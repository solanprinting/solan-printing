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

  /* ── אפקטי-שקיפות: התצוגה-המקדימה עלולה להטעות (דיווח-בעלים 10/09/2026) ──
     מבט-חצור 90: עמוד 77 הציג בפורטל "עיגול אפור" ועמוד 4 "מלל" — ובקובץ
     שהורד לא היו. בבייטים: אין הערות ואין שכבות; **יש** מיזוג ‎/Overlay‎,
     11 מסיכות-רכות ו-6 קבוצות-שקיפות. אלה בדיוק המבנים ש-pdf.js (מנוע
     התצוגה) מרכיב אחרת מ-Acrobat — אותה משפחה של עמ' 43 הפתוח.
     ⚠️ זו **הערה**, לא חסימה: הקובץ תקין ויודפס נכון. מה שנדרש הוא שהלקוח
     והדפוס ידעו מראש שהתצוגה כאן אינה מחייבת — ולא יבזבזו זמן על הבדל
     שאינו קיים בהדפסה. ספירה גולמית על הבייטים, כמו countObjects. */
  var FX_SMASK_MIN = 3, FX_GROUP_MIN = 3;   // מסיכה בודדת (צל אחד) אינה מדאיגה
  var FX_CAVEAT = 'אפקטי-שקיפות בקובץ (מסיכות/מיזוג) — התצוגה-המקדימה בפורטל עלולה להיות שונה מההדפסה; הקובץ עצמו תקין ויודפס כפי שהוא';
  function _countSeq(u8, seq) {
    if (!u8 || !u8.length) return 0;
    var n = 0, L = seq.length;
    for (var i = 0; i + L <= u8.length; i++) {
      var ok = true;
      for (var j = 0; j < L; j++) { if (u8[i + j] !== seq[j]) { ok = false; break; } }
      if (ok) { n++; i += L - 1; }
    }
    return n;
  }
  function _seq(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; }
  var _S_SMASK = _seq('/SMask'), _S_BM = _seq('/BM'), _S_BMN = _seq('/BM/Normal'), _S_BMN2 = _seq('/BM /Normal'), _S_TG = _seq('/S/Transparency'), _S_TG2 = _seq('/S /Transparency');
  function assessFx(u8) {
    var smask = _countSeq(u8, _S_SMASK);
    var bmAll = _countSeq(u8, _S_BM), bmNormal = _countSeq(u8, _S_BMN) + _countSeq(u8, _S_BMN2);
    var blend = Math.max(0, bmAll - bmNormal);
    var groups = _countSeq(u8, _S_TG) + _countSeq(u8, _S_TG2);
    var heavy = blend > 0 || smask >= FX_SMASK_MIN || groups >= FX_GROUP_MIN;
    return { smask: smask, blendNonNormal: blend, groups: groups, heavy: heavy, message: heavy ? FX_CAVEAT : '' };
  }
  /* האם אזהרה נתונה היא "הערת-תצוגה" (ולא כשל-קובץ) — לצרכני התצוגה */
  function isPreviewCaveat(msg) { return String(msg || '').indexOf('אפקטי-שקיפות') >= 0; }

  return { countObjects: countObjects, assess: assess, assessBytes: assessBytes,
           assessFx: assessFx, isPreviewCaveat: isPreviewCaveat, FX_CAVEAT: FX_CAVEAT,
           FX_SMASK_MIN: FX_SMASK_MIN, FX_GROUP_MIN: FX_GROUP_MIN,
           PER_PAGE_HEAVY: PER_PAGE_HEAVY, TOTAL_HEAVY: TOTAL_HEAVY };
});
