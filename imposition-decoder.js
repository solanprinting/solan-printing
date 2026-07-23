/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-decoder.js — Reverse-Imposition Decoder (Sprint C · Decoder V2)
 * ───────────────────────────────────────────────────────────────────────────
 * מטרה: לקחת את שני צדדי גיליון-הדפוס (פרופר מ-Apogee), לחלץ מכל תא את עמוד-העיתון,
 * ליישר (rotation correction) ולסדר 1..N בסדר-קריאה — לפי *מפת-הטמפלט* (מקור-האמת),
 * לא ע"י ניחוש קווי-קיפול או OCR של הפרופר.
 *
 * הגיאומטריה כוילה מקובץ-הטמפלט האמיתי (Template88X63 16p Perfector · מיקומי
 * מספרי-העמוד): רשת לא-סימטרית עם *מרווח-מרכזי (gutter) 32 מ"מ* ושוליים 4 מ"מ.
 * הפריסה נשמרת ב-*מרחב-Trim* (880×630) ולכן בלתי-תלויה בבליד — בזמן פירוק ממופה
 * למרחב-הפרופר לפי ה-TrimBox האמיתי שלו.
 *
 * ⚠️ לוגיקה טהורה + Node-testable. הרכבת ה-PDF נעשית בדפדפן לפי buildDecodePlan().
 *    אדיטיבי · מאחורי solanDecoderV2 · אינו נוגע ב-fold()/TEMPLATES/הכלי-הפעיל.
 *
 * צירים: מפת-הטמפלט ב"תצוגה" (row 0 = עליון). המרה screen→pdf מפורשת ב-_cellClipPt.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionDecoder = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var MM = 72 / 25.4;

  // ── מפת-התאים של 88x63 16p Perfector — מקור-האמת, במרחב-הפרופר (Rotate 0) ──
  //    ⚠️ קובץ-הטמפלט שמור עם דגל Rotate 180, אך הפרופר האמיתי (Apogee) שמור Rotate 0 —
  //    לכן המפה כאן היא מפת-הטמפלט מסובבת 180°: (row,col)→(1-row,3-col) + היפוך-סיבוב.
  //    אומת מול פרופר-גבעתיים האמיתי (השער הופיע בתא r0c1 של Front). עמודים 16,1 למעלה-משמאל.
  //    sourceSide: 0=Front(PDF עמ' 1) · 1=Back(PDF עמ' 2). row 0=עליון. rotation=תיקון-יישור.
  //    Front עליונה: 16,1,4,13 (180°) · תחתונה: 9,8,5,12 (0°)
  //    Back  עליונה: 10,7,6,11 (180°) · תחתונה: 15,2,3,14 (0°)
  var CELL_MAP_88x63_16P_PERFECTOR = [
    { sourceSide: 0, row: 0, column: 0, outputPageOffset: 15, rotation: 180 },
    { sourceSide: 0, row: 0, column: 1, outputPageOffset: 0,  rotation: 180 },
    { sourceSide: 0, row: 0, column: 2, outputPageOffset: 3,  rotation: 180 },
    { sourceSide: 0, row: 0, column: 3, outputPageOffset: 12, rotation: 180 },
    { sourceSide: 0, row: 1, column: 0, outputPageOffset: 8,  rotation: 0 },
    { sourceSide: 0, row: 1, column: 1, outputPageOffset: 7,  rotation: 0 },
    { sourceSide: 0, row: 1, column: 2, outputPageOffset: 4,  rotation: 0 },
    { sourceSide: 0, row: 1, column: 3, outputPageOffset: 11, rotation: 0 },
    { sourceSide: 1, row: 0, column: 0, outputPageOffset: 9,  rotation: 180 },
    { sourceSide: 1, row: 0, column: 1, outputPageOffset: 6,  rotation: 180 },
    { sourceSide: 1, row: 0, column: 2, outputPageOffset: 5,  rotation: 180 },
    { sourceSide: 1, row: 0, column: 3, outputPageOffset: 10, rotation: 180 },
    { sourceSide: 1, row: 1, column: 0, outputPageOffset: 14, rotation: 0 },
    { sourceSide: 1, row: 1, column: 1, outputPageOffset: 1,  rotation: 0 },
    { sourceSide: 1, row: 1, column: 2, outputPageOffset: 2,  rotation: 0 },
    { sourceSide: 1, row: 1, column: 3, outputPageOffset: 13, rotation: 0 }
  ];

  // סיבוב מפת-תאים ב-180° (לטמפלטים שנשמרו הפוך ביחס לפרופר): (row,col)→(rows-1-row,cols-1-col), rotation+180
  function rotateCellMap180(cells, rows, cols) {
    rows = rows || 2; cols = cols || 4;
    return (cells || []).map(function (c) {
      return {
        sourceSide: c.sourceSide, row: rows - 1 - c.row, column: cols - 1 - c.column,
        outputPageOffset: c.outputPageOffset, rotation: ((c.rotation + 180) % 360)
      };
    });
  }

  // ── פריסה מכוילת (מרחב-Trim 880×630) — קצוות-עמודות/שורות אמיתיים מהטמפלט ──────
  //    עמודות (רוחב 210): שמאל = 4,214,456,666 → מרכזי 109,319,561,771 · שדרה/דש-סיכות מרכזי 32 מ"מ · שוליים 4 מ"מ.
  //    שורות (גובה 297): פער ראש-לראש 10 מ"מ במרכז (סימטרי סביב 315) → קצה-עליון = 13,320.
  //      שורה-עליונה [13,310] (הפוכה, ראש בפנים=310) · פער 10 מ"מ · שורה-תחתונה [320,617] · שוליים חיצוניים (רגל) 13 מ"מ.
  var DEFAULT_LAYOUT_88x63 = {
    id: '88x63-16p-perfector', name: '88x63 16p Perfector',
    pagesPerSignature: 16, sidesCount: 2, cols: 4, rows: 2,
    finishedWmm: 210, finishedHmm: 297,
    trimWmm: 880, trimHmm: 630, headToHeadGapMm: 10,
    colLeftsTrimMm: [4, 214, 456, 666],   // קצה-שמאל של כל עמודה במרחב-Trim
    rowTopsTrimMm: [13, 320],             // קצה-עליון של כל שורה — פער ראש-לראש 10 מ"מ, שוליים-רגל 13 מ"מ
    // ברירת-מחדל של גיליון-המקור (הפרופר Givatiim) — לשימוש עצמאי כשלא הוזרק sheet אמיתי
    nominalMediaWmm: 892.1, nominalMediaHmm: 643.2, nominalTrimXmm: 6, nominalTrimYmm: 4.9, nominalTrimHmm: 630.1
  };

  function _resolveLayout(layout) {
    var L = {}; Object.keys(DEFAULT_LAYOUT_88x63).forEach(function (k) { L[k] = DEFAULT_LAYOUT_88x63[k]; });
    if (layout) Object.keys(layout).forEach(function (k) { if (layout[k] != null) L[k] = layout[k]; });
    return L;
  }
  // גיליון-המקור בפועל (קופסאות הפרופר). ברירת-מחדל = הנומינלי של הפריסה.
  function _resolveSheet(L, sheet) {
    sheet = sheet || {};
    return {
      mediaWmm: sheet.mediaWmm != null ? sheet.mediaWmm : L.nominalMediaWmm,
      mediaHmm: sheet.mediaHmm != null ? sheet.mediaHmm : L.nominalMediaHmm,
      trimXmm: sheet.trimXmm != null ? sheet.trimXmm : L.nominalTrimXmm,   // PDF-space (מקור שמאלי-תחתון)
      trimYmm: sheet.trimYmm != null ? sheet.trimYmm : L.nominalTrimYmm,
      trimWmm: sheet.trimWmm != null ? sheet.trimWmm : L.trimWmm,
      trimHmm: sheet.trimHmm != null ? sheet.trimHmm : L.nominalTrimHmm
    };
  }

  // מלבן-התא בתצוגה (mm · מקור פינה שמאלית-עליונה של media-הפרופר), לפי row/col.
  // ממפה מ-Trim-מרחב הטמפלט אל מרחב-הפרופר לפי ה-TrimBox האמיתי (בלתי-תלוי בבליד).
  function cellRectDisplayMm(row, col, layout, sheet) {
    var L = _resolveLayout(layout), S = _resolveSheet(L, sheet);
    var trimLeftDisplay = S.trimXmm;                              // x לא מושפע מהיפוך-y
    var trimTopDisplay = S.mediaHmm - (S.trimYmm + S.trimHmm);    // קצה-עליון של ה-Trim בתצוגה
    return {
      xMm: trimLeftDisplay + L.colLeftsTrimMm[col],
      yMm: trimTopDisplay + L.rowTopsTrimMm[row],
      wMm: L.finishedWmm, hMm: L.finishedHmm
    };
  }

  // המרת מלבן-תצוגה → clip-box ב-PDF (נקודות · מקור שמאלי-תחתון). ל-Rotate 0 של עמוד-המקור.
  function _cellClipPt(rectMm, mediaHmm) {
    var left = rectMm.xMm * MM;
    var topPdf = (mediaHmm - rectMm.yMm) * MM;
    var bottom = topPdf - rectMm.hMm * MM;
    return { left: left, bottom: bottom, right: left + rectMm.wMm * MM, top: topPdf };
  }

  // יחסים מנורמלים (0..1) יחסית ל-Trim (בלתי-תלוי בבליד) — לאחסון בטמפלט
  function cellRatios(row, col, layout) {
    var L = _resolveLayout(layout);
    return {
      xRatio: L.colLeftsTrimMm[col] / L.trimWmm, yRatio: L.rowTopsTrimMm[row] / L.trimHmm,
      widthRatio: L.finishedWmm / L.trimWmm, heightRatio: L.finishedHmm / L.trimHmm
    };
  }

  // ── ולידציית מפת-התאים (בלי תלות בקובץ) ─────────────────────────────────────
  function validateCellMap(cells, N) {
    N = N || 16; var errors = [], offsets = {}, sideRowCol = {};
    if (!Array.isArray(cells) || cells.length !== N) errors.push('CELL_COUNT_MISMATCH:' + (cells ? cells.length : 0));
    (cells || []).forEach(function (c, i) {
      if ([0, 90, 180, 270].indexOf(c.rotation) < 0) errors.push('INVALID_ROTATION@' + i);
      if (!(c.outputPageOffset >= 0 && c.outputPageOffset <= N - 1)) errors.push('OFFSET_OUT_OF_RANGE@' + i);
      if (offsets[c.outputPageOffset]) errors.push('DUPLICATE_OFFSET:' + c.outputPageOffset);
      offsets[c.outputPageOffset] = true;
      if (c.sourceSide !== 0 && c.sourceSide !== 1) errors.push('INVALID_SOURCE_SIDE@' + i);
      var key = c.sourceSide + ':' + c.row + ':' + c.column;
      if (sideRowCol[key]) errors.push('DUPLICATE_CELL:' + key);
      sideRowCol[key] = true;
    });
    for (var p = 0; p < N; p++) if (!offsets[p]) errors.push('MISSING_OFFSET:' + p);
    return { valid: errors.length === 0, errors: errors };
  }

  // צד-השדרה של תא (סימון: היכן אין גלישה). השדרה = המרווח-המרכזי (דש-הסיכות):
  //   עמודות בחצי השמאלי → שדרה מימין ; בחצי הימני → שדרה משמאל. (בשטח-הגיליון, לפני תיקון-סיבוב.)
  function spineSideForCell(col, layout) {
    var L = _resolveLayout(layout);
    return (col < L.cols / 2) ? 'right' : 'left';
  }
  // הרחבת clip בגלישה: 3 מ"מ בראש/רגל/fore-edge, ולא בצד-השדרה.
  function _bleedClip(clip, spineSide, bleedMm) {
    var b = (bleedMm || 0) * MM;
    var bc = { left: clip.left, bottom: clip.bottom, right: clip.right, top: clip.top };
    if (b <= 0) return bc;
    bc.top += b; bc.bottom -= b;                       // ראש + רגל
    if (spineSide === 'right') bc.left -= b;            // fore-edge משמאל
    else bc.right += b;                                 // fore-edge מימין
    return bc;
  }

  // ── ליבת ה-Decoder: מפה + גיליון → תוכנית-פירוק (plan) ──────────────────────
  // input: { cells?, layout?, sheet?, startPage?, signatureIndex?, bleedMm? }
  //   sheet = קופסאות-הפרופר האמיתיות { mediaWmm, mediaHmm, trimXmm, trimYmm, trimWmm, trimHmm }.
  //   bleedMm > 0 → תוספת גלישה ב-3 קצוות (לא בשדרה); עמוד-הפלט גדל בהתאם.
  function buildDecodePlan(input) {
    input = input || {};
    var cells = input.cells || CELL_MAP_88x63_16P_PERFECTOR;
    var L = _resolveLayout(input.layout);
    var S = _resolveSheet(L, input.sheet);
    var N = L.pagesPerSignature || cells.length;
    var startPage = input.startPage != null ? input.startPage : 1;
    var bleedMm = input.bleedMm > 0 ? input.bleedMm : 0;

    var v = validateCellMap(cells, N);
    var errors = v.errors.slice(), warnings = [];

    var pages = cells.map(function (c) {
      var rectMm = cellRectDisplayMm(c.row, c.column, L, S);
      var clip = _cellClipPt(rectMm, S.mediaHmm);
      var spineSide = spineSideForCell(c.column, L);
      var bClip = _bleedClip(clip, spineSide, bleedMm);
      var mediaWpt = S.mediaWmm * MM, mediaHpt = S.mediaHmm * MM;
      var w = [];
      if (rectMm.xMm < -0.01 || rectMm.yMm < -0.01 ||
          rectMm.xMm + rectMm.wMm > S.mediaWmm + 0.01 || rectMm.yMm + rectMm.hMm > S.mediaHmm + 0.01) {
        w.push('CELL_OUT_OF_PAGE');
      }
      if (bleedMm && (bClip.left < -0.5 || bClip.bottom < -0.5 || bClip.right > mediaWpt + 0.5 || bClip.top > mediaHpt + 0.5)) {
        w.push('BLEED_EXCEEDS_SHEET');
      }
      return {
        finalPageNumber: startPage + c.outputPageOffset,
        outputPageOffset: c.outputPageOffset,
        sourceSide: c.sourceSide, sourcePdfPage: c.sourceSide + 1,
        row: c.row, column: c.column,
        rotationApplied: c.rotation, spineSide: spineSide,
        rectMm: rectMm, clipPt: clip,
        bleedMm: bleedMm, bleedClipPt: bClip,
        outputWpt: bClip.right - bClip.left, outputHpt: bClip.top - bClip.bottom,
        outputTrimWpt: L.finishedWmm * MM, outputTrimHpt: L.finishedHmm * MM,
        warnings: w
      };
    });
    pages.forEach(function (p) { p.warnings.forEach(function (msg) { warnings.push('page ' + p.finalPageNumber + ': ' + msg); }); });
    pages.sort(function (a, b) { return a.finalPageNumber - b.finalPageNumber; });

    var rotations = pages.map(function (p) { return { page: p.finalPageNumber, rotation: p.rotationApplied }; });
    return {
      success: errors.length === 0,
      templateId: L.id, startPage: startPage, signatureIndex: input.signatureIndex != null ? input.signatureIndex : 0,
      pagesPerSignature: N, sidesCount: L.sidesCount, bleedMm: bleedMm,
      finishedPage: { widthMm: L.finishedWmm, heightMm: L.finishedHmm },
      sheet: { mediaWmm: S.mediaWmm, mediaHmm: S.mediaHmm, trimWmm: S.trimWmm, trimHmm: S.trimHmm, trimXmm: S.trimXmm, trimYmm: S.trimYmm },
      pages: pages, rotations: rotations, warnings: warnings, errors: errors,
      notice: 'טרם אומת מול פרופר אמיתי חזותית — סימולציית Preview בלבד.'
    };
  }

  // ── ייצוא cells מנורמלים לטמפלט (row/col + ratios יחסית ל-Trim) ──────────────
  function toNormalizedCells(cells, layout) {
    cells = cells || CELL_MAP_88x63_16P_PERFECTOR;
    return cells.map(function (c) {
      var r = cellRatios(c.row, c.column, layout);
      return {
        sourceSide: c.sourceSide + 1, row: c.row, column: c.column,
        xRatio: r.xRatio, yRatio: r.yRatio, widthRatio: r.widthRatio, heightRatio: r.heightRatio,
        outputPageOffset: c.outputPageOffset, rotation: c.rotation, mirrorX: false, mirrorY: false
      };
    });
  }

  return {
    MM: MM, CELL_MAP_88x63_16P_PERFECTOR: CELL_MAP_88x63_16P_PERFECTOR, DEFAULT_LAYOUT_88x63: DEFAULT_LAYOUT_88x63,
    cellRectDisplayMm: cellRectDisplayMm, cellRatios: cellRatios, validateCellMap: validateCellMap,
    rotateCellMap180: rotateCellMap180,
    spineSideForCell: spineSideForCell, buildDecodePlan: buildDecodePlan, toNormalizedCells: toNormalizedCells
  };
});
