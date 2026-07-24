/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-template-registry.js — Template Registry (T1 · Template-Driven Folding)
 * ───────────────────────────────────────────────────────────────────────────
 * מקור-אמת מרכזי לטמפלטים כ*נתונים*. T1: עוטף רק את שני הטמפלטים המאושרים (16perf, 88x63)
 * בלי לשנות מנוע/מפה/פלט. ה-Registry רק *מפנה* למנועים ולמפות הקיימים — לא מעתיק אותן.
 * ⚠️ אין כאן עותק של CELL_MAP או של גריד-fold. resolveEngineConfig שולף בהצבעה-חיה מה-decoder.
 * לוגיקה טהורה · אין DOM/רשת/PDF · מאחורי הדגל solanTemplateRegistry (ב-Shell).
 *
 * signatures[] נשאר בן פריט-אחד ב-T1 (קונטרס יחיד). Multi-Signature = T2 (לא כאן).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionTemplateRegistry = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var TEMPLATE_STATUSES = ['draft', 'calibrated', 'golden-passed', 'beta', 'production', 'disabled'];
  var READING_DIRECTIONS = ['rtl', 'ltr'];
  var PRINTING_MODES = ['perfector', 'work-and-turn', 'work-and-tumble', 'front-back', 'a+b'];

  // ── שתי ההגדרות (נתונים בלבד) ────────────────────────────────────────────────
  //    engineConfigReference = *מצביע* למנוע/מפה קיימים; אין כאן עותק-מפה.
  var DEFINITIONS = {
    '16perf': {
      templateId: '16perf', name: '16 עמ׳ פרפקטור (70×100)', engine: 'legacy',
      status: 'production', totalPages: 16, signatureCount: 1,
      finalPageSizeMm: { w: 165, h: 240 }, sourceSheetSizeMm: { w: 1000, h: 700 }, sourcePdfPages: 2,
      printingMode: 'perfector', readingDirection: 'rtl',
      validation: { expectedPdfPages: 2, expectedCells: 16, finalPageSizeMm: { w: 165, h: 240 } },
      // מצביע ל-fold() הישן (TEMPLATES['16perf'] ב-imposition-tool.html) דרך הגשר — בלי עותק
      engineConfigReference: { engine: 'legacy', legacyType: '16perf' },
      signatures: [{ signatureIndex: 0, pageStart: 1, pageEnd: 16, sourcePdfPages: 2 }]
    },
    '88x63-16p-perfector': {
      templateId: '88x63-16p-perfector', name: '88×63 16 עמ׳ פרפקטור', engine: 'decoder-v2',
      status: 'golden-passed', totalPages: 16, signatureCount: 1,
      finalPageSizeMm: { w: 210, h: 297 }, sourceSheetSizeMm: { w: 892.1, h: 643.2 }, sourcePdfPages: 2,
      printingMode: 'perfector', readingDirection: 'rtl',
      validation: { expectedPdfPages: 2, expectedCells: 16, finalPageSizeMm: { w: 210, h: 297 } },
      // מצביע למפה+פריסה המכוילות ב-imposition-decoder.js — נשלף בהצבעה-חיה (בלי עותק)
      engineConfigReference: { engine: 'decoder-v2', cellMapExport: 'CELL_MAP_88x63_16P_PERFECTOR', layoutExport: 'DEFAULT_LAYOUT_88x63' },
      signatures: [{ signatureIndex: 0, pageStart: 1, pageEnd: 16, sourcePdfPages: 2 }]
    },
    // ── T3 · 32 עמ׳ 165×240 (Decoder V2 · 90/270) — status:draft עד Golden+אימות-חזותי ידני ──
    '70x100-32p-165x240-perfector': {
      templateId: '70x100-32p-165x240-perfector', name: '70×100 32 עמ׳ 165×240 פרפקטור', engine: 'decoder-v2',
      status: 'draft', totalPages: 32, signatureCount: 1,
      finalPageSizeMm: { w: 165, h: 240 }, sourceSheetSizeMm: { w: 1000, h: 700 }, sourcePdfPages: 2,
      printingMode: 'perfector', readingDirection: 'rtl',
      validation: { expectedPdfPages: 2, expectedCells: 32, finalPageSizeMm: { w: 165, h: 240 }, sourceSheetSizeMm: { w: 1000, h: 700 } },
      engineConfigReference: { engine: 'decoder-v2', cellMapExport: 'CELL_MAP_70x100_32P', layoutExport: 'LAYOUT_70x100_32P' },
      signatures: [{ signatureIndex: 0, pageStart: 1, pageEnd: 32, sourcePdfPages: 2 }]
    }
  };

  function getTemplateDefinition(id) { return DEFINITIONS[id] || null; }
  function listTemplates() { return Object.keys(DEFINITIONS).map(function (k) { return DEFINITIONS[k]; }); }
  function hasTemplate(id) { return !!DEFINITIONS[id]; }

  // ── פתרון-קונפיג-מנוע: מחזיר את המפה בהצבעה-חיה (מקור-אמת יחיד) — לא עותק ──────
  //    deps = { decoder }  (ImpositionDecoder — בדפדפן window.ImpositionDecoder, ב-Node require)
  function resolveEngineConfig(id, deps) {
    deps = deps || {};
    var def = DEFINITIONS[id];
    if (!def) return { ok: false, error: 'UNKNOWN_TEMPLATE:' + id };
    var ref = def.engineConfigReference || {};
    if (ref.engine === 'legacy') {
      return { ok: true, engine: 'legacy', legacyType: ref.legacyType };
    }
    if (ref.engine === 'decoder-v2') {
      var dec = deps.decoder;
      if (!dec) return { ok: false, error: 'DECODER_MODULE_MISSING' };
      var cells = dec[ref.cellMapExport], layout = dec[ref.layoutExport];
      if (!cells) return { ok: false, error: 'CELL_MAP_MISSING:' + ref.cellMapExport };
      // ⚠️ מוחזר הרפרנס עצמו (זהות) — לא עותק — כדי לשמור מקור-אמת יחיד
      return { ok: true, engine: 'decoder-v2', cells: cells, layout: layout || null };
    }
    return { ok: false, error: 'UNKNOWN_ENGINE_REF' };
  }

  // ── ולידציה בסיסית של הגדרה (שלמות-שדות + enums) ────────────────────────────
  function validateDefinition(def) {
    var errors = [];
    if (!def) return { valid: false, errors: ['NULL_DEFINITION'] };
    ['templateId', 'name', 'engine', 'status', 'totalPages', 'signatureCount',
     'finalPageSizeMm', 'sourceSheetSizeMm', 'sourcePdfPages', 'printingMode',
     'readingDirection', 'validation', 'engineConfigReference'].forEach(function (f) {
      if (def[f] == null) errors.push('MISSING_FIELD:' + f);
    });
    if (def.status && TEMPLATE_STATUSES.indexOf(def.status) < 0) errors.push('INVALID_STATUS:' + def.status);
    if (def.readingDirection && READING_DIRECTIONS.indexOf(def.readingDirection) < 0) errors.push('INVALID_READING_DIRECTION');
    if (def.printingMode && PRINTING_MODES.indexOf(def.printingMode) < 0) errors.push('INVALID_PRINTING_MODE:' + def.printingMode);
    if (def.engine !== 'legacy' && def.engine !== 'decoder-v2') errors.push('INVALID_ENGINE');
    if (!Array.isArray(def.signatures) || !def.signatures.length) errors.push('NO_SIGNATURES');
    // T1: קונטרס יחיד בלבד
    if (Array.isArray(def.signatures) && def.signatures.length !== 1) errors.push('T1_SINGLE_SIGNATURE_ONLY');
    return { valid: errors.length === 0, errors: errors };
  }

  return {
    TEMPLATE_STATUSES: TEMPLATE_STATUSES, READING_DIRECTIONS: READING_DIRECTIONS, PRINTING_MODES: PRINTING_MODES,
    getTemplateDefinition: getTemplateDefinition, listTemplates: listTemplates, hasTemplate: hasTemplate,
    resolveEngineConfig: resolveEngineConfig, validateDefinition: validateDefinition
  };
});
