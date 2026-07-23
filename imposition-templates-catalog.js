/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-templates-catalog.js — קטלוג-טמפלטים מאוחד (U1 · Unified Shell)
 * ───────────────────────────────────────────────────────────────────────────
 * מאחד טמפלטים מכל המקורות (legacy TEMPLATES · localStorage · Firebase · seed)
 * לרשימת-תצוגה אחידה. המשתמש לא רואה את מקור-האחסון. מזהה התנגשויות-ID ומחיל
 * כללי-קדימות (draft לא עוקף production; לא-מאושר לא רץ אוטומטית).
 * לוגיקה טהורה · אין DOM/רשת · המקורות מוזרקים (dependency-injected).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionTemplatesCatalog = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var SOURCES = ['legacy', 'localStorage', 'firebase', 'seed'];
  // קדימות-מקור לתצוגה (production-legacy אמין; seed הכי נמוך)
  var SOURCE_RANK = { firebase: 4, legacy: 3, localStorage: 2, seed: 1 };

  function _num(v) { var n = Number(v); return isFinite(n) ? n : null; }

  // האם מותר לייצור: טמפלט ללא-cells רץ ע"י מנוע-הקיפול הקיים (production-מוכח) → מותר;
  // טמפלט V2 (cells-based) → רק status='production' מפורש. draft/tested/deprecated → חסום.
  function _productionAllowed(hasCells, status) {
    if (!hasCells) return status !== 'deprecated';        // legacy-style — עובד היום בייצור
    return status === 'production';                        // V2: רק production מפורש
  }
  // טמפלט "seed-stub" = מודל-V2 שעדיין בלי cells (ממתין לגרסה מכוילת). לא-legacy ולא-מאושר.
  function _isV2Model(raw) {
    return Array.isArray(raw.cells) || raw.validationState != null || raw.testState != null || raw.requiresRealProofValidation != null;
  }
  function _isSeedStub(raw, source, hasCells) {
    return !hasCells && (source === 'seed' || _isV2Model(raw));
  }
  var SEED_STUB_STATUS = 'Seed בלבד — ממתין לגרסת V2 מכוילת';
  function _engineRecommendation(hasCells, isV2Model) {
    if (hasCells) return 'decoder-v2';        // V2 עם cells
    if (isV2Model) return 'decoder-v2';       // V2-מיועד, cells ממתינים (seed-stub)
    return 'legacy';                          // ללא-מודל-V2 → מנוע-legacy
  }

  // נרמול רשומה בודדת לפורמט-קטלוג אחיד. raw = צורת-המקור; source = 'legacy'|…
  function normalizeCatalogEntry(raw, source) {
    raw = raw || {};
    var hasCells = Array.isArray(raw.cells) && raw.cells.length > 0;
    var isV2Model = _isV2Model(raw);
    var seedStub = _isSeedStub(raw, source, hasCells);
    var sheet = raw.sheet || {};
    var fin = raw.finishedPage || raw.finished || {};
    var version = raw.version != null ? (raw.version | 0) : 1;
    // סטטוס: legacy → 'legacy production' · seed-stub → הודעה ברורה · אחרת מהרשומה
    var status = source === 'legacy' ? 'legacy production'
      : seedStub ? SEED_STUB_STATUS
      : (raw.status || 'draft');
    // productionAllowed: seed-stub לעולם false; אחרת לפי cells+status
    var productionAllowed = seedStub ? false
      : _productionAllowed(hasCells, source === 'legacy' ? 'production' : (raw.status || 'draft'));
    var entry = {
      templateId: raw.id || raw.templateId || null,
      name: raw.name || raw.label || raw.id || '',
      source: SOURCES.indexOf(source) >= 0 ? source : 'seed',
      version: version, status: status,
      pagesPerSignature: raw.pagesPerSignature != null ? (raw.pagesPerSignature | 0) : (raw.N != null ? (raw.N | 0) : null),
      sidesCount: raw.sidesCount != null ? (raw.sidesCount | 0) : (raw.sides != null ? (raw.sides | 0) : null),
      sheetSize: { widthMm: _num(sheet.widthMm != null ? sheet.widthMm : raw.sheetWmm), heightMm: _num(sheet.heightMm != null ? sheet.heightMm : raw.sheetHmm) },
      finishedSize: { widthMm: _num(fin.widthMm != null ? fin.widthMm : raw.trimWmm), heightMm: _num(fin.heightMm != null ? fin.heightMm : raw.trimHmm) },
      printingMethod: raw.printingMethod || (raw.sides === 2 || raw.sidesCount === 2 ? 'perfector' : (raw.sides === 1 ? 'tumble' : null)),
      bindingType: raw.bindingType || 'saddle_stitch',
      machine: raw.machine || null,
      engineRecommendation: _engineRecommendation(hasCells, isV2Model),
      productionAllowed: productionAllowed,
      seedStub: seedStub,
      warning: null,
      internalKey: (source || 'seed') + ':' + (raw.id || raw.templateId || '?') + ':v' + version
    };
    // אזהרות
    if (seedStub) entry.warning = 'טמפלט seed ללא cells — יוצג עד לטעינת גרסת-V2 מכוילת; אינו מאושר לייצור ולא יופעל אוטומטית';
    else if (source !== 'legacy' && status !== 'production') entry.warning = 'טמפלט ' + status + ' — אינו מאושר לייצור ולא יופעל אוטומטית';
    return entry;
  }

  // בונה קטלוג מאוחד. input.sources = { legacy:[…], localStorage:[…], firebase:[…], seed:[…] }
  // מחיל כללי-התנגשות-ID: לא מחליף בשקט; draft לא עוקף production; מפתח-פנימי כולל source+version.
  function buildCatalog(input) {
    input = input || {};
    var entries = [];
    SOURCES.forEach(function (src) {
      (input.sources && input.sources[src] || []).forEach(function (raw) {
        var e = normalizeCatalogEntry(raw, src);
        if (e.templateId) entries.push(e);
      });
    });

    // זיהוי התנגשויות templateId (מקורות/גרסאות שונים)
    var byId = {};
    entries.forEach(function (e) { (byId[e.templateId] = byId[e.templateId] || []).push(e); });
    var collisions = [];
    Object.keys(byId).forEach(function (id) {
      var group = byId[id];
      if (group.length > 1) {
        collisions.push(id);
        group.forEach(function (e) {
          e.warning = (e.warning ? e.warning + ' · ' : '') + 'התנגשות-ID: קיים גם ב-' +
            group.filter(function (x) { return x !== e; }).map(function (x) { return x.source + ' v' + x.version; }).join(', ');
        });
        // כלל: draft אינו עוקף production — אם קיים production בקבוצה, סמן את ה-draft כלא-פעיל-לייצור
        var hasProd = group.some(function (x) { return x.productionAllowed; });
        if (hasProd) group.forEach(function (e) { if (!e.productionAllowed) e.warning += ' · לא-עוקף-production'; });
      }
    });

    // מיון-תצוגה: production תחילה, אז לפי קדימות-מקור, אז שם
    entries.sort(function (a, b) {
      if (a.productionAllowed !== b.productionAllowed) return a.productionAllowed ? -1 : 1;
      var ra = SOURCE_RANK[a.source] || 0, rb = SOURCE_RANK[b.source] || 0;
      if (ra !== rb) return rb - ra;
      return String(a.name).localeCompare(String(b.name));
    });

    return { entries: entries, collisions: collisions, count: entries.length };
  }

  // סינון/חיפוש לתצוגה
  function filterCatalog(entries, q) {
    q = (q || '').trim().toLowerCase(); if (!q) return entries.slice();
    return entries.filter(function (e) {
      return [e.name, e.templateId, e.printingMethod, e.machine, e.status, String(e.pagesPerSignature)]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  // מטא-דאטה תצוגתית לטמפלטים המובנים (legacy) — *תיאור בלבד*, ללא לוגיקת-קיפול.
  var LEGACY_DESCRIPTORS = [
    { id: '32', name: '32 עמ׳ פרפקטור', N: 32, sides: 2, printingMethod: 'perfector', machine: '8 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 },
    { id: '32p', name: '32 עמ׳ 4 צבעים', N: 32, sides: 2, printingMethod: 'sheetwise', machine: '4 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 },
    { id: '16perf', name: '16 עמ׳ פרפקטור', N: 16, sides: 2, printingMethod: 'perfector', machine: '8 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 },
    { id: '16p', name: '16 עמ׳ מתהפך', N: 16, sides: 1, printingMethod: 'tumble', machine: '4 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 },
    { id: '8perf', name: '8 עמ׳ פרפקטור', N: 8, sides: 2, printingMethod: 'perfector', machine: '8 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 },
    { id: '8p', name: '8 עמ׳ מתהפך', N: 8, sides: 1, printingMethod: 'tumble', machine: '4 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 },
    { id: '4perf', name: '4 עמ׳ פרפקטור', N: 4, sides: 2, printingMethod: 'perfector', machine: '8 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 },
    { id: '4p', name: '4 עמ׳ מתהפך', N: 4, sides: 1, printingMethod: 'tumble', machine: '4 צבעים', sheetWmm: 1000, sheetHmm: 700, trimWmm: 165, trimHmm: 240 }
  ];

  return { SOURCES: SOURCES, SEED_STUB_STATUS: SEED_STUB_STATUS, normalizeCatalogEntry: normalizeCatalogEntry,
           buildCatalog: buildCatalog, filterCatalog: filterCatalog, LEGACY_DESCRIPTORS: LEGACY_DESCRIPTORS };
});
