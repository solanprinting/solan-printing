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
  function runDecoderV2Adapter(input) {
    return { implemented: false, engine: 'decoder-v2', reason: 'Decoder V2 Adapter will be implemented in U3' };
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
    makeRequestCounter: makeRequestCounter, isStale: isStale, legacyReportToResult: legacyReportToResult,
    runLegacyAdapter: runLegacyAdapter, runDecoderV2Adapter: runDecoderV2Adapter, runImposition: runImposition,
    validateFoldInput: validateFoldInput
  };
});
