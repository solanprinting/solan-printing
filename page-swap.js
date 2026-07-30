/* ═══════════ page-swap.js — בקשת לקוח להחלפת עמודים בעיתון שאושר ═══════════
   הזרימה: הלקוח אישר עיתון → גילה טעות בעמוד → מבקש "החלפת עמודים" → בית-הדפוס
   מאשר (או דוחה) → הקישור של הלקוח נפתח שוב לעריכה לזמן מוגבל → הלקוח מחליף/מוחק
   עמודים ומאשר סופית → נוצרת גרסה חדשה, והבקשה נסגרת.

   כאן יושבת רק הלוגיקה הטהורה: מכונת-המצבים של הבקשה, חלון-העריכה, מספור-גרסאות
   ותיאור-השינויים לביקורת. אין DOM, אין Firebase — נבדק ב-Node.

   למה נדרש אישור של בית-הדפוס: קובץ שאושר עלול להיות כבר באימפוזיציה/על המכונה.
   פתיחה לעריכה בלי ידיעת הדפוס = הדפסה של גרסה שגויה. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PageSwap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EDIT_WINDOW_MS = 48 * 3600 * 1000;   // חלון העריכה מרגע האישור

  function _num(v){ v = Number(v); return isFinite(v) ? v : 0; }
  function _str(v){ return v == null ? '' : String(v); }

  /* target: 'full' לעיתון מלא, או מזהה-ריצה (partId) */
  function requestTarget(partId){ return partId ? String(partId) : 'full'; }

  function buildRequest(opt){
    opt = opt || {};
    var at = _num(opt.at) || 0;
    return {
      id: 'cr' + at + Math.random().toString(36).slice(2, 6),
      target: requestTarget(opt.target === 'full' ? null : opt.target),
      status: 'pending',
      at: at,
      by: _str(opt.by),
      note: _str(opt.note),
      pages: Array.isArray(opt.pages) ? opt.pages.slice(0, 200) : null   // אילו עמודים הלקוח מבקש להחליף (לא מחייב)
    };
  }

  function approve(req, opt){
    opt = opt || {};
    var at = _num(opt.at) || 0;
    var win = _num(opt.windowMs) || EDIT_WINDOW_MS;
    return Object.assign({}, req, {
      status: 'approved', decidedAt: at, decidedBy: _str(opt.by), expiresAt: at + win
    });
  }
  function reject(req, opt){
    opt = opt || {};
    return Object.assign({}, req, {
      status: 'rejected', decidedAt: _num(opt.at) || 0, decidedBy: _str(opt.by),
      decisionNote: _str(opt.note)
    });
  }
  /* אחרי שהלקוח אישר סופית — הבקשה מנוצלת (חלון העריכה נסגר) */
  function markUsed(req, opt){
    opt = opt || {};
    return Object.assign({}, req, {
      status: 'used', usedAt: _num(opt.at) || 0, version: _num(opt.version) || 0,
      changes: opt.changes || null
    });
  }

  /* מצב הבקשה בזמן נתון: none / pending / approved / expired / rejected / used */
  function state(req, now){
    if (!req || !req.status) return 'none';
    if (req.status === 'approved'){
      var exp = _num(req.expiresAt);
      if (exp && _num(now) > exp) return 'expired';
      return 'approved';
    }
    if (req.status === 'pending' || req.status === 'rejected' || req.status === 'used') return req.status;
    return 'none';
  }
  function canEdit(req, now){ return state(req, now) === 'approved'; }
  /* בקשה חדשה מותרת כשאין בקשה פתוחה (ממתינה או מאושרת-בתוקף) */
  function canRequest(req, now){
    var s = state(req, now);
    return s === 'none' || s === 'rejected' || s === 'used' || s === 'expired';
  }

  /* תווית עברית למסך — גם ללקוח וגם לבית-הדפוס */
  function label(req, now){
    switch (state(req, now)) {
      case 'pending':  return '⏳ בקשת החלפת עמודים ממתינה לאישור בית-הדפוס';
      case 'approved': return '✏️ אושרה החלפת עמודים — אפשר לערוך ולאשר מחדש';
      case 'expired':  return '⌛ חלון העריכה הסתיים — צריך לבקש שוב';
      case 'rejected': return '✖️ בקשת ההחלפה נדחתה' + (req && req.decisionNote ? (' — ' + req.decisionNote) : '');
      case 'used':     return '✓ ההחלפה בוצעה' + (req && req.version ? (' (גרסה ' + req.version + ')') : '');
      default:         return '';
    }
  }
  /* כמה זמן נשאר לעריכה — לתצוגה ללקוח */
  function remainingMs(req, now){
    if (state(req, now) !== 'approved') return 0;
    return Math.max(0, _num(req.expiresAt) - _num(now));
  }
  function remainingLabel(req, now){
    var ms = remainingMs(req, now);
    if (!ms) return '';
    var h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
    if (m === 60) { h += 1; m = 0; }        // 47:59:59 → "48 שע׳", לא "47 שע׳ ו-60 דק׳"
    return h > 0 ? ('נותרו ' + h + ' שע׳' + (m ? (' ו-' + m + ' דק׳') : '')) : ('נותרו ' + Math.max(1, m) + ' דק׳');
  }

  /* ── גרסאות הקובץ ── */
  function currentVersion(rec){ return Math.max(1, _num(rec && rec.version) || 1); }
  function nextVersion(rec){ return currentVersion(rec) + 1; }
  /* customerProofs/<לקוח>/<id>/full.pdf → …/full-v2.pdf (לא דורסים את הגרסה שאושרה) */
  function versionedPath(basePath, version){
    var p = _str(basePath);
    if (!p) return p;
    if (_num(version) <= 1) return p;
    return p.replace(/(\.[a-z0-9]+)$/i, '-v' + _num(version) + '$1');
  }

  /* ── תיאור השינויים (ביקורת): מה הוחלף, מה נמחק ── */
  /* before/after = מערכי מזהי-עמוד (uid) בסדר התצוגה. replacedUids = עמודים שהתוכן שלהם הוחלף. */
  function describeChanges(before, after, replacedUids){
    before = (before || []).map(String);
    after  = (after  || []).map(String);
    var inAfter = {}; after.forEach(function (u){ inAfter[u] = 1; });
    var deleted = before.filter(function (u){ return !inAfter[u]; });
    var rep = {}; (replacedUids || []).forEach(function (u){ rep[String(u)] = 1; });
    var replaced = before.filter(function (u){ return inAfter[u] && rep[u]; });
    var order = {}; before.forEach(function (u, i){ order[u] = i; });
    // "שונה הסדר" נמדד רק על העמודים ששרדו: מחיקה מזיזה את כל מה שאחריה, וזה
    // אינו שינוי-סדר. משווים את סדר-השורדים לפני מול הסדר אחרי.
    var survivorsBefore = before.filter(function (u){ return inAfter[u]; });
    var moved = after.length === survivorsBefore.length &&
      after.some(function (u, i){ return survivorsBefore[i] !== u; });
    return {
      deletedCount: deleted.length,
      replacedCount: replaced.length,
      reordered: moved,
      pagesBefore: before.length,
      pagesAfter: after.length,
      // מספרי-העמוד (1-מבוסס) שנמחקו/הוחלפו — כפי שהלקוח ראה אותם לפני העריכה
      deletedPages: deleted.map(function (u){ return order[u] + 1; }).sort(function (a,b){ return a-b; }),
      replacedPages: replaced.map(function (u){ return order[u] + 1; }).sort(function (a,b){ return a-b; })
    };
  }
  /* תקציר קריא לבית-הדפוס */
  function changesLabel(ch){
    if (!ch) return '';
    var parts = [];
    if (ch.replacedCount) parts.push('הוחלפו עמ׳ ' + ch.replacedPages.join(', '));
    if (ch.deletedCount)  parts.push('נמחקו עמ׳ ' + ch.deletedPages.join(', '));
    if (ch.reordered)     parts.push('שונה הסדר');
    if (ch.pagesBefore !== ch.pagesAfter) parts.push(ch.pagesBefore + ' עמ׳ → ' + ch.pagesAfter + ' עמ׳');
    return parts.join(' · ') || 'ללא שינוי';
  }

  /* אזהרה שחייבת להוצג ללקוח כשמספר העמודים משתנה: פגינציה/ריצות מחייבות כפולות של 4 */
  function pageCountWarning(after, sheetMultiple){
    var n = _num(after), mult = _num(sheetMultiple) || 4;
    if (!n) return 'לא נשארו עמודים — אי אפשר לאשר עיתון ריק.';
    if (n % mult !== 0) return 'מספר העמודים (' + n + ') אינו כפולה של ' + mult + ' — ייתכן שיידרשו עמודים ריקים בהדפסה.';
    return '';
  }

  /* נתיב הבקשה ב-Firebase — בקשה אחת פעילה לכל יעד */
  function requestPath(proofId, target){
    var t = requestTarget(target === 'full' ? null : target);
    return 'customerProofs/' + _str(proofId) + '/changeRequests/' + t;
  }

  return {
    EDIT_WINDOW_MS: EDIT_WINDOW_MS,
    requestTarget: requestTarget, requestPath: requestPath,
    buildRequest: buildRequest, approve: approve, reject: reject, markUsed: markUsed,
    state: state, canEdit: canEdit, canRequest: canRequest,
    label: label, remainingMs: remainingMs, remainingLabel: remainingLabel,
    currentVersion: currentVersion, nextVersion: nextVersion, versionedPath: versionedPath,
    describeChanges: describeChanges, changesLabel: changesLabel, pageCountWarning: pageCountWarning
  };
});
