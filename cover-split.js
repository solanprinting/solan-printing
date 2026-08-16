/* ═══════════════════════════════════════════════════════════════════════════
   cover-split.js — כפולת-שער מסובבת: הלוגיקה הטהורה, מקור-אמת יחיד.

   הבעיה (בקשות-בעלים 14-15/08/2026): עיתונים מייצאים את גיליון-השער —
   שער+גב — כעמוד אחד העומד-על-צידו (מסובב 90°). צריך: לזהות, לסובב
   לתצוגה ישרה, ולפצל — חצי אחד לעמוד 1 (שער) וחצי לעמוד האחרון (גב).

   שני צרכנים מריצים את אותה מתמטיקה בדיוק:
     · proof-viewer  — תיקון-תצוגה בדפדוף (הקובץ לא משתנה)
     · customer-portal — "🔄 סובב וחלק": פיצול אמיתי של הקובץ לשני עמודים

   ⚠️ **הסכמות-הצירים נעולות כאן ונבדקות נומרית:**
     rot=+90 — סיבוב נגד-כיוון-השעון חזותית (PDF, ציר-y למעלה: זווית
               חיובית = נגד-השעון). ראש-העמוד המקורי → צד שמאל.
     rot=−90 — עם כיוון-השעון. ראש-העמוד המקורי → צד ימין.
     coverHalf — החצי **החזותי** (אחרי הסיבוב) שהמשתמש בחר כשער:
               'right' | 'left'.
   מכאן: החצי-המקורי (top/bottom של הקובץ המסובב) שהוא השער:
     rot=−90 + right → top · rot=+90 + left → top · אחרת bottom.

   ⚠️ בקנבס (ציר-y למטה) הכיוון החזותי מתהפך: ‏rotate(+π/2)‎ בקנבס נראה
   עם-השעון. לכן תצוגת-הבחירה חייבת למפות: קנבס-CCW ↔ rot=+90.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoverSplit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TOL_MM = 2, SLACK_MM = 14;   // אותה סובלנות-גלישה של PageSpine

  /* עמוד שהוא כפולה-מסובבת ביחס לעמוד-ייחוס (רוחב×גובה של עמוד בודד):
     רוחבו ≈ גובה-הייחוס, וגובהו ≈ פעמיים רוחב-הייחוס. */
  function isRotatedSpread(wmm, hmm, refWmm, refHmm, tolMm, slackMm) {
    var tol = (tolMm != null ? tolMm : TOL_MM), slack = (slackMm != null ? slackMm : SLACK_MM);
    if (!(isFinite(wmm) && isFinite(hmm) && isFinite(refWmm) && isFinite(refHmm))) return false;
    if (refWmm <= 0 || refHmm <= 0) return false;
    return (wmm >= refHmm - tol && wmm <= refHmm + slack)
        && (hmm >= 2 * refWmm - tol && hmm <= 2 * refWmm + slack);
  }

  /* עמוד-ייחוס כשאין גודל-עבודה מוגדר (העלאות-פורטל): חציון העמודים
     ה"עומדים" (גובה ≥ רוחב) מבין שאר עמודי-הגיליון. דורש לפחות שניים —
     ייחוס מעמוד יחיד הוא ניחוש. מחזיר null כשאין מספיק ראיות. */
  function refFromSizes(sizes) {
    var portrait = (sizes || []).filter(function (s) {
      return s && isFinite(s.w) && isFinite(s.h) && s.w > 0 && s.h >= s.w;
    });
    if (portrait.length < 2) return null;
    var ws = portrait.map(function (s) { return s.w; }).sort(function (a, b) { return a - b; });
    var hs = portrait.map(function (s) { return s.h; }).sort(function (a, b) { return a - b; });
    return { w: ws[Math.floor(ws.length / 2)], h: hs[Math.floor(hs.length / 2)] };
  }

  /* איזה חצי-מקור (top/bottom בקובץ המסובב, ציר-PDF) הוא השער. */
  function coverOrigHalf(rot, coverHalf) {
    if (rot !== 90 && rot !== -90) return null;
    if (coverHalf !== 'right' && coverHalf !== 'left') return null;
    return ((rot === -90 && coverHalf === 'right') || (rot === 90 && coverHalf === 'left'))
      ? 'top' : 'bottom';
  }

  /* קופסת-החצי בקואורדינטות-המקור. mb = {x, y, w, h} של עמוד-המקור. */
  function halfBox(half, mb) {
    var hh = mb.h / 2;
    return half === 'top'
      ? { left: mb.x, bottom: mb.y + hh, right: mb.x + mb.w, top: mb.y + mb.h }
      : { left: mb.x, bottom: mb.y,      right: mb.x + mb.w, top: mb.y + hh };
  }

  /* מפרט-הציור של חצי מוטמע על עמוד-פלט מסובב.
     חצי-המקור: רוחב w0 × גובה hh. עמוד-הפלט: hh × w0.
     אומת מול מטריצת-הסיבוב: ‏+90: (u,v)→(−v,u) → הזזה x+hh;
     ‏−90: (u,v)→(v,−u) → הזזה y+w0. */
  function drawSpec(rot, srcHalfW, srcHalfH) {
    return rot === 90
      ? { x: srcHalfH, y: 0,        deg: 90,  outW: srcHalfH, outH: srcHalfW }
      : { x: 0,        y: srcHalfW, deg: -90, outW: srcHalfH, outH: srcHalfW };
  }

  /* תוכנית-פיצול מלאה: מהבחירה ומקופסת-המקור אל שתי פקודות-ציור. */
  function splitPlan(rot, coverHalf, mb) {
    var covHalf = coverOrigHalf(rot, coverHalf);
    if (!covHalf) return null;
    var backHalf = covHalf === 'top' ? 'bottom' : 'top';
    var spec = drawSpec(rot, mb.w, mb.h / 2);
    return {
      cover: { box: halfBox(covHalf, mb),  draw: spec },
      back:  { box: halfBox(backHalf, mb), draw: spec },
    };
  }

  return { isRotatedSpread: isRotatedSpread, refFromSizes: refFromSizes,
           coverOrigHalf: coverOrigHalf, halfBox: halfBox, drawSpec: drawSpec,
           splitPlan: splitPlan, TOL_MM: TOL_MM, SLACK_MM: SLACK_MM };
});
