/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-tpl-parser.js — קריאת טמפלט Preps (.tpl) → פריסה + מפת-עמודים
 * ───────────────────────────────────────────────────────────────────────────
 * הפורמט (Preps 5.3, מיוצא מ-APOGEEX) הוא **PostScript טקסטואלי** — לא בינארי.
 * ולכן אין כאן ניחוש: המספרים מגיעים מהקובץ שממנו הדפוס עצמו עובד.
 *
 * ⚠️ למה זה חשוב יותר מכל שאר הדרכים: עד היום הגיאומטריה חולצה מ-PDF של
 *    הטמפלט ע"י קריאת מספרי-העמודים ואשכולם לעמודות/שורות — ניחוש שנשבר
 *    (בעלים, 16/08/2026). ה-TPL מכיל את המיקומים **במפורש**, בנקודות, כולל
 *    המרווחים הלא-אחידים והגלישות. אומת: הוא משחזר את פריסת 70×100 32p
 *    המאומתת-בייצור אות-באות (ראה imposition-tpl-parser-tests.js).
 *
 * ── מה נקרא מהקובץ ──────────────────────────────────────────────────────────
 *   %SSiPressSheet: W H …            → גיליון-הדפוס בנקודות
 *   %SSiSignature: |name| N …        → עמודים בקונטרס
 *   %SSiPrshPage: x y w h rot A B bL bB bR bT …
 *        x,y   = פינה שמאלית-**תחתונה** (PostScript מודד מלמטה)
 *        w,h   = גודל-העמוד הסופי (נטו) — *לא* טביעת-הרגל בגיליון
 *        rot   = קוד-סיבוב של Preps
 *        A,B   = מספר-העמוד בצד הקדמי ובצד האחורי של אותה משבצת
 *        bL…   = גלישות
 *
 * ⚠️ **שתי מוסכמות שחייבות להישאר מסונכרנות עם ImpositionDecoder:**
 *   1. ציר-Y מתהפך כאן פעם אחת (PostScript מלמטה → תצוגה מלמעלה) ב-_topFromBottom.
 *   2. עמוד מסובב 90/270 יושב **לרוחב** בגיליון, ולכן טביעת-הרגל היא h×w
 *      ולא w×h. חישוב ה-rowTop תלוי בזה — טעות כאן מזיזה שורות שלמות.
 *
 * ⚠️ קוד-הסיבוב של Preps אינו מתועד ציבורית. מופו רק שני הערכים שנצפו
 *    בקובץ אמיתי ואומתו מול הפריסה המאומתת (0→270°, 2→90°). ערך אחר מוחזר
 *    כ-null **עם אזהרה** — ולא נופל ל-0 בשקט, כי "0" נראה כמו עמוד ישר
 *    ויעבור בלי שאיש ישים לב, עד הלוחות.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionTplParser = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var PT_PER_MM = 72 / 25.4;
  function ptToMm(pt) { return pt / PT_PER_MM; }
  function _round(v, dp) { var f = Math.pow(10, dp == null ? 3 : dp); return Math.round(v * f) / f; }
  function _num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  /* קודי-סיבוב שנצפו ואומתו. מכוון שלא מתועד — טבלה מפורשת ולא נוסחה. */
  var ROT_CODES = { 0: 270, 2: 90 };

  // שדות אחרי ה-marker, מופרדים ברווחים. תומך גם ב-CRLF (הקובץ מ-Windows).
  function _fields(line, marker) {
    var i = line.indexOf(marker);
    if (i < 0) return null;
    return line.slice(i + marker.length).trim().split(/\s+/);
  }

  /* ⚠️ **הכול מתחיל מ-`%SSiSignature`.** לפניה יושבות הצהרות-ברירת-מחדל של
     הפריסה: גיליון "נייר" אחר, ושורת-`%SSiPrshPage` תבניתית. בקובץ הראשון
     שנבדק היא הייתה עם רוחב/גובה 0 ולכן נדלגה במקרה; בקובץ `740x570` היא
     ‏612×792 (Letter) עם קוד-סיבוב 3 — וקריאתה ייצרה שלוש אזהרות-שווא:
     ‏UNKNOWN_ROTATION_CODE:3 · MULTIPLE_PRESS_SHEET_SIZES · PAGE_COUNT_MISMATCH.
     סינון לפי מיקום ביחס לחתימה פותר את שלושתן, ובלי לנחש מה קוד 3 אומר. */
  function parseTpl(text) {
    var warnings = [], sheet = null, preSheet = null, pagesPerSignature = null, slots = [];
    var seenSignature = false;
    var lines = String(text == null ? '' : text).split(/\r?\n/);

    lines.forEach(function (line) {
      var f;
      if ((f = _fields(line, '%SSiPressSheet:'))) {
        var w = _num(f[0]), h = _num(f[1]);
        if (!(w > 0 && h > 0)) return;
        var cand = { wMm: _round(ptToMm(w)), hMm: _round(ptToMm(h)) };
        /* הגיליון הקובע הוא זה של החתימה. מה שלפניה נשמר בנפרד ומשמש רק
           כנפילה-לאחור אם אין אף גיליון אחריה. */
        if (!seenSignature) { if (!preSheet) preSheet = cand; return; }
        if (!sheet) sheet = cand;
        else if (Math.abs(cand.wMm - sheet.wMm) > 0.5 || Math.abs(cand.hMm - sheet.hMm) > 0.5)
          warnings.push('MULTIPLE_PRESS_SHEET_SIZES');
        return;
      }
      if (_fields(line, '%SSiSignature:')) {
        seenSignature = true;
        // |Full Signature| 32 6 1 1 |avalon2| — המספר הראשון שאחרי השם
        var m = line.match(/%SSiSignature:\s*\|[^|]*\|\s*(\d+)/);
        if (m) pagesPerSignature = parseInt(m[1], 10);
        return;
      }
      if ((f = _fields(line, '%SSiPrshPage:'))) {
        if (!seenSignature) return;                       // שורת-ברירת-מחדל, לא משבצת
        var x = _num(f[0]), y = _num(f[1]), pw = _num(f[2]), ph = _num(f[3]);
        var rotCode = _num(f[4]), pa = _num(f[5]), pb = _num(f[6]);
        if (!(pw > 0 && ph > 0)) return;
        if (!(pa > 0)) return;
        var rot = ROT_CODES.hasOwnProperty(rotCode) ? ROT_CODES[rotCode] : null;
        if (rot === null) warnings.push('UNKNOWN_ROTATION_CODE:' + rotCode);
        slots.push({
          xMm: _round(ptToMm(x)), yBottomMm: _round(ptToMm(y)),
          pageWmm: _round(ptToMm(pw)), pageHmm: _round(ptToMm(ph)),
          rotCode: rotCode, rotation: rot,
          pageFront: pa, pageBack: (pb > 0 ? pb : null),
          bleedMm: {
            left: _round(ptToMm(_num(f[7]) || 0)), bottom: _round(ptToMm(_num(f[8]) || 0)),
            right: _round(ptToMm(_num(f[9]) || 0)), top: _round(ptToMm(_num(f[10]) || 0))
          }
        });
        return;
      }
    });

    if (!sheet) sheet = preSheet;                          // קובץ בלי גיליון אחרי החתימה
    if (!sheet) warnings.push('NO_PRESS_SHEET');
    if (!slots.length) warnings.push('NO_PAGE_SLOTS');
    var sides = slots.some(function (s) { return s.pageBack != null; }) ? 2 : 1;
    /* ⚠️ נספרים **עמודים ייחודיים** ולא סכום-המשבצות: בפריסת 2-up אותם 4
       עמודים יושבים פעמיים על הגיליון (‏740×570 4+4p), ולכן ספירת-משבצות
       נתנה 10 מול הצהרה של 4 — אזהרת-שווא שחסמה טעינה של טמפלט תקין. */
    var uniq = {};
    slots.forEach(function (s) {
      uniq[s.pageFront] = true;
      if (s.pageBack != null) uniq[s.pageBack] = true;
    });
    var covered = Object.keys(uniq).length;
    if (pagesPerSignature != null && covered !== pagesPerSignature)
      warnings.push('PAGE_COUNT_MISMATCH:declared=' + pagesPerSignature + ',pages=' + covered);

    return {
      sheet: sheet, pagesPerSignature: pagesPerSignature != null ? pagesPerSignature : covered,
      sides: sides, slots: slots, warnings: warnings
    };
  }

  /* טביעת-הרגל בגיליון: עמוד מסובב 90/270 שוכב, ולכן ממדיו מתחלפים.
     ⚠️ סיבוב לא-ידוע (null) → **לא מנחשים**; מחזירים את הנטו כמו-שהוא
     ומסמנים, כדי שהקורא יידע שהמיקום האנכי אינו מוסמך. */
  function slotFootprint(slot) {
    var swap = (slot.rotation === 90 || slot.rotation === 270);
    return { wMm: swap ? slot.pageHmm : slot.pageWmm, hMm: swap ? slot.pageWmm : slot.pageHmm, trusted: slot.rotation !== null };
  }
  // PostScript מודד מלמטה; המנוע והתצוגה מודדים מלמעלה. היפוך יחיד, כאן.
  function _topFromBottom(sheetHmm, yBottomMm, footprintHmm) { return _round(sheetHmm - (yBottomMm + footprintHmm)); }

  function _uniqSorted(vals, tol) {
    var out = [];
    vals.slice().sort(function (a, b) { return a - b; }).forEach(function (v) {
      if (!out.length || Math.abs(v - out[out.length - 1]) > tol) out.push(v);
    });
    return out;
  }

  /* TPL → פריסה בפורמט ImpositionDecoder. ⚠️ הפריסה נשמרת במרחב-Trim, ובקובץ
     Preps אין TrimBox נפרד — הגיליון *הוא* ה-Trim (המדיה של הפרופר גדולה
     ממנו, וזה מטופל בזמן-הפירוק לפי ה-TrimBox האמיתי של הפרופר). */
  function tplToLayout(parsed, meta) {
    var m = meta || {};
    if (!parsed || !parsed.sheet || !parsed.slots.length) return null;
    var sh = parsed.sheet, tol = 0.6;
    var xs = _uniqSorted(parsed.slots.map(function (s) { return s.xMm; }), tol);
    var tops = _uniqSorted(parsed.slots.map(function (s) {
      return _topFromBottom(sh.hMm, s.yBottomMm, slotFootprint(s).hMm);
    }), tol);
    var f0 = slotFootprint(parsed.slots[0]);
    return {
      id: m.id || null, name: m.name || null, source: 'preps-tpl',
      pagesPerSignature: parsed.pagesPerSignature,
      sidesCount: parsed.sides, cols: xs.length, rows: tops.length,
      finishedWmm: parsed.slots[0].pageWmm, finishedHmm: parsed.slots[0].pageHmm,
      trimWmm: sh.wMm, trimHmm: sh.hMm,
      colLeftsTrimMm: xs, rowTopsTrimMm: tops,
      // הגלישה שהטמפלט עצמו מצהיר — מקור-אמת עדיף על ברירת-מחדל בקוד
      declaredBleedMm: parsed.slots[0].bleedMm,
      footprintWmm: f0.wMm, footprintHmm: f0.hMm,
      nominalMediaWmm: sh.wMm, nominalMediaHmm: sh.hMm,
      nominalTrimXmm: 0, nominalTrimYmm: 0, nominalTrimHmm: sh.hMm
    };
  }

  function _nearest(arr, v) {
    var bi = 0, bd = Infinity;
    arr.forEach(function (a, i) { var d = Math.abs(a - v); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }

  /* TPL → מפת-תאים של המנוע.
     ⚠️ הצד האחורי של פרפקטור מודפס **הפוך-מראה**, ולכן משבצת שיושבת בעמודה c
     בצד הקדמי יושבת בעמודה (cols-1-c) בצד האחורי. זה לא ניחוש: הזוגות בקובץ
     האמיתי הם (1,2)(16,15)(13,14)(4,3) — כלומר האחוריים 2,15,14,3, והרשת
     האחורית המאומתת היא [3,14,15,2] = בדיוק ההיפוך. */
  function tplToCellMap(parsed, layout) {
    if (!parsed || !layout) return [];
    var cells = [], taken = {};
    /* ⚠️ בפריסת 2-up (‏740×570 4+4p) אותו עמוד יושב ב**שתי** משבצות על
       הגיליון. לפירוק צריך מקום אחד לכל עמוד — נלקחת המשבצת הראשונה,
       ובלעדי זה נוצרים שני תאים לאותו outputPageOffset ו-validateCellMap
       פוסל את המפה כולה (DUPLICATE_OFFSET). */
    var put = function (side, row, col, page, rot) {
      if (page == null || taken[page]) return;
      taken[page] = true;
      cells.push({ sourceSide: side, row: row, column: col, outputPageOffset: page - 1, rotation: rot });
    };
    parsed.slots.forEach(function (s) {
      var fp = slotFootprint(s);
      var col = _nearest(layout.colLeftsTrimMm, s.xMm);
      var row = _nearest(layout.rowTopsTrimMm, _topFromBottom(parsed.sheet.hMm, s.yBottomMm, fp.hMm));
      put(0, row, col, s.pageFront, s.rotation);
      put(1, row, (layout.cols - 1 - col), s.pageBack, s.rotation);
    });
    cells.sort(function (a, b) { return a.outputPageOffset - b.outputPageOffset; });
    return cells;
  }

  // מפת-תאים → רשת דו-מימדית לתצוגה/השוואה: grid[side][row][col] = מספר-עמוד
  function cellMapToGrids(cells, rows, cols, sides) {
    var g = [], s, r;
    for (s = 0; s < sides; s++) { g.push([]); for (r = 0; r < rows; r++) g[s].push(new Array(cols).fill(0)); }
    (cells || []).forEach(function (c) {
      if (g[c.sourceSide] && g[c.sourceSide][c.row]) g[c.sourceSide][c.row][c.column] = c.outputPageOffset + 1;
    });
    return g;
  }

  /* קריאה מלאה: טקסט → { layout, cells, grids, warnings }. נקודת-הכניסה ל-UI. */
  function readTpl(text, meta) {
    var parsed = parseTpl(text);
    var layout = tplToLayout(parsed, meta);
    if (!layout) return { ok: false, parsed: parsed, layout: null, cells: [], grids: [], warnings: parsed.warnings };
    var cells = tplToCellMap(parsed, layout);
    return {
      ok: parsed.warnings.length === 0, parsed: parsed, layout: layout, cells: cells,
      grids: cellMapToGrids(cells, layout.rows, layout.cols, layout.sidesCount),
      warnings: parsed.warnings
    };
  }

  return {
    PT_PER_MM: PT_PER_MM, ROT_CODES: ROT_CODES, ptToMm: ptToMm,
    parseTpl: parseTpl, slotFootprint: slotFootprint,
    tplToLayout: tplToLayout, tplToCellMap: tplToCellMap, cellMapToGrids: cellMapToGrids,
    readTpl: readTpl
  };
});
