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

  // ── Placeholders — U1 אינו מפעיל שום מנוע ───────────────────────────────────
  function runLegacyAdapter(input) {
    return { implemented: false, engine: 'legacy', reason: 'Legacy Adapter will be implemented in U2' };
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
    FLAG: FLAG, WIZARD_STEPS: WIZARD_STEPS, canEnterStep: canEnterStep,
    unifiedUiEnabled: unifiedUiEnabled, unifiedUiAllowedForUser: unifiedUiAllowedForUser,
    unifiedAccessAllowed: unifiedAccessAllowed, resolveImpositionEngine: resolveImpositionEngine,
    runLegacyAdapter: runLegacyAdapter, runDecoderV2Adapter: runDecoderV2Adapter, runImposition: runImposition,
    validateFoldInput: validateFoldInput
  };
});
