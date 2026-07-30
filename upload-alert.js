/* ═══════════ התראת "הלקוח שלח קבצים" — עד שרואים אותה ═══════════
   בקשת-בעלים (2026-07-30): כשלקוח שולח קבצים תישמע התראה עם צליל כל כמה
   שניות במסך הקדם-דפוס, והיא תיפסק *רק* כשהקדם-דפוס מסמן שראה. אם אחרי
   5 דקות עוד לא סומן — ההתראה עולה גם למסך המנהל.

   הלוגיקה כאן טהורה (בלי DOM/שמע/רשת) כדי שתהיה נבדקת: מקבלת את מצב
   ההעלאות + מי המשתמש + הזמן, ומחזירה מה צריך לקרות *עכשיו*.
   האישור נשמר בענן (seenBy) ולא מקומית, כדי שסימון במכשיר אחד ישתיק את כולם. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UploadAlert = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOUND_EVERY_MS  = 8 * 1000;        // צליל כל 8 שניות — מורגש בלי להיות בלתי-נסבל
  var ESCALATE_MS     = 5 * 60 * 1000;   // 5 דקות בלי סימון → גם המנהל
  var MAX_AGE_MS      = 12 * 60 * 60 * 1000;  // העלאה מלפני יותר מזה לא מצייצת (שאריות)

  function _int(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

  /* העלאות שממתינות לעין אנושית. item = { id, customer, title, at, seenAt } */
  function pending(items, now) {
    now = _int(now);
    return (items || []).filter(function (it) {
      if (!it || _int(it.at) <= 0) return false;
      if (it.seenAt) return false;                       // מישהו סימן שראה → נגמר
      return (now - _int(it.at)) <= MAX_AGE_MS;          // לא מצייצים על שאריות ישנות
    });
  }

  // כמה זמן ההעלאה הכי-ותיקה ממתינה
  function oldestWaitMs(items, now) {
    var p = pending(items, now);
    if (!p.length) return 0;
    var oldest = p.reduce(function (a, b) { return _int(a.at) <= _int(b.at) ? a : b; });
    return Math.max(0, _int(now) - _int(oldest.at));
  }

  /* מה לעשות עכשיו.
     role: 'prepress' | 'manager' | 'other'
     lastSoundAt: מתי צייצנו לאחרונה במסך הזה (0 = עדיין לא)
     מחזיר { count, banner, sound, escalated, waitMs, dot } */
  function tick(items, opts) {
    opts = opts || {};
    var now = _int(opts.now), role = opts.role || 'other';
    var p = pending(items, now);
    var waitMs = oldestWaitMs(items, now);
    var escalated = p.length > 0 && waitMs >= ESCALATE_MS;

    // מי רואה את ההתראה הגדולה: קדם-דפוס תמיד; מנהל רק אחרי הסלמה.
    var loud = p.length > 0 && (role === 'prepress' || (role === 'manager' && escalated));
    var due  = loud && ((_int(opts.lastSoundAt) === 0) || (now - _int(opts.lastSoundAt) >= SOUND_EVERY_MS));

    return {
      count: p.length,
      items: p,
      waitMs: waitMs,
      banner: loud,                        // באנר/חלון גדול
      sound: due,                          // לצייץ עכשיו
      escalated: escalated,
      dot: p.length > 0 && !loud           // שאר המשתמשים: נקודה אדומה בלבד
    };
  }

  // ניסוח ההודעה — אותו ניסוח בכל המסכים
  function message(res) {
    if (!res || !res.count) return '';
    var mins = Math.floor((res.waitMs || 0) / 60000);
    var who = res.count === 1 ? (res.items[0].customer || 'לקוח') : (res.count + ' לקוחות');
    var head = '📥 ' + who + ' שלח' + (res.count === 1 ? '' : 'ו') + ' קבצים לדפוס';
    if (res.escalated) head = '⏰ ' + head + ' — ' + mins + ' דקות בלי טיפול';
    return head;
  }

  /* סימון "ראיתי" — מה לכתוב לענן. נשמר לכל העלאה בנפרד, עם מי סימן ומתי,
     כדי שיהיה תיעוד ולא רק השתקה. */
  function seenPatch(who, now) {
    return { seenAt: _int(now) || 1, seenBy: String(who || '') || null };
  }

  return { SOUND_EVERY_MS: SOUND_EVERY_MS, ESCALATE_MS: ESCALATE_MS, MAX_AGE_MS: MAX_AGE_MS,
           pending: pending, oldestWaitMs: oldestWaitMs, tick: tick,
           message: message, seenPatch: seenPatch };
});
