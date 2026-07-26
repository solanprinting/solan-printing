/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-fold-adapter.js — בורר-מנוע ו-placeholders (U1 · Unified Shell)
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠️ U1: *החלטה בלבד* — resolveImpositionEngine מחליט איזה מנוע יופעל ולמה, אך
 *    אינו מפעיל שום מנוע. runLegacyAdapter/runDecoderV2Adapter הם placeholders
 *    (implemented:false). אין כאן שום עותק של לוגיקת-הקיפול (fold/decoder).
 *    Legacy/V2 Adapters אמיתיים = U2/U3.
 * לוגיקה טהורה · אין DOM/רשת/PDF.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionFoldAdapter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var FLAG = 'solanUnifiedProofUI';

  // הדגל כבוי כברירת-מחדל; נדלק רק אם window.SOLAN_FLAGS.solanUnifiedProofUI === true
  function unifiedUiEnabled(win) {
    try { var w = win || (typeof window !== 'undefined' ? window : null);
      return !!(w && w.SOLAN_FLAGS && w.SOLAN_FLAGS[FLAG] === true); } catch (e) { return false; }
  }
  // הרשאת-משתמש: מנהל/מורשה בלבד (בתקופת-המעבר). user = {role} | null
  function unifiedUiAllowedForUser(user) {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'owner' || user.unifiedBeta === true;
  }
  // האם להציג את המסך: דגל דלוק + משתמש-מורשה, או מצב-Beta מפורש (?beta=1)
  function unifiedAccessAllowed(opts) {
    opts = opts || {};
    if (opts.betaParam === true) return true;                       // כפתור-Beta / URL מפורש
    return unifiedUiEnabled(opts.win) && unifiedUiAllowedForUser(opts.user);
  }

  // ── בורר-המנוע — החלטה + תיאור בלבד (לא מפעיל) ──────────────────────────────
  // input: { template, files, job, featureFlags }
  //   template = רשומת-קטלוג (engineRecommendation/status/productionAllowed/…)
  function resolveImpositionEngine(input) {
    input = input || {};
    var t = input.template || null;
    var warnings = [];
    if (!t) return { engine: null, reason: 'לא נבחר טמפלט', supported: false, warnings: warnings };

    var rec = t.engineRecommendation || (Array.isArray(t.cells) && t.cells.length ? 'decoder-v2' : 'legacy');

    // Legacy: טמפלטים ישנים שכבר עובדים בייצור → מנוע-legacy, נתמך
    if (rec === 'legacy' || t.source === 'legacy') {
      return { engine: 'legacy', reason: 'טמפלט legacy (מקובע/מיובא) — יופעל ע"י מנוע-הקיפול הקיים', supported: true, warnings: warnings };
    }

    // Decoder V2: מבוסס cells + outputPageOffset
    if (rec === 'decoder-v2') {
      if (t.productionAllowed === true || t.status === 'production') {
        return { engine: 'decoder-v2', reason: 'טמפלט V2 מאושר-לייצור', supported: true, warnings: warnings };
      }
      if (t.status === 'tested') {
        warnings.push('הטמפלט נבדק אך טרם אושר production');
        return { engine: 'decoder-v2', reason: 'טמפלט V2 (tested) — ניתן לבדיקה, לא לייצור', supported: true, warnings: warnings };
      }
      // draft / לא-מאושר → לא נתמך אוטומטית
      return { engine: 'decoder-v2', reason: 'טמפלט V2 שטרם נבדק (' + (t.status || 'draft') + ') — אינו מופעל אוטומטית', supported: false, warnings: warnings };
    }

    return { engine: null, reason: 'לא ניתן לקבוע מנוע לטמפלט זה', supported: false, warnings: warnings };
  }

  // ── U2 · Legacy Adapter (טהור) — מיפוי דוח-הכלי-הישן ל-NormalizedFoldResult ──
  var FLAG_U2 = 'solanUnifiedLegacyU2';
  function legacyU2Enabled(win) {
    try { var w = win || (typeof window !== 'undefined' ? window : null);
      return !!(w && w.SOLAN_FLAGS && w.SOLAN_FLAGS[FLAG_U2] === true); } catch (e) { return false; }
  }
  // U2 מוגבל לטמפלט אחד בלבד
  function legacyU2TemplateAllowed(templateId) { return templateId === '16perf'; }

  // ── U3 · Decoder V2 — דגל נפרד + גבלת-טמפלט (לא נוגע ב-U2) ──────────────────
  var FLAG_U3 = 'solanUnifiedDecoderV3';
  function decoderV3Enabled(win) {
    try { var w = win || (typeof window !== 'undefined' ? window : null);
      return !!(w && w.SOLAN_FLAGS && w.SOLAN_FLAGS[FLAG_U3] === true); } catch (e) { return false; }
  }
  // U3 מוגבל לטמפלט המכויל היחיד
  function decoderV3TemplateAllowed(templateId) { return templateId === '88x63-16p-perfector'; }

  // ── T1 · Template Registry — דגל נפרד (כבוי=התנהגות U2/U3 הישירה כמו היום) ────
  var FLAG_REGISTRY = 'solanTemplateRegistry';
  function templateRegistryEnabled(win) {
    try { var w = win || (typeof window !== 'undefined' ? window : null);
      return !!(w && w.SOLAN_FLAGS && w.SOLAN_FLAGS[FLAG_REGISTRY] === true); } catch (e) { return false; }
  }

  // ── T3 · טמפלט 32 עמ׳ — דגל Beta נפרד (מוגבל לטמפלט אחד) ─────────────────────
  var FLAG_32 = 'solanDecoder32pBeta';
  function decoder32pEnabled(win) {
    try { var w = win || (typeof window !== 'undefined' ? window : null);
      return !!(w && w.SOLAN_FLAGS && w.SOLAN_FLAGS[FLAG_32] === true); } catch (e) { return false; }
  }
  function decoder32pTemplateAllowed(templateId) { return templateId === '70x100-32p-165x240-perfector'; }

  // ── Customer Fold Preview MVP — דגל נפרד (כבוי) · 3 הטמפלטים שעברו Golden בלבד ──
  var FLAG_CFP = 'solanCustomerFoldPreviewBeta';
  function customerFoldPreviewEnabled(win) {
    try { var w = win || (typeof window !== 'undefined' ? window : null);
      return !!(w && w.SOLAN_FLAGS && w.SOLAN_FLAGS[FLAG_CFP] === true); } catch (e) { return false; }
  }
  var CFP_TEMPLATES = ['16perf', '88x63-16p-perfector', '70x100-32p-165x240-perfector'];
  // בנוסף: כל הטמפלטים המובנים של מנוע-האפליקציה (legacy:<type>) + טמפלטים שנשמרו
  // בכלי סימון-הטמפלט (custom:<key>) — כולם רצים באותו מנוע-אפליקציה דרך הגשר.
  function customerFoldTemplateAllowed(id) {
    if (typeof id !== 'string' || !id) return false;
    if (CFP_TEMPLATES.indexOf(id) >= 0) return true;
    return id.indexOf('legacy:') === 0 || id.indexOf('custom:') === 0 || id.indexOf('multi:') === 0;
  }

  // ── עיתון מרובה-קונטרסים (תפירת-אוכף מקוננת) ─────────────────────────────────
  //    R-1 = הקונטרס החיצוני (עוטף · מכיל שער+גב) · R-2 בתוכו · וכו'. כל קונטרס = positionsPerRun
  //    עמ' (בד"כ 32). החצי-הראשון (1..H) של כל קונטרס נכנס פנימה בסדר-הקונטרסים; החצי-השני
  //    (H+1..positionsPerRun) יוצא החוצה בסדר הפוך. דוגמת-המשתמש: 64 עמ' = R1[1-16]+R2[1-16]+R2[17-32]+R1[17-32].
  //    מחזיר סדר-קריאה גלובלי: [{ runIndex(0-based), posInRun(1-based) }] באורך runCount*positionsPerRun.
  //    גרסה עם גדלים שונים לכל קונטרס: runSizes=[16,32] → R0 חיצוני 16עמ', R1 פנימי 32עמ'.
  //    כניסה: כל קונטרס חצי-ראשון בסדר-הקונטרסים; יציאה: הפוך, חצי-שני. דוגמת-48: R0[1-8]R1[1-16]R1[17-32]R0[9-16].
  function assembleNestedRuns(runSizes) {
    if (!Array.isArray(runSizes) || !runSizes.length) return [];
    for (var i = 0; i < runSizes.length; i++) { var s = runSizes[i] | 0; if (s < 2 || s % 2 !== 0) return []; }
    var order = [], k, p;
    for (k = 0; k < runSizes.length; k++) { var H = runSizes[k] >> 1; for (p = 1; p <= H; p++) order.push({ runIndex: k, posInRun: p }); }
    for (k = runSizes.length - 1; k >= 0; k--) { var Hk = runSizes[k] >> 1; for (p = Hk + 1; p <= runSizes[k]; p++) order.push({ runIndex: k, posInRun: p }); }
    return order;
  }
  function assembleNestedRunOrder(runCount, positionsPerRun) {
    runCount = runCount | 0; positionsPerRun = (positionsPerRun | 0) || 32;
    if (runCount < 1) return [];
    var sizes = []; for (var i = 0; i < runCount; i++) sizes.push(positionsPerRun);
    return assembleNestedRuns(sizes);   // אחיד = מקרה-פרטי של הגדלים-השונים
  }

  // ── זיהוי-אוטומטי לעיתון מרובה-קונטרסים (מהשם + סה"כ-עמודים שהמשתמש בוחר) ──────
  //    כלל-המשתמש: "8 COLORS" בשם = פרפקטור. 4-צבע = מתהפך (אם <32 עמ'). R-1 חיצוני.
  function isPerfectorName(name) { return /8\s*colou?rs?/i.test(String(name || '')); }
  //    סוג-מנוע לפי (פרפקטור?, עמודים): פרפקטור→32/16perf/8perf/4perf · מתהפך→32p/16p/8p/4p.
  function legacyTypeForRun(perfector, pages) {
    pages = pages | 0;
    if (perfector) return pages >= 32 ? '32' : pages >= 16 ? '16perf' : pages >= 8 ? '8perf' : '4perf';
    return pages >= 32 ? '32p' : pages >= 16 ? '16p' : pages >= 8 ? '8p' : '4p';   // מתהפך / 4-צבע
  }
  //    גזירת עמודי-כל-ריצה מסה"כ: כל פרפקטור=32; היתרה לריצת-המתהפך (או חלוקה שווה). ניתן-לעריכה ב-UI.
  function planMultiRun(names, totalPages) {
    names = names || []; totalPages = totalPages | 0;
    var perf = names.map(isPerfectorName);
    var perfCount = perf.filter(Boolean).length;
    var tumbleIdx = []; perf.forEach(function (p, i) { if (!p) tumbleIdx.push(i); });
    var pages = names.map(function (_, i) { return perf[i] ? 32 : null; });
    var remaining = totalPages - perfCount * 32;
    if (tumbleIdx.length === 1) { pages[tumbleIdx[0]] = (totalPages && remaining >= 4) ? remaining : 16; }
    else if (tumbleIdx.length > 1 && totalPages) {
      var each = Math.max(16, Math.floor((remaining / tumbleIdx.length) / 16) * 16) || 16;
      tumbleIdx.forEach(function (i) { pages[i] = each; });
    }
    var runs = names.map(function (nm, i) {
      var pg = (pages[i] != null && pages[i] > 0) ? pages[i] : (perf[i] ? 32 : 16);
      return { name: nm, perfector: perf[i], pages: pg, legacyType: legacyTypeForRun(perf[i], pg) };
    });
    var sum = runs.reduce(function (a, r) { return a + r.pages; }, 0);
    return { runs: runs, sum: sum, total: totalPages || sum, matches: !totalPages || sum === totalPages };
  }

  // ── גשר-מאגרים: טמפלט-V2 מנורמל → פורמט-legacy של מנוע-הקיפול (solanFoldTemplates) ──
  //    כלי סימון-הטמפלט שומר ל-solanImpositionTemplatesV2 (cells+ratios), אבל fold() של
  //    imposition-tool קורא TEMPLATES בפורמט grids. ההמרה מאפשרת לטמפלט שנשמר בכלי-הסימון
  //    להופיע ולעבוד בכלי-הקיפול ובמסך "שליחת פרופר ללקוח".
  //    מיפוי-שדות (מאומת מול הקיפול-הגנרי שבכלי): geom.sheetWmm/Hmm = גיליון-הפריסה ·
  //    geom.trimWmm/Hmm = גודל-העמוד-הסופי · geom.colX/rowY = *מרכזי*-התאים במ״מ.
  //    ⚠️ המרת-נתונים בלבד — אין כאן עותק של מנוע-הקיפול (ראה סנטינל ב-unified-tests).
  function v2TemplateToLegacy(t) {
    if (!t || !Array.isArray(t.cells) || !t.cells.length) return null;
    var sheetW = (t.sheet && t.sheet.widthMm) || 0, sheetH = (t.sheet && t.sheet.heightMm) || 0;
    var finW = (t.finishedPage && t.finishedPage.widthMm) || 0, finH = (t.finishedPage && t.finishedPage.heightMm) || 0;
    if (!(sheetW > 0 && sheetH > 0 && finW > 0 && finH > 0)) return null;
    var sides = t.sidesCount || 1, maxRow = 0, maxCol = 0;
    t.cells.forEach(function (c) { if (c.row > maxRow) maxRow = c.row; if (c.column > maxCol) maxCol = c.column; });
    var rows = maxRow + 1, cols = maxCol + 1;
    var grids = [], rotGrids = [], s, r, cIdx;
    for (s = 0; s < sides; s++) {
      grids.push([]); rotGrids.push([]);
      for (r = 0; r < rows; r++) { grids[s].push(new Array(cols).fill(0)); rotGrids[s].push(new Array(cols).fill(0)); }
    }
    var colX = new Array(cols).fill(null), rowY = new Array(rows).fill(null);
    for (cIdx = 0; cIdx < t.cells.length; cIdx++) {
      var c = t.cells[cIdx];
      var si = (c.sourceSide || 1) - 1;                       // V2 = 1-based · legacy = 0-based
      if (si < 0 || si >= sides || c.row >= rows || c.column >= cols) continue;
      grids[si][c.row][c.column] = (c.outputPageOffset | 0) + 1;   // מספר-עמוד 1-based
      rotGrids[si][c.row][c.column] = c.rotation || 0;
      if (colX[c.column] == null) colX[c.column] = (c.xRatio + c.widthRatio / 2) * sheetW;   // מרכז-תא
      if (rowY[c.row] == null) rowY[c.row] = (c.yRatio + c.heightRatio / 2) * sheetH;
    }
    if (colX.some(function (v) { return v == null; }) || rowY.some(function (v) { return v == null; })) return null;
    var rot = [];   // fallback פר-עמודה (מנוע-הקיפול מעדיף rotGrids כשקיים)
    for (cIdx = 0; cIdx < cols; cIdx++) rot.push(rotGrids[0][0][cIdx] || 0);
    return {
      custom: true, N: t.pagesPerSignature || t.cells.length, sides: sides,
      rot: rot, grids: grids, rotGrids: rotGrids,
      geom: { colX: colX, rowY: rowY, sheetWmm: sheetW, sheetHmm: sheetH, trimWmm: finW, trimHmm: finH },
      label: t.name || t.id || 'טמפלט מותאם', sizeLabel: finW + '×' + finH
    };
  }

  // ── CFP · fallback ל-TrimBox חסר ──────────────────────────────────────────────
  //    פרופר בלי TrimBox נראה כ-trim==media (offset 0,0) → כל התאים זזים ~5-6.5 מ"מ
  //    → מסגרת-לבנה בפלט. כשהמדיה בקנה-מידה 1:1 מול הנומינלי (±2%) ממרכזים את
  //    ה-Trim הנומינלי של הפריסה בתוך המדיה. יש TrimBox אמיתי / קנה-מידה שונה → ללא-שינוי.
  function sheetTrimFallback(sheet, layout) {
    if (!sheet || !layout) return sheet;
    var noTrim = Math.abs(sheet.trimWmm - sheet.mediaWmm) < 0.01 && Math.abs(sheet.trimHmm - sheet.mediaHmm) < 0.01
              && Math.abs(sheet.trimXmm || 0) < 0.01 && Math.abs(sheet.trimYmm || 0) < 0.01;
    if (!noTrim) return sheet;                                        // TrimBox אמיתי — לא נוגעים
    var nw = layout.nominalMediaWmm, nh = layout.nominalMediaHmm;
    if (!(nw > 0 && nh > 0)) return sheet;
    var sx = sheet.mediaWmm / nw, sy = sheet.mediaHmm / nh;
    if (Math.abs(sx - 1) > 0.02 || Math.abs(sy - 1) > 0.02) return sheet;   // לא 1:1 — לא ממציאים גיאומטריה
    var tw = layout.trimWmm, th = layout.trimHmm;
    return { mediaWmm: sheet.mediaWmm, mediaHmm: sheet.mediaHmm,
      trimWmm: tw, trimHmm: th,
      trimXmm: (sheet.mediaWmm - tw) / 2, trimYmm: (sheet.mediaHmm - th) / 2 };
  }

  // ── Validator · חוסם הרצה אם הפרופר/התוצאה אינם תואמים להגדרת-הטמפלט ─────────
  //    input: { def, sourcePdfPages, sheetWmm, sheetHmm, result, outputDimsMm[], tolMm }
  //    def = Template Definition (מה-Registry). result = NormalizedFoldResult. outputDimsMm = [{w,h}] פר-עמוד (מה-PDF, אופציונלי).
  function validateDecodeAgainstTemplate(input) {
    input = input || {}; var errors = [], warnings = [];
    var def = input.def, r = input.result || {}, tol = input.tolMm != null ? input.tolMm : 2;
    if (!def) return { valid: false, errors: ['NO_TEMPLATE_DEFINITION'], warnings: warnings };
    // מספר עמודי-מקור
    if (input.sourcePdfPages != null && input.sourcePdfPages !== def.sourcePdfPages)
      errors.push('SOURCE_PDF_PAGES:' + input.sourcePdfPages + '≠' + def.sourcePdfPages);
    // מידות גיליון-מקור (טולרנס)
    var ss = def.sourceSheetSizeMm || {};
    if (input.sheetWmm != null && Math.abs(input.sheetWmm - ss.w) > tol) errors.push('SHEET_W:' + Math.round(input.sheetWmm) + '≠' + ss.w);
    if (input.sheetHmm != null && Math.abs(input.sheetHmm - ss.h) > tol) errors.push('SHEET_H:' + Math.round(input.sheetHmm) + '≠' + ss.h);
    // מספר עמודי-פלט + מפה 1..N בדיוק
    var N = def.totalPages, pages = r.orderedPages || [];
    if (pages.length !== N) errors.push('PAGE_COUNT:' + pages.length + '≠' + N);
    var seen = {};
    pages.forEach(function (p) {
      if (!(p.finalPageNumber >= 1 && p.finalPageNumber <= N)) errors.push('PAGE_OUT_OF_RANGE:' + p.finalPageNumber);
      if (seen[p.finalPageNumber]) errors.push('DUP_PAGE:' + p.finalPageNumber);
      seen[p.finalPageNumber] = true;
      if ([0, 90, 180, 270].indexOf(p.rotationApplied) < 0) errors.push('ROTATION:' + p.finalPageNumber);
      if (p.sourceSide !== 0 && p.sourceSide !== 1) errors.push('SOURCE_SIDE:' + p.finalPageNumber);
      if (!p.cropBox || !(p.cropBox.width > 0 && p.cropBox.height > 0)) errors.push('CROPBOX:' + p.finalPageNumber);
    });
    for (var i = 1; i <= N; i++) if (!seen[i]) errors.push('MISSING_PAGE:' + i);
    // Front+Back שניהם בשימוש
    var sides = {}; pages.forEach(function (p) { sides[p.sourceSide] = true; });
    if (def.sourcePdfPages === 2 && !(sides[0] && sides[1])) errors.push('FRONT_BACK_STRUCTURE');
    // מידות-פלט 165×240 (טולרנס) — אם סופקו מה-PDF
    var fp = def.finalPageSizeMm || {};
    (input.outputDimsMm || []).forEach(function (d, idx) {
      if (Math.abs(d.w - fp.w) > tol || Math.abs(d.h - fp.h) > tol) errors.push('OUTPUT_DIMS@' + (idx + 1) + ':' + Math.round(d.w) + '×' + Math.round(d.h));
    });
    // warning קריטי בתוצאה
    (r.errors || []).forEach(function (e) { errors.push('RESULT_ERROR:' + (e.code || e)); });
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ── שתי מערכות-קואורדינטות של הטמפלט (מתועד למניעת בלבול) ────────────────────
  //  Template Display Map  = כפי שנראה כשמציגים את PDF-הטמפלט למשתמש.
  //  Decoder Source Map    = לאחר נרמול-180 (הטמפלט שמור /Rotate 180, הפרופר /Rotate 0).
  //  הטרנספורמציה: sourceRow = rows-1-displayRow · sourceColumn = cols-1-displayColumn · rotation += 180.
  //  ⚠️ אין כאן מפה אוטוריטטיבית שנייה — זו פונקציית-הוכחה בלבד. מקור-האמת = CELL_MAP ב-imposition-decoder.js.
  function displayMapToDecoderMap(displayMap, rows, cols) {
    rows = rows || 2; cols = cols || 4;
    return (displayMap || []).map(function (c) {
      return {
        sourceSide: c.sourceSide,
        sourceRow: rows - 1 - c.displayRow, sourceColumn: cols - 1 - c.displayColumn,
        outputPageOffset: c.outputPageOffset, rotation: ((c.rotation + 180) % 360)
      };
    });
  }

  // מונה-בקשות מונוטוני + בדיקת-stale (מניעת דריסת-request חדש ע"י ישן)
  function makeRequestCounter() { var n = 0; return { next: function () { return ++n; }, current: function () { return n; } }; }
  function isStale(requestId, activeRequestId) { return requestId !== activeRequestId; }

  // ⚠️ טהור: אינו מפעיל fold ואינו נוגע ב-DOM. מקבל את פלט-הגשר (report+bytes-meta) ובונה תוצאה.
  //    Legacy אינו חושף מיפוי-מקור → sourceSide/cropBox/rotationApplied = null (לא ממציאים).
  //    input: { report, outputPageCount?, bytesLen, sourceFile, templateId, engineVersion,
  //             bridgeMode, appCheckUnavailable, sourceHash, outputHash }
  function legacyReportToResult(input) {
    input = input || {};
    var report = input.report || {};
    var pageCount = input.outputPageCount != null ? (input.outputPageCount | 0)
      : (report.pagesOut != null ? (report.pagesOut | 0) : 0);
    var sourceFileId = input.sourceFile && input.sourceFile.fileId || null;
    var orderedPages = [];
    for (var i = 1; i <= pageCount; i++) {
      orderedPages.push({
        finalPageNumber: i, sourceFileId: sourceFileId,
        sourcePdfPage: null, sourceSide: null, cropBox: null, rotationApplied: null,   // Legacy: לא-ידוע → null
        blank: false
      });
    }
    var warnings = [], errors = [];
    if (report.sizeWarn) warnings.push({ code: 'SIZE_WARN', message: 'גודל-גיליון חריג: ' + report.sizeWarn, blocking: false });
    if (report.rotWarn) warnings.push({ code: 'ROTATE_FLAG', message: 'הקובץ שמור עם דגל-סיבוב ' + report.rotWarn + '°', blocking: false });
    if (report.leftover) warnings.push({ code: 'LEFTOVER_PAGES', message: 'נשארו ' + report.leftover + ' עמ׳ שלא הושלמה להם חתימה', blocking: false });
    if (report.lip) warnings.push({ code: 'STITCH_LIP', message: 'זוהה דש-סיכות ~' + (report.lip.big) + ' מ״מ בצד ' + report.lip.bigSide, blocking: false });
    if (input.appCheckUnavailable) warnings.push({ code: 'APP_CHECK_UNAVAILABLE', message: 'App Check לא נטען, אך מנוע הקיפול המקומי זמין.', blocking: false });
    if (pageCount <= 0) errors.push({ code: 'NO_OUTPUT_PAGES', message: 'לא נוצרו עמודי-פלט' });

    return {
      success: errors.length === 0 && pageCount > 0,
      jobId: input.jobId || null, templateId: input.templateId || null, templateVersion: null,
      engine: 'legacy',
      sourceFiles: input.sourceFile ? [input.sourceFile] : [],
      orderedPages: orderedPages,
      outputPdfBytes: input.bytes || null,        // מקור-האמת היחיד לרכיבים
      spreadsPdfBytes: null,                       // U2: כפולות רק אחרי Golden נפרד
      warnings: warnings, errors: errors,
      metadata: {
        totalPages: pageCount, signatureCount: report.signatures != null ? (report.signatures | 0) : null,
        createdAt: input.createdAt || null, createdBy: input.createdBy || null,
        sourceHash: input.sourceHash || null, outputHash: input.outputHash || null,
        engineVersion: input.engineVersion || '', legacyTemplateType: input.templateId || null,
        bridgeMode: input.bridgeMode || 'same-origin-iframe',
        mappingDetailLevel: 'output-only', appCheckRequiredForFold: false
      }
    };
  }

  // runLegacyAdapter: אם ניתן פלט-גשר → בונה תוצאה; אחרת (בלי גשר) מסמן שנדרש הגשר בדפדפן.
  function runLegacyAdapter(input) {
    input = input || {};
    if (input.report && (input.bytes || input.outputPageCount != null)) return legacyReportToResult(input);
    return { implemented: false, engine: 'legacy', reason: 'Legacy Adapter דורש פלט-גשר (bridge) — ראה imposition-legacy-bridge.js' };
  }
  // ── U3 · Decoder V2 Adapter (טהור) — plan+bytes של ה-Executor → NormalizedFoldResult מיפוי-מלא ──
  //    ⚠️ טהור: אינו קורא ל-Executor, אינו יוצר PDF, אינו עושה save. bytes = passthrough.
  //    שדות-מיפוי (מרחב-מקור, לא-null): sourceRow/sourceColumn/cropBox(points)/rotationApplied.
  //    input: { plan, bytes, templateId, templateVersion, sourceFile, sourceHash, outputHash, engineVersion, createdAt }
  var _MM_ADP = 72 / 25.4, _CROP_TOL_PT = 1;   // tolerance ל-floating point (points · מתועד)
  function decoderPlanToResult(input) {
    input = input || {};
    var plan = input.plan || null;
    var errors = [], warnings = [];
    if (!plan || !Array.isArray(plan.pages) || !plan.pages.length) {
      return _v2Fail(input, [{ code: 'NO_PLAN', message: 'אין תוכנית-פירוק (plan) מה-Executor' }]);
    }
    var pages = plan.pages;
    var N = pages.length;
    // גבולות עמוד-המקור ב-points (לבדיקת cropBox באותן יחידות)
    var srcWpt = (plan.sheet && plan.sheet.mediaWmm || 0) * _MM_ADP;
    var srcHpt = (plan.sheet && plan.sheet.mediaHmm || 0) * _MM_ADP;
    // rows/cols מהתוכנית (למרחב-תצוגה לצורכי Debug)
    var maxRow = 0, maxCol = 0;
    pages.forEach(function (p) { if (p.row > maxRow) maxRow = p.row; if (p.column > maxCol) maxCol = p.column; });
    var rows = maxRow + 1, cols = maxCol + 1;

    var sourceFileId = input.sourceFile && input.sourceFile.fileId || null;
    var seen = {}, orderedPages = [];
    for (var i = 0; i < N; i++) {
      var p = pages[i];
      var fp = p.finalPageNumber;
      // שומרי-סף
      if (!(fp >= 1 && fp <= N)) errors.push({ code: 'FINAL_PAGE_OUT_OF_RANGE', message: 'finalPageNumber=' + fp + ' מחוץ ל-1..' + N });
      if (seen[fp]) errors.push({ code: 'DUPLICATE_FINAL_PAGE', message: 'finalPageNumber כפול: ' + fp });
      seen[fp] = true;
      if (i > 0 && pages[i - 1].finalPageNumber >= fp) errors.push({ code: 'NOT_NUMERIC_SORTED', message: 'סדר לא מספרי-עולה בעמ׳ ' + i });
      if ([0, 90, 180, 270].indexOf(p.rotationApplied) < 0) errors.push({ code: 'INVALID_ROTATION', message: 'עמ׳ ' + fp + ' rotation=' + p.rotationApplied });
      if (p.sourceSide !== 0 && p.sourceSide !== 1) errors.push({ code: 'INVALID_SOURCE_SIDE', message: 'עמ׳ ' + fp + ' sourceSide=' + p.sourceSide });
      // cropBox ב-PDF points (מ-clipPt · מקור שמאלי-תחתון)
      var clip = p.clipPt || {};
      var cropBox = { x: clip.left, y: clip.bottom, width: clip.right - clip.left, height: clip.top - clip.bottom };
      if (!(cropBox.x >= -_CROP_TOL_PT && cropBox.y >= -_CROP_TOL_PT && cropBox.width > 0 && cropBox.height > 0 &&
            cropBox.x + cropBox.width <= srcWpt + _CROP_TOL_PT && cropBox.y + cropBox.height <= srcHpt + _CROP_TOL_PT)) {
        errors.push({ code: 'CROPBOX_OUT_OF_BOUNDS', message: 'עמ׳ ' + fp + ' cropBox מחוץ לגבולות עמוד-המקור' });
      }
      orderedPages.push({
        finalPageNumber: fp, sourceFileId: sourceFileId,
        sourcePdfPage: p.sourcePdfPage,           // 1-based
        sourceSide: p.sourceSide,                 // 0=Front · 1=Back
        sourceRow: p.row, sourceColumn: p.column, // מרחב-מקור (post-180) — היכן ה-Decoder חתך בפועל
        displayRow: rows - 1 - p.row, displayColumn: cols - 1 - p.column,   // Debug בלבד (מרחב-תצוגה)
        cropBox: cropBox,                         // PDF points {x,y,width,height}
        rotationApplied: p.rotationApplied,       // התיקון שהוחל (0/90/180/270)
        blank: false
      });
    }
    for (var q = 1; q <= N; q++) if (!seen[q]) errors.push({ code: 'MISSING_FINAL_PAGE', message: 'חסר עמ׳ ' + q });
    (plan.warnings || []).forEach(function (w) { warnings.push({ code: 'PLAN_WARNING', message: w, blocking: false }); });

    if (errors.length) return _v2Fail(input, errors, warnings);
    return {
      success: true,
      jobId: input.jobId || null, templateId: input.templateId || null,
      templateVersion: input.templateVersion != null ? input.templateVersion : null,
      engine: 'decoder-v2',
      sourceFiles: input.sourceFile ? [input.sourceFile] : [],
      orderedPages: orderedPages,
      outputPdfBytes: input.bytes || null,   // passthrough — אין save נוסף באדפטר
      spreadsPdfBytes: null,
      warnings: warnings, errors: [],
      metadata: {
        totalPages: N,
        signatureCount: plan.pagesPerSignature ? Math.max(1, Math.round(N / plan.pagesPerSignature)) : 1,
        createdAt: input.createdAt || null, createdBy: input.createdBy || null,
        sourceHash: input.sourceHash || null, outputHash: input.outputHash || null,
        engineVersion: input.engineVersion || '', legacyTemplateType: null,
        bridgeMode: 'direct-module',
        mappingDetailLevel: 'full-source-map', appCheckRequiredForFold: false
      }
    };
  }
  function _v2Fail(input, errors, warnings) {
    return {
      success: false, engine: 'decoder-v2', templateId: input.templateId || null, templateVersion: null,
      sourceFiles: input.sourceFile ? [input.sourceFile] : [], orderedPages: [],
      outputPdfBytes: null, spreadsPdfBytes: null, warnings: warnings || [], errors: errors,
      metadata: { totalPages: 0, mappingDetailLevel: 'full-source-map', appCheckRequiredForFold: false }
    };
  }

  // עם plan+bytes → בונה תוצאה; אחרת מסמן שנדרש ה-Executor בדפדפן.
  function runDecoderV2Adapter(input) {
    input = input || {};
    if (input.plan && input.bytes) return decoderPlanToResult(input);
    return { implemented: false, engine: 'decoder-v2', reason: 'Decoder V2 Adapter דורש plan+bytes מה-Executor — ראה imposition-decoder-exec.js' };
  }
  // dispatch לפי החלטת-הבורר (עדיין placeholder בלבד)
  function runImposition(input) {
    var d = resolveImpositionEngine(input);
    if (!d.supported) return { implemented: false, engine: d.engine, reason: d.reason, blocked: true };
    return d.engine === 'legacy' ? runLegacyAdapter(input) : runDecoderV2Adapter(input);
  }

  // ולידציה בסיסית של קלט (files+template נדרשים לפני שלב-קיפול)
  function validateFoldInput(input) {
    input = input || {}; var errors = [];
    if (!input.template) errors.push('NO_TEMPLATE');
    if (!input.files || !input.files.length) errors.push('NO_FILES');
    return { valid: errors.length === 0, errors: errors };
  }

  // ── מודל Wizard 5-שלבי — כניסה לשלב מותנית במצב (בלי לדלג על תנאים) ──────────
  var WIZARD_STEPS = ['files', 'template', 'mapping', 'fold', 'booklet'];
  function canEnterStep(step, state) {
    state = state || {};
    var idx = WIZARD_STEPS.indexOf(step);
    if (idx <= 0) return true;                                       // 'files' תמיד
    var hasFiles = (state.files || []).length > 0, hasTpl = !!state.template;
    if (step === 'template') return hasFiles;
    if (step === 'mapping' || step === 'fold') return hasFiles && hasTpl;
    if (step === 'booklet') return state.folded === true;            // רק אחרי קיפול (ב-U1 תמיד false)
    return true;
  }

  return {
    FLAG: FLAG, FLAG_U2: FLAG_U2, WIZARD_STEPS: WIZARD_STEPS, canEnterStep: canEnterStep,
    unifiedUiEnabled: unifiedUiEnabled, unifiedUiAllowedForUser: unifiedUiAllowedForUser,
    unifiedAccessAllowed: unifiedAccessAllowed, resolveImpositionEngine: resolveImpositionEngine,
    legacyU2Enabled: legacyU2Enabled, legacyU2TemplateAllowed: legacyU2TemplateAllowed,
    FLAG_U3: FLAG_U3, decoderV3Enabled: decoderV3Enabled, decoderV3TemplateAllowed: decoderV3TemplateAllowed,
    FLAG_REGISTRY: FLAG_REGISTRY, templateRegistryEnabled: templateRegistryEnabled,
    FLAG_32: FLAG_32, decoder32pEnabled: decoder32pEnabled, decoder32pTemplateAllowed: decoder32pTemplateAllowed,
    validateDecodeAgainstTemplate: validateDecodeAgainstTemplate,
    FLAG_CFP: FLAG_CFP, customerFoldPreviewEnabled: customerFoldPreviewEnabled,
    CFP_TEMPLATES: CFP_TEMPLATES, customerFoldTemplateAllowed: customerFoldTemplateAllowed,
    sheetTrimFallback: sheetTrimFallback, v2TemplateToLegacy: v2TemplateToLegacy,
    assembleNestedRunOrder: assembleNestedRunOrder, assembleNestedRuns: assembleNestedRuns,
    isPerfectorName: isPerfectorName, legacyTypeForRun: legacyTypeForRun, planMultiRun: planMultiRun,
    displayMapToDecoderMap: displayMapToDecoderMap, decoderPlanToResult: decoderPlanToResult,
    makeRequestCounter: makeRequestCounter, isStale: isStale, legacyReportToResult: legacyReportToResult,
    runLegacyAdapter: runLegacyAdapter, runDecoderV2Adapter: runDecoderV2Adapter, runImposition: runImposition,
    validateFoldInput: validateFoldInput
  };
});
