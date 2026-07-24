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
    displayMapToDecoderMap: displayMapToDecoderMap, decoderPlanToResult: decoderPlanToResult,
    makeRequestCounter: makeRequestCounter, isStale: isStale, legacyReportToResult: legacyReportToResult,
    runLegacyAdapter: runLegacyAdapter, runDecoderV2Adapter: runDecoderV2Adapter, runImposition: runImposition,
    validateFoldInput: validateFoldInput
  };
});
