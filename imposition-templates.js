/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-templates.js — מודל-נתונים מנורמל לטמפלטי-אימפוזיציה (Sprint B · Decoder V2)
 * ───────────────────────────────────────────────────────────────────────────
 * מטרה: תשתית בלבד. מודל טמפלט מובנה + אחסון מגורסן (Firebase versions/meta) +
 * adapter מאחד (getNormalizedImpositionTemplate) הקורא legacy(TEMPLATES)/localStorage/Firebase.
 *
 * ⚠️ אדיטיבי בלבד. מאחורי Feature-Flag `solanDecoderV2` (כבוי כברירת-מחדל).
 *    אינו נוגע ב-fold()/foldSignature()/foldSignatureGeneric()/TEMPLATES של הכלי הפעיל.
 *    אינו מבצע רשת בעצמו — כל גישת-Firebase מוזרקת (backend). לוגיקה טהורה + Node-testable.
 *
 * חשוב: outputPageOffset הוא *יחסי לקונטרס* (0..pagesPerSignature-1), לא מספר מוחלט.
 *       finalPageNumber = startPage + outputPageOffset  (מחושב ב-Decoder, לא נשמר בטמפלט).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionTemplates = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var MODEL_VERSION = 1;
  var FLAG_NAME = 'solanDecoderV2';
  var ROTATIONS = [0, 90, 180, 270];
  var PRINTING_METHODS = ['perfector', 'tumble', 'sheetwise', 'work_and_turn', 'work_and_tumble'];
  var BINDING_TYPES = ['saddle_stitch', 'perfect_bound', 'none'];
  var STATUSES = ['draft', 'tested', 'production'];
  var LS_KEY = 'solanImpositionTemplatesV2';   // אחסון-דפדפן מקומי (תאימות-לאחור, גיבוי ל-Firebase)
  var NOT_VERIFIED_NOTICE = 'הטמפלט טרם נבדק מול פרופר אמיתי ואינו מאושר לייצור.';

  function _clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  // ── Feature-Flag ─────────────────────────────────────────────────────────
  // כבוי כברירת-מחדל. נדלק רק אם window.SOLAN_FLAGS.solanDecoderV2 === true (בוליאני מפורש).
  function isDecoderV2Enabled(win) {
    try {
      var w = win || (typeof window !== 'undefined' ? window : null);
      if (!w || !w.SOLAN_FLAGS) return false;
      return w.SOLAN_FLAGS[FLAG_NAME] === true;
    } catch (e) { return false; }
  }

  function normalizeRotation(deg) {
    var r = Math.round((Number(deg) || 0) / 90) * 90;
    r = ((r % 360) + 360) % 360;   // → 0/90/180/270
    return r;
  }
  function isValidRotation(deg) { return ROTATIONS.indexOf(deg) >= 0; }

  // ── מצבי-אימות (ממתין-לאימות עד שיהיה פרופר אמיתי) ──────────────────────────
  function emptyValidationState() {
    return { templateImported: false, geometryChecked: false, testedWithRealProof: false, productionApproved: false };
  }
  function emptyTestState() {
    return { requiresRealProofValidation: true, testedWithRealProof: false, testedAt: null, testedBy: null, testProofHash: null };
  }

  // ── בונה תא מנורמל ──────────────────────────────────────────────────────────
  function buildCell(o) {
    o = o || {};
    return {
      sourceSide: o.sourceSide != null ? o.sourceSide : 1,          // 1=צד ראשון (קדמי), 2=שני (אחורי)
      xRatio: _num(o.xRatio), yRatio: _num(o.yRatio),               // פינה שמאלית-עליונה של התא (יחס 0..1 מגבולות הגיליון)
      widthRatio: _num(o.widthRatio), heightRatio: _num(o.heightRatio),
      outputPageOffset: o.outputPageOffset != null ? (o.outputPageOffset | 0) : 0,   // 0..N-1, יחסי לקונטרס
      rotation: normalizeRotation(o.rotation),
      mirrorX: o.mirrorX === true, mirrorY: o.mirrorY === true
    };
  }
  function _num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  // ── בונה טמפלט מנורמל (פורמט-אחיד) ─────────────────────────────────────────
  function buildTemplate(o) {
    o = o || {};
    var sheet = o.sheet || {};
    var fin = o.finishedPage || {};
    var N = o.pagesPerSignature != null ? (o.pagesPerSignature | 0) : 0;
    return {
      schemaVersion: MODEL_VERSION,
      id: o.id || null,
      name: o.name || '',
      version: o.version != null ? (o.version | 0) : 1,
      status: STATUSES.indexOf(o.status) >= 0 ? o.status : 'draft',   // כברירת-מחדל draft (אסור לקפוץ ל-tested/production)
      sheet: {
        widthMm: _num(sheet.widthMm), heightMm: _num(sheet.heightMm),
        orientation: sheet.orientation || (_num(sheet.widthMm) >= _num(sheet.heightMm) ? 'landscape' : 'portrait')
      },
      finishedPage: { widthMm: _num(fin.widthMm), heightMm: _num(fin.heightMm) },
      pagesPerSignature: N,
      sidesCount: o.sidesCount != null ? (o.sidesCount | 0) : (fin && o.sidesCount === 0 ? 0 : 2),
      printingMethod: o.printingMethod || 'perfector',
      bindingType: o.bindingType || 'saddle_stitch',
      cells: Array.isArray(o.cells) ? o.cells.map(buildCell) : [],
      validation: {
        expectedPdfPages: o.validation && o.validation.expectedPdfPages != null ? (o.validation.expectedPdfPages | 0) : (o.sidesCount | 0) || 2,
        expectedCells: o.validation && o.validation.expectedCells != null ? (o.validation.expectedCells | 0) : N,
        allowBlankPages: !!(o.validation && o.validation.allowBlankPages),
        requiresRealProofValidation: !(o.validation && o.validation.requiresRealProofValidation === false)
      },
      validationState: Object.assign(emptyValidationState(), o.validationState || {}),
      testState: Object.assign(emptyTestState(), o.testState || {}),
      source: o.source || null,   // 'legacy' | 'localStorage' | 'firebase' | 'import'
      notice: NOT_VERIFIED_NOTICE,
      createdAt: o.createdAt || '',
      updatedAt: o.updatedAt || '',
      createdBy: o.createdBy || ''
    };
  }

  // ── ולידציה של טמפלט מנורמל ────────────────────────────────────────────────
  // errors = חוסמים; warnings = לא-חוסמים (למשל cells עדיין לא יובאו — draft תקין).
  function validateTemplate(t) {
    var errors = [], warnings = [];
    if (!t || typeof t !== 'object') return { valid: false, errors: ['NULL_TEMPLATE'], warnings: [] };
    if (!t.id) errors.push('MISSING_ID');
    var N = t.pagesPerSignature | 0;
    if (N <= 0) errors.push('INVALID_PAGES_PER_SIGNATURE');
    if ((t.sidesCount | 0) !== 2 && (t.sidesCount | 0) !== 1) errors.push('INVALID_SIDES_COUNT');
    if (STATUSES.indexOf(t.status) < 0) errors.push('INVALID_STATUS');

    var cells = Array.isArray(t.cells) ? t.cells : [];
    if (cells.length === 0) {
      // אין תאים עדיין — ממתין לייבוא/כיול מפרופר. לא חוסם (draft), אבל מסמן.
      warnings.push('CELLS_PENDING');
      if (t.validationState && t.validationState.geometryChecked === true) errors.push('GEOMETRY_CHECKED_BUT_NO_CELLS');
    } else {
      var expected = t.validation && t.validation.expectedCells != null ? (t.validation.expectedCells | 0) : N;
      if (cells.length !== expected) errors.push('CELL_COUNT_MISMATCH');
      var offsets = {}, sidesSeen = {};
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (!isValidRotation(c.rotation)) errors.push('INVALID_ROTATION@' + i);
        if (typeof c.mirrorX !== 'boolean' || typeof c.mirrorY !== 'boolean') errors.push('INVALID_MIRROR@' + i);
        if (!(c.outputPageOffset >= 0 && c.outputPageOffset <= N - 1)) errors.push('OFFSET_OUT_OF_RANGE@' + i);
        if (offsets[c.outputPageOffset]) errors.push('DUPLICATE_OFFSET:' + c.outputPageOffset);
        offsets[c.outputPageOffset] = true;
        if (c.sourceSide !== 1 && c.sourceSide !== 2) errors.push('INVALID_SOURCE_SIDE@' + i);
        sidesSeen[c.sourceSide] = true;
        ['xRatio', 'yRatio', 'widthRatio', 'heightRatio'].forEach(function (k) {
          if (!(c[k] >= 0 && c[k] <= 1)) errors.push('RATIO_OUT_OF_RANGE:' + k + '@' + i);
        });
      }
      if ((t.sidesCount | 0) === 2 && Object.keys(sidesSeen).length < 2) warnings.push('ONLY_ONE_SIDE_USED');
      // כיסוי מלא של הקונטרס (אלא אם מותרים עמודים ריקים)
      if (!(t.validation && t.validation.allowBlankPages)) {
        for (var p = 0; p < N; p++) if (!offsets[p]) { errors.push('MISSING_OFFSET:' + p); }
      }
    }
    // אסור לסמן production/tested בלי אימות-פרופר אמיתי
    if (t.status !== 'draft' && !(t.testState && t.testState.testedWithRealProof === true)) errors.push('STATUS_AHEAD_OF_VALIDATION');
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ── Converter: טמפלט-legacy (מבנה TEMPLATES של הכלי) → פורמט מנורמל ──────────
  // מקבל {N,sides,grids,rot,rotGrids,geom} + מטא. מחשב ratios מגיאומטריה קיימת/מקובעים.
  // דטרמיניסטי — לא "מנחש" סדר-קיפול; רק ממיר נתונים שכבר קיימים ואומתו.
  // constants: מרכזי-עמודות/שורות + גודל-נטו + גודל-גיליון (לטמפלטים המקובעים 70×100).
  function fromLegacyTemplate(legacy, meta) {
    legacy = legacy || {}; meta = meta || {};
    var g = legacy.geom || null;
    var sheetW = (g && g.sheetWmm) || meta.sheetWmm || 1000;
    var sheetH = (g && g.sheetHmm) || meta.sheetHmm || 700;
    var trimW = (g && g.trimWmm) || meta.trimWmm || 165;
    var trimH = (g && g.trimHmm) || meta.trimHmm || 240;
    var colX = (g && g.colX) || meta.colX || null;   // מרכזי-עמודות במ״מ
    var rowY = (g && g.rowY) || meta.rowY || null;    // מרכזי-שורות במ״מ
    var grids = legacy.grids || [];
    var sides = legacy.sides || grids.length || 1;
    var N = legacy.N || 0;
    var cells = [];
    var seen = {};
    for (var side = 0; side < grids.length; side++) {
      var grid = grids[side];
      for (var row = 0; row < grid.length; row++) {
        for (var col = 0; col < grid[row].length; col++) {
          var pg = grid[row][col];
          if (!pg || seen[pg]) continue;   // מופע ראשון בלבד (מפה 1:1 עמוד→תא, כמו _buildMap)
          seen[pg] = true;
          var rg = legacy.rotGrids && legacy.rotGrids[side];
          var rot = (rg && rg[row] && rg[row][col] != null) ? rg[row][col] : ((legacy.rot && legacy.rot[col]) || 0);
          // מרכז-תא במ״מ → פינה שמאלית-עליונה ביחס. אם אין geom — משתמשים במרכזים מקובעים.
          var cxMm = colX ? colX[col] : ((col + 0.5) * (sheetW / grid[row].length));
          var cyMm = rowY ? rowY[row] : ((row + 0.5) * (sheetH / grid.length));
          var rr = normalizeRotation(rot);
          var cellWmm = (rr === 90 || rr === 270) ? trimH : trimW;
          var cellHmm = (rr === 90 || rr === 270) ? trimW : trimH;
          cells.push(buildCell({
            sourceSide: side + 1,
            xRatio: (cxMm - cellWmm / 2) / sheetW,
            yRatio: (cyMm - cellHmm / 2) / sheetH,
            widthRatio: cellWmm / sheetW,
            heightRatio: cellHmm / sheetH,
            outputPageOffset: pg - 1,   // legacy = מוחלט 1..N ; יחסי = 0..N-1 (startPage מתווסף ב-Decoder)
            rotation: rr, mirrorX: false, mirrorY: false
          }));
        }
      }
    }
    cells.sort(function (a, b) { return a.outputPageOffset - b.outputPageOffset; });
    return buildTemplate({
      id: meta.id || null, name: meta.name || '', version: meta.version || 1, status: 'draft',
      sheet: { widthMm: sheetW, heightMm: sheetH }, finishedPage: { widthMm: trimW, heightMm: trimH },
      pagesPerSignature: N, sidesCount: sides, printingMethod: meta.printingMethod || (sides === 2 ? 'perfector' : 'tumble'),
      bindingType: meta.bindingType || 'saddle_stitch', cells: cells,
      validation: { expectedPdfPages: sides, expectedCells: N, allowBlankPages: false, requiresRealProofValidation: true },
      validationState: { templateImported: true, geometryChecked: false, testedWithRealProof: false, productionApproved: false },
      source: 'legacy', createdBy: meta.createdBy || ''
    });
  }

  // ── Firebase paths (versioned) ─────────────────────────────────────────────
  function metaPath(id) { return 'impositionTemplates/' + id + '/meta'; }
  function versionPath(id, v) { return 'impositionTemplates/' + id + '/versions/' + v; }
  function buildMeta(o) {
    o = o || {};
    return {
      activeVersion: o.activeVersion != null ? (o.activeVersion | 0) : 1,
      latestVersion: o.latestVersion != null ? (o.latestVersion | 0) : 1,
      status: STATUSES.indexOf(o.status) >= 0 ? o.status : 'draft',
      locked: o.locked === true,
      createdAt: o.createdAt || '', updatedAt: o.updatedAt || '', createdBy: o.createdBy || ''
    };
  }

  // ── Backend mock בזיכרון (לבדיקות + הזרקה) — מדמה Firebase get/set לפי path ──
  function makeMemoryBackend(seed) {
    var store = seed ? _clone(seed) : {};
    return {
      get: function (path) { return Promise.resolve(store.hasOwnProperty(path) ? _clone(store[path]) : null); },
      set: function (path, val) { store[path] = _clone(val); return Promise.resolve(true); },
      _dump: function () { return _clone(store); }
    };
  }

  // ── שמירת גרסה חדשה (Firebase versioned) + עדכון meta ────────────────────────
  // כבוד ל-locked: אם meta.locked=true → אסור לדרוס גרסה קיימת (יוצרים גרסה חדשה בלבד).
  function saveTemplateVersion(backend, template, opts) {
    opts = opts || {};
    var now = opts.now || function () { return new Date().toISOString(); };
    var user = opts.user || '';
    var id = template.id;
    if (!id) return Promise.reject(new Error('MISSING_ID'));
    return backend.get(metaPath(id)).then(function (meta) {
      var isNew = !meta;
      meta = meta || buildMeta({ createdAt: now(), createdBy: user, latestVersion: 0, activeVersion: 0 });
      var nextVersion = opts.asNewVersion === false && !isNew ? (template.version || meta.latestVersion) : (meta.latestVersion | 0) + 1;
      if (meta.locked === true && opts.asNewVersion === false) return Promise.reject(new Error('TEMPLATE_LOCKED'));
      var toSave = buildTemplate(Object.assign({}, template, {
        id: id, version: nextVersion,
        createdAt: template.createdAt || meta.createdAt || now(), updatedAt: now(), createdBy: template.createdBy || user
      }));
      // draft בלבד נשמר אוטומטית; קידום status דורש אימות (נבדק ב-validateTemplate).
      return backend.set(versionPath(id, nextVersion), toSave).then(function () {
        var newMeta = buildMeta({
          activeVersion: meta.activeVersion ? meta.activeVersion : nextVersion,
          latestVersion: nextVersion, status: meta.status || 'draft', locked: meta.locked === true,
          createdAt: meta.createdAt || now(), updatedAt: now(), createdBy: meta.createdBy || user
        });
        return backend.set(metaPath(id), newMeta).then(function () { return { template: toSave, meta: newMeta, version: nextVersion }; });
      });
    });
  }
  function loadTemplateVersion(backend, id, version) {
    if (version != null) return backend.get(versionPath(id, version)).then(function (t) { return t ? buildTemplate(t) : null; });
    return backend.get(metaPath(id)).then(function (meta) {
      if (!meta) return null;
      return backend.get(versionPath(id, meta.activeVersion)).then(function (t) { return t ? buildTemplate(t) : null; });
    });
  }

  // ── Seed מובנה: 88x63 16p Perfector (מטא ידוע · cells ריקים · ממתין-לאימות) ──
  //    ⚠️ גיאומטריית התאים תיובא מקובץ-הטמפלט האמיתי ב-Sprint C (במחשב-העבודה).
  //    כרגע cells=[] בכוונה — לא ממציאים סדר-קיפול. status=draft, geometryChecked=false.
  var SEED_TEMPLATES = {
    '88x63-16p-perfector': buildTemplate({
      id: '88x63-16p-perfector', name: '88x63 16p Perfector', version: 1, status: 'draft',
      sheet: { widthMm: 880, heightMm: 630, orientation: 'landscape' },
      finishedPage: { widthMm: 210, heightMm: 297 },
      pagesPerSignature: 16, sidesCount: 2, printingMethod: 'perfector', bindingType: 'saddle_stitch',
      cells: [],   // טרם יובאו — ממתין לפרופר/טמפלט אמיתי לכיול
      validation: { expectedPdfPages: 2, expectedCells: 16, allowBlankPages: false, requiresRealProofValidation: true },
      validationState: { templateImported: true, geometryChecked: false, testedWithRealProof: false, productionApproved: false },
      testState: { requiresRealProofValidation: true, testedWithRealProof: false, testedAt: null, testedBy: null, testProofHash: null },
      source: 'seed'
    })
  };
  function getSeedTemplate(id) { return SEED_TEMPLATES[id] ? buildTemplate(SEED_TEMPLATES[id]) : null; }

  // ── Adapter מאחד: מחזיר פורמט-אחיד מכל מקור, לפי קדימות firebase→localStorage→legacy/seed ──
  //    sources מוזרק (בלי תלות ברשת/DOM):
  //      { firebaseBackend, localStorageGet(id)→raw|null, legacyGet(id)→{legacy,meta}|null }
  //    מחזיר Promise<normalized|null>.
  function getNormalizedImpositionTemplate(templateId, opts) {
    opts = opts || {};
    var order = opts.order || ['firebase', 'localStorage', 'legacy', 'seed'];
    var steps = order.map(function (src) {
      return function () {
        if (src === 'firebase' && opts.firebaseBackend) return loadTemplateVersion(opts.firebaseBackend, templateId, opts.version);
        if (src === 'localStorage' && typeof opts.localStorageGet === 'function') {
          var raw = opts.localStorageGet(templateId); return Promise.resolve(raw ? buildTemplate(raw) : null);
        }
        if (src === 'legacy' && typeof opts.legacyGet === 'function') {
          var lg = opts.legacyGet(templateId); return Promise.resolve(lg ? fromLegacyTemplate(lg.legacy, lg.meta) : null);
        }
        if (src === 'seed') return Promise.resolve(getSeedTemplate(templateId));
        return Promise.resolve(null);
      };
    });
    return steps.reduce(function (chain, step) {
      return chain.then(function (found) { return found || step(); });
    }, Promise.resolve(null));
  }

  // ── שכבת-אחסון דפדפן (תאימות-לאחור localStorage + Firebase אופציונלי, בלי לאבד בכשל) ──
  //    win מוזרק; firebaseWriter(path,val)→Promise אופציונלי; envAllowsWrite()→bool אופציונלי.
  function createBrowserTemplateStore(cfg) {
    cfg = cfg || {};
    var win = cfg.win || (typeof window !== 'undefined' ? window : {});
    function _lsAll() { try { return JSON.parse((win.localStorage && win.localStorage.getItem(LS_KEY)) || '{}') || {}; } catch (e) { return {}; } }
    function _lsWrite(obj) { try { if (win.localStorage) win.localStorage.setItem(LS_KEY, JSON.stringify(obj)); return true; } catch (e) { return false; } }
    return {
      getLocal: function (id) { var all = _lsAll(); return all[id] ? buildTemplate(all[id]) : null; },
      listLocal: function () { return Object.keys(_lsAll()); },
      // שמירה: תמיד ל-localStorage (לא מאבדים גם אם Firebase חסום/לא-זמין); Firebase best-effort.
      save: function (template, o) {
        o = o || {};
        var t = buildTemplate(template);
        var all = _lsAll(); all[t.id] = t; var lsOk = _lsWrite(all);
        var res = { localStorage: lsOk, firebase: false };
        var canFb = typeof cfg.firebaseWriter === 'function' && (typeof cfg.envAllowsWrite !== 'function' || cfg.envAllowsWrite() === true);
        if (!canFb) return Promise.resolve(res);
        return saveTemplateVersion({
          get: function (p) { return cfg.firebaseReader ? cfg.firebaseReader(p) : Promise.resolve(null); },
          set: function (p, v) { return cfg.firebaseWriter(p, v); }
        }, t, { user: o.user, now: o.now }).then(function () { res.firebase = true; return res; })
          .catch(function () { return res; });   // כשל Firebase → ה-localStorage כבר נשמר, לא מאבדים
      }
    };
  }

  return {
    MODEL_VERSION: MODEL_VERSION, FLAG_NAME: FLAG_NAME, ROTATIONS: ROTATIONS, STATUSES: STATUSES,
    PRINTING_METHODS: PRINTING_METHODS, BINDING_TYPES: BINDING_TYPES, LS_KEY: LS_KEY, NOT_VERIFIED_NOTICE: NOT_VERIFIED_NOTICE,
    isDecoderV2Enabled: isDecoderV2Enabled, normalizeRotation: normalizeRotation, isValidRotation: isValidRotation,
    emptyValidationState: emptyValidationState, emptyTestState: emptyTestState,
    buildCell: buildCell, buildTemplate: buildTemplate, validateTemplate: validateTemplate,
    fromLegacyTemplate: fromLegacyTemplate,
    metaPath: metaPath, versionPath: versionPath, buildMeta: buildMeta,
    makeMemoryBackend: makeMemoryBackend, saveTemplateVersion: saveTemplateVersion, loadTemplateVersion: loadTemplateVersion,
    getSeedTemplate: getSeedTemplate, SEED_TEMPLATES: SEED_TEMPLATES,
    getNormalizedImpositionTemplate: getNormalizedImpositionTemplate, createBrowserTemplateStore: createBrowserTemplateStore
  };
});
