/* ═══════════════════════════════════════════════════════════════════════════
   portal-chat.js — שיחה בין בית-הדפוס ללקוח, בתוך הפורטל שלו.

   ⚠️ **מה זה בא לפתור (בקשת-בעלים 11/08/2026).** עד היום הערוץ היחיד לכיוון
   הלקוח היה "דרישה" (‏customerNotices) — הודעה חד-כיוונית שהלקוח יכול רק
   לבצע. אין דרך לשאול "העמוד השני בגיליון הזה — זה נכון?" ולקבל תשובה,
   ולכן הכל עובר לטלפון ונעלם. כאן שיחה דו-כיוונית, צמודה לפורטל של אותו
   לקוח, ששני הצדדים רואים.

   ⚠️ **שיחה אינה דרישה, ולכן היא לא מחליפה אותה.** דרישה היא פעולה
   שממתינה לביצוע ונסגרת; הודעה היא טקסט. ערבוב השניים היה גורם לדרישות
   להיקבר בתוך שיחה — ובדיוק ההפך ממה שנדרש. הודעה **יכולה** לפתוח דרישה
   (‎asNotice‎), אבל זו פעולה מפורשת.

   ⚠️ **"הם יראו אותם באותו הרגע" — במסגרת מה שהמערכת יודעת לעשות.** אין
   כאן חיבור-חי; שני הצדדים מושכים כל כמה שניות בזמן שהמסך פתוח. ההפרש
   נמדד בשניות, לא ברענון-ידני. ‎POLL_MS‎ הוא המספר היחיד שקובע.

   ⚠️ **צד אחד לא מוחק לשני.** אין מחיקת-הודעות: היסטוריית-שיחה שאפשר
   לשנות אינה ראיה, ובדיוק במקרה של מחלוקת על מה נאמר היא נדרשת.

   הרצת הבדיקות: node portal-chat-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PortalChat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SHOP = 'shop', CUSTOMER = 'customer';
  var MAX_LEN = 2000;          /* הודעה ארוכה מזה היא מסמך, לא הודעה */
  var POLL_MS = 7000;          /* קצב-המשיכה בזמן שהמסך פתוח */
  var KEEP = 300;              /* כמה הודעות נטענות לתצוגה */

  var str = function (v) { return String(v == null ? '' : v); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };

  function chatPath(slug) { return 'portalChat/' + str(slug).trim(); }
  /* ⚠️ חותמת-הצפייה של כל צד בנפרד. שדה משותף היה גורם לצד אחד לסמן
     "נקרא" בשם השני — ואז הודעה נעלמת בלי שאיש ראה אותה. */
  function seenPath(slug, side) {
    return chatPath(slug) + '/_seen/' + (side === SHOP ? SHOP : CUSTOMER);
  }

  /* ⚠️ מפתח לפי-זמן: ‏RTDB ממיין מפתחות כמחרוזות, ולכן הסדר-הכרונולוגי
     נשמר בלי מיון נוסף. הזנב האקראי מונע דריסה כששני צדדים כותבים
     באותה מילישנייה. */
  function msgId(at, rnd) {
    var t = String(num(at)).padStart(14, '0');
    var r = str(rnd) || Math.random().toString(36).slice(2, 7);
    return 'm' + t + '_' + r;
  }

  /* ⚠️ הטקסט נבדק **לפני** השליחה ולא אחריה: הודעה ריקה שנשלחת מייצרת
     שורה ריקה בשיחה של הלקוח, והוא אינו יודע אם משהו נמחק. */
  function validate(text) {
    var t = str(text).replace(/\s+$/, '').replace(/^\s+/, '');
    if (!t) return { ok: false, text: '', message: 'אין מה לשלוח — ההודעה ריקה.' };
    if (t.length > MAX_LEN)
      return { ok: false, text: t, message: 'ההודעה ארוכה מדי (' + t.length + ' תווים, המקסימום ' + MAX_LEN + ').' };
    return { ok: true, text: t, message: '' };
  }

  function build(o) {
    o = o || {};
    var side = (o.side === SHOP) ? SHOP : CUSTOMER;
    var m = { side: side, text: str(o.text), by: str(o.by), at: num(o.at) };
    /* ⚠️ קובץ מצורף (21/08/2026) — רשימת-שדות סגורה, ראה chat-files.js */
    if (str(o.fileUrl)) {
      m.fileUrl = str(o.fileUrl); m.fileName = str(o.fileName).slice(0, 120);
      m.fileType = str(o.fileType); m.fileSize = num(o.fileSize);
    }
    return m;
  }

  /* ── סגירת שיחה ─────────────────────────────────────────────────────────
     ⚠️ **בקשת-בעלים 11/08/2026:** "שיחה שהסתיימה — הדפוס יוכל לסגור אותה,
     והיא תוצג בהיסטוריית-שיחות, כדי שלא תופיע כל השיחה מגיליונות קודמים
     במסך הראשי." שיחה שמצטברת שנה אחורה הופכת את התיבה לארכיון: מה
     שרלוונטי לגיליון של היום נבלע בין עשרות הודעות ישנות.

     ⚠️ **סגירה אינה מחיקה.** ההודעות נשארות במקומן, ורק **נחתכות** לפי
     חותמת-הסגירה. היסטוריית-שיחה שאפשר למחוק אינה ראיה — וזו בדיוק
     הסיבה שהודעות הן append-only מלכתחילה.

     ⚠️ **רק בית-הדפוס סוגר.** הלקוח באמצע משפט אינו מי שמחליט שהנושא
     נסגר, ולקוח שסוגר שיחה מעלים מבית-הדפוס פנייה פתוחה. */
  function closePath(slug) { return chatPath(slug) + '/_closed'; }
  function closeId(at, rnd) {
    var t = String(num(at)).padStart(14, '0');
    return 'c' + t + '_' + (str(rnd) || Math.random().toString(36).slice(2, 6));
  }
  function closeMark(o) {
    o = o || {};
    return { at: num(o.at), by: str(o.by) || 'בית-הדפוס', note: str(o.note) };
  }
  /* רשימת הסגירות, ישן→חדש. */
  function closes(obj) {
    var o = (obj && obj._closed && typeof obj._closed === 'object') ? obj._closed : {};
    return Object.keys(o).map(function (k) {
      var c = o[k] || {};
      return { _id: k, at: num(c.at), by: str(c.by), note: str(c.note) };
    }).filter(function (c) { return c.at > 0; })
      .sort(function (a, b) { return a.at - b.at; });
  }
  function lastCloseAt(obj) {
    var c = closes(obj);
    return c.length ? c[c.length - 1].at : 0;
  }
  /* ⚠️ השיחה הפעילה = מה שנאמר **אחרי** הסגירה האחרונה. הודעה שנשלחה
     באותה מילישנייה של הסגירה שייכת לשיחה שנסגרה, לא לחדשה. */
  function activeOf(msgs, closedAt) {
    var c = num(closedAt);
    return (msgs || []).filter(function (m) { return num(m.at) > c; });
  }
  /* שיחות שנסגרו, חדשה→ישנה. כל אחת נחתכת בין הסגירה הקודמת לשלה. */
  function sessionsOf(msgs, obj) {
    var cs = closes(obj), all = msgs || [], out = [], prev = 0;
    cs.forEach(function (c) {
      var items = all.filter(function (m) { return num(m.at) > prev && num(m.at) <= c.at; });
      /* ⚠️ סגירה בלי הודעות אינה "שיחה": שתי לחיצות ברצף היו מייצרות
         שורות-ארכיון ריקות שמסתירות את האמיתיות. */
      if (items.length) out.push({ at: c.at, by: c.by, note: c.note, items: items });
      prev = c.at;
    });
    return out.reverse();
  }

  /* ⚠️ **‏RTDB מחזיר דחיית-הרשאה כגוף-JSON תקין**: ‎{"error":"Permission
     denied"}‎ עם קוד 401. ‏list() על גוף כזה מחזיר מערך ריק, והמסך אומר
     "אין עדיין הודעות" — כלומר חוק שחוסם נראה **בדיוק** כמו שיחה ריקה.
     זו הייתה התקלה שדווחה ב-11/08/2026: הודעות נשלחו ולא הגיעו, ובשני
     הצדדים המסך היה שקט לגמרי. מכאן והלאה דחייה נאמרת בקול. */
  function denied(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    return typeof body.error === 'string' && body.error.length > 0;
  }
  /* הודעת-כשל אחידה לשני הצדדים. ⚠️ אומרת מה לעשות, לא רק מה קרה. */
  function errorText(status, body) {
    var s = num(status);
    if (s === 401 || s === 403 || denied(body))
      return 'השיחה חסומה בהרשאות השרת (קוד ' + (s || 401) + '). ההודעות אינן נשלחות ואינן מתקבלות עד שחוקי-הגישה יעודכנו.';
    if (s >= 500) return 'השרת אינו זמין כרגע (קוד ' + s + '). נסו שוב בעוד רגע.';
    if (s) return 'השיחה נכשלה (קוד ' + s + ').';
    return 'אין חיבור לשרת — השיחה אינה מתעדכנת.';
  }

  /* ⚠️ ‎_seen‎ יושב באותו צומת כמו ההודעות, ולכן הוא **חייב** להיות מסונן
     החוצה. בלעדי הסינון הוא היה מופיע כהודעה ריקה בראש השיחה. */
  function list(obj) {
    var o = (obj && typeof obj === 'object') ? obj : {};
    var out = [];
    Object.keys(o).forEach(function (k) {
      if (k.charAt(0) === '_') return;                     /* _seen וכל מטא עתידי */
      var m = o[k];
      /* ⚠️ 21/08/2026: הודעה יכולה להיות קובץ-בלבד — טקסט ריק אינו פוסל
         כשיש fileUrl. הודעה בלי שניהם עדיין נזרקת (רשומה שבורה). */
      if (!m || typeof m !== 'object' || (!str(m.text) && !str(m.fileUrl))) return;
      var row = { _id: k, side: (m.side === SHOP) ? SHOP : CUSTOMER,
                  text: str(m.text), by: str(m.by), at: num(m.at) };
      if (str(m.fileUrl)) {
        row.fileUrl = str(m.fileUrl); row.fileName = str(m.fileName);
        row.fileType = str(m.fileType); row.fileSize = num(m.fileSize);
      }
      out.push(row);
    });
    out.sort(function (a, b) { return a.at - b.at || (a._id < b._id ? -1 : 1); });
    return out.length > KEEP ? out.slice(out.length - KEEP) : out;
  }

  /* כמה הודעות **מהצד השני** חדשות מחותמת-הצפייה שלי.
     ⚠️ הודעות שאני שלחתי אינן "לא-נקראו" אצלי — ספירתן הייתה מציגה
     תג-אדום על שיחה שאני עצמי הרגע כתבתי בה. */
  function unread(msgs, side, seenAt) {
    var me = (side === SHOP) ? SHOP : CUSTOMER, s = num(seenAt), n = 0;
    (msgs || []).forEach(function (m) {
      if (!m || m.side === me) return;
      if (num(m.at) > s) n++;
    });
    return n;
  }
  function lastMessage(msgs) {
    var a = msgs || [];
    return a.length ? a[a.length - 1] : null;
  }
  /* תקציר לשורת-הלקוח ברשימה: מי כתב ומה, בשורה אחת. */
  function preview(msgs, maxLen) {
    var m = lastMessage(msgs);
    if (!m) return '';
    var lim = num(maxLen) || 42;
    var t = str(m.text).replace(/\s+/g, ' ');
    if (!t && str(m.fileUrl)) t = '📎 ' + (str(m.fileName) || 'קובץ');   /* קובץ-בלבד (21/08) */
    if (t.length > lim) t = t.slice(0, lim - 1) + '…';
    return (m.side === SHOP ? 'אנחנו: ' : '') + t;
  }

  /* ── תצוגה ──────────────────────────────────────────────────────────────
     ⚠️ מפריד-תאריך ולא חותמת מלאה על כל הודעה: שיחה שכל שורה בה נושאת
     תאריך אינה נקראת כשיחה. */
  function timeLabel(at) {
    var d = new Date(num(at));
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function dayLabel(at, now) {
    var d = new Date(num(at)), n = new Date(num(now) || num(at));
    var same = function (a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    };
    if (same(d, n)) return 'היום';
    var y = new Date(n.getTime() - 86400000);
    if (same(d, y)) return 'אתמול';
    return d.toLocaleDateString('he-IL');
  }
  /* קבוצות לפי-יום, בסדר כרונולוגי, לתצוגה עם מפריד. */
  function groupByDay(msgs, now) {
    var out = [], cur = null;
    (msgs || []).forEach(function (m) {
      var lbl = dayLabel(m.at, now);
      if (!cur || cur.label !== lbl) { cur = { label: lbl, items: [] }; out.push(cur); }
      cur.items.push(m);
    });
    return out;
  }

  /* ── הודעה שהיא גם דרישה ────────────────────────────────────────────────
     ⚠️ הסיווג זהה לזה שבמסך-הדרישות, כי דרישה שנוצרת מכאן חייבת להתנהג
     בדיוק כמו דרישה שנוצרה שם — אחרת אותו טקסט פותח מסלול אחר. */
  function noticeType(text) {
    var t = str(text);
    if (/פרופר|אשר|אישור/.test(t)) return 'approve';
    if (/החלפ|החליף|עמוד/.test(t)) return 'replace';
    return 'note';
  }
  function asNotice(text, at) {
    var v = validate(text);
    if (!v.ok) return null;
    return { text: v.text, type: noticeType(v.text), at: num(at), done: false, source: 'chat' };
  }

  return {
    SHOP: SHOP, CUSTOMER: CUSTOMER, MAX_LEN: MAX_LEN, POLL_MS: POLL_MS, KEEP: KEEP,
    chatPath: chatPath, seenPath: seenPath, msgId: msgId,
    validate: validate, build: build, list: list,
    denied: denied, errorText: errorText,
    closePath: closePath, closeId: closeId, closeMark: closeMark,
    closes: closes, lastCloseAt: lastCloseAt, activeOf: activeOf, sessionsOf: sessionsOf,
    unread: unread, lastMessage: lastMessage, preview: preview,
    timeLabel: timeLabel, dayLabel: dayLabel, groupByDay: groupByDay,
    noticeType: noticeType, asNotice: asNotice
  };
});
