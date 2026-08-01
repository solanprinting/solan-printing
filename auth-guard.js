/* ═══════════════════════════════════════════════════════════════════════════
   auth-guard.js — שומר-הכניסה של המסכים הקיימים (שלב B+3).

   מה הוא עושה: מסך ותיק טוען שורה אחת, ומקבל שני דברים —
     1. **שער**  — מי שאינו מחובר מועבר ל-login.html; מי שמחובר ואינו שייך
        למסך הזה מועבר לבית שלו.
     2. **אסימון** — ‎_fbAuthToken()‎ מפסיק להנפיק זהות אנונימית ומחזיר את
        האסימון של המשתמש **האמיתי**. כל קריאה קיימת (‎?auth=‎ ו-Authorization)
        ממשיכה לעבוד בלי לגעת באלפי מקומות-הקריאה.

   ⚠️ שלושה מצבים, ובכוונה: 'off' · 'observe' · 'enforce'.
   מעבר ישיר ל-enforce על מסך-העבודה היה **נועל את בית-הדפוס**: כרגע רק שני
   חשבונות נושאים claims, ולשאר העובדים אין עדיין חשבון Email/Password.
   לכן ברירת-המחדל היא observe: הכל עובד כרגיל, האסימון האמיתי משמש כשיש
   משתמש מחובר, ומה שהיה נחסם נרשם ומוצג — במקום להפיל את היום.

   ⚠️ עקרון-ברזל בעקיפה: ‎?guard=‎ ו-localStorage יכולים רק **להחמיר** את
   המצב, אף פעם לא להקל. אחרת כל אחד היה מוסיף ‎?guard=off‎ לכתובת ופותח את
   השער בעצמו. resolveMode אוכף את זה, והבדיקות נועלות אותו.

   ⚠️ המסלול האנונימי הישן עבר לכאן ולא נמחק — הוא עדיין המסלול היחיד של מי
   שאינו מחובר, כל עוד המסכים ב-observe. יש לו **מקום אחד** בקוד, כדי
   שמחיקתו ב-B+4 תהיה שורה אחת ולא ציד בשישה קבצים.

   ⚠️ אין נפילה-לאחור שקטה: מסך ב-enforce שאין בו משתמש **אינו** מקבל אסימון
   אנונימי. כשל-הרשאה חייב להיראות ככשל.

   טעינה במסך ותיק (שלוש שורות, לפני הסקריפט שמשתמש ב-_fbAuthToken):
     <script src="firebase-auth.bundle.js"></script>
     <script src="auth-client.js"></script>
     <script src="auth-guard.js" data-page="proof-admin.html" data-mode="observe"></script>

   הרצת הבדיקות: node auth-guard-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SolanGuard = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /* auth-client נטען כגלובל בדפדפן, וכמודול ב-Node (הבדיקות) */
  var AC = (root && root.AuthClient) ||
           ((typeof require === 'function') ? require('./auth-client.js') : null);

  /* ⚠️ מפתח-Web ציבורי — אותו אחד של כל שאר הדפים. אינו סוד ואינו מעניק
     הרשאה; ההרשאה יושבת ב-claims ובחוקים. */
  var FB_CONFIG = {
    apiKey: 'AIzaSyAFp99furP4L5hqTI-horBHmGZC9s13dGg',
    authDomain: 'solan-printing.firebaseapp.com',
    projectId: 'solan-printing',
    databaseURL: 'https://solan-printing-default-rtdb.europe-west1.firebasedatabase.app',
  };
  var ANON_RT_KEY = 'solanFbAnonRT';   /* אותו מפתח של הקוד הישן — לא לשבור סשנים קיימים */
  var MODE_KEY    = 'solanGuardMode';

  /* ── ליבה טהורה (נבדקת ב-Node, בלי DOM ובלי רשת) ───────────────────── */

  var RANK = { off: 0, observe: 1, enforce: 2 };

  function rank(mode) {
    var r = RANK[String(mode || '').toLowerCase()];
    return typeof r === 'number' ? r : -1;
  }

  /* המצב בפועל = **החמור מבין** המצב האפוי לדף לבין העקיפות.
     ⚠️ עקיפה שאינה מוכרת (שגיאת-כתיב, ערך זדוני) פשוט מתעלמים ממנה —
     היא לא מורידה ולא מעלה. */
  function resolveMode(baked, stored, urlParam) {
    var best = rank(baked);
    if (best < 0) best = RANK.observe;                 /* דף בלי הצהרה — תצפית */
    [stored, urlParam].forEach(function (o) {
      var r = rank(o);
      if (r > best) best = r;                          /* להחמיר בלבד */
    });
    return Object.keys(RANK).filter(function (k) { return RANK[k] === best; })[0];
  }

  /* חילוץ ‎?guard=‎ מהכתובת */
  function modeFromSearch(search) {
    var m = /[?&]guard=([a-z]+)/i.exec(String(search || ''));
    return m ? m[1].toLowerCase() : null;
  }

  /* ההחלטה עצמה. state:
       { signedIn, claims, emailVerified, page, here, origin, mode }
     תוצאה: { action, to, reason } · action ∈ allow|login|elsewhere|blocked
     ⚠️ ב-observe התוצאה תמיד allow, אבל ‎would‎ נושא את מה שהיה קורה
     ב-enforce — כדי שהמסך יוכל להציג את זה במקום לשתוק. */
  function decide(state) {
    var s = state || {};
    var mode = s.mode || 'observe';
    if (mode === 'off') return { action: 'allow', reason: 'off' };

    var want = enforced(s);
    if (mode === 'enforce') return want;
    return { action: 'allow', reason: 'observe', would: want };
  }

  function enforced(s) {
    if (!s.signedIn) {
      return { action: 'login', to: AC.loginUrlFor(s.here || s.page, s.origin), reason: 'anonymous' };
    }
    var claims = s.claims || {};
    var kind = AC.kindOf(claims);
    if (kind === 'pending') return { action: 'blocked', reason: 'pending' };

    /* ⚠️ עובד חייב קישור ל-staffId (B+3.2). חשבון-עובד בלי קישור אינו יודע
       **מי** הוא ברשימת-העובדים, ולכן באכיפה הוא נעצר — בלי נפילה חזרה
       ל-PIN ובלי נפילה לאנונימי. שתי הנפילות האלה היו מחזירות בדיוק את
       המצב שהמעבר בא לסגור. */
    if (kind === 'staff' && !claims.staffId) return { action: 'blocked', reason: 'no-staff-id' };

    /* ⚠️ אימות-מייל הוא תנאי ללקוח, ובעליו הוא portal.html — שם יושב מסך
       "שלח שוב / כבר אימתתי". מסך ותיק לא מנסה לשכפל אותו, הוא שולח לשם. */
    if (kind === 'customer' && s.emailVerified === false) {
      return { action: 'elsewhere', to: 'portal.html', reason: 'unverified' };
    }
    if (!AC.mayOpen(claims, s.page)) {
      return { action: 'elsewhere', to: AC.routeFor(claims, null).to, reason: 'wrong-audience' };
    }
    return { action: 'allow', reason: 'ok' };
  }

  /* מאיפה יבוא האסימון.
     ⚠️ enforce לעולם לא נופל לאנונימי — ראה כותרת הקובץ. */
  function tokenPolicy(mode, hasUser) {
    if (mode === 'enforce') return hasUser ? 'user' : 'none';
    if (hasUser) return 'user';
    return 'anonymous';
  }

  /* ── ספק-הכניסה שעל הטוקן ─────────────────────────────────────────────
     ⚠️ זו **בדיקה-עצמית נגד באג שלנו**, לא גבול-אבטחה: החתימה מאומתת בשרת
     ובחוקים, וכאן רק מפענחים את המטען כדי לוודא שלא החזרנו בטעות אסימון
     אנונימי במסך שאמור לדרוש Email/Password. נכשלת "פנימה" — עוצרת אותנו. */
  function providerOf(idToken) {
    try {
      var part = String(idToken || '').split('.')[1];
      if (!part) return null;
      var json = (typeof atob === 'function')
        ? decodeURIComponent(escape(atob(part.replace(/-/g, '+').replace(/_/g, '/'))))
        : Buffer.from(part, 'base64').toString('utf8');
      var p = JSON.parse(json);
      return ((p && p.firebase) || {}).sign_in_provider || null;
    } catch (e) { return null; }
  }

  /* אילו אסימונים מתקבלים בכל מצב */
  function tokenOkFor(mode, prov) {
    if (mode !== 'enforce') return true;
    return prov === 'password';
  }

  /* ניסוח ההחלטה לבן-אדם (מוצג בשבב-התצפית וברישום) */
  function explain(d) {
    switch (d && d.reason) {
      case 'anonymous':      return 'לא מחובר — היה מועבר למסך ההתחברות';
      case 'pending':        return 'החשבון עדיין לא שויך — פנו לבית הדפוס';
      case 'no-staff-id':    return 'חשבון העובד אינו מקושר לרשומת עובד (staffId)';
      case 'unverified':     return 'המייל טרם אומת';
      case 'wrong-audience': return 'החשבון אינו מורשה למסך הזה';
      case 'off':            return 'השומר כבוי במסך הזה';
      case 'observe':        return 'מצב תצפית';
      default:               return 'מורשה';
    }
  }

  var core = {
    FB_CONFIG: FB_CONFIG, ANON_RT_KEY: ANON_RT_KEY, MODE_KEY: MODE_KEY,
    rank: rank, resolveMode: resolveMode, modeFromSearch: modeFromSearch,
    decide: decide, tokenPolicy: tokenPolicy, explain: explain,
    providerOf: providerOf, tokenOkFor: tokenOkFor,
  };

  /* ── מכאן ומטה: דפדפן בלבד ─────────────────────────────────────────── */
  if (typeof document === 'undefined') return core;

  var _readyP = null, _state = { mode: 'observe', user: null, claims: null, decision: null };

  /* המסך שהדף מצהיר עליו, ואם לא הצהיר — שם-הקובץ מהכתובת.
     ⚠️ ברירת-המחדל בטוחה: עמוד שאינו ברשימת-הלקוחות נחשב מסך-עובד. */
  function selfScript() {
    var s = document.currentScript;
    if (s) return s;
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--)
      if (/auth-guard\.js/.test(all[i].src || '')) return all[i];
    return null;
  }

  function anonToken() {
    if (_anonP) return _anonP;
    if (_anon.token && Date.now() < _anon.exp - 120000) return Promise.resolve(_anon.token);
    var rt = null; try { rt = localStorage.getItem(ANON_RT_KEY); } catch (e) {}
    var key = FB_CONFIG.apiKey;
    var step = rt
      ? fetch('https://securetoken.googleapis.com/v1/token?key=' + key, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt),
        }).then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function (j) { return { token: j.id_token, rt: j.refresh_token, exp: Date.now() + (parseInt(j.expires_in) || 3600) * 1000 }; })
      : Promise.reject();

    _anonP = step['catch'](function () {
      return fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      }).then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (j) { return { token: j.idToken, rt: j.refreshToken, exp: Date.now() + (parseInt(j.expiresIn) || 3600) * 1000 }; });
    }).then(function (a) {
      _anon = { token: a.token, exp: a.exp };
      try { localStorage.setItem(ANON_RT_KEY, a.rt); } catch (e) {}
      _anonP = null; return a.token;
    })['catch'](function () { _anonP = null; return null; });  /* אין רשת — בלי אסימון, כמו הקוד הישן */
    return _anonP;
  }
  var _anon = { token: null, exp: 0 }, _anonP = null;

  /* ── חיווי ──────────────────────────────────────────────────────────── */
  function overlay(html) {
    var d = document.getElementById('solan-guard-overlay');
    if (!d) {
      d = document.createElement('div');
      d.id = 'solan-guard-overlay';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:#f5f6f9;color:#2d3561;' +
        'display:flex;align-items:center;justify-content:center;text-align:center;direction:rtl;' +
        "font:700 1rem 'Heebo',system-ui,Arial;padding:24px";
      (document.body || document.documentElement).appendChild(d);
    }
    d.innerHTML = html;
    return d;
  }
  function clearOverlay() {
    var d = document.getElementById('solan-guard-overlay');
    if (d && d.parentNode) d.parentNode.removeChild(d);
  }

  /* שבב-תצפית: מה **היה** קורה ב-enforce. קטן, פינתי, ולא חוסם —
     ⚠️ אבל מוצג. מצב-ביניים ששותק הוא בדיוק "הכשל השקט" שכבר עלה לנו. */
  function chip(text) {
    function put() {
      var c = document.getElementById('solan-guard-chip');
      if (!c) {
        c = document.createElement('div');
        c.id = 'solan-guard-chip';
        c.style.cssText = 'position:fixed;bottom:8px;inset-inline-start:8px;z-index:2147483500;' +
          'background:#1f2937;color:#fbbf24;border-radius:8px;padding:5px 10px;direction:rtl;' +
          "font:600 11px 'Heebo',system-ui,Arial;opacity:.9;pointer-events:none;max-width:70vw";
        (document.body || document.documentElement).appendChild(c);
      }
      c.textContent = '🔓 שומר בתצפית · ' + text;
    }
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }

  /* ── השער ───────────────────────────────────────────────────────────── */
  function protect(opts) {
    if (_readyP) return _readyP;
    opts = opts || {};
    var page = opts.page || AC.pageOf(location.pathname) || 'index.html';
    var stored = null; try { stored = localStorage.getItem(MODE_KEY); } catch (e) {}
    var mode = resolveMode(opts.mode, stored, modeFromSearch(location.search));
    _state.mode = mode;
    _state.page = page;

    if (mode === 'enforce') overlay('בודק הרשאה…');

    _readyP = new Promise(function (resolve) {
      if (mode === 'off') { _state.decision = decide({ mode: 'off' }); resolve(_state); return; }

      SolanAuth.init(FB_CONFIG);
      var settled = false;
      SolanAuth.onAuthStateChanged(function (user) {
        Promise.resolve(user ? SolanAuth.claims(false)['catch'](function () { return {}; }) : null)
          .then(function (claims) {
            /* ⚠️ ‎here‎ נגזר מהכתובת ולא מ-data-page: מסך-העבודה נקרא
               krtis-avoda.html מקומית ו-index.html בייצור, ו-returnTo
               שמצביע על השם המקומי מחזיר 404 של GitHub Pages — בדיוק
               התקלה שכבר נתפסה בפיילוט. data-page הוא **קהל**, לא כתובת. */
            var here = (AC.pageOf(location.pathname) || 'index.html') + location.search;
            var d = decide({
              signedIn: !!user, claims: claims || {},
              emailVerified: user ? !!user.emailVerified : false,
              page: page, here: here, origin: location.origin, mode: mode,
            });
            _state.user = user || null;
            _state.claims = claims || null;
            _state.decision = d;

            if (d.action === 'login')     { location.replace(d.to); return; }   /* ⚠️ נשאר תלוי בכוונה — הדף מתחלף */
            if (d.action === 'elsewhere') { location.replace(d.to); return; }
            if (d.action === 'blocked')   { overlay('<div>🚫 ' + explain(d) + '</div>'); return; }

            clearOverlay();
            if (mode === 'observe' && d.would && d.would.action !== 'allow') chip(explain(d.would));
            if (!settled) { settled = true; resolve(_state); }
          });
      });
    });
    return _readyP;
  }

  function ready() { return _readyP || protect({}); }

  /* האסימון שכל המסכים הוותיקים מבקשים.
     ⚠️ אותה חתימה בדיוק של ‎_fbAuthToken‎ הישן: Promise<string|null>. */
  function token(force) {
    return ready().then(function (st) {
      var pol = tokenPolicy(st.mode, !!st.user);
      if (pol === 'none')  return Promise.reject(new Error('אין משתמש מחובר — המסך במצב אכיפה'));
      if (pol !== 'user')  return anonToken();
      return SolanAuth.idToken(!!force).then(function (t) {
        /* ⚠️ בדיקה-עצמית: באכיפה האסימון חייב להיות של Email/Password.
           אם אי-פעם נחזיר כאן אסימון אנונימי בגלל באג, עדיף שהמסך ייפול
           ברעש מאשר שימשיך לעבוד "כאילו" עם זהות אנונימית. */
        if (!tokenOkFor(st.mode, providerOf(t)))
          return Promise.reject(new Error('האסימון אינו של Email/Password'));
        return t;
      });
    });
  }

  /* ── רשומת-העובד: שם-תצוגה והעדפות בלבד ───────────────────────────────
     ⚠️ מקור-האמת להרשאה הוא ה-claims והחוקים, **לא** הרשומה הזו. תחת
     החוקים החיים כל מחובר יכול לערוך את solanUsers, ולכן קריאת isAdmin
     משם הייתה מאפשרת לכל אחד להעלות את עצמו לדרגת מנהל. הרשומה משמשת
     לשם-תצוגה והעדפות קיימות, וזהו. */
  var _staffP = null;
  function staff() {
    if (_staffP) return _staffP;
    _staffP = ready().then(function (st) {
      var sid = (st.claims || {}).staffId;
      if (!sid) return null;
      return token(false).then(function (t) {
        return fetch(FB_CONFIG.databaseURL + '/solanUsers.json?auth=' + encodeURIComponent(t));
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (val) {
          if (!val) return { staffId: sid, name: null };
          var list = Array.isArray(val) ? val : Object.keys(val).map(function (k) { return val[k]; });
          var rec = null;
          for (var i = 0; i < list.length; i++)
            if (list[i] && String(list[i].id) === String(sid)) { rec = list[i]; break; }
          return { staffId: sid, name: rec ? rec.name : null, record: rec };
        })['catch'](function () { return { staffId: sid, name: null }; });
    });
    return _staffP;
  }

  var api = {
    FB_CONFIG: FB_CONFIG, ANON_RT_KEY: ANON_RT_KEY, MODE_KEY: MODE_KEY,
    rank: rank, resolveMode: resolveMode, modeFromSearch: modeFromSearch,
    decide: decide, tokenPolicy: tokenPolicy, explain: explain,
    providerOf: providerOf, tokenOkFor: tokenOkFor,
    protect: protect, ready: ready, token: token, staff: staff,
    state: function () { return _state; },
    signOut: function () {
      return SolanAuth.signOut()['catch'](function () {})
        .then(function () { location.replace('login.html'); });
    },
  };

  /* ── הפעלה-עצמית מתגית-הסקריפט ──────────────────────────────────────
     ⚠️ הפעלה מיידית ולא ב-DOMContentLoaded: המסכים הוותיקים מבקשים אסימון
     כבר ברמת-הסקריפט ("חימום"), ואם השומר עוד לא רץ הם היו מנפיקים אנונימי
     בעצמם ומקדימים אותו. */
  var tag = selfScript();
  if (tag && tag.getAttribute('data-page')) {
    api.protect({ page: tag.getAttribute('data-page'), mode: tag.getAttribute('data-mode') });
    /* גשר-התאימות: כל ‎_fbAuthToken()‎ קיים בדף עובר דרך השומר */
    root._fbAuthToken = function () { return api.token(false); };
  }

  return api;
});
