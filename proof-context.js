/* ═══════════════════════════════════════════════════════════════════════════
   proof-context.js — שכבת-הזהות של "פרופר ללקוח" (customer-fold-preview.html).

   ⚠️ **מראה מדויקת של portal-context.js**, עם תחום-אחריות נפרד לגמרי: שם
   קישור-ותיק ‎?cust=&k=‎ מוחלף ב-Custom Token דרך ‎portalLinkLogin‎; כאן
   קישור-פרופר ‎?v=&t=‎ מוחלף ב-Custom Token דרך ‎proofLinkLogin‎. אותה שיטת
   REST בדיוק (signInWithCustomToken/refresh), אותו history.replaceState,
   אותו localStorage-ל-refresh-token-בלבד — **מפתח נפרד** (RT_KEY) כדי
   שסשן-פרופר לא יתנגש עם סשן-פורטל אם שני הדפים אי-פעם נפתחים באותו
   דפדפן. אינו תלוי ב-portal-context.js ואינו נוגע בו.

   ⚠️ **הסוד הישן (t) אינו נשמר.** נשלח פעם אחת ל-Function, מוחלף ב-Custom
   Token, ומוסר מהכתובת ב-‎history.replaceState‎ בלי reload.

   ⚠️ **הזהות מהאסימון בלבד.** ‎versionId‎ נקרא מ-claims (‎proofVersionId‎
   שהשרת צרב), ולא מ-‎v=‎ שבכתובת. הכתובת משמשת רק כדי לדעת *איזה* קישור
   להחליף — ולאמת בהמשך (בקוד הקורא) שה-claim תואם ל-v שבכתובת, לא ההפך.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var API_KEY = 'AIzaSyAFp99furP4L5hqTI-horBHmGZC9s13dGg';
  var FN_BASE = 'https://europe-west1-solan-printing.cloudfunctions.net/';
  var RT_KEY  = 'solanProofRT';   // ⚠️ נפרד מ-solanPortalRT/solanFbAnonRT — סשן-פרופר בלבד

  function decodeClaims(idToken) {
    try {
      var p = String(idToken || '').split('.')[1];
      if (!p) return {};
      p = p.replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      var json = decodeURIComponent(atob(p).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json) || {};
    } catch (e) { return {}; }
  }

  var _session = null;   // { idToken, rt, exp }
  var _ctx = null;       // { ok, mode, versionId, orgId, viewOnly }
  var _ready = null;     // Promise (single-flight)
  var _viewMeta = null;  // מטא-נתוני-צפייה מתשובת-הכניסה (לסשן-צפייה בלבד)

  function _saveRt(rt) { try { if (rt) localStorage.setItem(RT_KEY, rt); } catch (e) {} }
  function _clearRt()  { try { localStorage.removeItem(RT_KEY); } catch (e) {} }
  function _wipe() {
    _session = null;
    _ctx = { ok: false, mode: 'none', versionId: '', orgId: '' };
    _clearRt();
  }

  /* ⚠️ ביקורת-אמינות 21/08/2026: פסק-זמן על קריאות-הזהות — מסנן שמחזיק
     סוקט פתוח השאיר את מסך-אישור-הפרופר תלוי לנצח על 'טוען…'. */
  function _fetchTO(url, opts, ms) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var o = Object.assign({}, opts || {});
    if (ctrl) o.signal = ctrl.signal;
    var t = setTimeout(function () { if (ctrl) try { ctrl.abort(); } catch (e) {} }, ms || 20000);
    return fetch(url, o).then(function (r) { clearTimeout(t); return r; },
                             function (e) { clearTimeout(t);
                               throw (e && e.name === 'AbortError') ? new Error('החיבור נקטע (רשת/סינון) — נסו שוב') : e; });
  }
  async function _callFn(fn, data) {
    var r = await _fetchTO(FN_BASE + fn, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data || {} }),
    }, 25000);
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var e = new Error((j.error && j.error.message) || 'הקישור אינו תקין');
      e.code = (j.error && j.error.details && j.error.details.code) || '';
      throw e;
    }
    return j.result;
  }

  /* ⚠️ persistRt=false — סשן-צפייה (13/08/2026): ה-RT שלו **אינו נשמר**,
     משתי סיבות: (א) RT_KEY הוא חריץ-יחיד, וצופה שפותח קישור באותו דפדפן
     של המאשר היה דורס את סשן-האישור שלו; (ב) לקישור-צפייה ה-t נשאר
     בכתובת (הוא הקישור עצמו, נועד להישלח הלאה) — רענון-דף פשוט נכנס
     מחדש, ואין מה לשחזר. */
  async function _signInCustom(customToken, persistRt) {
    var r = await _fetchTO('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!r.ok) throw new Error('signInWithCustomToken נכשל');
    var d = await r.json();
    _session = { idToken: d.idToken, rt: d.refreshToken, exp: Date.now() + (parseInt(d.expiresIn) || 3600) * 1000 };
    if (persistRt !== false) _saveRt(d.refreshToken);
    return _session;
  }

  async function _refresh(rt) {
    var r = await _fetchTO('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt),
    });
    if (!r.ok) throw new Error('refresh נכשל');
    var d = await r.json();
    _session = { idToken: d.id_token, rt: d.refresh_token, exp: Date.now() + (parseInt(d.expires_in) || 3600) * 1000 };
    _saveRt(d.refresh_token);
    return _session;
  }

  function _ctxFromToken(idToken, mode) {
    var c = decodeClaims(idToken);
    if (c.accountType !== 'customer') return null;
    if (c.proofVersionId)
      return { ok: true, mode: mode, versionId: c.proofVersionId, orgId: c.orgId || '', viewOnly: false };
    /* ⚠️ סשן-צפייה: claim בשם אחר **בכוונה** — proofVersionId הוא מה
       שחוקי-RTDB מעניקים לו, וצופה אסור שיחזיק אותו. ראה proof-link.js. */
    if (c.proofViewVersionId)
      return { ok: true, mode: mode, versionId: c.proofViewVersionId, orgId: c.orgId || '', viewOnly: true };
    return null;
  }

  /* ⚠️ expectedVersionId: ה-v שבכתובת, כפי שהקורא ראה אותו *לפני* קריאת ready().
     דרישה #4 (חלק ה׳): "מאמתת שה-claim תואם ל-version המבוקש" — לא מספיק
     שהשרת מנפיק claim תקין; חייבים לוודא שהוא ל-**אותה** גרסה שהקישור
     ביקש, אחרת קישור-ב׳ שנפתח בטאב עם סשן-א׳ שרוד היה מדליף context-א׳. */
  async function _resolve(expectedVersionId) {
    var params = new URLSearchParams(location.search);
    var v = params.get('v') || '';
    var t = params.get('t') || '';

    if (v && t) {
      try {
        var res = await _callFn('proofLinkLogin', { versionId: v, token: t });
        var isView = !!(res && res.viewOnly);
        await _signInCustom(res.token, !isView);
        /* ⚠️ בקישור-אישור t מוסר מהכתובת (סוד חד-פעמי); בקישור-צפייה הוא
           **נשאר** — הכתובת עצמה היא מה שמשתפים, ורענון-דף נכנס מחדש
           דרכה. אין כאן הדלפה חדשה: זו בדיוק הכתובת שהגיעה. */
        if (!isView) {
          try {
            params.delete('t');
            var qs = params.toString();
            history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
          } catch (e) {}
        }
        _ctx = _ctxFromToken(_session.idToken, isView ? 'view' : 'link');
        if (_ctx && _ctx.viewOnly) _viewMeta = (res && res.viewMeta) || null;
        if (_ctx && _ctx.versionId === v) return _ctx;
      } catch (e) {}
      /* כשל, או claim לגרסה אחרת (לא אמור לקרות — mint תמיד לפי v שנשלח —
         אבל לא מניחים, בודקים). ניקוי מוחלט, בלי fallback ובלי שחזור-סשן-קודם. */
      _session = null;
      _clearRt();
      _ctx = { ok: false, mode: 'none', versionId: '', orgId: '' };
      return _ctx;
    }

    /* סשן-משוחזר: רענון-דף בלי t בכתובת (t כבר הוסר ב-history.replaceState). */
    var rt = null; try { rt = localStorage.getItem(RT_KEY); } catch (e) {}
    if (rt) {
      try {
        await _refresh(rt);
        _ctx = _ctxFromToken(_session.idToken, 'resumed');
        /* ⚠️ סשן-צפייה אינו משוחזר — הוא מעולם לא נשמר (ראה _signInCustom),
           והשורה הזו fail-closed למקרה שבכל-זאת הגיע RT כזה: הכניסה של
           צופה היא הקישור, תמיד. */
        if (_ctx && _ctx.viewOnly) { _wipe(); return _ctx; }
        /* ⚠️ סשן משוחזר חייב להתאים ל-v שבכתובת **הנוכחית** — אחרת לקוח
           א׳ שמשאיר טאב פתוח ומקבל קישור-ב׳ (v שונה) בלי t מפורש היה
           ממשיך לראות את גרסה-א׳ בטעות. */
        if (_ctx && expectedVersionId && _ctx.versionId !== expectedVersionId) { _wipe(); return _ctx; }
        if (_ctx) return _ctx;
      } catch (e) { _clearRt(); }
    }

    _ctx = { ok: false, mode: 'none', versionId: '', orgId: '' };
    return _ctx;
  }

  var Ctx = {
    decodeClaims: decodeClaims,

    ready: function (expectedVersionId) {
      if (!_ready) _ready = _resolve(expectedVersionId);
      return _ready;
    },

    hasSession: function () { return !!_session; },
    get versionId() { return _ctx ? _ctx.versionId : ''; },
    get orgId()     { return _ctx ? _ctx.orgId : ''; },
    get ok()        { return !!(_ctx && _ctx.ok); },
    get viewOnly()  { return !!(_ctx && _ctx.viewOnly); },
    /* מטא-נתוני-הצפייה מתשובת-הכניסה — לסשן-צפייה אין קריאת-RTDB, וזה
       כל מה שהוא יודע על הרשומה. null בסשן-אישור. */
    get viewMeta()  { return _viewMeta; },

    authToken: async function () {
      if (!_session) {
        var rt = null; try { rt = localStorage.getItem(RT_KEY); } catch (e) {}
        if (rt) { try { await _refresh(rt); } catch (e) { _wipe(); return null; } }
      }
      if (!_session) return null;
      if (Date.now() > _session.exp - 60000) {
        try { await _refresh(_session.rt); }
        catch (e) { _wipe(); return null; }
      }
      return _session.idToken;
    },
  };

  root.ProofContext = Ctx;
})(typeof window !== 'undefined' ? window : this);
