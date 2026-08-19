/* ⚠️ CACHE / RELEASE-ID: הצרכנים טוענים page-spine.js?v=<release>. **בכל שינוי
   בקובץ הזה יש להעלות את מזהה-ה-release** (bidi1 → bidi2 → …) בכל הצרכנים
   (proof-client.html, proof-viewer.html), כדי ש-HTML חדש לעולם לא יקבל
   page-spine.js ישן מ-cache. bidi1 אינו תג-קבוע — הוא מזהה-שחרור בן-חלוף. */
/* ═══════════ page-spine.js — צד השדרה והגלישות בתצוגת דפדוף (RTL+LTR) ═══════════
   חוק-הברזל של חוברות עברית: **עמוד אי-זוגי — שדרה מימין · עמוד זוגי — שדרה משמאל.**

   בתצוגת הדפדוף חותכים את הגלישה בצד השדרה בלבד (כדי ששני עמודי הכפולה
   יתחברו נקי), ומציגים את הגלישה + צלבי החיתוך בצד החיצוני.

   הבאג שזה מתקן: בכפולה הכלל יושם נכון, אבל לעמוד בודד (השער) צד השדרה היה
   מקובע ל-'left' — ולכן בשער הגלישה הוצגה מימין במקום משמאל. השער הוא עמוד 1
   (אי-זוגי) ולכן שדרתו מימין, והגלישה שלו חייבת להופיע משמאל.

   הקוד טהור (אין DOM) כדי שייבדק ב-Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PageSpine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* מנרמל כיוון-דפדוף: 'ltr' מפורש בלבד; כל השאר (כולל חסר/ריק) → 'rtl' (תאימות-לאחור). */
  function normDir(readingDirection) { return (readingDirection === 'ltr') ? 'ltr' : 'rtl'; }

  /* צד השדרה לפי מספר-עמוד 1-מבוסס + כיוון-דפדוף.
     RTL (חוברת עברית): אי-זוגי → ימין, זוגי → שמאל.
     LTR (אנגלית/צרפתית/רוסית): המראה — אי-זוגי → שמאל, זוגי → ימין.
     readingDirection חסר → 'rtl' (ברירת-מחדל היסטורית; אין רגרסיה לעבודות ישנות). */
  function spineFor(pageNumber, readingDirection) {
    var rtl = normDir(readingDirection) === 'rtl';
    var p = parseInt(pageNumber, 10);
    if (!isFinite(p) || p < 1) return rtl ? 'right' : 'left';            // שער
    var rtlSide = (p % 2 === 0) ? 'left' : 'right';                       // בסיס RTL
    return rtl ? rtlSide : (rtlSide === 'right' ? 'left' : 'right');      // LTR = מראה
  }
  /* אותו כלל לפי אינדקס 0-מבוסס (כמו מערך התמונות בצופה) */
  function spineForIndex(i, readingDirection) { return spineFor((parseInt(i, 10) || 0) + 1, readingDirection); }

  /* הצד שבו מוצגת הגלישה — תמיד ההפוך משדרה */
  function bleedSide(pageNumber, readingDirection) { return spineFor(pageNumber, readingDirection) === 'left' ? 'right' : 'left'; }

  /* שני עמודי כפולה הם שני הצדדים של אותו דף — השדרות שלהם הפוכות */
  function isMirrorPair(a, b) {
    return Math.abs((parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)) === 1 &&
           spineFor(a) !== spineFor(b);
  }

  /* חישוב אזור-התצוגה: חותך את הגלישה בצד השדרה, משאיר אותה בצד החיצוני.
     tf = {l,t,w,h} (יחסי-MediaBox) + wmm/hmm של ה-TrimBox.
     מחזיר יחס-תצוגה, פרמטרי background, ומיקום מסגרת ה-trim באחוזים. */
  function netSpec(tf, spine) {
    var mediaHmm = tf.hmm / tf.h, mediaWmm = tf.wmm / tf.w;
    var shownL, shownR;
    if (spine === 'left') { shownL = tf.l; shownR = 1; }               // שדרה משמאל → חותך שמאל
    else if (spine === 'right') { shownL = 0; shownR = tf.l + tf.w; }  // שדרה מימין → חותך ימין
    else { shownL = 0; shownR = 1; }                                    // בלי חיתוך — כל הגלישה
    var shownW = shownR - shownL;
    var arr = (shownW * mediaWmm) / mediaHmm;
    var posX = shownW < 1 ? (shownL / (1 - shownW) * 100) : 0;
    var sizeW = 100 / shownW;
    var trimL = (tf.l - shownL) / shownW, trimR = (tf.l + tf.w - shownL) / shownW;
    return { arr: arr, sizeW: sizeW, posX: posX,
      frame: { left: trimL * 100, top: tf.t * 100, width: (trimR - trimL) * 100, height: tf.h * 100, skip: spine } };
  }

  /* ── גלישה-לכל-עמוד: מקור-אמת יחיד לסיווג ולגזירת TrimBox לוגי ──────────
     כלל-הקדימויות (בקשת-בעלים 08/2026):
       1) TrimBox אמיתי ב-PDF        → 'pdf-trimbox'
       2) אין TrimBox אך MediaBox גדול מהגודל-הסופי + אישור-משתמש → 'confirmed-oversize'
       3) העמוד בדיוק בגודל-הסופי     → 'exact-size'
     החלטה לכל עמוד בנפרד — לעולם לא מוחלת על כל העיתון. */
  var BLEED_TOL_MM = 1.5;   // סף: מעל ~1.5מ״מ הפרש בצד = "גדול" (מכסה גלישת 3–10מ״מ, מתעלם מרעש-עיגול)

  /* האם MediaBox גדול מהגודל-הסופי (בשני הצירים) מעבר לסף */
  function isOversize(mediaWmm, mediaHmm, finalWmm, finalHmm) {
    return isFinite(mediaWmm) && isFinite(finalWmm) && finalWmm > 0 && finalHmm > 0 &&
           (mediaWmm - finalWmm) > BLEED_TOL_MM && (mediaHmm - finalHmm) > BLEED_TOL_MM;
  }
  /* TrimBox לוגי ממורכז בתוך ה-MediaBox לפי הגודל-הסופי — {l,t,w,h,wmm,hmm} כמו netSpec מצפה */
  function logicalTrimFrac(mediaWmm, mediaHmm, finalWmm, finalHmm) {
    var mW = mediaWmm, mH = mediaHmm;
    var lMm = (mW - finalWmm) / 2, tMm = (mH - finalHmm) / 2;
    return { l: lMm / mW, t: tMm / mH, w: finalWmm / mW, h: finalHmm / mH, wmm: finalWmm, hmm: finalHmm };
  }

  /* מסווג עמוד בודד. מחזיר { source, trimFrac|null, oversize }.
     pdfTrimFrac — trimFrac אמיתי מה-PDF (או null). meta — { bleedConfirmed } שמור (או null).
     final{W,H}mm — הגודל-הסופי (reqW/reqH). media{W,H}mm — גודל-העמוד בפועל. */
  function resolveBleed(pdfTrimFrac, meta, mediaWmm, mediaHmm, finalWmm, finalHmm) {
    if (pdfTrimFrac && (pdfTrimFrac.w < 0.999 || pdfTrimFrac.h < 0.999))
      return { source: 'pdf-trimbox', trimFrac: pdfTrimFrac, oversize: true };
    var over = isOversize(mediaWmm, mediaHmm, finalWmm, finalHmm);
    if (over && meta && meta.bleedConfirmed)
      return { source: 'confirmed-oversize', trimFrac: logicalTrimFrac(mediaWmm, mediaHmm, finalWmm, finalHmm), oversize: true };
    return { source: 'exact-size', trimFrac: null, oversize: over };
  }

  /* ── פיצול-כפולות: provenance יציב לתצוגה ──────────────────────────────
     קלט: רוחבי-עמודי-המקור (pt) + כיוון-דפדוף. פלט: מערך עמודי-תצוגה בסדר-קריאה,
     כל אחד עם מקור יציב + תפקידו + מספר-לוגי + צד-שדרה + צד-חיצוני.
       - עמוד-כפולה (רוחב > חציון×1.5) → שני חצאים בסדר-הקריאה:
           RTL: ימני(spine שמאל) ואז שמאלי(spine ימין)
           LTR: שמאלי(spine ימין) ואז ימני(spine שמאל)
         ⚠️ צד-השדרה של חצי = הקצה-הפנימי (החיבור) — קבוע ע"פ גיאומטריית-הכפולה,
         לא ע"פ הכיוון; הכיוון קובע רק את **סדר** החצאים. אין קו-חיתוך בקצה-הפנימי.
       - עמוד רגיל → single, spine לפי המספר-הלוגי הסופי + הכיוון.
     provenance מונע "המרה מספרית עיוורת": כל חצי יודע את srcIndex/part/number שלו. */
  function _medianWidth(widths) {
    var ws = (widths || []).slice().sort(function (a, b) { return a - b; });
    return ws.length ? (ws[Math.floor(ws.length / 2)] || 0) : 0;
  }
  /* מסווג עמוד-מקור יחיד: 'single' | 'spread' | '?' (לא-ודאי → נחליט ב-fallback).
     מקור-אמת: type מפורש → גודל-עבודה reqW/reqH → (בחוץ) median.
     wmm/hmm = הגודל-הלוגי של העמוד (TrimBox אם קיים, אחרת CropBox/MediaBox). */
  var SPREAD_BLEED_SLACK_MM = 14;   // סובלנות לגלישה (~10מ״מ/צד) + עיגול
  function classifyPageType(src, reqWmm, reqHmm, tolMm) {
    if (src && (src.type === 'single' || src.type === 'spread')) return src.type;   // מפורש גובר
    var w = src ? src.wmm : NaN, h = src ? src.hmm : NaN;
    if (isFinite(reqWmm) && reqWmm > 0 && isFinite(reqHmm) && reqHmm > 0 && isFinite(w) && isFinite(h)) {
      var tol = (tolMm != null ? tolMm : 2), slack = SPREAD_BLEED_SLACK_MM;
      var hOk = (h >= reqHmm - tol) && (h <= reqHmm + slack);          // גובה ≈ עמוד לוגי (+גלישה)
      var wSpread = (w >= 2 * reqWmm - tol) && (w <= 2 * reqWmm + slack);
      var wSingle = (w >= reqWmm - tol) && (w <= reqWmm + slack);
      if (hOk && wSpread && !wSingle) return 'spread';
      if (hOk && wSingle) return 'single';
      return 'single';                                                  // לא-ודאי (כולל landscape שבו h≠reqH) → לא מפצלים
    }
    return '?';                                                        // אין גודל-עבודה → median-fallback
  }
  /* sources: [{ wmm, hmm, sourceId?, type? }] · opts: { readingDirection, reqWmm, reqHmm, tolMm } */
  function splitProvenance(sources, opts) {
    opts = opts || {};
    var rtl = normDir(opts.readingDirection) === 'rtl';
    var reqW = opts.reqWmm, reqH = opts.reqHmm, tolMm = opts.tolMm;
    sources = sources || [];
    // median-fallback רק כשאין גודל-עבודה — ורק אם רוב-העמודים בודדים (אחרת החציון לא מייצג)
    var haveReq = isFinite(reqW) && reqW > 0 && isFinite(reqH) && reqH > 0;
    var med = 0, majoritySingles = false;
    if (!haveReq) {
      var widths = sources.map(function (s) { return s.wmm; });
      med = _medianWidth(widths);
      var cluster = widths.filter(function (w) { return med > 0 && w <= med * 1.2; }).length;
      majoritySingles = cluster > widths.length / 2;
    }
    var isSpread = function (src) {
      var t = classifyPageType(src, reqW, reqH, tolMm);
      if (t === 'spread') return true;
      if (t === 'single') return false;
      return majoritySingles && med > 0 && src.wmm > med * 1.5;         // '?' → fallback בטוח
    };
    var out = [];
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      var sid = (src && src.sourceId != null) ? src.sourceId : i;
      if (isSpread(src)) {
        var rightHalf = { srcIndex: i, sourceId: sid, part: 'spread-right', spine: 'left', outer: 'right' };
        var leftHalf  = { srcIndex: i, sourceId: sid, part: 'spread-left',  spine: 'right', outer: 'left' };
        if (rtl) { out.push(rightHalf); out.push(leftHalf); }   // RTL: ימני קודם
        else     { out.push(leftHalf);  out.push(rightHalf); }  // LTR: שמאלי קודם
      } else {
        out.push({ srcIndex: i, sourceId: sid, part: 'single', spine: null, outer: null });
      }
    }
    out.forEach(function (p, idx) {
      p.number = idx + 1;                                  // מספר-לוגי סופי = מיקום בסדר-הקריאה
      if (p.part === 'single') { p.spine = spineFor(p.number, opts.readingDirection); p.outer = (p.spine === 'left' ? 'right' : 'left'); }
    });
    return out;
  }
  /* מיפוי metadata-מקור לעמוד-תצוגה: pageDisplayMeta של עמוד-מקור עובר לשני חצאיו.
     מפתח יציב: sourceId (או srcIndex בנפילה-לאחור). מחזיר null אם אין התאמה חד-משמעית. */
  function metaForProv(pageDisplayMeta, prov) {
    if (!pageDisplayMeta || !prov) return null;
    var byId = pageDisplayMeta.bySourceId || null, byIdx = pageDisplayMeta.byIndex || pageDisplayMeta;
    if (byId && prov.sourceId != null && byId[prov.sourceId] != null) return byId[prov.sourceId];
    if (byIdx && byIdx[prov.srcIndex] != null) return byIdx[prov.srcIndex];
    return null;
  }

  /* ── השוואת גיאומטריה בין שני עמודי-כפולה ────────────────────────────
     ⚠️ **למה זו מדידה ולא תיקון (10/08/2026, דיווח-בעלים).** בעמודים
     שיש בהם חיבור-גרפיקה מעבר לשדרה, האמנות לא התחברה בדיוק — סטייה של
     כמה מ"מ, נראית בפס אדום שחוצה את הכפולה. לסטייה כזו שני מקורות
     הפוכים לחלוטין:

       א. לשני העמודים גיאומטריה שונה (MediaBox/TrimBox/בליד) — אז
          הצופה מציג אותם בקנה-מידה שונה, וזו תקלה **בתצוגה**.
       ב. הגיאומטריה זהה — אז הצופה נאמן, והסטייה נמצאת **בקובץ**.

     ⚠️ ותיקון-יישור עיוור במקרה ב׳ הוא הנזק הגרוע מהשניים: הוא היה
     מיישר את התצוגה ומסתיר פגם שיודפס שגוי. לכן קודם מודדים.

     היחידות מ"מ, והסף 0.2 מ"מ — מתחת לזה זה רעש-עיגול של PDF ולא
     הפרש אמיתי. */
  var GEOM_TOL_MM = 0.2;

  function _mediaMM(tf) {
    if (!tf || !(tf.h > 0) || !(tf.w > 0)) return null;
    return { w: tf.wmm / tf.w, h: tf.hmm / tf.h };
  }

  function compareGeometry(a, b) {
    var out = { ok: false, same: null, fields: [], verdict: '' };
    var ma = _mediaMM(a), mb = _mediaMM(b);
    if (!a || !b || !ma || !mb) {
      out.verdict = 'אין נתוני-גיאומטריה לאחד העמודים — אי אפשר להכריע.';
      return out;
    }
    out.ok = true;
    var cmp = [
      { key: 'גובה גיליון (מדיה)', a: ma.h, b: mb.h },
      { key: 'גובה קו-חיתוך',      a: a.hmm, b: b.hmm },
      /* ⚠️ הבליד העליון הוא החשוד המרכזי: הוא זה שמזיז את כל האמנות
         כלפי מטה כשהעמודים מיושרים לפי גבול-המדיה ולא לפי החיתוך. */
      { key: 'בליד עליון',          a: a.t * ma.h,  b: b.t * mb.h },
      { key: 'בליד תחתון',          a: (1 - a.t - a.h) * ma.h, b: (1 - b.t - b.h) * mb.h },
      { key: 'רוחב גיליון (מדיה)', a: ma.w, b: mb.w },
      { key: 'רוחב קו-חיתוך',      a: a.wmm, b: b.wmm }
    ];
    var worst = 0;
    cmp.forEach(function (c) {
      var d = Math.abs(c.a - c.b);
      if (d > worst) worst = d;
      out.fields.push({ key: c.key, a: c.a, b: c.b, diff: d, differs: d > GEOM_TOL_MM });
    });
    out.same = worst <= GEOM_TOL_MM;
    out.worstMM = worst;
    out.verdict = out.same
      ? 'הגיאומטריה של שני העמודים זהה. הצופה מציג אותם באותו קנה-מידה, ולכן הסטייה נמצאת **בקובץ עצמו** — לא בתצוגה.'
      : ('הגיאומטריה שונה בין העמודים (עד ' + worst.toFixed(2) + ' מ"מ). ההפרש הזה הוא שמזיז את האמנות בתצוגה.');
    return out;
  }

  /* ── תיבת-החיתוך של חצי-כפולה (19/08/2026, תקרית מידע-העיר 1840) ────────
     ⚠️ נמדד בייצור: הרכבת-הריצה ב-proof-client פיצלה כפולות לחצאים
     **בלי להעביר את ה-TrimBox** — 9 מתוך 32 עמודי-הריצה יצאו בלי הצהרת-
     חיתוך. אפוגי מודד תרים ([[solan-trimbox-page-size]]): עמוד כזה נמדד
     ‏177.4×264.8 במקום 165×240, הצלבים והגלישה נכנסים לגיליון, והכפולות
     "יוצאות לא טוב". ‏copyPages משמר תיבות — רק מסלול-הפיצול איבד אותן.
     אותו לקח בדיוק תוקן ב-cover-split ב-16/08 (halfTrimBox) — אבל רק שם.

     הקלט בנקודות, צירי-PDF (y-למעלה): mb/tb = {x,y,w,h} של עמוד-המקור.
     ‏side: 'right'|'left' — החתך במחצית רוחב-המדיה, כמו בהרכבה עצמה.
     הפלט: תרים בצירי עמוד-החצי (ראשית בפינת אזור-ההטמעה), או null —
     כשאין תרים אמיתי במקור לא ממציאים אחד. */
  function spreadHalfTrim(mb, tb, side) {
    if (!mb || !(mb.w > 0 && mb.h > 0)) return null;
    if (!tb || !(tb.w > 0 && tb.h > 0)) return null;
    if (Math.abs(tb.w - mb.w) < 0.5 && Math.abs(tb.h - mb.h) < 0.5) return null;   // תרים=מדיה → אין הצהרה
    var half = mb.w / 2;
    var L = side === 'right' ? mb.x + half : mb.x;
    var R = side === 'right' ? mb.x + mb.w : mb.x + half;
    var x1 = Math.max(tb.x, L), x2 = Math.min(tb.x + tb.w, R);
    var y1 = Math.max(tb.y, mb.y), y2 = Math.min(tb.y + tb.h, mb.y + mb.h);
    if (!(x2 - x1 > 1 && y2 - y1 > 1)) return null;                                // אין חפיפה — לא ממציאים
    return { x: x1 - L, y: y1 - mb.y, w: x2 - x1, h: y2 - y1 };
  }

  return { compareGeometry: compareGeometry, GEOM_TOL_MM: GEOM_TOL_MM, spreadHalfTrim: spreadHalfTrim,
           spineFor: spineFor, spineForIndex: spineForIndex, bleedSide: bleedSide,
           isMirrorPair: isMirrorPair, netSpec: netSpec, normDir: normDir,
           isOversize: isOversize, logicalTrimFrac: logicalTrimFrac, resolveBleed: resolveBleed,
           BLEED_TOL_MM: BLEED_TOL_MM, splitProvenance: splitProvenance, metaForProv: metaForProv,
           classifyPageType: classifyPageType, SPREAD_BLEED_SLACK_MM: SPREAD_BLEED_SLACK_MM };
});
