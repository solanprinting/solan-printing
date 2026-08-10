/* ═══════════════════════════════════════════════════════════════════════════
   doc-storage.js — פינוי צילומי-מסמכים מ-Storage. החלטות טהורות בלבד.

   ⚠️ **הבקשה (בעלים): "תשמור ב-Storage עם אפשרות למחיקה לאחר שה-Storage
   מלא".** כלומר המחיקה אינה אוטומטית ואינה תזמון — היא כלי שמופעל כשהמקום
   נגמר, ומראה מראש **בדיוק מה יימחק**.

   ⚠️ **הרשימה נבנית מהרשומות ולא מהדלי.** חוקי ה-Storage מתירים ‎get‎
   ו-‎delete‎ אבל **לא ‎list‎** — הדפדפן אינו יכול למנות את התוכן. לכן
   מקור-האמת הוא ‎agent_pending‎, שבו נשמר ‎photoPath‎ לכל צילום שהעלינו.
   המשמעות המעשית: קובץ שרשומתו נמחקה אינו נראה כאן. זה מכוון — עדיף
   לא-לראות מאשר למחוק על סמך ניחוש מה הקובץ.

   ⚠️ **מראה של ‎plan_cleanup‎ ב-pending_invoice.py.** שני הצדדים חייבים
   להסכים מה מותר למחוק; אם משנים כלל כאן, משנים גם שם — אחרת הבוט
   והאפליקציה יחלקו על מה בטוח למחוק, וזה ייגמר בקובץ שנמחק בטעות.

   ⚠️ **שם נפרד מ-storage-cleanup.js בכוונה.** הקובץ ההוא מנהל פינוי של
   קבצי-לקוחות (‏customerProofs) ומייצא ‎StorageCleanup‎ שבו משתמש
   ‏proof-admin. שני מודולי-פינוי תחת אותו שם גלובלי היו דורסים זה את זה.

   הרצת הבדיקות: node doc-storage-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DocStorage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };

  /* ── איסוף הצילומים מתוך הרשומות ───────────────────────────────────────
     ⚠️ **אותו קובץ יכול להופיע בשתי רשומות** (מסמך שנסרק פעמיים מייצר
     שתי רשומות עם אותו ‎docKey‎ ולכן אותו נתיב). איחוד לפי הנתיב הוא
     קריטי: בלעדיו התצוגה סופרת את אותם בייטים פעמיים, והמחיקה מנסה
     למחוק קובץ שכבר נמחק ונכשלת. */
  function collect(records) {
    var byPath = {}, out = [];
    (records || []).forEach(function (r) {
      if (!r) return;
      var path = String(r.photoPath || '').trim();
      if (!path) return;
      var at = num(r.approvedAt ? Date.parse(r.approvedAt) : 0) || num(r.id) || 0;
      var ex = byPath[path];
      if (ex) {
        /* הרשומה הפעילה ביותר קובעת: אם **אחת** מהן ממתינה, הקובץ נחוץ. */
        if (r.status === 'pending') ex.status = 'pending';
        if (at > ex.at) ex.at = at;
        ex.refs++;
        return;
      }
      var rec = { path: path, url: r.photoUrl || '', status: r.status || 'pending',
                  at: at, size: num(r.photoSize), refs: 1,
                  label: String(r.doc_number || r.docKey || r.file || path.split('/').pop() || ''),
                  kind: r.docKind || '' };
      byPath[path] = rec; out.push(rec);
    });
    return out;
  }

  /* ── מה למחוק ──────────────────────────────────────────────────────────
     שלושה כללים, וכולם נועדו למנוע מחיקה של עבודה שלא נעשתה:
       1. רק מסמכים שכבר טופלו (‎status !== 'pending'‎).
       2. הישנים ביותר קודם.
       3. לא נוגעים במסמך צעיר מ-‎minAgeMs‎.

     ⚠️ **מסמך ממתין אינו נמחק לעולם, גם כשהאחסון מלא לגמרי.** צילום
     שממתין להכרעה הוא היחיד שאי אפשר לשחזר בלעדיו — מחיקתו פירושה
     חשבונית שאיש לא יזין. עדיף אחסון מלא מאשר חשבונית שנעלמה.

     ⚠️ מפנה עד ‎keepRatio‎ ולא עד הסוף: מחיקה שמשאירה את האחסון על
     99% תחזור לדרוש פינוי מחר. */
  function planCleanup(items, usedBytes, capBytes, opts) {
    var o = opts || {};
    var keep = o.keepRatio === undefined ? 0.70 : num(o.keepRatio);
    var minAge = num(o.minAgeMs), now = num(o.nowMs) || 0;
    var used = num(usedBytes), cap = num(capBytes);
    if (cap <= 0 || used <= cap * keep) return { toDelete: [], freed: 0, needed: 0 };
    var target = cap * keep;
    var needed = used - target;
    var done = (items || []).filter(function (r) {
      if (!r || r.status === 'pending') return false;
      if (minAge && now && (now - num(r.at)) < minAge) return false;
      return true;
    });
    done.sort(function (a, b) { return num(a.at) - num(b.at); });
    var out = [], freed = 0;
    for (var i = 0; i < done.length; i++) {
      if (used - freed <= target) break;
      out.push(done[i]);
      freed += num(done[i].size);
    }
    return { toDelete: out, freed: freed, needed: needed };
  }

  /* ⚠️ מפריד בין "תפוס" ל"ניתן לפינוי": מספר יחיד היה מסתיר שרוב
     האחסון תפוס במסמכים ממתינים, ושפינוי לא יעזור. */
  function summarize(items) {
    var total = 0, pending = 0, freeable = 0, unknown = 0;
    (items || []).forEach(function (r) {
      var s = num(r.size);
      total += s;
      if (!s) unknown++;
      if (r.status === 'pending') pending += s; else freeable += s;
    });
    return { count: (items || []).length, total: total, pending: pending,
             freeable: freeable, unknownSize: unknown };
  }

  function fmtBytes(b) {
    var n = num(b);
    if (n <= 0) return '0';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  return { collect: collect, planCleanup: planCleanup,
           summarize: summarize, fmtBytes: fmtBytes };
});
