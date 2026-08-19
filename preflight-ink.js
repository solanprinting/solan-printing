/* ═══════════ preflight-ink.js — קו-שערה ומרחב-צבע לפני שליחה ═══════════
   ⚠️ **מה שדווח (בעלים 19/08/2026).** אפוגי החזיר על חדשות-הגליל 968:
       Warnings: Image in RGB (61) · Object in RGB (5429)
       Fixes:    Line weight was changed to 0.25 pt (88)
   ובפורטל לא הופיעה שום התראה — כי ‎_preflightCheck‎ בדק **רק** בליד
   וגודל-עמוד אחיד. מרחב-צבע ועובי-קו לא נבדקו מעולם.

   ⚠️ **סדר-העדיפויות נקבע ע"י הבעלים: קו-שערה חמור מ-RGB.**
   „‏Fixes LINE יותר מטריד כי הוא יכול לגרום לאותיות להיעלם מהגיליון."
   וזה נכון: קו ברוחב 0 („hairline") מודפס בעובי הדק ביותר שהמכשיר יודע —
   על פלטה זה עלול לצאת שבור או לא לצאת כלל. באפוגי זה מופיע כ-Fix שקט,
   ולכן קל לפספס אותו — בדיוק מה שקרה.
   ⚠️ **RGB, לעומת זאת, אפוגי ממיר לבד.** התראה על כל אובייקט-RGB הייתה
   מופיעה כמעט על כל קובץ, ואזהרה שמופיעה תמיד היא אזהרה שמתעלמים ממנה.
   לכן: קו-שערה = אזהרה · RGB = מידע, ורק מעל סף.

   ⚠️ **עובי-הקו כאן הוא לפני-טרנספורמציה.** מדידה מדויקת דורשת מעקב
   אחרי מטריצת-הציור, ו-‎0.1‎ תחת הגדלה פי-10 הוא בעצם ‎1pt‎. לכן
   **רוחב-0 בלבד הוא ודאי** (הוא hairline בכל טרנספורמציה), והשאר נאמר
   כ"חשוד" ולא כעובדה. עדיף לומר את מידת-הביטחון מאשר להמציא דיוק.

   הרצת הבדיקות: node preflight-ink-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PreflightInk = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ⚠️ 0.25pt הוא הסף שאפוגי עצמו מרים אליו — לא מספר שהמצאנו. */
  var MIN_PT = 0.25;
  /* ⚠️ ספי-RGB: מתחתם זה רעש-רקע (לוגו בודד, פרופיל מוטמע). מעליהם זה
     כבר מאפיין של הקובץ, ושווה לומר לפני שאפוגי ממיר בשקט. */
  var RGB_IMG_MIN = 5;
  var RGB_OBJ_MIN = 50;

  function _n(v) { var x = Number(v); return isFinite(x) && x >= 0 ? x : 0; }

  /* counts = { hairlines, thinLines, minWidthPt, rgbImages, rgbObjects,
                images, pages } — כולם נאספים מ-pdf.js ע"י הקורא. */
  function assess(counts) {
    var c = counts || {};
    var hair = _n(c.hairlines), thin = _n(c.thinLines);
    var rimg = _n(c.rgbImages), robj = _n(c.rgbObjects);
    var warnings = [], info = [];

    /* ── קו-שערה: האזהרה הראשית ──────────────────────────────────────── */
    if (hair > 0) {
      warnings.push('קו בעובי 0 („קו-שערה") — ' + hair + ' מופעים. '
        + 'בדפוס הוא עלול לצאת שבור או להיעלם; אם זה מתאר של אותיות, הן ייפגעו.');
    }
    if (thin > 0) {
      /* ⚠️ "חשוד" ולא "שגוי" — הרוחב נמדד לפני טרנספורמציה */
      warnings.push('קווים דקים מ-' + MIN_PT + 'pt — ' + thin + ' מופעים (חשוד; '
        + 'העובי נמדד לפני הגדלה, ייתכן שחלקם תקינים).');
    }

    /* ── RGB: מידע, לא אזהרה, ורק מעל סף ─────────────────────────────── */
    if (rimg >= RGB_IMG_MIN || robj >= RGB_OBJ_MIN) {
      var parts = [];
      if (rimg) parts.push(rimg + ' תמונות');
      if (robj) parts.push(robj + ' אובייקטים');
      info.push('מרחב-צבע RGB: ' + parts.join(' · ')
        + '. אפוגי ימיר ל-CMYK, וגוונים עזים עלולים לצאת עמומים יותר.');
    }

    return {
      warnings: warnings,
      info: info,
      /* ⚠️ ‎blocking‎ = יש על מה לעצור את הלקוח ולשאול. מידע לבדו לעולם
         אינו עוצר — אחרת חזרנו לאזהרה-שתמיד-מופיעה. */
      blocking: warnings.length > 0,
      hairlines: hair, thinLines: thin, rgbImages: rimg, rgbObjects: robj
    };
  }

  /* צבירה מרשימת-אופרטורים של pdf.js. ⚠️ הפונקציה טהורה: הקורא מביא
     ‎{ fnArray, argsArray }‎ ואת מפת-ה-OPS, וכאן רק סופרים.
     ⚠️ ‎setLineWidth‎ יכול להופיע פעמים רבות עם אותו ערך — סופרים מופעים,
     כי זה מה שאפוגי מדווח ("88 מופעים"). */
  function scanOps(opList, OPS) {
    var out = { hairlines: 0, thinLines: 0, minWidthPt: Infinity,
                rgbObjects: 0, images: 0 };
    if (!opList || !opList.fnArray || !OPS) return out;
    var fn = opList.fnArray, args = opList.argsArray || [];
    for (var i = 0; i < fn.length; i++) {
      var op = fn[i], a = args[i];
      if (op === OPS.setLineWidth) {
        var w = Number(a && a[0]);
        if (isFinite(w)) {
          if (w < out.minWidthPt) out.minWidthPt = w;
          if (w === 0) out.hairlines++;
          else if (w < MIN_PT) out.thinLines++;
        }
      } else if (op === OPS.setFillRGBColor || op === OPS.setStrokeRGBColor) {
        out.rgbObjects++;
      } else if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
        out.images++;
      }
    }
    if (!isFinite(out.minWidthPt)) out.minWidthPt = 0;
    return out;
  }

  /* איחוד ספירות של כמה עמודים */
  function merge(list) {
    var out = { hairlines: 0, thinLines: 0, minWidthPt: Infinity,
                rgbObjects: 0, images: 0, rgbImages: 0, pages: 0 };
    (list || []).forEach(function (c) {
      if (!c) return;
      out.hairlines += _n(c.hairlines); out.thinLines += _n(c.thinLines);
      out.rgbObjects += _n(c.rgbObjects); out.images += _n(c.images);
      out.rgbImages += _n(c.rgbImages);
      if (Number(c.minWidthPt) < out.minWidthPt) out.minWidthPt = Number(c.minWidthPt);
      out.pages++;
    });
    if (!isFinite(out.minWidthPt)) out.minWidthPt = 0;
    return out;
  }

  return { MIN_PT: MIN_PT, RGB_IMG_MIN: RGB_IMG_MIN, RGB_OBJ_MIN: RGB_OBJ_MIN,
           assess: assess, scanOps: scanOps, merge: merge };
});
