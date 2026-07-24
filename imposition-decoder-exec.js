/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-decoder-exec.js — Decoder V2 Executor (U3 · מקור-אמת יחיד לבניית-הפלט)
 * ───────────────────────────────────────────────────────────────────────────
 * חילוץ מכני של buildOutput + sheet-extraction שהיו בתוך imposition-decoder-preview.html.
 * אחראי: טעינת PDF · בניית plan (DEC.buildDecodePlan) · crop/rotation · יצירת PDF · save יחיד.
 * וקטורי בלבד (embedPage+clip+rotate) — אין rasterization, אין שינוי-צבע, אין DOM/Firebase/Storage.
 * ⚠️ החילוץ מכני: אין לשנות נוסחאות-crop / צירים / סדר-transform / rotation / bleed / embed-strategy.
 * ה-Adapter (runDecoderV2Adapter) הוא צרכן — הוא לא קורא לכאן שוב ולא בונה PDF נוסף.
 *
 * הגדרות-שדות (מתועד למניעת בלבול):
 *   sourcePdfPage : 1-based (עמ׳ 1 = Front, עמ׳ 2 = Back).
 *   sourceSide    : 0 = Front · 1 = Back.
 *   row / column  : 0-based בתוך הטמפלט.
 *   clipPt        : PDF points · מקור שמאלי-תחתון של עמוד-המקור · {left,bottom,right,top}.
 *   rotationApplied: התיקון (0/90/180/270) שהוחל על התוכן בפלט — לא הסיבוב המקורי בפרופר.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'), require('./imposition-decoder.js'));
  } else {
    root.ImpositionDecoderExec = factory(root.PDFLib, root.ImpositionDecoder);
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (PDFLib, DEC) {
  'use strict';

  var PDFDocument = PDFLib.PDFDocument, degrees = PDFLib.degrees;
  var MM = 72 / 25.4;                       // זהה ל-MM של ה-preview/decoder (72/25.4)
  var TEMPLATE_ID = '88x63-16p-perfector';  // U3: הטמפלט המאושר (0/180)
  var TEMPLATE_ID_32 = '70x100-32p-165x240-perfector';  // T3: 32 עמ׳ 165×240 (90/270)

  // ── חילוץ קופסאות-הגיליון מהפרופר (מכני מ-_sheetFrom של ה-preview) ──────────
  //    מקבל מסמך-pdf-lib טעון (טעינה פעם אחת ב-decodeToPdf) — לא bytes, כדי לא לטעון פעמיים.
  function _sheetFromDoc(doc) {
    var p = doc.getPages()[0];
    var mb = p.getMediaBox(), tb = p.getTrimBox();
    return {
      mediaWmm: mb.width / MM, mediaHmm: mb.height / MM,
      trimXmm: tb.x / MM, trimYmm: tb.y / MM, trimWmm: tb.width / MM, trimHmm: tb.height / MM
    };
  }

  // ── טמפלט → אפשרויות-decode. U3: רק 88x63-16p-perfector → cells ברירת-מחדל של ה-decoder ──
  //    (מפת-התאים המכוילת CELL_MAP_88x63_16P_PERFECTOR + DEFAULT_LAYOUT_88x63 מסופקות ע"י ה-decoder.)
  function _templateToDecodeOpts(template) {
    var id = template && (template.id || template.templateId);
    if (!id || id === TEMPLATE_ID) return {};   // 88x63 → ברירת-מחדל של ה-decoder (cells+layout מכוילים)
    if (id === TEMPLATE_ID_32) return { cells: DEC.CELL_MAP_70x100_32P, layout: DEC.LAYOUT_70x100_32P };
    return { unsupported: true, templateId: id };   // אחר → לא נתמך (לא ממציאים cells)
  }

  // ── בניית PDF-הפלט (חילוץ מכני של buildOutput) — embed כל-צד פעם-אחת, clip ע"י MediaBox, rotate ──
  //    srcDoc = מסמך-המקור הטעון. plan = תוצאת DEC.buildDecodePlan. מחזיר Uint8Array (save יחיד).
  async function buildOutputFromPlan(srcDoc, plan) {
    var srcPages = srcDoc.getPages();
    var out = await PDFDocument.create();
    var embBySide = {};
    embBySide[1] = await out.embedPage(srcPages[0]);
    if (srcPages[1]) embBySide[2] = await out.embedPage(srcPages[1]);
    for (var i = 0; i < plan.pages.length; i++) {
      var p = plan.pages[i];
      var emb = embBySide[p.sourcePdfPage]; if (!emb) continue;
      var op = out.addPage([p.outputWpt, p.outputHpt]);   // 90/270 → מידות מוחלפות (נקבע ב-buildDecodePlan)
      var cp = p.bleedClipPt || p.clipPt;   // bleedClipPt == clipPt כשאין גלישה
      // transform לפי הנוסחאות המאושרות (CCW · origin שמאל-תחתון). 0/180 ללא שינוי (88x63 byte-identical).
      if (p.rotationApplied === 180) op.drawPage(emb, { x: cp.right, y: cp.top, rotate: degrees(180) });
      else if (p.rotationApplied === 90) op.drawPage(emb, { x: cp.top, y: -cp.left, rotate: degrees(90) });
      else if (p.rotationApplied === 270) op.drawPage(emb, { x: -cp.bottom, y: cp.right, rotate: degrees(270) });
      else op.drawPage(emb, { x: -cp.left, y: -cp.bottom });
    }
    return await out.save();
  }

  function _now() {
    try { if (typeof performance !== 'undefined' && performance.now) return performance.now(); } catch (e) {}
    return Date.now();
  }

  // ── API ציבורי: decodeToPdf — מפרק פרופר → PDF פלט בסדר-קריאה. bytes פעם אחת בלבד. ──
  //    input: { sourceArrayBuffer, template, startPage, bleedMm, requestId }
  //    output: { requestId, bytes, plan, durationMs, warnings, errors }
  async function decodeToPdf(input) {
    input = input || {};
    var requestId = input.requestId != null ? input.requestId : null;
    var t0 = _now();
    var topts = _templateToDecodeOpts(input.template);
    if (topts.unsupported) {
      return { requestId: requestId, bytes: null, plan: null, durationMs: _now() - t0,
        warnings: [], errors: ['UNSUPPORTED_TEMPLATE:' + topts.templateId] };
    }
    var srcBytes = input.sourceArrayBuffer;
    if (!srcBytes) {
      return { requestId: requestId, bytes: null, plan: null, durationMs: _now() - t0,
        warnings: [], errors: ['NO_SOURCE'] };
    }
    var srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    var sheet = _sheetFromDoc(srcDoc);
    var opts = {
      sheet: sheet,
      startPage: input.startPage != null ? input.startPage : 1,
      bleedMm: input.bleedMm > 0 ? input.bleedMm : 0
    };
    if (topts.cells) { opts.cells = topts.cells; opts.layout = topts.layout; }   // 32 → מפה+פריסה; 88x63 → ברירת-מחדל
    var plan = DEC.buildDecodePlan(opts);
    var bytes = null;
    if (plan.success !== false) bytes = await buildOutputFromPlan(srcDoc, plan);
    return {
      requestId: requestId, bytes: bytes, plan: plan, durationMs: _now() - t0,
      warnings: (plan.warnings || []).slice(), errors: (plan.errors || []).slice()
    };
  }

  return {
    TEMPLATE_ID: TEMPLATE_ID, MM: MM,
    _sheetFromDoc: _sheetFromDoc, _templateToDecodeOpts: _templateToDecodeOpts,
    buildOutputFromPlan: buildOutputFromPlan, decodeToPdf: decodeToPdf
  };
});
