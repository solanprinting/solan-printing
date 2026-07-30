/* ═══════════ storage-cleanup.js — פינוי-אחסון קבצי-לקוחות בהתמלאות ═══════════
   כשאחסון קבצי-הלקוחות מתקרב לתקרה, מפנים את הקבצים הישנים ביותר — אבל *רק* של
   עבודות שכבר הושלמו, ורק אחרי הודעה+אישור של המנהל (אף פעם לא מחיקה שקטה).

   מדידה: אין דרך אמינה למדוד מהדפדפן את גודל-הבאקט בפועל, ולכן מעריכים לפי סכום
   ה-fileSize שנשמר על כל רשומת-פרופר (proof-client שומר fileSize בכל העלאה). זו
   הערכה טובה לצורך סף-אזהרה — לא מדידה מדויקת.

   כל החלק כאן טהור (בלי DOM/רשת) ונבדק ב-Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StorageCleanup = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GB = 1024 * 1024 * 1024;
  var CAP_DEFAULT   = 5 * GB;   // מכסת Firebase Storage החינמית
  var THRESHOLD     = 0.85;     // מ-85% ומעלה — מציעים פינוי
  var TARGET_RATIO  = 0.70;     // מפנים עד שיורדים ל-70%
  var MIN_AGE_MS    = 7 * 24 * 3600 * 1000;   // לא נוגעים בקובץ שנוצר בשבוע האחרון

  function _num(v){ v = Number(v); return isFinite(v) && v > 0 ? v : 0; }

  /* שיטוח כל קבצי-הלקוחות מרשומות customerProofs לרשימה אחת עם מטא-דאטה */
  function recordFiles(proofsObj){
    var out = [];
    var o = proofsObj || {};
    Object.keys(o).forEach(function (id){
      var p = o[id]; if (!p) return;
      var completed = !!p.completedAt;
      var pushOne = function(path, size, at, partId){
        if (!path) return;   // בלי נתיב-Storage אי אפשר למחוק
        out.push({ proofId: id, partId: partId || null, path: path, size: _num(size),
                   at: _num(at), completed: completed, customer: p.customer || '', title: p.title || '' });
      };
      // עיתון-מלא
      if (p.filePath && !p.filePurgedAt) pushOne(p.filePath, p.fileSize, p.approvedAt || p.createdAt);
      // ריצות
      if (p.parts && typeof p.parts === 'object'){
        Object.keys(p.parts).forEach(function(pid){
          var t = p.parts[pid]; if (!t || t.filePurgedAt) return;
          pushOne(t.filePath, t.fileSize, t.approvedAt || p.createdAt, pid);
        });
      }
    });
    return out;
  }

  function totalBytes(files){ return (files||[]).reduce(function(s,f){ return s + _num(f.size); }, 0); }
  function usageRatio(used, cap){ cap = _num(cap) || CAP_DEFAULT; return _num(used) / cap; }
  function needsCleanup(used, cap, threshold){ return usageRatio(used, cap) >= (threshold || THRESHOLD); }

  /* בוחר אילו קבצים לפנות: רק של עבודות שהושלמו, ישנים מ-MIN_AGE, הישן-ביותר קודם,
     עד שהתפוסה יורדת ל-targetRatio (או עד שנגמרו המועמדים). */
  function selectForPurge(files, opt){
    opt = opt || {};
    var cap = _num(opt.cap) || CAP_DEFAULT;
    var used = (opt.used != null) ? _num(opt.used) : totalBytes(files);
    var now = _num(opt.now) || 0;
    var target = (opt.targetRatio != null ? opt.targetRatio : TARGET_RATIO) * cap;
    var minAge = (opt.minAgeMs != null) ? opt.minAgeMs : MIN_AGE_MS;
    // מועמדים: הושלמו, יש נתיב, ישנים מספיק
    var cands = (files||[]).filter(function(f){
      return f.completed && f.path && _num(f.size) > 0 && (!now || (now - _num(f.at)) >= minAge);
    }).sort(function(a,b){ return _num(a.at) - _num(b.at); });   // ישן→חדש
    var toPurge = [], freed = 0, remaining = used;
    for (var i = 0; i < cands.length && remaining > target; i++){
      toPurge.push(cands[i]); freed += _num(cands[i].size); remaining -= _num(cands[i].size);
    }
    return { toPurge: toPurge, freed: freed, before: used, after: used - freed,
             cap: cap, reachedTarget: (used - freed) <= target, candidates: cands.length };
  }

  function fmtSize(bytes){
    bytes = _num(bytes);
    if (bytes >= GB) return (bytes / GB).toFixed(2) + ' GB';
    if (bytes >= 1024*1024) return (bytes / (1024*1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }
  function pct(ratio){ return Math.round(_num(ratio) * 100) + '%'; }

  return {
    GB: GB, CAP_DEFAULT: CAP_DEFAULT, THRESHOLD: THRESHOLD, TARGET_RATIO: TARGET_RATIO, MIN_AGE_MS: MIN_AGE_MS,
    recordFiles: recordFiles, totalBytes: totalBytes, usageRatio: usageRatio, needsCleanup: needsCleanup,
    selectForPurge: selectForPurge, fmtSize: fmtSize, pct: pct
  };
});
