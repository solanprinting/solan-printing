/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-template-import.js — גזירת-טמפלט אוטומטית ממספרי-העמוד (Decoder V2 · Sprint G-core)
 * ───────────────────────────────────────────────────────────────────────────
 * מקבל את מיקומי מספרי-העמוד שחולצו מקובץ-הטמפלט (n · מרכז-x/y במ"מ · זווית · צד)
 * ומייצר אוטומטית: מפת-תאים (side/row/col/outputPageOffset/rotation) + גיאומטריה
 * מכוילת (colLefts/rowTops · שדרה/gutter · שוליים) לכל גודל-עיתון — בלי ניחוש-קיפול.
 *
 * ⚠️ לוגיקה טהורה + Node-testable. אין רשת/DOM/pdf.js (החילוץ נעשה ב-UI ומוזרק לכאן).
 *    אופקי: מרכזי-המספר = מרכזי-העמוד (נגזר אוטומטית). אנכי: המספר אינו במרכז-העמוד,
 *    לכן הגובה נקבע מ-finishedH + פער-ראש (headToHeadGapMm · ברירת-מחדל/כוונון-ידני).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionTemplateImport = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  function _normRot(deg) { var r = Math.round((Number(deg) || 0) / 90) * 90; r = ((r % 360) + 360) % 360; return r; }

  // קיבוץ ערכים קרובים (מרכזי-עמודות/שורות) לאשכולות → מרכז ממוצע לכל אשכול, ממוין עולה.
  function clusterCenters(values, tolMm) {
    var tol = tolMm == null ? 6 : tolMm;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var clusters = [], cur = [];
    sorted.forEach(function (v) {
      if (!cur.length || v - cur[cur.length - 1] <= tol) cur.push(v);
      else { clusters.push(cur); cur = [v]; }
    });
    if (cur.length) clusters.push(cur);
    return clusters.map(function (c) { return c.reduce(function (a, b) { return a + b; }, 0) / c.length; });
  }
  function _nearestIndex(centers, v) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < centers.length; i++) { var d = Math.abs(centers[i] - v); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  // ── גזירת-טמפלט: numbers → מפת-תאים + גיאומטריה מכוילת ────────────────────────
  // input: {
  //   pages: [ { side:0|1, numbers:[ {n, cxMm, cyMm, angle} ] }, ... ],   // side 0=Front, 1=Back
  //   sheetTrim: { widthMm, heightMm },     // אזור ה-Trim (מהטמפלט/פרופר)
  //   finished:  { widthMm, heightMm },     // גודל עמוד סופי
  //   cols?, rows?,                          // ברירת-מחדל: מזוהה אוטומטית מהאשכולות
  //   headToHeadGapMm?,                      // פער ראש-לראש (ברירת-מחדל 10; כוונון-ידני)
  //   tolMm?
  // }
  function deriveTemplateFromNumbers(input) {
    input = input || {};
    var pages = input.pages || [];
    var trim = input.sheetTrim || {}, fin = input.finished || {};
    var trimW = +trim.widthMm, trimH = +trim.heightMm, finW = +fin.widthMm, finH = +fin.heightMm;
    var gap = input.headToHeadGapMm != null ? +input.headToHeadGapMm : 10;
    var tol = input.tolMm != null ? input.tolMm : 6;
    var warnings = [], errors = [];

    // כל המספרים (עם side) + אשכולות אופקיים/אנכיים
    var all = [];
    pages.forEach(function (pg) { (pg.numbers || []).forEach(function (t) { all.push({ side: pg.side, n: t.n, cx: +t.cxMm, cy: +t.cyMm, angle: _normRot(t.angle) }); }); });
    if (!all.length) return { ok: false, errors: ['NO_NUMBERS'], warnings: warnings };

    var colCenters = clusterCenters(all.map(function (t) { return t.cx; }), tol);   // ממוין עולה → col 0=שמאל
    var rowCenters = clusterCenters(all.map(function (t) { return t.cy; }), tol);    // ממוין עולה → row 0=עליון
    var cols = input.cols || colCenters.length;
    var rows = input.rows || rowCenters.length;

    // אופקי: מרכז-מספר = מרכז-עמוד → colLefts = center - finW/2
    var colLeftsTrimMm = colCenters.slice(0, cols).map(function (c) { return +(c - finW / 2).toFixed(2); });
    // אנכי: המספר אינו במרכז-העמוד. גובה נקבע מ-finH + gap, סימטרי סביב מרכז-ה-Trim.
    //   שוליים-רגל חיצוניים = (trimH - rows*finH - (rows-1)*gap) / 2 ; קצה-עליון של שורה r = margin + r*(finH+gap)
    var footMargin = (trimH - rows * finH - (rows - 1) * gap) / 2;
    var rowTopsTrimMm = [];
    for (var r = 0; r < rows; r++) rowTopsTrimMm.push(+(footMargin + r * (finH + gap)).toFixed(2));
    if (footMargin < -0.5) warnings.push('NEGATIVE_FOOT_MARGIN(gap ' + gap + ' גדול מדי לגובה-הגיליון)');

    // מפת-תאים: לכל מספר → side/row/col/offset/rotation
    var cellMap = [], seen = {}, offsets = {};
    all.forEach(function (t) {
      var col = _nearestIndex(colCenters, t.cx);
      var row = _nearestIndex(rowCenters, t.cy);
      var key = t.side + ':' + row + ':' + col;
      if (seen[key]) warnings.push('DUPLICATE_CELL:' + key); seen[key] = true;
      if (offsets[t.n - 1]) warnings.push('DUPLICATE_PAGE:' + t.n); offsets[t.n - 1] = true;
      cellMap.push({ sourceSide: t.side, row: row, column: col, outputPageOffset: t.n - 1, rotation: t.angle });
    });
    cellMap.sort(function (a, b) { return a.outputPageOffset - b.outputPageOffset; });

    var N = cellMap.length;
    // שדרה (gutter): הפער-האופקי הגדול ביותר בין עמודות סמוכות (אם קיים) — לצורך spine/דש
    var gutters = [];
    for (var i = 1; i < colLeftsTrimMm.length; i++) gutters.push(+(colLeftsTrimMm[i] - (colLeftsTrimMm[i - 1] + finW)).toFixed(2));
    var maxGutter = gutters.length ? Math.max.apply(null, gutters) : 0;
    var spineGapIndex = gutters.indexOf(maxGutter);   // בין עמודה spineGapIndex ל-spineGapIndex+1

    var layout = {
      cols: cols, rows: rows, finishedWmm: finW, finishedHmm: finH,
      trimWmm: trimW, trimHmm: trimH, headToHeadGapMm: gap,
      colLeftsTrimMm: colLeftsTrimMm, rowTopsTrimMm: rowTopsTrimMm,
      footMarginMm: +footMargin.toFixed(2), spineGutterMm: maxGutter, spineGapIndex: spineGapIndex
    };
    return {
      ok: errors.length === 0, errors: errors, warnings: warnings,
      pagesPerSignature: N, sidesCount: pages.length,
      columns: colCenters, rows: rowCenters, cellMap: cellMap, layout: layout
    };
  }

  return { clusterCenters: clusterCenters, deriveTemplateFromNumbers: deriveTemplateFromNumbers };
});
