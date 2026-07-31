/* ═══════════ auth-client.js — הזדהות אחת לכל המסכים (שלב B+) ═══════════
   מסך התחברות אחד משרת גם את העובד וגם את הלקוח. ההבדל אינו במסך אלא
   ב-claims שעל הטוקן: accountType=staff|customer.

   ⚠️ הליבה כאן **טהורה** (בלי DOM ובלי Firebase) כדי שתיבדק ב-Node:
   ולידציית יעד-חזרה, בחירת התמדה, וניתוב לפי claims. העטיפה שנוגעת
   ב-Firebase נטענת רק בדפדפן.

   ⚠️ פרצת open-redirect: יעד-החזרה מגיע מהכתובת, ולכן הוא **חייב** להיות
   יחסי או באותו מקור. אותו לקח בדיוק כבר נלמד ב-ShortLink.safeTarget —
   קישור פנימי אסור שישמש קפיצה לאתר זר.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AuthClient = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LOGIN_PAGE = 'login.html';
  var RETURN_PARAM = 'returnTo';
  /* ⚠️ מסך-העבודה נקרא krtis-avoda.html **מקומית בלבד**. upload.ps1 מעלה
     אותו לאתר בשם index.html, ולכן הפניה ל-krtis-avoda.html בייצור מחזירה
     404 של GitHub Pages. נתפס בפיילוט: ההתחברות הצליחה, ה-claims היו
     תקינות, והמנהל נחת בדף "File not found".
     נעול מעכשיו ב-deploy-manifest-tests.js. */
  var STAFF_HOME = 'index.html';

  /* ── יעד-חזרה ─────────────────────────────────────────────────────────
     מותר: נתיב יחסי באותו אתר, או כתובת מלאה באותו מקור.
     אסור: מקור אחר, //host, javascript:, data:, וכל מה שאינו http(s). */
  function safeReturn(target, origin) {
    var t = String(target || '').trim();
    if (!t) return null;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(t)) {          // כתובת עם סכימה
      var u;
      try { u = new URL(t); } catch (e) { return null; }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!origin || u.origin !== origin) return null;
      return u.pathname + u.search + u.hash;
    }
    if (t.charAt(0) === '/' && t.charAt(1) === '/') return null;   // //evil.com
    if (t.charAt(0) === '\\') return null;
    if (t.charAt(0) === '/') return t;                             // /path באותו אתר
    if (/^[?#]/.test(t)) return null;                              // חסר עמוד
    return t;                                                       // page.html?x=1
  }

  /* בניית כתובת מסך-ההתחברות עם היעד לחזרה */
  function loginUrlFor(currentUrl, origin) {
    var back = safeReturn(currentUrl, origin) || '';
    return LOGIN_PAGE + (back ? ('?' + RETURN_PARAM + '=' + encodeURIComponent(back)) : '');
  }

  /* חילוץ היעד מכתובת מסך-ההתחברות, כבר מסונן.
     ⚠️ fallback === null מחזיר null במפורש — "אין יעד מבוקש". בלי זה
     `returnFrom(..., null)` היה נופל ל-STAFF_HOME, כלומר **כל** התחברות
     נראתה כאילו ביקשה את מסך-העבודה. נתפס בפיילוט: לקוח שהפעיל חשבון
     מקישור-הזמנה הופנה ל-index.html במקום לפורטל שלו. */
  function returnFrom(search, origin, fallback) {
    var m = /[?&]returnTo=([^&#]*)/.exec(String(search || ''));
    var raw = '';
    if (m) { try { raw = decodeURIComponent(m[1]); } catch (e) { raw = ''; } }
    var safe = safeReturn(raw, origin);
    if (safe) return safe;
    return fallback === null ? null : (fallback || STAFF_HOME);
  }

  /* ── התמדה ────────────────────────────────────────────────────────────
     "זכור אותי" = local (נשמר בין סגירות דפדפן) · אחרת session.
     ⚠️ בית-הדפוס עובד ממחשב משותף, ולכן ברירת-המחדל היא **לא** לזכור. */
  function persistenceFor(remember) { return remember ? 'local' : 'session'; }

  /* המסכים שלקוח רשאי לפתוח. עובד — הכל; ההפרדה בין admin ל-worker
     נעשית בתוך המסך עצמו.
     ⚠️ portal.html הוא הפורטל של המבנה החדש (לפי portalId ב-claims);
     customer-portal.html הוא הפורטל הישן של 44 הלקוחות עם ?cust=&k=.
     השניים חיים זה לצד זה עד שהמעבר יושלם — ולכן שניהם ברשימה. */
  var CUSTOMER_PAGES = ['portal.html', 'customer-portal.html', 'proof-client.html', 'proof-upload.html'];
  var CUSTOMER_HOME = 'portal.html';

  /* סוג החשבון לפי ה-claims. ⚠️ חשבון שנוצר בלי הזמנה — 'pending':
     לא נכשל בשקט ולא מגיע לשום מסך. */
  function kindOf(claims) {
    var c = claims || {};
    if (c.accountType === 'staff' && (c.role === 'admin' || c.role === 'worker')) return 'staff';
    if (c.accountType === 'customer' && c.portalId) return 'customer';
    return 'pending';
  }

  /* שם-העמוד בלי השאילתה: 'proof-client.html?id=3' → 'proof-client.html' */
  function pageOf(target) {
    var t = String(target || '').split('?')[0].split('#')[0];
    var i = t.lastIndexOf('/');
    return i >= 0 ? t.slice(i + 1) : t;
  }

  /* האם משתמש רשאי לפתוח מסך מסוים — בדיקת-נוחות בצד הלקוח בלבד.
     ⚠️ אינה תחליף לחוקים: החוקים הם מה שמגן, זה רק חוסך מסך ריק. */
  function mayOpen(claims, page) {
    var k = kindOf(claims);
    if (k === 'pending') return false;
    if (k === 'customer') return CUSTOMER_PAGES.indexOf(pageOf(page)) >= 0;
    return true;
  }

  /* ── ניתוב לפי claims ─────────────────────────────────────────────────
     החלטה אחת ומרוכזת: לאן שולחים משתמש אחרי התחברות מוצלחת.
     ⚠️ יעד מבוקש שאינו מותר לתפקיד **אינו** מכובד — נופלים לבית של
     התפקיד. בלי זה לקוח היה נשלח למסך-העבודה של בית-הדפוס רק מפני
     שהכתובת ביקשה זאת. נתפס בפיילוט. */
  function routeFor(claims, requested) {
    var k = kindOf(claims);
    if (k === 'pending') return { kind: 'pending', to: null };
    var home = (k === 'staff') ? STAFF_HOME
             : (CUSTOMER_HOME + '?p=' + encodeURIComponent((claims || {}).portalId));
    if (requested && mayOpen(claims, requested)) return { kind: k, to: requested };
    return { kind: k, to: home };
  }

  /* ניסוח שגיאות למשתמש. ⚠️ בכוונה אינו מבחין בין "אין משתמש כזה" ל"סיסמה
     שגויה" — הבחנה כזו מסגירה אילו כתובות-מייל קיימות במערכת. */
  function errorText(code) {
    switch (String(code || '')) {
      case 'auth/invalid-email':        return 'כתובת המייל אינה תקינה';
      case 'auth/user-disabled':        return 'החשבון הושבת. פנו לבית הדפוס.';
      case 'auth/too-many-requests':    return 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
      case 'auth/network-request-failed': return 'אין חיבור לרשת. נסו שוב.';
      case 'invite_expired':            return 'ההזמנה פגה. בקשו הזמנה חדשה מבית הדפוס.';
      case 'invite_already_used':       return 'ההזמנה כבר נוצלה. בקשו הזמנה חדשה.';
      case 'invite_email_mismatch':     return 'ההזמנה נשלחה לכתובת מייל אחרת.';
      case 'invite_not_found':          return 'ההזמנה אינה קיימת.';
      case 'pending':                   return 'החשבון עדיין לא שויך. פנו לבית הדפוס.';
      default:                          return 'המייל או הסיסמה שגויים';
    }
  }

  return {
    LOGIN_PAGE: LOGIN_PAGE, RETURN_PARAM: RETURN_PARAM,
    safeReturn: safeReturn, loginUrlFor: loginUrlFor, returnFrom: returnFrom,
    persistenceFor: persistenceFor, routeFor: routeFor, mayOpen: mayOpen,
    kindOf: kindOf, pageOf: pageOf, errorText: errorText,
  };
});
