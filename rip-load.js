/* ═══════════════════════════════════════════════════════════════════════════
   rip-load.js — התראת "קובץ עמוס-וקטורים" שתוקע את ה-RIP (אפוגי).

   בקשת-בעלים 16/08/2026: קובץ עם אלפי אובייקטים וקטוריים תוקע את אפוגי
   ולא מאפשר לבנות לוחות. הזיהוי כאן — ספירת האובייקטים העקיפים בקובץ
   ("N 0 obj") על הבייטים הגולמיים, בלי פענוח-זרמים: פרוקסי זול ואמין
   לעומס-RIP. ההודעה: לבקש מהלקוח קובץ **משוטח**.

   ⚠️ ספים שמרניים בכוונה: עיתון-מודעות לגיטימי מגיע למאות אובייקטים
   לעמוד; ההתראה נועדה ל"קיצוני של כמה אלפים", לא להציף כל קובץ עשיר. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RipLoad = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PER_PAGE_HEAVY = 2000;    // אובייקטים-לעמוד שמעליהם מתריעים
  var TOTAL_HEAVY = 60000;      // או סך-הכול בקובץ

  /* ספירת " obj" בבייטים (0x20 6F 62 6A) — כל אובייקט עקיף מופיע פעם
     אחת כ-"N G obj". סריקה לינארית, בלי מחרוזות-ענק. */
  function countObjects(u8) {
    if (!u8 || !u8.length) return 0;
    var n = 0;
    for (var i = 0; i + 3 < u8.length; i++) {
      if (u8[i] === 0x20 && u8[i + 1] === 0x6F && u8[i + 2] === 0x62 && u8[i + 3] === 0x6A) {
        /* ‏" obj" חייב להסתיים שם — ‏" objx" (טקסט) אינו אובייקט */
        var nx = (i + 4 < u8.length) ? u8[i + 4] : 0x0A;
        var word = (nx >= 0x30 && nx <= 0x39) || (nx >= 0x41 && nx <= 0x5A) || (nx >= 0x61 && nx <= 0x7A);
        if (!word) n++;
        i += 3;
      }
    }
    return n;
  }

  function assess(objCount, pageCount) {
    var pc = Math.max(1, Number(pageCount) || 1);
    var oc = Math.max(0, Number(objCount) || 0);
    var per = Math.round(oc / pc);
    var heavy = per >= PER_PAGE_HEAVY || oc >= TOTAL_HEAVY;
    return {
      objects: oc, perPage: per, heavy: heavy,
      message: heavy
        ? ('הקובץ עמוס-וקטורים (' + oc.toLocaleString('he-IL') + ' אובייקטים · ~' + per.toLocaleString('he-IL')
           + ' לעמוד) — עומס כזה תוקע את ה-RIP בדפוס. מומלץ לייצא קובץ משוטח (Flatten) ולהעלות שוב')
        : '',
    };
  }

  function assessBytes(u8, pageCount) { return assess(countObjects(u8), pageCount); }

  return { countObjects: countObjects, assess: assess, assessBytes: assessBytes,
           PER_PAGE_HEAVY: PER_PAGE_HEAVY, TOTAL_HEAVY: TOTAL_HEAVY };
});
