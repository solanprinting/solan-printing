/* ═══════════════════════════════════════════════════════════════════════════
 * customer-fold-versions.js — Customer Fold Preview · לוגיקת-גרסאות (טהורה)
 * ───────────────────────────────────────────────────────────────────────────
 * מקור-האמת ל-customerFoldVersions/<versionId>: יצירת רשומת-גרסה בלתי-ניתנת-לדריסה,
 * token אקראי, קשירת-אישור ל-outputHash *מהרשומה* (לא מהדפדפן), revoked/expired.
 * לוגיקה טהורה · אין DOM/Firebase/PDF. הכתיבה ל-Firebase + ה-DOM נעשים ב-Shell.
 *
 * versioning: כל קישור = versionId חדש · versionNumber עולה · אין דריסה של רשומה קיימת.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CustomerFoldVersions = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var STATUSES = ['draft', 'shared', 'approved', 'correction-requested', 'revoked'];
  var APPROVAL_STATUSES = ['pending', 'approved', 'correction-requested'];
  var SUPPORTED_TEMPLATES = ['16perf', '88x63-16p-perfector', '70x100-32p-165x240-perfector'];
  // בנוסף לרשימה: טמפלטים מובנים של מנוע-האפליקציה (legacy:<type>) וטמפלטים שנשמרו
  // בכלי סימון-הטמפלט (custom:<key>) — כולם מקופלים באותו מנוע-אפליקציה דרך הגשר.
  function templateSupported(id) {
    if (typeof id !== 'string' || !id) return false;
    if (SUPPORTED_TEMPLATES.indexOf(id) >= 0) return true;
    /* ⚠️ 17/08/2026 — `tpl:` = טמפלט שנקרא מקובץ Preps .tpl. הקיפול עבד, אבל
       **יצירת-הקישור נכשלה** ב-UNSUPPORTED_TEMPLATE: זו רשימת-היתר **שנייה**,
       מקבילה ל-`customerFoldTemplateAllowed` ב-imposition-fold-adapter.js,
       ורק אחת מהן עודכנה. שתי רשימות לאותה שאלה = בדיוק סוג התקלה הזה.
       ⚠️ מי שמוסיף קידומת-טמפלט חייב לעדכן את שתיהן; יש סנטינל שמשווה ביניהן. */
    return id.indexOf('legacy:') === 0 || id.indexOf('custom:') === 0 ||
           id.indexOf('multi:') === 0 || id.indexOf('tpl:') === 0;
  }

  // ── אקראיות: crypto (דפדפן/Node). rng אופציונלי להזרקה בבדיקות (מחזיר Uint8Array). ──
  function _randBytes(n, rng) {
    if (rng) return rng(n);
    try { if (typeof crypto !== 'undefined' && crypto.getRandomValues) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; } } catch (e) {}
    try { return new Uint8Array(require('crypto').randomBytes(n)); } catch (e) {}
    throw new Error('NO_SECURE_RNG');   // לא נופלים ל-Math.random עבור token
  }
  function _hex(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0'); return s; }
  function makeVersionId(rng) { return 'v_' + _hex(_randBytes(16, rng)); }           // 128-bit
  function makeToken(rng) { return _hex(_randBytes(24, rng)); }                       // 192-bit · לא-נחיש

  function nextVersionNumber(existing) {
    var max = 0; (existing || []).forEach(function (r) { if (r && r.versionNumber > max) max = r.versionNumber; });
    return max + 1;
  }

  // ── יצירת רשומת-גרסה חדשה (בלתי-ניתנת-לדריסה) ────────────────────────────────
  //    input נדרש: internalCheck.confirmed===true, templateId נתמך, outputHash, output path/url.
  function buildVersionRecord(input) {
    input = input || {};
    var ic = input.internalCheck || {};
    var errors = [];
    if (ic.confirmed !== true) errors.push('INTERNAL_CHECK_NOT_CONFIRMED');
    if (!templateSupported(input.templateId)) errors.push('UNSUPPORTED_TEMPLATE:' + input.templateId);
    if (!input.outputHash) errors.push('NO_OUTPUT_HASH');
    if (!input.outputStoragePath && !input.outputUrl) errors.push('NO_OUTPUT_LOCATION');
    if (errors.length) return { ok: false, errors: errors };

    var versionId = input.versionId || makeVersionId(input.rng);
    var token = input.token || makeToken(input.rng);
    var record = {
      versionId: versionId, jobId: input.jobId || null, customerId: input.customerId || null, jobName: input.jobName || '',
      versionNumber: input.versionNumber != null ? (input.versionNumber | 0) : 1,
      status: 'shared',
      templateId: input.templateId, engine: input.engine || null, engineVersion: input.engineVersion || '',
      sourceFileName: input.sourceFileName || '', sourceStoragePath: input.sourceStoragePath || null, sourceHash: input.sourceHash || null,
      outputStoragePath: input.outputStoragePath || null, outputUrl: input.outputUrl || null, outputHash: input.outputHash,
      pageCount: input.pageCount != null ? (input.pageCount | 0) : null,
      finalPageSizeMm: { width: (input.finalPageSizeMm && input.finalPageSizeMm.width) || null, height: (input.finalPageSizeMm && input.finalPageSizeMm.height) || null },
      internalCheck: { confirmed: true, confirmedAt: ic.confirmedAt || input.createdAt || null, confirmedBy: ic.confirmedBy || input.createdBy || null },
      share: { sid: input.sid || versionId, token: token, createdAt: input.createdAt || null, expiresAt: input.expiresAt || null, revoked: false, allowDownload: input.allowDownload === true },
      approval: { status: 'pending', approvedOutputHash: null, approvedAt: null, approvedBy: null, comment: null },
      createdAt: input.createdAt || null, createdBy: input.createdBy || null
    };
    return { ok: true, record: record };
  }

  // ── תוקף-קישור: revoked / expiresAt (nowIso מוזרק — בלי Date.now פנימי) ──────
  function isLinkValid(record, nowIso) {
    if (!record || !record.share) return { valid: false, reason: 'NO_RECORD' };
    if (record.share.revoked === true) return { valid: false, reason: 'REVOKED' };
    if (record.share.expiresAt && nowIso && String(nowIso) > String(record.share.expiresAt)) return { valid: false, reason: 'EXPIRED' };
    return { valid: true };
  }

  function revoke(record) {
    var r = _clone(record); r.share.revoked = true; r.status = 'revoked'; return r;
  }

  // ── אישור/בקשת-תיקון · קושר approvedOutputHash *מהרשומה* (לא מהדפדפן) ────────
  //    action: 'approve' | 'request-correction'. clientProvidedOutputHash מתעלמים ממנו כמקור-אמת.
  function applyApproval(record, action, opts) {
    opts = opts || {};
    var v = isLinkValid(record, opts.nowIso);
    if (!v.valid) return { ok: false, error: 'LINK_' + v.reason };   // אין אישור אחרי ביטול/פקיעה
    var r = _clone(record);
    if (action === 'approve') {
      r.approval.status = 'approved';
      r.approval.approvedOutputHash = record.outputHash;   // ← מקור-אמת: ה-hash מהרשומה בלבד
      r.approval.approvedAt = opts.nowIso || null;
      r.approval.approvedBy = opts.approvedBy || null;
      r.approval.comment = opts.comment || null;
      r.status = 'approved';
    } else if (action === 'request-correction') {
      r.approval.status = 'correction-requested';
      r.approval.approvedOutputHash = null;
      r.approval.comment = opts.comment || null;
      r.approval.approvedBy = opts.approvedBy || null;
      r.status = 'correction-requested';
    } else {
      return { ok: false, error: 'UNKNOWN_ACTION' };
    }
    return { ok: true, record: r };
  }

  // הוכחת-זהות: worker-hash === record.outputHash === storage-hash === approvedOutputHash
  function outputHashConsistent(record, workerBytesHash, storageBytesHash) {
    var h = record && record.outputHash;
    var ok = !!h && workerBytesHash === h && storageBytesHash === h;
    if (record && record.approval && record.approval.status === 'approved') ok = ok && record.approval.approvedOutputHash === h;
    return ok;
  }

  function validate(record) {
    var errors = [];
    if (!record) return { valid: false, errors: ['NULL'] };
    if (STATUSES.indexOf(record.status) < 0) errors.push('INVALID_STATUS');
    if (!record.versionId || record.versionId.indexOf('v_') !== 0) errors.push('BAD_VERSION_ID');
    if (!(record.versionNumber >= 1)) errors.push('BAD_VERSION_NUMBER');
    if (!templateSupported(record.templateId)) errors.push('UNSUPPORTED_TEMPLATE');
    if (!record.outputHash) errors.push('NO_OUTPUT_HASH');
    if (!record.share || !record.share.token || record.share.token.length < 32) errors.push('WEAK_TOKEN');
    if (!record.approval || APPROVAL_STATUSES.indexOf(record.approval.status) < 0) errors.push('INVALID_APPROVAL_STATUS');
    return { valid: errors.length === 0, errors: errors };
  }

  function _clone(o) { return JSON.parse(JSON.stringify(o)); }

  return {
    STATUSES: STATUSES, APPROVAL_STATUSES: APPROVAL_STATUSES, SUPPORTED_TEMPLATES: SUPPORTED_TEMPLATES,
    templateSupported: templateSupported,
    makeVersionId: makeVersionId, makeToken: makeToken, nextVersionNumber: nextVersionNumber,
    buildVersionRecord: buildVersionRecord, isLinkValid: isLinkValid, revoke: revoke,
    applyApproval: applyApproval, outputHashConsistent: outputHashConsistent, validate: validate
  };
});
