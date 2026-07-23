/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-result.js — NormalizedFoldResult: סכמת-תוצאה אחידה (U1 · Unified Shell)
 * ───────────────────────────────────────────────────────────────────────────
 * מקור-אמת יחיד שממנו *כל* הרכיבים צורכים (thumbnails/flipbook/downloads/share/
 * approval/attach). U1: סכמה + ולידציה בלבד — עדיין לא מייצר PDF אמיתי.
 * לוגיקה טהורה · אין DOM/רשת/PDF.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionResult = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var ENGINES = ['legacy', 'decoder-v2'];

  function _num(v) { var n = Number(v); return isFinite(n) ? n : null; }

  function buildSourceFile(o) {
    o = o || {};
    return {
      fileId: o.fileId || null, name: o.name || '', pdfPages: o.pdfPages != null ? (o.pdfPages | 0) : null,
      widthMm: _num(o.widthMm), heightMm: _num(o.heightMm), bytesLen: o.bytesLen != null ? (o.bytesLen | 0) : null,
      hash: o.hash || null, uploadedAt: o.uploadedAt || null,
      signatureIndex: o.signatureIndex != null ? (o.signatureIndex | 0) : 0,
      side: o.side != null ? o.side : null   // 0/1/null
    };
  }

  function buildPage(o) {
    o = o || {};
    return {
      finalPageNumber: o.finalPageNumber != null ? (o.finalPageNumber | 0) : null,
      sourceFileId: o.sourceFileId || null,
      sourcePdfPage: o.sourcePdfPage != null ? (o.sourcePdfPage | 0) : null,
      sourceSide: o.sourceSide != null ? o.sourceSide : null,        // legacy=null
      cropBox: o.cropBox || null,                                     // legacy=null
      rotationApplied: o.rotationApplied != null ? o.rotationApplied : null,
      blank: o.blank === true
    };
  }

  // בונה NormalizedFoldResult מלא עם ברירות-מחדל. bytes נשארים null ב-U1.
  function buildFoldResult(o) {
    o = o || {};
    var pages = (o.orderedPages || []).map(buildPage);
    return {
      success: o.success === true,
      jobId: o.jobId || null, templateId: o.templateId || null,
      templateVersion: o.templateVersion != null ? (o.templateVersion | 0) : null,
      engine: ENGINES.indexOf(o.engine) >= 0 ? o.engine : null,
      sourceFiles: (o.sourceFiles || []).map(buildSourceFile),
      orderedPages: pages,
      outputPdfBytes: o.outputPdfBytes || null,
      spreadsPdfBytes: o.spreadsPdfBytes || null,
      warnings: (o.warnings || []).slice(),
      errors: (o.errors || []).slice(),
      metadata: {
        totalPages: o.metadata && o.metadata.totalPages != null ? (o.metadata.totalPages | 0) : pages.length,
        signatureCount: o.metadata && o.metadata.signatureCount != null ? (o.metadata.signatureCount | 0) : null,
        createdAt: (o.metadata && o.metadata.createdAt) || null,
        createdBy: (o.metadata && o.metadata.createdBy) || null,
        sourceHash: (o.metadata && o.metadata.sourceHash) || null,
        outputHash: (o.metadata && o.metadata.outputHash) || null
      }
    };
  }

  // ── ולידציה: orderedPages = 1..N רציף, בלי כפילות/חוסר, מיון-מספרי, engine חוקי ──
  function validateFoldResult(r) {
    var errors = [], warnings = [];
    if (!r || typeof r !== 'object') return { valid: false, errors: ['NULL_RESULT'], warnings: warnings };
    if (ENGINES.indexOf(r.engine) < 0) errors.push('INVALID_ENGINE');
    var pages = Array.isArray(r.orderedPages) ? r.orderedPages : [];
    var N = pages.length;
    if (N === 0) errors.push('NO_PAGES');
    var seen = {};
    for (var i = 0; i < N; i++) {
      var fp = pages[i].finalPageNumber;
      if (!(fp >= 1)) errors.push('BAD_FINAL_PAGE@' + i);
      if (seen[fp]) errors.push('DUPLICATE_PAGE:' + fp);
      seen[fp] = true;
      if (i > 0 && pages[i - 1].finalPageNumber >= fp) errors.push('NOT_NUMERIC_SORTED@' + i);   // מיון-מספרי-עולה, לא לקסיקוגרפי
    }
    for (var p = 1; p <= N; p++) if (!seen[p]) errors.push('MISSING_PAGE:' + p);
    if (r.metadata && r.metadata.totalPages != null && r.metadata.totalPages !== N) warnings.push('TOTALPAGES_MISMATCH');
    // engine-specific: decoder-v2 חייב cropBox/sourceSide ; legacy מותר null
    if (r.engine === 'decoder-v2') {
      pages.forEach(function (pg, idx) { if (!pg.blank && (pg.cropBox == null || pg.sourceSide == null)) warnings.push('V2_MISSING_MAPPING@' + idx); });
    }
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  // צורת-Preview ל-U1 (מבנה עתידי בלבד — בלי bytes)
  function previewShape(o) {
    var r = buildFoldResult(o || {});
    r.outputPdfBytes = null; r.spreadsPdfBytes = null; r._previewOnly = true;
    return r;
  }

  return { ENGINES: ENGINES, buildSourceFile: buildSourceFile, buildPage: buildPage,
           buildFoldResult: buildFoldResult, validateFoldResult: validateFoldResult, previewShape: previewShape };
});
