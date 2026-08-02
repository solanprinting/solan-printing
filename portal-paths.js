/* ═══════════════════════════════════════════════════════════════════════════
   portal-paths.js — בניית נתיבי הפורטל הארגוני. מקור-אמת יחיד.

   ⚠️ למה מודול ולא קוד בכל מסך: portal.html ו-portal-view.html בונים את
   אותם נתיבים בדיוק. שכפול של לוגיקת-נתיב הוא בדיוק המקרה שבו מסך אחד
   מתוקן והשני נשאר מאחור, והתוצאה היא 403 שקט או — גרוע יותר — פנייה
   לנתיב של פורטל אחר.

   ⚠️ orgId ו-portalId מגיעים **אך ורק** מה-claims של הטוקן. המודול הזה
   מקבל אותם כפרמטרים ולא קורא ל-location, ל-DOM או ל-storage; מי שיעביר
   לכאן ערך מ-?p= או משדה-טופס עושה זאת באחריותו, והמסכים לא עושים זאת.

   ⚠️ הקוד טהור — אין DOM ואין רשת — כדי שייבדק ב-Node.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PortalPaths = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ORG_RE   = /^org_[0-9a-f]{32}$/;
  var PID_RE   = /^pid_[0-9a-f]{32}$/;
  var PROOF_RE = /^prf_[0-9a-z]{10,40}$/;
  var DB_KINDS = { portals: 1, portalProofs: 1 };

  function assertOrg(orgId) {
    var s = String(orgId || '');
    if (!ORG_RE.test(s)) throw new Error('מזהה-עסק לא חוקי');
    return s;
  }
  function assertPid(portalId) {
    var s = String(portalId || '');
    if (!PID_RE.test(s)) throw new Error('מזהה-פורטל לא חוקי');
    return s;
  }
  function assertProof(proofId) {
    var s = String(proofId || '');
    if (!PROOF_RE.test(s)) throw new Error('מזהה-עבודה לא חוקי');
    return s;
  }

  /* נתיב RTDB. רק שני סוגי-צומת מותרים — כל השאר זורק, כדי שהוספת צומת
     חדש תהיה החלטה מפורשת ולא שכחה. */
  function db(orgId, kind, portalId, rest) {
    if (!DB_KINDS[kind]) throw new Error('נתיב לא מורשה');
    var p = 'organizations/' + assertOrg(orgId) + '/' + kind + '/' + assertPid(portalId);
    if (rest) p += '/' + String(rest).replace(/^\/+/, '');
    return p;
  }

  /* קידומת קובצי-האחסון של פורטל מסוים. כל בדיקת-שייכות עוברת דרכה. */
  function filePrefix(orgId, portalId) {
    return 'organizations/' + assertOrg(orgId) + '/portalFiles/' + assertPid(portalId) + '/';
  }

  function filePath(orgId, portalId, proofId, fileName) {
    var f = String(fileName || '');
    if (!f || f.indexOf('/') >= 0 || f.indexOf('\\') >= 0) throw new Error('שם קובץ לא חוקי');
    return filePrefix(orgId, portalId) + assertProof(proofId) + '/' + f;
  }

  /* ⚠️ שער-הפתיחה. מחזיר true רק לנתיב שנמצא תחת הארגון **וגם** הפורטל
     של המשתמש. אם אחד מהם פסול — הפונקציה מחזירה false ולא זורקת, כדי
     שקריאה בלולאת-רינדור לא תפיל את כל המסך. */
  function ownsPath(orgId, portalId, path) {
    var s = String(path || '');
    if (s.indexOf('..') >= 0) return false;
    var pre;
    try { pre = filePrefix(orgId, portalId); } catch (e) { return false; }
    if (s.indexOf(pre) !== 0) return false;
    return s.length > pre.length;
  }

  /* ניקוי שם-קובץ: מסיר תווי-נתיב ובקרה, מקצר, ומוודא סיומת .pdf —
     חוקי ה-Storage דורשים file.matches('.*[.]pdf'). */
  function sanitizeFileName(name) {
    var s = String(name == null ? '' : name);
    s = s.replace(/^.*[\\\/]/, '');                 // כל מה שלפני המפריד האחרון
    s = s.replace(/[\x00-\x1f\x7f]/g, '');   // תווי-בקרה
    s = s.replace(/[\\\/:*?"<>|#%&+]/g, '_');       // תווים בעייתיים בנתיב/כתובת
    s = s.replace(/\.{2,}/g, '.');                  // ".." לא נשאר גם לא באמצע
    s = s.replace(/^[.\s]+|[.\s]+$/g, '');          // נקודות/רווחים בקצוות
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > 80) {
      var m = /\.pdf$/i.exec(s);
      s = s.slice(0, 76) + (m ? '.pdf' : '');
    }
    if (!/\.pdf$/i.test(s)) s = (s || 'file') + '.pdf';
    if (s === '.pdf') s = 'file.pdf';
    return s;
  }

  /* PDF בלבד — נבדק לפני כל בקשת-רשת. שם וגם סוג: דפדפנים לא תמיד
     ממלאים type, ולכן שם-הקובץ הוא התנאי המחייב והסוג הוא תנאי-פסילה. */
  function isPdf(file) {
    var f = file || {};
    var n = String(f.name || '');
    if (!/\.pdf$/i.test(n)) return false;
    var t = String(f.type || '');
    return t === '' || t.toLowerCase() === 'application/pdf';
  }

  /* מזהים חדשים. ה-rng מוזרק כדי שהבדיקות יהיו דטרמיניסטיות; במסך
     מעבירים Math.random. אין overwrite — כל העלאה מקבלת proofId חדש
     ושם-קובץ ייחודי. */
  function rand(n, rng) {
    var r = rng || Math.random, out = '';
    while (out.length < n) out += Math.floor(r() * 36).toString(36);
    return out.slice(0, n);
  }
  function newProofId(rng) { return 'prf_' + rand(20, rng); }
  function uniqueFileName(name, index, rng) {
    var i = Math.max(0, parseInt(index, 10) || 0) + 1;
    return String(i) + '-' + rand(6, rng) + '-' + sanitizeFileName(name);
  }

  return {
    ORG_RE: ORG_RE, PID_RE: PID_RE, PROOF_RE: PROOF_RE,
    db: db, filePrefix: filePrefix, filePath: filePath, ownsPath: ownsPath,
    sanitizeFileName: sanitizeFileName, isPdf: isPdf,
    newProofId: newProofId, uniqueFileName: uniqueFileName,
  };
});
