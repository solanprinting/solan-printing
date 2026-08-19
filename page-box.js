/* ═══════════════════ page-box.js — איזו תיבה היא "העמוד" ═══════════════════
   ⚠️ **דיווח-בעלים 19/08/2026, שלושה תסמינים ושורש אחד.**
     · הפורטל התריע "לא בגודל" על עמודים, ובמסך-הדפוס לא הופיע שום חיווי.
     · אפוגי **לא** התריע על אותם עמודים.
     · בדפדוף אותם עמודים הוצגו בגודל שונה מהתקינים, והחוברת נראתה עקומה.
   השורש: כל צרכן מדד תיבה אחרת. הפורטל — ‎getViewport‎ של pdf.js (כלומר
   ‏CropBox); הדפדוף — ‎getMediaBox‎; אפוגי — **ArtBox**. שלושה מספרים לאותו
   עמוד, ולכן שלוש מסקנות סותרות.

   ⚠️ **TrimBox הוא הקובע.** זו התיבה של **גודל-העמוד הגמור אחרי חיתוך**,
   וזו זו שאפוגי קורא. מי שמודד MediaBox רואה גם את הגלישה ואת סימוני-
   החיתוך, ולכן "מגלה" הפרש של כמה מ"מ שאינו קיים — או מפספס עמוד שבאמת
   חורג.
   ⚠️ **תוקן 19/08/2026 אחרי שנכתב הפוך.** בתחילה נכתב כאן ArtBox קודם,
   על סמך הבנה מוטעית של מה שאפוגי קורא. הבעלים תיקן: אפוגי מתייחס
   ל-TrimBox. ‏ArtBox נשאר **שני** — הוא היקף-התוכן, ניחוש סביר כשאין
   TrimBox, אבל הוא אינו גודל-העמוד.

   סדר-הנפילה: ‏TrimBox → ArtBox → CropBox → MediaBox. כל שלב הוא התיבה
   הבאה-בטיבה שקיימת בקובץ. ⚠️ תיבה שאינה מוכלת ב-MediaBox או שאפסית
   נדחית — קובץ פגום לא יגרור את המסך אחריו.

   הרצת הבדיקות: node page-box-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PageBox = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PT_MM = 25.4 / 72;
  var ORDER = ['trim', 'art', 'crop', 'media'];
  var LABEL = { art: 'ArtBox', trim: 'TrimBox', crop: 'CropBox', media: 'MediaBox' };

  function _n(v) { var x = Number(v); return isFinite(x) ? x : NaN; }

  /* תיבה תקינה: ארבעה מספרים, רוחב וגובה חיוביים ממש */
  function valid(b) {
    if (!b || typeof b !== 'object') return false;
    var x = _n(b.x), y = _n(b.y), w = _n(b.width), h = _n(b.height);
    return isFinite(x) && isFinite(y) && w > 0.5 && h > 0.5;
  }
  /* ⚠️ תיבה שחורגת מ-MediaBox אינה "עמוד גדול יותר" — היא נתון שבור.
     סובלנות של 1 נקודה לשגיאות-עיגול של מחוללי-PDF. */
  function within(b, media) {
    if (!valid(media)) return true;             // בלי מדיה אין מול מה לבדוק
    var T = 1;
    return _n(b.x) >= _n(media.x) - T &&
           _n(b.y) >= _n(media.y) - T &&
           _n(b.x) + _n(b.width)  <= _n(media.x) + _n(media.width)  + T &&
           _n(b.y) + _n(b.height) <= _n(media.y) + _n(media.height) + T;
  }

  /* התיבה הקובעת. boxes = { art, trim, crop, media } — כל אחת {x,y,width,height}
     או חסרה. מחזיר { x, y, width, height, src, label } או null. */
  function effective(boxes) {
    var b = boxes || {};
    var media = b.media;
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i], v = b[k];
      if (!valid(v)) continue;
      if (k !== 'media' && !within(v, media)) continue;
      return { x: _n(v.x), y: _n(v.y), width: _n(v.width), height: _n(v.height),
               src: k, label: LABEL[k] };
    }
    return null;
  }

  function mm(box) {
    if (!valid(box)) return null;
    return { w: _n(box.width) * PT_MM, h: _n(box.height) * PT_MM };
  }
  /* התיבה הקובעת, במילימטרים — הצורה שבה כל המסכים משווים גדלים */
  function effectiveMM(boxes) {
    var e = effective(boxes);
    if (!e) return null;
    var s = mm(e);
    return { w: s.w, h: s.h, src: e.src, label: e.label };
  }

  /* ── האם העמוד בגודל? ─────────────────────────────────────────────────────
     ⚠️ כפולה אינה "גודל שגוי" — היא צורה מוכרת, וכך גם כפולה מסובבת
     (שער+גב שיצאו עומדים על צידם). ההכרעה כאן זהה למה שהפורטל עשה עד
     היום, אבל על **התיבה הנכונה** ובמקום אחד לכל המסכים.
     tol במ"מ; ברירת-מחדל 3 — מתחתיה זה רעש-עיגול של מחוללי-PDF. */
  function verdict(sizeMM, refMM, tol) {
    if (!sizeMM || !refMM || !(refMM.w > 0) || !(refMM.h > 0)) return { kind: 'unknown' };
    var T = (_n(tol) > 0) ? _n(tol) : 3;
    var w = _n(sizeMM.w), h = _n(sizeMM.h);
    if (!(w > 0) || !(h > 0)) return { kind: 'unknown' };
    if (Math.abs(w - refMM.w) <= T && Math.abs(h - refMM.h) <= T) return { kind: 'ok' };
    if (Math.abs(w - 2 * refMM.w) <= T * 2 && Math.abs(h - refMM.h) <= T) return { kind: 'spread' };
    /* מסובבת: הרוחב ≈ גובה-העבודה, והגובה ≈ פעמיים הרוחב */
    if (Math.abs(w - refMM.h) <= T && Math.abs(h - 2 * refMM.w) <= T * 2) return { kind: 'rotated-spread' };
    return { kind: 'bad', got: { w: Math.round(w), h: Math.round(h) },
             want: { w: Math.round(refMM.w), h: Math.round(refMM.h) } };
  }
  function isBad(v) { return !!(v && v.kind === 'bad'); }

  /* טקסט-החיווי — אותו ניסוח בפורטל ובמסך-הדפוס. ⚠️ מציין **מאיזו תיבה**
     נמדד: "לא בגודל" בלי לומר לפי מה נמדד שולח לחפש במקום הלא-נכון. */
  function badLabel(v, srcLabel) {
    if (!isBad(v)) return '';
    return '⚠️ לא בגודל (' + v.got.w + '×' + v.got.h + ' מ״מ · נדרש '
         + v.want.w + '×' + v.want.h + ')' + (srcLabel ? ' · לפי ' + srcLabel : '');
  }

  /* ── מלבן-הציור לדפדוף ────────────────────────────────────────────────────
     ⚠️ הדפדוף צייר את MediaBox, ולכן עמוד עם גלישה הוצג גדול משכניו
     והחוברת נראתה עקומה. כאן מחושבת ההזזה שמציגה את **התיבה הקובעת**
     בלבד: הקנבס בגודל התיבה, והעמוד מוזז כך שפינתה תשב ב-(0,0).
     ⚠️ ציר-ה-Y של PDF עולה מלמטה וזה של הקנבס יורד מלמעלה — ומכאן
     החישוב מגובה-המדיה ולא מ-y ישירות. */
  function renderRect(boxes, scale) {
    var e = effective(boxes);
    var media = (boxes || {}).media;
    var s = (_n(scale) > 0) ? _n(scale) : 1;
    if (!e || !valid(media)) return null;
    var mx = _n(media.x), my = _n(media.y), mh = _n(media.height);
    return {
      width:  Math.max(1, Math.round(e.width  * s)),
      height: Math.max(1, Math.round(e.height * s)),
      offsetX: -(e.x - mx) * s,
      offsetY: -((my + mh) - (e.y + e.height)) * s,
      src: e.src, label: e.label
    };
  }

  return { PT_MM: PT_MM, ORDER: ORDER, LABEL: LABEL,
           valid: valid, within: within, effective: effective,
           mm: mm, effectiveMM: effectiveMM,
           verdict: verdict, isBad: isBad, badLabel: badLabel,
           renderRect: renderRect };
});
