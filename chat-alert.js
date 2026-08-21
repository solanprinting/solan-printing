/* ═══════════════════════════════════════════════════════════════════════════
   chat-alert.js — מי צריך לדעת שהגיעה הודעה, ומה להגיד לו.

   ⚠️ **מה זה בא לפתור (בקשת-בעלים 12/08/2026).** השיחה עבדה, אבל בשקט:
   ההודעה נכנסה לתיבה ואיש לא ידע. בצד-הדפוס הייתה נקודה פסיבית ‎💬 N‎
   שמופיעה **רק** במסך לקוחות-העיתונים, ובצד-הלקוח לא היה כלום. מי שלא
   הסתכל בדיוק על המסך הנכון — פספס.

   ⚠️ **למה לא להישען על ‎_seen‎ שכבר קיים.** ‎_seen‎ הוא **לכל צד**, לא לכל
   משתמש: ברגע שקדם-דפוס פותח שיחה, ‎_seen.shop‎ קופץ — וההתראה לא תקפוץ
   יותר לאיש מהצוות, גם למי שלא ראה מעולם. ובצד-הלקוח ‎_seen.customer‎
   מתעדכן בכל משיכה, גם כשהלקוח לא הסתכל. לכן ההתראה נשענת על **סימון
   מקומי לכל דפדפן** (‎mark‎), שחי לצד ‎_seen‎ ואינו מחליף אותו: ‎_seen‎
   ממשיך להזין את התג המשותף, ו-‎mark‎ מזין את הקפיצה האישית.

   ⚠️ **טעינה ראשונה אינה מתריעה.** בלי זה, עובד שפותח את המסך בבוקר היה
   מקבל קפיצה על כל היסטוריית-השיחות. ‎scan‎ מחזיר ‎baseline‎ בנפרד
   מ-‎alerts‎: הראשון נשמר בשקט, רק השני קופץ.

   ⚠️ **מי מקבל — לפי התפקיד שבטוקן.** ‎admin‎ ו-‎prepress‎. זה **לא** גבול-
   אבטחה (הגבול הוא ‎CHAT_STAFF‎ בחוקים, ראה build-transition-rules.js §1א2)
   אלא מיקוד: ‎worker‎ ממילא אינו מורשה לקרוא את השיחות, ו-‎office‎ מורשה
   אך אינו איש-הקשר של הגיליון. להוסיף ‎office‎ = לשנות כאן בלבד.

   הרצת הבדיקות: node chat-alert-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChatAlert = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SHOP = 'shop', CUSTOMER = 'customer';
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var str = function (v) { return String(v == null ? '' : v); };

  /* ⚠️ הרשימה תואמת את מה שהחוקים בכלל מתירים לקרוא — אין טעם להתריע
     לתפקיד שיקבל 401 כשינסה לפתוח את השיחה. */
  var ALERT_ROLES = { admin: 1, prepress: 1 };
  function shouldAlertRole(role) { return !!ALERT_ROLES[str(role)]; }

  /* מפתח-הסימון המקומי. ⚠️ נפרד לכל צד **ולכל טווח**: מסך-העבודה ומסך
     לקוחות-העיתונים הם שני צרכנים באותו דפדפן, ואם יחלקו מפתח אחד —
     הראשון שסורק "יבלע" את ההתראה של השני. */
  function markKey(side, scope) {
    return 'solanChatMark_' + (side === SHOP ? SHOP : CUSTOMER) + (scope ? '_' + str(scope) : '');
  }

  function otherSide(mySide) { return mySide === SHOP ? CUSTOMER : SHOP; }

  /* החותמת הגבוהה ביותר ברשימה — הסימון החדש אחרי שהתרענו. */
  function highWater(msgs) {
    var hi = 0;
    (msgs || []).forEach(function (m) { if (m && num(m.at) > hi) hi = num(m.at); });
    return hi;
  }

  /* הודעות **מהצד השני** שחדשות מהסימון. ⚠️ הודעות שאני שלחתי אינן
     התראה אצלי — אחרת כל שליחה הייתה מקפיצה לי הודעה על עצמי. */
  /* ⚠️ 21/08/2026: הסינון היה ‎&& str(m.text)‎, ולכן **הודעת-קובץ בלי טקסט
     לא הפיקה שום התראה** — לא צליל, לא הקפצה, לא טוסט — בזמן ש-list,
     ‎preview ו-unread כן ראו אותה (התג הראה 1). שני מסלולי-השליחה מתירים
     קובץ-בלי-טקסט במפורש, ולכן לקוח שהעלה עמוד-מתוקן לשיחה לא הגיע לאיש
     בבית-הדפוס. הודעה היא הודעה — טקסט **או** קובץ. */
  function hasBody(m) { return !!(str(m.text) || str(m.fileUrl)); }

  function pending(msgs, mySide, mark) {
    var other = otherSide(mySide), m0 = num(mark);
    return (msgs || []).filter(function (m) {
      return m && m.side === other && num(m.at) > m0 && hasBody(m);
    });
  }

  /* ── סריקת כל השיחות (צד-הדפוס) ───────────────────────────────────────────
     ‎allChats‎ = ‎{ slug: node }‎ · ‎marks‎ = ‎{ slug: at }‎ מקומי ·
     ‎parse(node)‎ = ‎PortalChat.list‎ (מוזרק — כדי שהמודול יישאר טהור).

     ⚠️ ‏slug שאין לו ‎mark‎ הוא **חדש לדפדפן הזה**, לא "הכול לא-נקרא":
     הוא נכנס ל-‎baseline‎ ונשמר בלי קפיצה. */
  function scanShop(allChats, marks, parse) {
    var all = (allChats && typeof allChats === 'object') ? allChats : {};
    var mk = marks || {};
    var p = typeof parse === 'function' ? parse : function (n) { return (n && n.msgs) || []; };
    var alerts = [], baseline = [], nextMarks = {}, total = 0;
    /* ⚠️ 21/08/2026 — **ההודעה הפותחת של כל שיחה חדשה נבלעה.** צומת
       ‎portalChat/<slug>‎ נוצר רק כשנכתבת ההודעה הראשונה, ולכן slug עם
       הודעה אחת נראה בדיוק כמו "slug חדש לדפדפן" ונכנס ל-baseline בשקט.
       ההבחנה הנכונה היא **סריקה-ראשונה-אי-פעם** מול שיחה-חדשה: אם כבר
       יש סימונים, ‏slug שלא היה קודם הוא שיחה שנפתחה עכשיו — ומתריעים.
       ‏kiosk שמוחק localStorage חוזר ל"סריקה ראשונה", וזה מכוון. */
    var firstScanEver = Object.keys(mk).length === 0;
    Object.keys(all).forEach(function (slug) {
      if (!slug || slug.charAt(0) === '_') return;
      var msgs = p(all[slug]) || [];
      var hi = highWater(msgs);
      nextMarks[slug] = hi;
      var known = Object.prototype.hasOwnProperty.call(mk, slug);
      if (!known && firstScanEver) { if (hi) baseline.push({ slug: slug, at: hi }); return; }
      var items = pending(msgs, SHOP, known ? mk[slug] : 0);
      if (!items.length) return;
      total += items.length;
      alerts.push({ slug: slug, count: items.length, last: items[items.length - 1], at: hi });
    });
    /* החדש קודם — אם קופצות כמה, זו שראויה לכותרת היא האחרונה שנכתבה. */
    alerts.sort(function (a, b) { return b.at - a.at; });
    return { alerts: alerts, baseline: baseline, nextMarks: nextMarks, total: total };
  }

  /* ── נוסח ההתראה ──────────────────────────────────────────────────────────
     ⚠️ שם-הלקוח בכותרת ולא בגוף: בהתראת-מערכת הגוף נחתך, והדבר היחיד
     שקובע אם שווה לעזוב את מה שעושים הוא **מי** כתב. */
  function trim(text, lim) {
    var t = str(text).replace(/\s+/g, ' ').trim(), n = num(lim) || 90;
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }
  /* שם-לקוח לתצוגה מתוך slug (‎לקוח_א‎ → ‎לקוח א‎). ⚠️ תצוגה בלבד. */
  function nameOf(slug) { return str(slug).replace(/_/g, ' ').trim(); }

  function shopAlertText(scan) {
    var a = (scan && scan.alerts) || [];
    if (!a.length) return null;
    if (a.length === 1) {
      return { title: '💬 הודעה חדשה מ' + nameOf(a[0].slug),
               body: trim(a[0].last && a[0].last.text),
               count: a[0].count, slug: a[0].slug };
    }
    var total = (scan && scan.total) || 0;
    return { title: '💬 ' + total + ' הודעות חדשות מלקוחות',
             body: a.map(function (x) { return nameOf(x.slug); }).join(' · '),
             count: total, slug: '' };
  }

  function customerAlertText(items) {
    var a = items || [];
    if (!a.length) return null;
    return { title: '💬 הודעה חדשה מבית הדפוס',
             body: trim(a[a.length - 1].text),
             count: a.length, slug: '' };
  }

  /* ── מונה בכותרת-הלשונית ──────────────────────────────────────────────────
     ⚠️ הדרך היחידה להגיע ללקוח שהלשונית שלו ברקע **בלי** לבקש ממנו
     הרשאת-התראות — בקשה כזו במסך של לקוח חיצוני היא חיכוך, לא שירות.
     ⚠️ חייבת להיות idempotent: קריאה חוזרת לא תיצור ‎(1) (1) …‎. */
  var TITLE_RE = /^\(\d+\)\s*/;
  function baseTitle(title) { return str(title).replace(TITLE_RE, ''); }
  function titleWith(title, n) {
    var b = baseTitle(title), c = num(n);
    return c > 0 ? '(' + c + ') ' + b : b;
  }

  /* ── שכבת-אפקטים ──────────────────────────────────────────────────────────
     ⚠️ **כל מה שמתחת אינו טהור** ולכן מופרד בבירור: הוא נוגע ב-Notification
     וב-AudioContext. הוא קיים כאן ולא בקובצי-ה-HTML כי אחרת אותו קוד היה
     משוכפל בשני מסכים בני עשרות-אלפי שורות, ונסחף.
     ⚠️ הכול מוגן ב-typeof: ב-node (בדיקות) ובדפדפן ישן זה no-op שקט
     שמחזיר false, ולא חריגה שמפילה את הסורק. */
  function canNotify() {
    try {
      return typeof Notification !== 'undefined' && Notification.permission === 'granted';
    } catch (e) { return false; }
  }
  /* מצב-ההרשאה לתצוגה: ‎granted‎ · ‎denied‎ · ‎default‎ · ‎unsupported‎. */
  function notifyState() {
    try {
      if (typeof Notification === 'undefined') return 'unsupported';
      return str(Notification.permission) || 'default';
    } catch (e) { return 'unsupported'; }
  }
  /* ⚠️ ‎tag‎ מאחד התראות חוזרות לאותה שיחה במקום לערום עשר. */
  function notify(o) {
    o = o || {};
    if (!canNotify()) return false;
    try {
      var n = new Notification(str(o.title), {
        body: str(o.body), tag: str(o.tag) || 'solan-chat', icon: 'icon-192.png', renotify: true
      });
      if (typeof o.onclick === 'function') n.onclick = function () {
        try { if (typeof window !== 'undefined') window.focus(); } catch (e) {}
        o.onclick(); try { n.close(); } catch (e) {}
      };
      return true;
    } catch (e) {
      /* ⚠️ נאמר ולא נבלע: התראה שלא נורתה היא בדיוק המצב שבו העובד
         חושב שאין הודעות. */
      try { console.error('התראת-מערכת נכשלה', e); } catch (e2) {}
      return false;
    }
  }
  /* צליל קצר. ⚠️ ‏WebAudio ולא קובץ-שמע: אין נכס חיצוני לטעון, ולכן
     גם באינטרנט מסונן זה עובד (§2). */
  function beep() {
    try {
      var AC = (typeof AudioContext !== 'undefined') ? AudioContext
             : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext : null;
      if (!AC) return false;
      var ctx = new AC();
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.34);
      osc.onended = function () { try { ctx.close(); } catch (e) {} };
      return true;
    } catch (e) { return false; }
  }

  return {
    canNotify: canNotify, notifyState: notifyState, notify: notify, beep: beep,
    SHOP: SHOP, CUSTOMER: CUSTOMER,
    ALERT_ROLES: ALERT_ROLES, shouldAlertRole: shouldAlertRole,
    markKey: markKey, otherSide: otherSide,
    highWater: highWater, pending: pending, scanShop: scanShop,
    trim: trim, nameOf: nameOf,
    shopAlertText: shopAlertText, customerAlertText: customerAlertText,
    baseTitle: baseTitle, titleWith: titleWith
  };
});
