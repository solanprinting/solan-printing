/* ═══════════ נתוני מסך-הדפוס ═══════════
   כל הלוגיקה של מסך "לקוחות ועבודות" במקום אחד, טהור ונבדק — לפני שנוגעים
   ב-HTML. ככה אפשר לשכתב את המסך בלי לשכתב את החשיבה, ובלי לגלות רגרסיות
   רק כשהמסך כבר באוויר.

   ארבעה דברים שהמסך צריך ולא היו בו (בקשת-בעלים 2026-07-31):
     1. מי אמור לשלוח היום — ולא שלח. (עד היום ראו רק מי כן שלח.)
     2. פס-סטטוס אחד לכל גיליון: התקבל → נצפה → אושר → בדפוס → הושלם.
     3. עמודים חסרים, בולט ברמת הלקוח ולא קבור בשורת-ריצה.
     4. ספירת קבצים-חדשים שקדם-הדפוס טרם סימן שראה.

   מקורות-אמת (אותם שדות שכבר קיימים — בלי להמציא חדשים):
     customerProofs[].approvedAt · .shopSeenAt · .completedAt · .closedAt
     customerProofs[].pendingPages · .parts[<id>].{approvedAt,shopSeenAt,pendingPages}
     newspapers[].day + customerDayOverride  → יום-השליחה של הלקוח
     cards[]                                  → האם יש כרטיס פעיל ("בדפוס")   */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShopView = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  var DAY_MS = 24 * 60 * 60 * 1000;

  function _s(v){ return String(v == null ? '' : v); }
  function _i(v){ var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  // נרמול שם: מתעלם מסימני-פיסוק ורווחים כפולים (שמות נכתבים בכמה וריאציות)
  function normName(s){ return _s(s).replace(/["'.,\-()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  /* התאמת-שם כמילה שלמה בלבד. ⚠️ באג שהיה: חיפוש-מחרוזת דו-כיווני שייך
     כרטיס "שבועון" ללקוח "שבועון אלעד". כאן רק כיוון אחד ועם גבולות. */
  function isSep(ch){ return ch === '' || /[\s\-–—·,:;()\[\]"'\/|]/.test(ch); }
  function nameInside(hay, needle){
    hay = _s(hay); needle = _s(needle);
    if (!hay || !needle || needle.length < 3) return false;
    if (hay === needle) return true;
    for (var i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)){
      var before = i === 0 ? '' : hay[i - 1];
      var after = (i + needle.length >= hay.length) ? '' : hay[i + needle.length];
      if (isSep(before) && isSep(after)) return true;
    }
    return false;
  }

  /* ── 1. יום-השליחה של לקוח ─────────────────────────────────────────────
     דריסה ידנית קודמת ליומן; אחרת התאמה כמילה שלמה מול שמות-העיתונים. */
  function customerDay(name, dayByCustomer, overrides){
    var n = normName(name); if (!n) return '';
    overrides = overrides || {}; dayByCustomer = dayByCustomer || {};
    if (overrides[n]) return overrides[n];
    if (dayByCustomer[n]) return dayByCustomer[n];
    for (var k in dayByCustomer){ if (nameInside(k, n)) return dayByCustomer[k]; }
    return '';
  }

  /* ── 2. פס-הסטטוס של גיליון ────────────────────────────────────────────
     סדר קבוע, וכל שלב נגזר משדה קיים. "בדפוס" מגיע מכרטיס-עבודה פעיל,
     כי ל-customerProofs אין שדה כזה — ולכן הוא אופציונלי. */
  var STAGES = [
    { key: 'received', label: 'התקבל',  icon: '📥' },
    { key: 'seen',     label: 'נצפה',   icon: '👁' },
    { key: 'approved', label: 'אושר',   icon: '✅' },
    { key: 'printing', label: 'בדפוס',  icon: '🖨' },
    { key: 'done',     label: 'הושלם',  icon: '🏁' }
  ];
  function stageOf(p, opts){
    opts = opts || {};
    if (!p) return 'received';
    if (p.completedAt || p.closedAt) return 'done';
    if (opts.hasActiveCard) return 'printing';
    if (p.apogeeApprovedAt || p.status === 'approved' || p.approvedAt) {
      // "נצפה" הוא שלב-ביניים: התקבל אך קדם-הדפוס עדיין לא סימן
      return anySeen(p) ? 'approved' : 'seen';
    }
    return 'received';
  }
  function stageIndex(key){
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return i;
    return 0;
  }
  // האם מישהו בבית-הדפוס כבר סימן שראה (בעיתון המלא או באחת הריצות)
  function anySeen(p){
    if (!p) return false;
    if (p.shopSeenAt) return true;
    var parts = p.parts || {};
    for (var k in parts) if (parts[k] && parts[k].shopSeenAt) return true;
    return false;
  }

  /* ── 3. קבצים חדשים שטרם נצפו ──────────────────────────────────────────
     נספרים העיתון המלא וכל ריצה בנפרד — כך שהמספר אומר כמה פריטים ממתינים. */
  function newFiles(p){
    if (!p) return 0;
    var n = 0;
    if (p.approvedAt && !p.shopSeenAt && p.mode !== 'parts') n++;
    var parts = p.parts || {};
    for (var k in parts){ var pt = parts[k]; if (pt && pt.approvedAt && !pt.shopSeenAt) n++; }
    return n;
  }

  /* ── 4. עמודים חסרים ───────────────────────────────────────────────────
     הלקוח יכול לשלוח עיתון עם עמודים ריקים "להשלמה". הנתון נשמר, אבל היה
     קבור בשורת-ריצה — כאן מרכזים אותו לרמת-הגיליון ולרמת-הלקוח. */
  function pendingPages(p){
    if (!p) return [];
    var out = [];
    (p.pendingPages || []).forEach(function(x){ if (out.indexOf(x) < 0) out.push(x); });
    var parts = p.parts || {};
    for (var k in parts){
      var pt = parts[k]; if (!pt) continue;
      (pt.pendingPages || []).forEach(function(x){ if (out.indexOf(x) < 0) out.push(x); });
    }
    return out.sort(function(a,b){ return _i(a) - _i(b); });
  }

  /* ── סיכום לקוח אחד ────────────────────────────────────────────────────
     זו הרשומה שהמסך מצייר ממנה: מה חדש, מה חסר, ומה מצב הגיליון האחרון. */
  function customerSummary(name, proofs, opts){
    opts = opts || {};
    var list = (proofs || []).filter(Boolean);
    var nNew = 0, pend = [], active = 0, last = 0;
    list.forEach(function(p){
      nNew += newFiles(p);
      pendingPages(p).forEach(function(x){ if (pend.indexOf(x) < 0) pend.push(x); });
      if (!p.completedAt && !p.closedAt) active++;
      var t = _i(p.createdAt) || _i(p.approvedAt) || 0;
      if (t > last) last = t;
    });
    // הגיליון "הפעיל" — האחרון שלא הושלם; אחרת האחרון בכלל
    var live = null;
    list.forEach(function(p){
      if (p.completedAt || p.closedAt) return;
      var t = _i(p.createdAt) || _i(p.approvedAt) || 0;
      if (!live || t > (_i(live.createdAt) || _i(live.approvedAt) || 0)) live = p;
    });
    return {
      customer: _s(name),
      day: opts.day || '',
      total: list.length,
      active: active,
      newFiles: nNew,
      pendingPages: pend.sort(function(a,b){ return _i(a) - _i(b); }),
      lastAt: last,
      stage: live ? stageOf(live, { hasActiveCard: !!opts.hasActiveCard }) : (list.length ? 'done' : 'received'),
      hasActiveCard: !!opts.hasActiveCard
    };
  }

  /* ── 5. מי אמור לשלוח היום ולא שלח ─────────────────────────────────────
     "שלח היום" = יש גיליון עם approvedAt/createdAt מהיום. הפער הזה הוא מה
     שגורם לרדוף אחרי לקוחות בסוף היום, ולכן הוא צריך להיות בולט. */
  function sentOn(p, dayStartMs){
    var t = _i(p && (p.approvedAt || p.createdAt));
    return t >= dayStartMs && t < dayStartMs + DAY_MS;
  }
  function startOfDay(ms){ var d = new Date(_i(ms)); d.setHours(0,0,0,0); return d.getTime(); }
  function dayNameOf(ms){ return DAYS[new Date(_i(ms)).getDay()]; }

  /* מחזיר { due, sent, missing } לפי היום הנוכחי.
     customers = [{ name, day, proofs:[...] }] */
  function todayBoard(customers, now){
    var start = startOfDay(now), today = dayNameOf(now);
    var due = [], sent = [], missing = [];
    (customers || []).forEach(function(c){
      if (!c || !c.name) return;
      var isDue = (_s(c.day) === today);
      var didSend = (c.proofs || []).some(function(p){ return sentOn(p, start); });
      if (isDue) due.push(c.name);
      if (didSend) sent.push(c.name);
      if (isDue && !didSend) missing.push(c.name);
    });
    return { today: today, due: due, sent: sent, missing: missing };
  }

  return { DAYS: DAYS, STAGES: STAGES,
           normName: normName, nameInside: nameInside, customerDay: customerDay,
           stageOf: stageOf, stageIndex: stageIndex, anySeen: anySeen,
           newFiles: newFiles, pendingPages: pendingPages,
           customerSummary: customerSummary,
           sentOn: sentOn, startOfDay: startOfDay, dayNameOf: dayNameOf, todayBoard: todayBoard };
});
