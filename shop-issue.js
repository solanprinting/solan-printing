/* ═══════════════════════════════════════════════════════════════════════════
   shop-issue.js — כרטיס-גיליון במסך "לקוחות ועבודות".

   ⚠️ **הבקשה (בעלים 11/08/2026):** "החלק האמצעי יהיה יותר מרווח עם לחצנים
   ברורים… וכל גיליון יהיה בנפרד ולא יראו את הגיליון הקודם בצורה פתוחה —
   בלחיצה ייפתח הגיליון הקודם. לחצן אושר להדפסה, לחצן דרוש תיקון."

   ⚠️ **גיליון אחד פתוח בכל רגע.** הרשימה של לקוח ותיק היא עשרות גיליונות;
   כשכולם פתוחים, זה שעובדים עליו נבלע בהיסטוריה. הפתוח כברירת-מחדל הוא
   **החדש-הפעיל**, כי הוא זה שעובדים עליו — לא פשוט "האחרון שנוצר".

   ⚠️ **"אושר להדפסה" הוא שדה חדש (‎printApprovedAt/By‎), ולא שימוש-מחדש.**
   ‏approvedAt = הלקוח שלח · apogeeApprovedAt = הלקוח אישר פרופר ·
   completedAt = העבודה נגמרה. אף אחד מהם אינו "בית-הדפוס אישר להדפסה",
   ודחיסה לתוך אחד מהם הייתה שוברת את מי שקורא אותו היום.

   הרצת הבדיקות: node shop-issue-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShopIssue = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var str = function (v) { return String(v == null ? '' : v).trim(); };

  function idOf(p) { return str((p || {}).id || (p || {})._id); }
  function timeOf(p) {
    var r = p || {};
    return num(r.createdAt) || num(r.approvedAt) || 0;
  }
  function isActive(p) {
    var r = p || {};
    return !num(r.completedAt) && !num(r.closedAt);
  }

  /* חדש→ישן. ⚠️ מיון יציב לפי מזהה כשהזמנים שווים: שתי עבודות שנוצרו
     באותה שנייה היו מתחלפות בכל רינדור, והמסך "קופץ". */
  function sortIssues(list) {
    return (list || []).slice().sort(function (a, b) {
      var d = timeOf(b) - timeOf(a);
      return d !== 0 ? d : (idOf(a) < idOf(b) ? 1 : -1);
    });
  }

  /* איזה גיליון פתוח. ⚠️ בחירה מפורשת גוברת — אבל **רק אם היא עדיין
     קיימת ברשימה**: מזהה של עבודה שנמחקה או שעברה ללקוח אחר היה משאיר
     את המסך בלי שום גיליון פתוח, כלומר נראה ריק. */
  function openId(list, explicit) {
    var rows = sortIssues(list), ex = str(explicit);
    if (ex && rows.some(function (p) { return idOf(p) === ex; })) return ex;
    for (var i = 0; i < rows.length; i++) if (isActive(rows[i])) return idOf(rows[i]);
    return rows.length ? idOf(rows[0]) : '';
  }

  /* ── מצב הגיליון ─────────────────────────────────────────────────────────
     סדר הבדיקות הוא סדר-הגמר: מה שקרה אחרון גובר. */
  function statusOf(p) {
    var r = p || {};
    if (num(r.completedAt)) return { key: 'done', label: '🏁 הושלם', cls: 'b-done' };
    if (num(r.printApprovedAt)) return { key: 'print', label: '✅ אושר להדפסה', cls: 'b-approved' };
    if (num(r.closedAt)) return { key: 'closed', label: '🔒 סגור להעלאה', cls: 'b-wait' };
    if (num(r.apogeeApprovedAt) || r.foldApprovalStatus === 'approved')
      return { key: 'customer-ok', label: '✓ הלקוח אישר', cls: 'b-approved' };
    if (r.status === 'approved' || r.status === 'parts' || num(r.approvedAt) || r.parts)
      return { key: 'received', label: '📥 התקבל', cls: 'b-new' };
    return { key: 'waiting', label: '⏳ ממתין לקבצים', cls: 'b-wait' };
  }

  function printApproved(p) { return num((p || {}).printApprovedAt) > 0; }

  /* ⚠️ "אשר קבלה ללקוח" הוא ‎shopSeenAt‎ הקיים — אותו שדה שהפורטל כבר
     מציג כ"בית-הדפוס קיבל את הקבצים". שדה חדש כאן היה יוצר שני מקורות
     לאותה אמירה, ואחד מהם היה מפגר אחרי השני. */
  function seenAt(p) {
    var r = p || {}, m = num(r.shopSeenAt);
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).forEach(function (k) {
      var t = num((parts[k] || {}).shopSeenAt); if (t > m) m = t;
    });
    return m;
  }
  /* עוזר: יש בעבודה קבצים מהעלאה-מקובצת של הפורטל (‎files:{f0:{fileUrl}}‎).
     ⚠️ 13/08/2026: המבנה הזה נכתב ע"י customer-portal.html **בלי**
     approvedAt/fileUrl/parts/apogeeUrl (רק source:'portal' + files + createdAt).
     הוא נשמט מ-hasArrived ומ-unitsOf, ולכן עיתון שהלקוח **כן** העלה נראה
     ל-hasArrived כ"ריק" — והגידור החדש (cardActions) הסתיר עליו את הכפתורים
     והציג "טרם התקבלו קבצים", בזמן שהטבלה הקלאסית מציגה אותם להורדה.
     נתפס בביקורת אדוורסרית לפני פריסה. */
  function fileEntries(p) {
    var r = p || {}, files = (r.files && typeof r.files === 'object') ? r.files : {};
    return Object.keys(files).map(function (k) { return files[k] || {}; })
                 .filter(function (f) { return str(f.fileUrl); });
  }

  /* יש מה לאשר רק כשבאמת הגיע משהו. ⚠️ כפתור "אשר קבלה" על גיליון ריק
     מאשר ללקוח קבלה של כלום. */
  function hasArrived(p) {
    var r = p || {};
    if (num(r.approvedAt) || str(r.fileUrl) || str(r.apogeeUrl)) return true;
    if (fileEntries(r).length) return true;
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    return Object.keys(parts).some(function (k) { return str((parts[k] || {}).fileUrl); });
  }

  /* ── אילו פעולות מוצגות על הכרטיס הפתוח ─────────────────────────────────
     ⚠️ 13/08/2026, דיווח-בעלים: גיליון שממתין לקבצים הציג "אושר להדפסה",
     "דרוש תיקון" ו"הורד" — נראה כאילו אפשר להוריד ולאשר בשם הלקוח, כשאין
     על מה. אותו עיקרון בדיוק כמו "אשר קבלה" (hasArrived, למעלה): פעולה
     בלי מושא אינה מוצגת. ההחלטה כאן — טהורה ונבדקת; הכרטיס רק מצייר. */
  function cardActions(p) {
    var arrived = hasArrived(p);
    return { canPrintApprove: arrived, canRequestFix: arrived,
             canDownload: arrived, showUploadHint: !arrived };
  }

  /* ── היחידות שאפשר לצפות/להוריד ─────────────────────────────────────────
     ריצה בלי קובץ אינה יחידה: כפתור שמוביל לכלום גרוע מהיעדרו. */
  function unitsOf(p) {
    var r = p || {}, out = [];
    if (str(r.fileUrl)) out.push({ kind: 'full', partId: '', label: 'העיתון המלא',
                                   url: str(r.fileUrl), pages: num(r.pageCount) });
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).map(function (k) {
      var t = parts[k] || {};
      return { kind: 'part', partId: k, label: str(t.name) || 'ריצה',
               url: str(t.fileUrl), pages: num(t.pageCount), at: num(t.approvedAt) };
    }).filter(function (u) { return !!u.url; })
      .sort(function (a, b) { return a.at - b.at; })
      .forEach(function (u) { out.push(u); });
    /* ⚠️ קבצי העלאה-מקובצת של הפורטל (‎files:{}‎) — קובץ גולמי לכל אחד,
       בלי דפדוף (אין assemble כמו ל-parts). מוצג כ-kind:'file', ולכן
       הכרטיס נותן לו הורדה ישירה ולא קישור-דפדוף. ראה fileEntries. */
    fileEntries(r).forEach(function (f) {
      out.push({ kind: 'file', partId: '', label: str(f.fileName) || 'קובץ',
                 url: str(f.fileUrl), pages: 0 });
    });
    if (!out.length && str(r.apogeeUrl))
      out.push({ kind: 'apogee', partId: '', label: 'פרופר לאישור', url: str(r.apogeeUrl), pages: num(r.pageCount) });
    return out;
  }

  /* ── מה מוצג על הכרטיס המכווץ ───────────────────────────────────────────
     ⚠️ מספיק כדי להחליט אם לפתוח, בלי לפתוח. */
  function summaryOf(p) {
    var r = p || {}, u = unitsOf(r);
    var pages = u.length ? u.reduce(function (s, x) { return s + x.pages; }, 0) : num(r.pageCount);
    var pend = [];
    (r.pendingPages || []).forEach(function (x) { if (pend.indexOf(x) < 0) pend.push(x); });
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).forEach(function (k) {
      ((parts[k] || {}).pendingPages || []).forEach(function (x) { if (pend.indexOf(x) < 0) pend.push(x); });
    });
    return {
      id: idOf(r), title: str(r.title) || 'עיתון', issue: str(r.issue),
      at: timeOf(r), units: u.length, pages: pages,
      status: statusOf(r), seen: seenAt(r) > 0, arrived: hasArrived(r),
      pendingPages: pend.sort(function (a, b) { return num(a) - num(b); }),
      version: num(r.version) || 1, corrected: num(r.correctedAt) > 0
    };
  }

  /* כותרת קריאה לגיליון. ⚠️ מספר-הגיליון הוא מה שמבדיל בין שורות באותו
     שם, ולכן הוא חלק מהכותרת ולא פרט-משנה. */
  function titleOf(p) {
    var r = p || {}, t = str(r.title) || 'עיתון';
    return r.issue ? (t + ' · גיליון ' + str(r.issue)) : t;
  }

  /* ── הפעולה "אושר להדפסה" ────────────────────────────────────────────────
     ⚠️ מתג דו-כיווני: אישור בטעות חייב להיות הפיך, אחרת מתקנים אותו
     במסד-הנתונים. ‎null‎ מוחק את השדה במסלול REST. */
  function printApprovePatch(p, opts) {
    var o = opts || {};
    return printApproved(p)
      ? { printApprovedAt: null, printApprovedBy: null }
      : { printApprovedAt: num(o.at) || 0, printApprovedBy: str(o.by) || 'בית-הדפוס' };
  }
  function printApproveLabel(p) {
    return printApproved(p) ? '↩ בטל אישור-הדפסה' : '✅ אושר להדפסה';
  }

  return {
    idOf: idOf, timeOf: timeOf, isActive: isActive,
    sortIssues: sortIssues, openId: openId,
    statusOf: statusOf, printApproved: printApproved,
    seenAt: seenAt, hasArrived: hasArrived,
    unitsOf: unitsOf, summaryOf: summaryOf, titleOf: titleOf, cardActions: cardActions,
    printApprovePatch: printApprovePatch, printApproveLabel: printApproveLabel
  };
});
