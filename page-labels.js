/* ═══════════════════ page-labels.js — מספור-עמודים אמיתי בקובץ ═══════════════
   ⚠️ **בקשת-בעלים 23/08/2026.** "מורידים ריצה ומעבירים לאפוגי — לדוגמה
   ריצה 4, 32 עמודים מתוך 112, עמ' 41-72 — ובאפוגי רואים 1 עד 32, והשם
   אינו המספר. אי-אפשר לדעת איזה עמוד זה בלי לפתוח."

   הפתרון: ‎/PageLabels‎ — המנגנון התקני של PDF להצגת מספור שאינו 1..N.
   ‏(אומת מול הבעלים: אפוגי מכבד תוויות-עמוד.)

   ⚠️⚠️ **ריצה אינה טווח רציף.** זו הטעות הקלה כאן. ריצה היא **קונטרס**:
   בעיתון 112 עמ' על גיליון 32, ריצה 1 היא עמ' 1-8 **וגם** 105-112.
   ‏‎St‎ יחיד היה מתאים רק לריצה הפנימית (ריצה 4 = 41-72, רציפה במקרה).
   לכן ‎Nums‎ נבנה **מקטע לכל רצף**: לכל קפיצה במספרי-העמודים נפתחת
   רשומה חדשה. מקור-האמת לרצף הוא ‎ShopIssue.runLayout‎, לא ניחוש.

   מבנה היעד:
     /PageLabels << /Nums [ 0 << /S /D /St 1 >>  8 << /S /D /St 105 >> ] >>
   כלומר: מאינדקס 0 — ספרות עשרוניות שמתחילות ב-1; מאינדקס 8 — מ-105.

   הרצת הבדיקות: node page-labels-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PageLabels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _int(v) { var n = Number(v); return (isFinite(n) && n === Math.floor(n)) ? n : NaN; }

  /* ── רצפי-מספור מתוך רשימת מספרי-העמוד של הריצה ──────────────────────────
     ‏seq = [41,42,…,72] או [1,…,8,105,…,112]. מחזיר
     ‎[{ at: <אינדקס-בקובץ>, start: <מספר-העמוד המוצג> }, …]‎.
     ⚠️ מחזיר [] על קלט שאינו רשימת שלמים חיוביים — **נכשל-סגור**: בלי
     תוויות הקובץ נשאר 1..N כמו היום, וזה גרוע מלסמן מספרים שגויים.
     קובץ עם מספור שגוי הוא עמוד שיודפס במקום הלא-נכון. */
  function ranges(seq) {
    if (!Array.isArray(seq) || !seq.length) return [];
    var out = [], prev = NaN;
    for (var i = 0; i < seq.length; i++) {
      var n = _int(seq[i]);
      if (!(n >= 1)) return [];                      // קלט שבור — אין תוויות
      if (i === 0 || n !== prev + 1) out.push({ at: i, start: n });
      prev = n;
    }
    return out;
  }

  /* האם בכלל שווה לכתוב תוויות. רצף שמתחיל ב-1 ורציף לגמרי הוא בדיוק
     מה שקורא-ה-PDF מציג ממילא — כתיבה כזו רק מנפחת את הקובץ. */
  function needed(seq) {
    var r = ranges(seq);
    if (!r.length) return false;
    return !(r.length === 1 && r[0].at === 0 && r[0].start === 1);
  }

  /* ── כתיבה לקטלוג ────────────────────────────────────────────────────────
     ‏doc = PDFDocument של pdf-lib; ‏L = אובייקט PDFLib (מוזרק, כדי שהמודול
     יישאר טהור ובר-בדיקה). מחזיר true אם נכתב.
     ⚠️ נכשל-רך: קובץ-הדפוס חשוב מהתווית. אם הכתיבה נכשלה — מחזיר false,
     והקורא ממשיך עם הקובץ כמות-שהוא במקום לאבד אותו. */
  function apply(doc, L, seq) {
    try {
      if (!doc || !L || !L.PDFName) return false;
      var r = ranges(seq);
      if (!r.length || !needed(seq)) return false;
      var ctx = doc.context;
      var nums = [];
      for (var i = 0; i < r.length; i++) {
        nums.push(r[i].at);
        nums.push(ctx.obj({ S: L.PDFName.of('D'), St: r[i].start }));
      }
      doc.catalog.set(L.PDFName.of('PageLabels'), ctx.obj({ Nums: ctx.obj(nums) }));
      return true;
    } catch (e) {
      try { console.error('PageLabels: כתיבת מספור-העמודים נכשלה — הקובץ יורד בלעדיה', e); } catch (_) {}
      return false;
    }
  }

  /* ── תווית קריאה לבן-אדם, לשם-הקובץ ולממשק ───────────────────────────────
     ‏[41..72] → "41-72" · [1..8,105..112] → "1-8+105-112". אותו ניסוח
     שהמסך כבר מציג בפריסת-הריצות, כדי שהשם והמסך יאמרו אותו דבר. */
  function spanLabel(seq) {
    var r = ranges(seq);
    if (!r.length) return '';
    var parts = [];
    for (var i = 0; i < r.length; i++) {
      var from = r[i].start;
      var next = (i + 1 < r.length) ? r[i + 1].at : seq.length;
      var to = from + (next - r[i].at) - 1;
      parts.push(from === to ? String(from) : (from + '-' + to));
    }
    return parts.join('+');
  }

  return { ranges: ranges, needed: needed, apply: apply, spanLabel: spanLabel };
});
