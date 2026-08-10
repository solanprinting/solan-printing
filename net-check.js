/* ═══════════════════════════════════════════════════════════════════════════
   net-check.js — אילו דומיינים המערכת צריכה, ומה לעשות כשהם חסומים.

   ⚠️ **הרקע (10/08/2026).** לקוח על אינטרנט מסונן לא הצליח לפתוח את
   הפורטל. הקישור והשרת היו תקינים לגמרי — הדומיין פשוט לא נגיש ממכשירו.

   ⚠️ **אין כאן עקיפה של הסינון, וזו החלטה ולא מגבלה.** הלקוח בחר את
   הסינון במכוון; עקיפה פועלת נגד מה שהוא ביקש לעצמו, ונשברת בעדכון
   הבא של המסנן ממילא. הדרך שעובדת היא **אישור הדומיין** אצל הספק —
   פתרון קבוע שחל על כל הלקוחות שעל אותו ספק.

   ⚠️ ולכן החלוקה ל"חיוני" ו"לא חיוני" היא העיקר: בקשת-אישור של שלושה
   דומיינים מאושרת; בקשה של שמונה נראית כמו בקשה לפתוח את האינטרנט,
   ונדחית. מה שאינו חיוני חייב להיות מסומן ככזה.

   הרצת הבדיקות: node net-check-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetCheck = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RTDB = 'solan-printing-default-rtdb.europe-west1.firebasedatabase.app';
  var BUCKET = 'solan-printing.firebasestorage.app';

  /* ⚠️ ‎essential:true‎ = בלעדיו העיתון לא ייפתח. ‎false‎ = פוגע בנוחות
     בלבד, ויש לו נפילה-לאחור בקוד. הסימון הזה הוא מה שהופך את בקשת
     האישור לקצרה ולסבירה. */
  var HOSTS = [
    { host: 'solanprinting.github.io', essential: true,
      what: 'האתר עצמו', url: 'https://solanprinting.github.io/solan-printing/version.txt' },
    { host: 'identitytoolkit.googleapis.com', essential: true,
      what: 'כניסה לחשבון', url: 'https://identitytoolkit.googleapis.com/v1/projects' },
    { host: 'securetoken.googleapis.com', essential: true,
      what: 'חידוש הכניסה', url: 'https://securetoken.googleapis.com/v1/token' },
    { host: RTDB, essential: true,
      what: 'רשימת העיתונים', url: 'https://' + RTDB + '/.json?shallow=true' },
    { host: 'firebasestorage.googleapis.com', essential: true,
      what: 'קובץ העיתון', url: 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o' },
    /* ⚠️ ספריית-התצוגה: יש לה שתי מראות, ולכן די באחת מהן. סימון שתיהן
       כחיוניות היה מנפח את הבקשה בלי צורך. */
    { host: 'cdn.jsdelivr.net', essential: false, mirrorOf: 'pdf',
      what: 'מנוע הדפדוף (מראה א׳)', url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist/package.json' },
    { host: 'cdnjs.cloudflare.com', essential: false, mirrorOf: 'pdf',
      what: 'מנוע הדפדוף (מראה ב׳)', url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' },
    { host: 'fonts.googleapis.com', essential: false,
      what: 'גופנים (עיצוב בלבד)', url: 'https://fonts.googleapis.com/css?family=Heebo' }
  ];

  /* ── סיכום התוצאות ─────────────────────────────────────────────────────
     results: { host: true|false }  (true = נגיש)
     ⚠️ מנוע-הדפדוף נחשב חסום רק כששתי המראות חסומות — אחרת דיווח על
     "חסימה" היה מופיע גם כשהכל עובד דרך המראה השנייה. */
  function summarize(results) {
    var r = results || {};
    var blocked = [], blockedEssential = [], pdfMirrors = 0, pdfBlocked = 0;
    HOSTS.forEach(function (h) {
      var ok = r[h.host] === true;
      if (h.mirrorOf === 'pdf') { pdfMirrors++; if (!ok) pdfBlocked++; }
      if (ok) return;
      blocked.push(h);
      if (h.essential) blockedEssential.push(h);
    });
    var pdfDown = pdfMirrors > 0 && pdfBlocked === pdfMirrors;
    if (pdfDown) {
      blocked.filter(function (h) { return h.mirrorOf === 'pdf'; })
             .forEach(function (h) { blockedEssential.push(h); });
    }
    var known = HOSTS.filter(function (h) { return r[h.host] !== undefined; }).length;
    return { blocked: blocked, blockedEssential: blockedEssential,
             pdfDown: pdfDown, tested: known, total: HOSTS.length,
             ok: known === HOSTS.length && blockedEssential.length === 0 };
  }

  /* ── הטקסט שנשלח לספק-הסינון ───────────────────────────────────────────
     ⚠️ נוסח מוכן-לשליחה ולא רשימת-דומיינים יבשה: בקשה שמסבירה מה
     המערכת עושה ולמה הדומיין נחוץ מאושרת בסיכוי גבוה בהרבה. */
  function requestText(sum, customer) {
    var s = sum || { blockedEssential: [] };
    var list = s.blockedEssential || [];
    if (!list.length) return '';
    var lines = [];
    lines.push('שלום,');
    lines.push('');
    lines.push('אנחנו בית דפוס. הלקוח שלנו' + (customer ? ' (' + customer + ')' : '')
             + ' צריך לצפות בעיתון שלו ולאשר אותו להדפסה דרך מערכת האישורים שלנו,');
    lines.push('והגישה נחסמת. נשמח לאישור הכתובות הבאות — הן משמשות אך ורק להצגת');
    lines.push('קובץ ההדפסה של הלקוח עצמו:');
    lines.push('');
    list.forEach(function (h) { lines.push('  ' + h.host + '   — ' + h.what); });
    lines.push('');
    lines.push('תודה רבה,');
    lines.push('סולן הדפסות · 03-9042333');
    return lines.join('\n');
  }

  return { HOSTS: HOSTS, RTDB: RTDB, summarize: summarize, requestText: requestText };
});
