/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-grid-calibration.js — כיול-רשת ויזואלי מעל הפרופר (שלב א')
 * ───────────────────────────────────────────────────────────────────────────
 * הבעיה שזה בא לפתור: עד היום מיקום-התאים חולץ **מקובץ-טמפלט** — pdf.js קרא
 * את מספרי-העמודים ואשכל אותם לעמודות/שורות. זה ניחוש מבוסס-טקסט, והוא נשבר
 * (בעלים, 16/08/2026: "ניסיתי להעלות טמפלט חדש ולא הצליח להיבנות כמו שצריך").
 *
 * הגישה כאן הפוכה: המשתמש **גורר רשת מעל הפרופר האמיתי**, והמיקום שבו הניח
 * אותה *הוא* הטמפלט. אין חילוץ, אין ניחוש, אין תלות בקובץ-טמפלט חיצוני.
 *
 * ⚠️ לוגיקה טהורה בלבד — אין DOM, אין pdf.js, אין Firebase. כל מה שקשור
 *    לעכבר/קנבס יושב ב-UI; כאן רק המתמטיקה, כדי שתהיה ניתנת-לבדיקה ב-Node.
 *    (הדפדפן-הפנימי אינו מרנדר pdf.js — ראה תיעוד-הפרויקט — ולכן *חייבים*
 *    שהחלק הנבדק-אוטומטית יהיה מופרד מהחלק הנבדק-בעין.)
 *
 * ⚠️ **מיקומי שורות/עמודות מפורשים, לא "מרווח קבוע".** הפריסה האמיתית של
 *    70×100 32p היא rowTops [15,180,355,520] — מרווחים 165/175/165, כי יש
 *    מרווח-חיתוך 10 מ"מ בין זוגות ראש-לראש. מודל של pitch אחיד אינו מסוגל
 *    לייצג את זה, והיה מזיז שתי שורות ב-10 מ"מ = תוכן חתוך בלוחות.
 *    לכן: מערך מיקומים לכל עמודה ולכל שורה, וגרירה של שורה/עמודה בודדת.
 *
 * ── שלושה מרחבי-צירים. ערבוב ביניהם הוא באג-הגיאומטריה הקלאסי כאן ──
 *   1. מרחב-מסך (px)   — מה שהמשתמש רואה; תלוי זום. מקור: פינה שמאלית-עליונה.
 *   2. מרחב-תצוגה (mm) — הגיליון כפי שנראה, מקור = פינה שמאלית-**עליונה** של
 *                        media-הפרופר. זה המרחב שבו המשתמש גורר.
 *   3. מרחב-Trim (mm)  — מה שנשמר בטמפלט, מקור = פינה שמאלית-עליונה של ה-TrimBox.
 *                        בלתי-תלוי בבליד, ולכן טמפלט אחד משרת פרופרים עם
 *                        בלידים שונים. זה מה ש-ImpositionDecoder מצפה לקבל.
 * המרה 2→3 היא חיסור-אופסט בלבד, ומרוכזת ב-_trimOriginDisplay — נקודה אחת
 * לשנות אם ה-TrimBox נקרא אחרת.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionGridCalibration = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var ROTATIONS = [0, 90, 180, 270];
  function _num(v, dflt) { var n = Number(v); return isFinite(n) ? n : dflt; }
  function _round(v, dp) { var f = Math.pow(10, dp == null ? 3 : dp); return Math.round(v * f) / f; }

  /* ── מסך ↔ מ"מ ─────────────────────────────────────────────────────────────
     scale = פיקסלים למ"מ. הזום משנה רק אותו — כל שאר החישובים במ"מ, כך
     שדיוק-המיקום אינו תלוי ברמת-הזום שבה המשתמש עבד. */
  function mmToPx(mm, scale) { return _num(mm, 0) * _num(scale, 1); }
  function pxToMm(px, scale) { var s = _num(scale, 1); return s === 0 ? 0 : _num(px, 0) / s; }

  /* זום שמתאים את הגיליון כולו לתוך המיכל. ⚠️ לא מחזיר 0 גם כשהמיכל זעיר —
     0 היה מייצר חלוקה-באפס ב-pxToMm במעלה-הזרם. */
  function fitScale(containerWpx, containerHpx, sheetWmm, sheetHmm, marginPx) {
    var m = _num(marginPx, 0);
    var w = _num(containerWpx, 0) - 2 * m, h = _num(containerHpx, 0) - 2 * m;
    var sw = _num(sheetWmm, 0), sh = _num(sheetHmm, 0);
    if (!(sw > 0 && sh > 0)) return 1;
    return Math.max(Math.min(w / sw, h / sh), 0.01);
  }

  /* ── מודל-הרשת ─────────────────────────────────────────────────────────────
     grid = {
       sides, cellWmm, cellHmm,             // גודל-העמוד הסופי (נטו)
       colLeftsMm: [],  rowTopsMm: [],      // מרחב-תצוגה. אורכם = cols/rows
       cellOffsets: { 's,r,c': {dxMm,dyMm} },   // כיוונון פר-תא (ברירת-מחדל 0)
       cellRot:     { 's,r,c': 0|90|180|270 },
       cellPage:    { 's,r,c': 1..N }
     } */
  function makeGrid(o) {
    o = o || {};
    var cw = _num(o.cellWmm, 165), ch = _num(o.cellHmm, 240);
    var colL = Array.isArray(o.colLeftsMm) && o.colLeftsMm.length ? o.colLeftsMm.map(function (v) { return _num(v, 0); }) : null;
    var rowT = Array.isArray(o.rowTopsMm) && o.rowTopsMm.length ? o.rowTopsMm.map(function (v) { return _num(v, 0); }) : null;
    if (!colL) colL = _uniform(Math.max(1, _num(o.cols, 4) | 0), _num(o.originXmm, 0), o.colPitchMm == null ? cw : _num(o.colPitchMm, cw));
    if (!rowT) rowT = _uniform(Math.max(1, _num(o.rows, 4) | 0), _num(o.originYmm, 0), o.rowPitchMm == null ? ch : _num(o.rowPitchMm, ch));
    return {
      sides: (_num(o.sides, 2) === 1 ? 1 : 2),
      cellWmm: cw, cellHmm: ch,
      colLeftsMm: colL, rowTopsMm: rowT,
      cellOffsets: o.cellOffsets ? JSON.parse(JSON.stringify(o.cellOffsets)) : {},
      cellRot: o.cellRot ? JSON.parse(JSON.stringify(o.cellRot)) : {},
      cellPage: o.cellPage ? JSON.parse(JSON.stringify(o.cellPage)) : {}
    };
  }
  function _uniform(n, origin, pitch) {
    var a = []; for (var i = 0; i < n; i++) a.push(_round(origin + i * pitch)); return a;
  }
  function cols(grid) { return grid.colLeftsMm.length; }
  function rows(grid) { return grid.rowTopsMm.length; }
  function cellKey(side, row, col) { return side + ',' + row + ',' + col; }
  function _clone(g) { return makeGrid(g); }

  function cellRotation(grid, side, row, col) {
    var r = grid.cellRot ? grid.cellRot[cellKey(side, row, col)] : null;
    return ROTATIONS.indexOf(r) >= 0 ? r : 0;
  }
  function cellPage(grid, side, row, col) {
    var p = grid.cellPage ? grid.cellPage[cellKey(side, row, col)] : null;
    return (p > 0) ? (p | 0) : null;
  }
  function cellOffset(grid, side, row, col) {
    var o = (grid.cellOffsets || {})[cellKey(side, row, col)];
    return { dxMm: _num(o && o.dxMm, 0), dyMm: _num(o && o.dyMm, 0) };
  }

  /* מלבן-תא במרחב-תצוגה. תא מסובב 90/270 יושב **לרוחב** בגיליון ולכן ממדיו
     מתחלפים — אותה מוסכמה בדיוק כמו cellRectDisplayMm ב-ImpositionDecoder,
     ובכוונה: הפלט של המודול הזה נכנס ישר לשם. */
  function cellRectDisplayMm(grid, side, row, col) {
    var rot = cellRotation(grid, side, row, col);
    var swap = (rot === 90 || rot === 270);
    var off = cellOffset(grid, side, row, col);
    return {
      xMm: _round(grid.colLeftsMm[col] + off.dxMm),
      yMm: _round(grid.rowTopsMm[row] + off.dyMm),
      wMm: swap ? grid.cellHmm : grid.cellWmm,
      hMm: swap ? grid.cellWmm : grid.cellHmm,
      rotation: rot, side: side, row: row, col: col,
      page: cellPage(grid, side, row, col)
    };
  }
  function allCellRects(grid, side) {
    var out = [];
    for (var r = 0; r < rows(grid); r++) for (var c = 0; c < cols(grid); c++) out.push(cellRectDisplayMm(grid, side, r, c));
    return out;
  }
  // התא שמתחת לנקודה (מרחב-תצוגה) — לבחירה בלחיצה. האחרון מנצח, כדי שתא
  // שצויר מעל (חופף) ייבחר, בדיוק כמו שהמשתמש רואה אותו.
  function cellAtPointMm(grid, side, xMm, yMm) {
    var hit = null;
    allCellRects(grid, side).forEach(function (q) {
      if (xMm >= q.xMm && xMm <= q.xMm + q.wMm && yMm >= q.yMm && yMm <= q.yMm + q.hMm) hit = q;
    });
    return hit;
  }

  /* ── פעולות-עריכה. כולן טהורות — מחזירות רשת חדשה ואינן משנות את הקיימת,
     כדי ש"בטל" יהיה שמירת-הפניה ולא שחזור-ידני של שדות. ────────────────── */
  function dragGrid(grid, dxMm, dyMm) {
    var g = _clone(grid), dx = _num(dxMm, 0), dy = _num(dyMm, 0);
    g.colLeftsMm = g.colLeftsMm.map(function (v) { return _round(v + dx); });
    g.rowTopsMm = g.rowTopsMm.map(function (v) { return _round(v + dy); });
    return g;
  }
  // גרירת עמודה/שורה בודדת — זה מה שמייצר מרווח-חיתוך לא-אחיד (למשל 10 מ"מ
  // בין זוגות ראש-לראש) בלי לשבור את שאר הרשת.
  function dragColumn(grid, col, dxMm) {
    var g = _clone(grid);
    if (col >= 0 && col < g.colLeftsMm.length) g.colLeftsMm[col] = _round(g.colLeftsMm[col] + _num(dxMm, 0));
    return g;
  }
  function dragRow(grid, row, dyMm) {
    var g = _clone(grid);
    if (row >= 0 && row < g.rowTopsMm.length) g.rowTopsMm[row] = _round(g.rowTopsMm[row] + _num(dyMm, 0));
    return g;
  }
  // גרירת עמודה/שורה **וכל מה שאחריה** — הדרך הטבעית לפתוח מרווח באמצע
  // בלי להזיז ידנית כל שורה שאחריה.
  function dragRowAndAfter(grid, row, dyMm) {
    var g = _clone(grid), dy = _num(dyMm, 0);
    for (var r = row; r < g.rowTopsMm.length; r++) g.rowTopsMm[r] = _round(g.rowTopsMm[r] + dy);
    return g;
  }
  function dragColumnAndAfter(grid, col, dxMm) {
    var g = _clone(grid), dx = _num(dxMm, 0);
    for (var c = col; c < g.colLeftsMm.length; c++) g.colLeftsMm[c] = _round(g.colLeftsMm[c] + dx);
    return g;
  }
  function nudgeCell(grid, side, row, col, dxMm, dyMm) {
    var g = _clone(grid), k = cellKey(side, row, col), cur = cellOffset(grid, side, row, col);
    g.cellOffsets[k] = { dxMm: _round(cur.dxMm + _num(dxMm, 0)), dyMm: _round(cur.dyMm + _num(dyMm, 0)) };
    return g;
  }
  function clearCellOffsets(grid) { var g = _clone(grid); g.cellOffsets = {}; return g; }
  function setCellRotation(grid, side, row, col, rot) {
    var g = _clone(grid);
    g.cellRot[cellKey(side, row, col)] = ROTATIONS.indexOf(rot) >= 0 ? rot : 0;
    return g;
  }
  function cycleCellRotation(grid, side, row, col) {
    var cur = cellRotation(grid, side, row, col);
    return setCellRotation(grid, side, row, col, ROTATIONS[(ROTATIONS.indexOf(cur) + 1) % 4]);
  }
  function setColumnRotation(grid, side, col, rot) {
    var g = grid;
    for (var r = 0; r < rows(grid); r++) g = setCellRotation(g, side, r, col, rot);
    return g;
  }
  function setRowRotation(grid, side, row, rot) {
    var g = grid;
    for (var c = 0; c < cols(grid); c++) g = setCellRotation(g, side, row, c, rot);
    return g;
  }
  function setCellPage(grid, side, row, col, page) {
    var g = _clone(grid), k = cellKey(side, row, col);
    if (page == null || !(page > 0)) delete g.cellPage[k]; else g.cellPage[k] = page | 0;
    return g;
  }

  /* מספור-בלחיצה. בפרפקטור העמוד שמאחורי התא הוא בעמודה **המשוקפת**
     (cols-1-col) בצד השני — כי הצד האחורי מודפס הפוך-מראה. זה אושר ע"י
     הבעלים בכלי-הבנייה הקודם; mirrorBack=false משאיר אותה עמודה. */
  function assignPageAt(grid, side, row, col, nextPage, mirrorBack) {
    var n = _num(nextPage, 1) | 0;
    var g = setCellPage(grid, side, row, col, n);
    if (grid.sides === 2) {
      var otherSide = side === 0 ? 1 : 0;
      var otherCol = (mirrorBack === false) ? col : (cols(grid) - 1 - col);
      g = setCellPage(g, otherSide, row, otherCol, n + 1);
      return { grid: g, nextPage: n + 2 };
    }
    return { grid: g, nextPage: n + 1 };
  }

  /* ── זווית-המספר בטמפלט → סיבוב-העמוד ────────────────────────────────────
     כלל-הבעלים (17/08/2026): "הכיוון של המספר הוא מדד לאיזה כיוון העמוד —
     אם מספר 1 שוכב, העמוד בדפדוף צריך להתהפך ב-90 מעלות לצורה קריאה."
     כלומר המספר המודפס בטמפלט אינו רק **מי** אלא גם **באיזה כיוון**.

     המוסכמה: הערך המוחזר הוא הזווית שבה העמוד **יושב בגיליון** (כפי שנמדדה
     מהמספר), וה-executor מיישם ‎-rotation‎ כדי ליישר. זו אותה מוסכמה בדיוק
     שכבר קיימת במנוע — אל תהפכו את הסימן כאן בלי להפוך אותו גם שם.

     ⚠️ הצמדה ל-4 רבעים בכוונה: טקסט בטמפלט אמיתי יוצא 89.97° וכדומה, וזווית
     חופשית הייתה מייצרת clip באלכסון. סובלנות ±45° סוגרת את כל המקרים. */
  function rotationFromTextAngle(deg) {
    var d = ((_num(deg, 0) % 360) + 360) % 360;
    return ROTATIONS[Math.round(d / 90) % 4];
  }
  /* מטריצת-טקסט של pdf.js: [a,b,c,d,e,f]. הזווית = atan2(b,a) (נגד-כיוון-השעון).
     מוחזר null כשאין מטריצה — כדי שהקורא ידע שלא נמדד כלום, במקום לקבל 0
     שנראה כמו "עמוד ישר" ולהמשיך על הנחה שקטה. */
  function rotationFromTransform(transform) {
    if (!transform || transform.length < 4) return null;
    var a = _num(transform[0], 0), b = _num(transform[1], 0);
    if (a === 0 && b === 0) return null;
    return rotationFromTextAngle(Math.atan2(b, a) * 180 / Math.PI);
  }
  /* מספרי-הטמפלט (מיקום + זווית) → רשת. זה מה שמחליף את גזירת-הגיאומטריה
     שנשברה: המיקומים מגדירים איזה תא, הזוויות מגדירות את הסיבוב, והמשתמש
     קובע רק **איפה הטמפלט יושב** ע"י גרירה.
     numbers = [{page, xMm, yMm, side, transform|angleDeg}] — xMm/yMm = מרכז-המספר. */
  function gridFromTemplateNumbers(numbers, o) {
    o = o || {};
    var cw = _num(o.cellWmm, 0), ch = _num(o.cellHmm, 0);
    var tolX = _num(o.clusterTolMm, Math.max(cw, ch, 10) * 0.4);
    var tolY = _num(o.clusterTolMm, Math.max(cw, ch, 10) * 0.4);
    var list = (numbers || []).filter(function (n) { return n && n.page > 0; });
    var colC = _cluster(list.map(function (n) { return _num(n.xMm, 0); }), tolX);
    var rowC = _cluster(list.map(function (n) { return _num(n.yMm, 0); }), tolY);
    var sides = 1;
    list.forEach(function (n) { if (_num(n.side, 0) === 1) sides = 2; });
    var pages = {}, rots = {};
    list.forEach(function (n) {
      var c = _nearestIdx(colC, _num(n.xMm, 0)), r = _nearestIdx(rowC, _num(n.yMm, 0));
      var s = _num(n.side, 0) === 1 ? 1 : 0, k = cellKey(s, r, c);
      pages[k] = n.page | 0;
      var rot = n.transform ? rotationFromTransform(n.transform)
              : (n.angleDeg != null ? rotationFromTextAngle(n.angleDeg) : null);
      rots[k] = rot == null ? 0 : rot;
    });
    // מרכזי-האשכולות → פינות-תא. הסיבוב מחליף ממדים, ולכן חצי-הרוחב תלוי בו.
    var colLefts = colC.map(function (x) { return _round(x - cw / 2); });
    var rowTops = rowC.map(function (y) { return _round(y - ch / 2); });
    return {
      grid: makeGrid({ sides: sides, cellWmm: cw, cellHmm: ch, colLeftsMm: colLefts, rowTopsMm: rowTops, cellRot: rots, cellPage: pages }),
      colCenters: colC, rowCenters: rowC
    };
  }
  function _cluster(vals, tol) {
    var sorted = vals.slice().sort(function (a, b) { return a - b; }), groups = [];
    sorted.forEach(function (v) {
      var g = groups[groups.length - 1];
      if (g && Math.abs(v - g[g.length - 1]) <= tol) g.push(v); else groups.push([v]);
    });
    return groups.map(function (g) { return _round(g.reduce(function (a, b) { return a + b; }, 0) / g.length); });
  }
  function _nearestIdx(centers, v) {
    var bi = 0, bd = Infinity;
    centers.forEach(function (c, i) { var d = Math.abs(c - v); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }

  /* ── סיבוב הטמפלט כולו מעל הפרופר ────────────────────────────────────────
     ⚠️ זו לא נוחות — זו תקלה מתועדת. קובץ-הטמפלט של 88×63 שמור עם /Rotate 180
     בעוד הפרופר Rotate 0, והמפה נקראה במרחב-התצוגה → **השער יצא עמוד 5**.
     כאן הסיבוב הוא פעולה מפורשת שהמשתמש רואה, במקום הנחה שקטה בקוד.

     צירי-תצוגה: x ימינה, y מטה. סיבוב עם-כיוון-השעון סביב מרכז-הגיליון.
       90°  → (x,y,w,h) הופך ל-(H-(y+h), x, h, w)  · הגיליון הופך ל-H×W
       180° → (W-(x+w), H-(y+h), w, h)             · הגיליון נשאר W×H
       270° → (y, W-(x+w), h, w)                   · הגיליון הופך ל-H×W
     ומיפוי-האינדקסים הנגזר (R שורות · C עמודות):
       90°: (r,c)→(c, R-1-r) · 180°: (r,c)→(R-1-r, C-1-c) · 270°: (r,c)→(C-1-c, r)
     מוחזר גם הגיליון החדש, כי ב-90/270 ממדיו מתחלפים והקורא חייב לדעת. */
  function rotateGrid(grid, deg, sheetWmm, sheetHmm) {
    var d = ((_num(deg, 0) % 360) + 360) % 360;
    var W = _num(sheetWmm, 0), H = _num(sheetHmm, 0);
    if (ROTATIONS.indexOf(d) < 0 || d === 0) return { grid: _clone(grid), sheetWmm: W, sheetHmm: H };
    var R = rows(grid), C = cols(grid), swap = (d === 90 || d === 270);
    var newRows = swap ? C : R, newCols = swap ? R : C;
    var mapIdx = function (r, c) {
      if (d === 90) return { r: c, c: R - 1 - r };
      if (d === 180) return { r: R - 1 - r, c: C - 1 - c };
      return { r: C - 1 - c, c: r };                       // 270
    };
    // מיקום מוחלט (כולל כיוונון-פר-תא) → מסובב → נבנה מחדש לרשת
    var absX = [], absY = [], pages = {}, rots = {}, s, r, c;
    for (s = 0; s < grid.sides; s++) for (r = 0; r < R; r++) for (c = 0; c < C; c++) {
      var q = cellRectDisplayMm(grid, s, r, c), n;
      if (d === 90) n = { x: H - (q.yMm + q.hMm), y: q.xMm };
      else if (d === 180) n = { x: W - (q.xMm + q.wMm), y: H - (q.yMm + q.hMm) };
      else n = { x: q.yMm, y: W - (q.xMm + q.wMm) };
      var m = mapIdx(r, c), k = cellKey(s, m.r, m.c);
      absX[k] = _round(n.x); absY[k] = _round(n.y);
      if (q.page != null) pages[k] = q.page;
      rots[k] = (q.rotation + d) % 360;
    }
    /* בסיס-הרשת נלקח מהתא הראשון בכל עמודה/שורה, והשאר נשמר ככיוונון-פר-תא.
       בטמפלט קשיח כל הסטיות יוצאות 0 — אבל אם היו כיוונונים ידניים, הם
       שורדים את הסיבוב במקום להימחק בשקט. */
    var newColLefts = [], newRowTops = [];
    for (c = 0; c < newCols; c++) newColLefts.push(_num(absX[cellKey(0, 0, c)], 0));
    for (r = 0; r < newRows; r++) newRowTops.push(_num(absY[cellKey(0, r, 0)], 0));
    var g = makeGrid({
      sides: grid.sides, cellWmm: grid.cellWmm, cellHmm: grid.cellHmm,
      colLeftsMm: newColLefts, rowTopsMm: newRowTops, cellRot: rots, cellPage: pages
    });
    for (s = 0; s < grid.sides; s++) for (r = 0; r < newRows; r++) for (c = 0; c < newCols; c++) {
      var kk = cellKey(s, r, c);
      var dx = _round(_num(absX[kk], newColLefts[c]) - newColLefts[c]);
      var dy = _round(_num(absY[kk], newRowTops[r]) - newRowTops[r]);
      if (dx || dy) g.cellOffsets[kk] = { dxMm: dx, dyMm: dy };
    }
    return { grid: g, sheetWmm: swap ? H : W, sheetHmm: swap ? W : H };
  }

  /* ── בדיקת-תקינות. מדווחת קודים, לא טקסט — ה-UI מתרגם. ─────────────────── */
  function validateGrid(grid, sheet) {
    var errors = [], warnings = [], seen = {}, i, r, c, s;
    var total = rows(grid) * cols(grid) * grid.sides;
    for (s = 0; s < grid.sides; s++) for (r = 0; r < rows(grid); r++) for (c = 0; c < cols(grid); c++) {
      var p = cellPage(grid, s, r, c);
      if (p == null) { errors.push('MISSING_PAGE@' + cellKey(s, r, c)); continue; }
      if (p < 1 || p > total) errors.push('PAGE_OUT_OF_RANGE:' + p + '@' + cellKey(s, r, c));
      if (seen[p]) errors.push('DUPLICATE_PAGE:' + p); else seen[p] = true;
    }
    /* חריגה מהגיליון = תוכן חתוך בפלט. **אזהרה ולא שגיאה** — לפעמים התא באמת
       נוגע בקצה, והבעלים ביקש מפורשות שכלי-העזר לא יחסום אותו
       ([[solan-jobcard-portal-link]]: "לא אמור להגביל את העובד"). */
    if (sheet && sheet.mediaWmm > 0 && sheet.mediaHmm > 0) {
      for (s = 0; s < grid.sides; s++) {
        var rects = allCellRects(grid, s);
        for (i = 0; i < rects.length; i++) {
          var q = rects[i];
          if (q.xMm < -0.5 || q.yMm < -0.5 ||
              q.xMm + q.wMm > sheet.mediaWmm + 0.5 || q.yMm + q.hMm > sheet.mediaHmm + 0.5)
            warnings.push('CELL_OUTSIDE_SHEET@' + cellKey(q.side, q.row, q.col));
        }
      }
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  /* ── תצוגה → Trim, ובחזרה ────────────────────────────────────────────────
     זו הנקודה היחידה שיודעת איפה ה-TrimBox יושב בתוך ה-media. */
  function _trimOriginDisplay(sheet) {
    var s = sheet || {};
    var mediaH = _num(s.mediaHmm, 0);
    return {
      xMm: _num(s.trimXmm, 0),                                  // x אינו מושפע מהיפוך-y
      yMm: mediaH - (_num(s.trimYmm, 0) + _num(s.trimHmm, 0))   // PDF מודד מלמטה; התצוגה מלמעלה
    };
  }

  /* רשת → פריסה בפורמט שה-decoder מצפה לו. ⚠️ colLefts/rowTops חייבים להיות
     במרחב-Trim, אחרת הטמפלט "יזוז" בכל פרופר שהבליד שלו שונה. */
  function gridToLayout(grid, sheet, meta) {
    var o = _trimOriginDisplay(sheet), m = meta || {};
    return {
      id: m.id || null, name: m.name || null,
      pagesPerSignature: rows(grid) * cols(grid) * grid.sides,
      sidesCount: grid.sides, cols: cols(grid), rows: rows(grid),
      finishedWmm: grid.cellWmm, finishedHmm: grid.cellHmm,
      trimWmm: _num(sheet && sheet.trimWmm, 0), trimHmm: _num(sheet && sheet.trimHmm, 0),
      colLeftsTrimMm: grid.colLeftsMm.map(function (v) { return _round(v - o.xMm); }),
      rowTopsTrimMm: grid.rowTopsMm.map(function (v) { return _round(v - o.yMm); }),
      /* הכיוונון-הפר-תא נשמר בנפרד: הפריסה נשארת רשת סדירה (כפי שהמנוע מצפה),
         והחריגים הם תוספת. כך טמפלט בלי חריגים זהה לחלוטין לטמפלטים הקיימים. */
      cellOffsetsMm: JSON.parse(JSON.stringify(grid.cellOffsets || {})),
      nominalMediaWmm: _num(sheet && sheet.mediaWmm, 0), nominalMediaHmm: _num(sheet && sheet.mediaHmm, 0),
      nominalTrimXmm: _num(sheet && sheet.trimXmm, 0), nominalTrimYmm: _num(sheet && sheet.trimYmm, 0),
      nominalTrimHmm: _num(sheet && sheet.trimHmm, 0)
    };
  }

  // פריסה שמורה → רשת (לפתיחת טמפלט קיים לעריכה). ההפך המדויק של gridToLayout.
  function layoutToGrid(layout, sheet, cellMapEntries) {
    var L = layout || {}, o = _trimOriginDisplay(sheet);
    var g = makeGrid({
      sides: L.sidesCount || 2,
      cellWmm: L.finishedWmm, cellHmm: L.finishedHmm,
      colLeftsMm: (L.colLeftsTrimMm || []).map(function (v) { return _round(_num(v, 0) + o.xMm); }),
      rowTopsMm: (L.rowTopsTrimMm || []).map(function (v) { return _round(_num(v, 0) + o.yMm); }),
      cellOffsets: L.cellOffsetsMm || {}
    });
    (cellMapEntries || []).forEach(function (e) {
      var k = cellKey(e.sourceSide, e.row, e.column);
      if (e.outputPageOffset != null) g.cellPage[k] = (e.outputPageOffset | 0) + 1;
      if (ROTATIONS.indexOf(e.rotation) >= 0) g.cellRot[k] = e.rotation;
    });
    return g;
  }

  /* רשת → מפת-תאים של ה-decoder. outputPageOffset הוא 0-בסיס שם, ואילו
     המשתמש חושב ומקליד עמוד 1 — ההמרה כאן, פעם אחת. */
  function gridToCellMap(grid) {
    var cells = [];
    for (var s = 0; s < grid.sides; s++) for (var r = 0; r < rows(grid); r++) for (var c = 0; c < cols(grid); c++) {
      var p = cellPage(grid, s, r, c);
      if (p == null) continue;
      cells.push({ sourceSide: s, row: r, column: c, outputPageOffset: p - 1, rotation: cellRotation(grid, s, r, c) });
    }
    cells.sort(function (a, b) { return a.outputPageOffset - b.outputPageOffset; });
    return cells;
  }

  /* ── התאמה-אוטומטית בפעם הבאה ────────────────────────────────────────────
     המפתח מתעלם מהבליד (מודד Trim, לא media) ומעגל ל-מ"מ שלם — שני פרופרים
     של אותה עבודה נבדלים ב-שברי-מ"מ, וזה לא אמור למנוע התאמה. */
  function matchKey(o) {
    o = o || {};
    var f = function (v) { return Math.round(_num(v, 0)); };
    return [f(o.trimWmm), f(o.trimHmm), f(o.finishedWmm), f(o.finishedHmm),
            _num(o.pages, 0) | 0, _num(o.sides, 0) | 0].join('x');
  }
  function proofMatchKey(sheet, finishedWmm, finishedHmm, pages, sides) {
    return matchKey({
      trimWmm: sheet && sheet.trimWmm, trimHmm: sheet && sheet.trimHmm,
      finishedWmm: finishedWmm, finishedHmm: finishedHmm, pages: pages, sides: sides
    });
  }
  function layoutMatchKey(layout) {
    var L = layout || {};
    return matchKey({
      trimWmm: L.trimWmm, trimHmm: L.trimHmm, finishedWmm: L.finishedWmm, finishedHmm: L.finishedHmm,
      pages: L.pagesPerSignature, sides: L.sidesCount
    });
  }
  /* מבין המתאימים — העדכני-ביותר. ⚠️ מחזיר null ולא "הכי-קרוב": טמפלט
     כמעט-מתאים הוא בדיוק מה שמייצר לוחות שגויים, ועדיף לבקש כיול. */
  function findMatchingTemplate(templates, key) {
    var best = null;
    (templates || []).forEach(function (t) {
      if (!t || !t.layout) return;
      if (layoutMatchKey(t.layout) !== key) return;
      if (!best || _num(t.updatedAt, 0) > _num(best.updatedAt, 0)) best = t;
    });
    return best;
  }

  return {
    ROTATIONS: ROTATIONS,
    mmToPx: mmToPx, pxToMm: pxToMm, fitScale: fitScale,
    makeGrid: makeGrid, cellKey: cellKey, cols: cols, rows: rows,
    cellRotation: cellRotation, cellPage: cellPage, cellOffset: cellOffset,
    cellRectDisplayMm: cellRectDisplayMm, allCellRects: allCellRects, cellAtPointMm: cellAtPointMm,
    dragGrid: dragGrid, dragColumn: dragColumn, dragRow: dragRow,
    dragRowAndAfter: dragRowAndAfter, dragColumnAndAfter: dragColumnAndAfter, rotateGrid: rotateGrid,
    rotationFromTextAngle: rotationFromTextAngle, rotationFromTransform: rotationFromTransform,
    gridFromTemplateNumbers: gridFromTemplateNumbers,
    nudgeCell: nudgeCell, clearCellOffsets: clearCellOffsets,
    setCellRotation: setCellRotation, cycleCellRotation: cycleCellRotation,
    setColumnRotation: setColumnRotation, setRowRotation: setRowRotation,
    setCellPage: setCellPage, assignPageAt: assignPageAt,
    validateGrid: validateGrid,
    gridToLayout: gridToLayout, layoutToGrid: layoutToGrid, gridToCellMap: gridToCellMap,
    matchKey: matchKey, proofMatchKey: proofMatchKey, layoutMatchKey: layoutMatchKey,
    findMatchingTemplate: findMatchingTemplate
  };
});
