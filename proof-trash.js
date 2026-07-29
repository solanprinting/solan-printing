/* ═══════════ proof-trash.js — סל-מיחזור לקבצי לקוחות (customerProofs) ═══════════
   רקע: 🗑 במסך "לקוחות עיתונים" מחק קבצי לקוחות מיידית ולצמיתות (Storage+RTDB).
   לחיצה בטעות = אובדן קובץ שהלקוח כבר לא יעלה שוב. הפתרון: מחיקה = מעבר לסל-מיחזור
   (customerProofsTrash) — הרשומה ב-RTDB מוסרת מהרשימה החיה, אבל הקובץ ב-Storage
   *לא נמחק* עד לניקוי אוטומטי אחרי חלון-חסד (ברירת מחדל 30 יום), או מחיקה ידנית
   מפורשת מתוך הסל.

   הקוד טהור (אין DOM/רשת) כדי שייבדק ב-Node; הקריאות בפועל ל-RTDB/Storage ב-proof-admin.html. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProofTrash = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_GRACE_DAYS = 30;
  var DAY_MS = 24 * 60 * 60 * 1000;

  /* בונה רשומת-סל למחיקת ריצה (part) בודדת מתוך עבודה עם כמה ריצות */
  function buildPartTrashEntry(jobId, part, jobMeta, deletedAt){
    if (!jobId || !part) return null;
    return {
      type: 'part',
      jobId: String(jobId),
      partId: part.pid || part.partId || null,
      customer: (jobMeta && jobMeta.customer) || '',
      title: (jobMeta && jobMeta.title) || '',
      name: part.name || '',
      fileUrl: part.fileUrl || null,
      filePath: part.filePath || null,
      pagesUrl: part.pagesUrl || null,
      pageCount: part.pageCount || null,
      deletedAt: deletedAt || 0
    };
  }

  /* בונה רשומת-סל למחיקת עבודה שלמה (כולל כל הריצות שבתוכה, אם יש) */
  function buildJobTrashEntry(job, deletedAt){
    if (!job || !job.id) return null;
    var parts = job.parts ? Object.keys(job.parts).map(function (pid){
      var pt = job.parts[pid];
      return { pid: pid, name: pt.name || '', fileUrl: pt.fileUrl || null, filePath: pt.filePath || null };
    }) : [];
    return {
      type: 'job',
      jobId: String(job.id),
      customer: job.customer || '',
      title: job.title || '',
      fileUrl: job.fileUrl || null,
      filePath: job.filePath || null,
      parts: parts,
      deletedAt: deletedAt || 0
    };
  }

  /* כמה ימים חלפו ממחיקה, ואם עבר חלון-החסד — מותר לנקות לצמיתות מ-Storage */
  function daysSince(deletedAt, now){
    if (!deletedAt) return 0;
    return Math.floor(((now || 0) - deletedAt) / DAY_MS);
  }
  function isPurgeEligible(entry, now, graceDays){
    if (!entry || !entry.deletedAt) return false;
    var g = (graceDays == null) ? DEFAULT_GRACE_DAYS : graceDays;
    return daysSince(entry.deletedAt, now) >= g;
  }
  /* מתוך רשימת ערכים בסל — אילו מוכנים לניקוי אוטומטי סופי */
  function purgeable(entries, now, graceDays){
    return (entries || []).filter(function (e){ return isPurgeEligible(e, now, graceDays); });
  }
  /* כל נתיבי-Storage של רשומת-סל (job עם parts, או part בודד) — לניקוי */
  function storagePaths(entry){
    if (!entry) return [];
    var out = [];
    if (entry.filePath) out.push(entry.filePath);
    (entry.parts || []).forEach(function (p){ if (p && p.filePath) out.push(p.filePath); });
    return out;
  }

  function daysLeft(entry, now, graceDays){
    var g = (graceDays == null) ? DEFAULT_GRACE_DAYS : graceDays;
    return Math.max(0, g - daysSince(entry && entry.deletedAt, now));
  }

  /* שורת-תיאור קריאה לתצוגה בסל */
  function describe(entry){
    if (!entry) return '';
    var base = [entry.customer, entry.title].filter(Boolean).join(' · ') || 'עיתון';
    return (entry.type === 'part' && entry.name) ? (base + ' — ' + entry.name) : base;
  }

  /* מיון: החדש-שנמחק ראשון */
  function sortByDeletedDesc(entries){
    return (entries || []).slice().sort(function (a, b){ return (b.deletedAt || 0) - (a.deletedAt || 0); });
  }

  return {
    DEFAULT_GRACE_DAYS: DEFAULT_GRACE_DAYS,
    buildPartTrashEntry: buildPartTrashEntry,
    buildJobTrashEntry: buildJobTrashEntry,
    daysSince: daysSince,
    daysLeft: daysLeft,
    isPurgeEligible: isPurgeEligible,
    purgeable: purgeable,
    storagePaths: storagePaths,
    describe: describe,
    sortByDeletedDesc: sortByDeletedDesc
  };
});
