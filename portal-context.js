/* ═══════════════════════════════════════════════════════════════════════════
   portal-context.js — שכבת-התאימות היחידה של הפורטל.

   ⚠️ **מה הקובץ הזה עושה, ומה הוא לא.** הוא אחראי אך-ורק על הזהות והנתיבים:
     · מזהה את מסלול-הכניסה (קישור-ותיק ‎?cust=&k=‎ / סשן-משוחזר).
     · מחליף קישור-ותיק ב-Custom Token דרך ‎portalLinkLogin‎, נכנס דרך REST,
       ושומר refresh-token ל-localStorage — בדיוק כמו ה-flow האנונימי הקיים.
     · מפענח את ה-claims מהאסימון ומחזיר ‎slug‎, ‎customer‎, ‎orgId‎.
     · מספק ‎authToken()‎ — האסימון שהפורטל מצרף כ-‎?auth=‎.
   כל **יתר הלוגיקה** — העלאה, preflight, היסטוריה, דפדוף, פרופר, אישור,
   הודעות — נשארת בקבצים ‎customer-portal.html‎ ו-‎proof-client.html‎ ללא שינוי.

   ⚠️ **הסוד הישן (k) אינו נשמר.** הוא נשלח פעם אחת ל-Function, מוחלף
   ב-Custom Token, ומוסר מהכתובת ב-‎history.replaceState‎ בלי reload. מה
   שנשמר ב-localStorage הוא ה-refresh-token של סשן-Firebase, לא ה-k.

   ⚠️ **הזהות מהאסימון בלבד.** ‎slug‎/‎customer‎/‎orgId‎ נקראים מ-claims של
   ה-ID Token (שהשרת צרב), ולא מ-‎cust=‎ שבכתובת. הכתובת משמשת רק כדי לדעת
   *איזה* קישור-ותיק להחליף.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var API_KEY = 'AIzaSyAFp99furP4L5hqTI-horBHmGZC9s13dGg';
  var FN_BASE = 'https://europe-west1-solan-printing.cloudfunctions.net/';
  var RT_KEY  = 'solanPortalRT';   // ⚠️ נפרד מ-solanFbAnonRT: סשן-פורטל, לא אנונימי

  /* מיזוג-נתונים: אותה נורמליזציה בדיוק כמו _slug בפורטל הישן, כדי
     שה-slug שנשלח ל-Function יהיה מפתח-הרשומה הנכון. */
  function slugify(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[.#$\[\]\/\\]+/g, '').replace(/\s+/g, '_');
  }

  /* פענוח claims מ-JWT (הסגמנט האמצעי, base64url). קריאה-בלבד — לא אימות;
     האימות נעשה בשרת ובחוקים. */
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
  var _ctx = null;       // { ok, mode, slug, customer, orgId }
  var _ready = null;     // Promise (single-flight)

  function _saveRt(rt) { try { if (rt) localStorage.setItem(RT_KEY, rt); } catch (e) {} }
  function _clearRt()  { try { localStorage.removeItem(RT_KEY); } catch (e) {} }
  /* ניקוי-מוחלט של זהות: סשן, הקשר, וה-refresh-token השמור. משמש בכל
     כישלון-אימות — קישור-חדש שנפל, או refresh שבוטל/פג. */
  function _wipe() {
    _session = null;
    _ctx = { ok: false, mode: 'none', slug: '', customer: '', orgId: '' };
    _clearRt();
  }

  async function _callFn(fn, data) {
    var r = await fetch(FN_BASE + fn, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data || {} }),
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var e = new Error((j.error && j.error.message) || 'הקישור אינו תקין');
      e.code = (j.error && j.error.details && j.error.details.code) || '';
      throw e;
    }
    return j.result;
  }

  /* signInWithCustomToken דרך REST — אין SDK. מחזיר idToken+refreshToken. */
  async function _signInCustom(customToken) {
    var r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    if (!r.ok) throw new Error('signInWithCustomToken נכשל');
    var d = await r.json();
    _session = { idToken: d.idToken, rt: d.refreshToken, exp: Date.now() + (parseInt(d.expiresIn) || 3600) * 1000 };
    _saveRt(d.refreshToken);
    return _session;
  }

  /* רענון אסימון מ-refresh-token — אותו endpoint של ה-flow האנונימי. */
  async function _refresh(rt) {
    var r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
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
    if (c.accountType !== 'customer' || !c.portalSlug || !c.portalCustomer) return null;
    return { ok: true, mode: mode, slug: c.portalSlug, customer: c.portalCustomer, orgId: c.orgId || '' };
  }

  async function _resolve() {
    var params = new URLSearchParams(location.search);
    var cust = params.get('cust') || '';
    var k = params.get('k') || '';

    /* מסלול-הקישור-הותיק: יש ‎cust‎ ו-‎k‎ → החלף ל-Custom Token.
       ⚠️ נוכחות ‎cust+k‎ היא **ניסיון-התחברות מפורש לזהות חדשה**. הבלוק
       הזה מכריע לבדו: בהצלחה — הסשן מתחלף לזהות-החדשה; בכשל (Function-לא-
       זמינה, ‎k‎ שגוי/פג, רשת) — מנקים ‎_session‎, ‎_ctx‎ **וגם את ה-RT
       השמור**, ומחזירים ‎ok:false‎ **מיד**. אסור ליפול למסלול-השחזור: RT של
       לקוח קודם (א׳) עלול היה להציג את פורטל-א׳ תחת כתובת-ב׳. אין זריקה
       (לא מסך-ריק), אין fallback אנונימי. */
    if (cust && k) {
      try {
        var res = await _callFn('portalLinkLogin', { slug: slugify(cust), k: k });
        await _signInCustom(res.token);
        /* ⚠️ הסרת ה-k מהכתובת מיד — בלי reload. ‎cust‎ נשאר לתאימות-תצוגה. */
        try {
          params.delete('k');
          var qs = params.toString();
          history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
        } catch (e) {}
        _ctx = _ctxFromToken(_session.idToken, 'link');
        if (_ctx) return _ctx;
      } catch (e) {}
      /* הגענו לכאן = הכשל, או שה-token לא הניב claims-לקוח. ניקוי מוחלט
         והחזרת ok:false — בלי שחזור-סשן-קודם ובלי fallback. */
      _session = null;
      _clearRt();
      _ctx = { ok: false, mode: 'none', slug: '', customer: '', orgId: '' };
      return _ctx;
    }

    /* סשן-משוחזר: refresh-token ב-localStorage (ניווט ל-proof-client, חזרה). */
    var rt = null; try { rt = localStorage.getItem(RT_KEY); } catch (e) {}
    if (rt) {
      try {
        await _refresh(rt);
        _ctx = _ctxFromToken(_session.idToken, 'resumed');
        if (_ctx) return _ctx;
      } catch (e) { _clearRt(); }
    }

    /* אין זהות. הקורא מחליט מה להציג (הפורטל הישן מציג את שער-הכניסה שלו). */
    _ctx = { ok: false, mode: 'none', slug: '', customer: '', orgId: '' };
    return _ctx;
  }

  /* ── שומר-גרסה שקט (חסם 4 §7) ─────────────────────────────────────────
     ⚠️ טאב-פורטל ישן שנשאר פתוח בזמן החלפת-החוקים טוען עדיין את
     ‎portal-context.js‎ הישן. סוקרים את ‎version.txt‎, ובשינוי-גרסה
     מרעננים — אך **רק כשהטאב ברקע** (‎visibilityState === 'hidden'‎). כך
     הרענון שקט לחלוטין: טאב-רקע מתרענן מעצמו, וטאב-פעיל לעולם אינו נקטע
     באמצע העלאה/אישור (מה שהיה מאבד עבודה). כשהלקוח חוזר לטאב — הוא כבר
     טרי. ‎_versionWatch(deps)‎ מקבל תלויות מוזרקות כדי שיהיה ניתן-לבדיקה. */
  function _versionWatch(deps) {
    var d = deps || {};
    var _fetch = d.fetch, _doc = d.document, _loc = d.location, _setInterval = d.setInterval, _now = d.now;
    if (typeof _fetch !== 'function' || !_doc || !_loc || typeof _loc.reload !== 'function' ||
        typeof _setInterval !== 'function' || typeof _now !== 'function') return null;
    var base = null, pending = false;
    function maybeReload() {
      if (pending && _doc.visibilityState === 'hidden') _loc.reload();
    }
    async function tick() {
      try {
        var r = await _fetch('version.txt?cb=' + _now(), { cache: 'no-store' });
        if (!r || r.ok === false) return;
        var v = String(await r.text() || '').trim();
        if (!v) return;
        if (base === null) { base = v; return; }   // בסיס = הקריאה הראשונה
        if (v !== base) { pending = true; maybeReload(); }
      } catch (e) {}
    }
    if (typeof _doc.addEventListener === 'function') _doc.addEventListener('visibilitychange', maybeReload);
    _setInterval(tick, 90000);
    tick();
    return { tick: tick, maybeReload: maybeReload, state: function () { return { base: base, pending: pending }; } };
  }

  var Ctx = {
    slugify: slugify,
    decodeClaims: decodeClaims,
    _versionWatch: _versionWatch,   // חשוף לבדיקה

    /* Promise יחיד — כמה קריאות מקבילות מקבלות אותו. מפעיל את שומר-הגרסה
       השקט פעם אחת, עם הגלובלים האמיתיים (no-op בסביבה בלי document/timer). */
    ready: function () {
      if (!_ready) {
        _ready = _resolve();
        try {
          if (typeof document !== 'undefined' && typeof setInterval !== 'undefined')
            _versionWatch({ fetch: fetch, document: document, location: location,
              setInterval: setInterval, now: function () { return Date.now(); } });
        } catch (e) {}
      }
      return _ready;
    },

    hasSession: function () { return !!_session; },
    get slug()     { return _ctx ? _ctx.slug : ''; },
    get customer() { return _ctx ? _ctx.customer : ''; },
    get orgId()    { return _ctx ? _ctx.orgId : ''; },
    get ok()       { return !!(_ctx && _ctx.ok); },

    /* ⚠️ האסימון שהפורטל מצרף כ-‎?auth=‎. מרענן אם פג-כמעט.
       כישלון-רענון (RT פג/בוטל) חייב **לנקות הכול ולהחזיר null** — אסור
       להחזיר אסימון ישן/פג, גם במסלול-הפעיל (לא רק ב-ready() הראשוני).
       הפורטל שמקבל null יציג שער-כניסה, לא ימשיך עם אסימון-רפאים. */
    authToken: async function () {
      if (!_session) {
        var rt = null; try { rt = localStorage.getItem(RT_KEY); } catch (e) {}
        if (rt) { try { await _refresh(rt); } catch (e) { _wipe(); return null; } }
      }
      if (!_session) return null;
      if (Date.now() > _session.exp - 60000) {
        try { await _refresh(_session.rt); }
        catch (e) { _wipe(); return null; }     // אסימון פג — לא מחזירים ישן
      }
      return _session.idToken;
    },
  };

  root.PortalContext = Ctx;
})(typeof window !== 'undefined' ? window : this);
