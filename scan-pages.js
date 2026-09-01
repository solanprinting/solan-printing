/* ═══════════════════════════════════════════════════════════════════════════
   scan-pages.js — מה שהעובד רואה כשהוא סורק את ה-QR שעל כרטיס-העבודה.

   ⚠️ **למה מודול ולא קוד בכל מסך.** לעבודה יש **שני** מקורות שונים לגמרי,
   ולשניהם אותה תוצאה:
     · הגיעה דרך הפורטל → הקבצים ב-‎customerProofs‎, והתמונונות כבר מוכנות
       במטמון-העמודים. הסימון נעשה בפריסת-הריצה שב-‎proof-admin‎.
     · **הגיעה במייל** → קדם-הדפוס מצרף קובץ לכל ריצה על הכרטיס עצמו
       (‎📎 R1 · 📎 R2‎, ‎cardProofs/…‎). אין מטמון, והעמודים מרונדרים מה-PDF.
   מה שמשותף — מה נבחר, מה נשמר, ולאן — יושב **כאן בלבד**. היום נסגרו שלוש
   תקלות שכולן אותה צורה: מסלול שני שבנה לעצמו את מה שכבר היה קיים, ונבדל
   ממנו בשקט. [[solan-run-paper-default-bug]] · [[solan-autoqueue-path-coverage]]

   הרצת הבדיקות: node scan-pages-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScanPages = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var str = function (v) { return String(v == null ? '' : v).trim(); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };

  /* ── מה שקדם-הדפוס יכול לבחור ────────────────────────────────────────────
     ⚠️ "ראשון + אחרון" על ריצה בת עמוד אחד הוא **אותו עמוד פעמיים**, ולכן
     מוחזר אחד. שכפול היה מציג לעובד שני אריחים זהים ונראה כמו תקלה. */
  function firstLast(total) {
    var n = Math.max(0, Math.floor(num(total)));
    if (!n) return [];
    return n > 1 ? [0, n - 1] : [0];
  }
  function all(total) {
    var n = Math.max(0, Math.floor(num(total)));
    var out = [];
    for (var i = 0; i < n; i++) out.push(i);
    return out;
  }
  /* ⚠️ הסדר הוא **סדר-העמודים ולא סדר-הלחיצה**: הבקשה היא "בסדר רץ".
     כפילויות מוסרות — אותו עמוד פעמיים אינו בחירה, הוא תקלה. */
  function normalize(idx, total) {
    var n = Math.max(0, Math.floor(num(total)));
    var seen = {}, out = [];
    (Array.isArray(idx) ? idx : []).forEach(function (v) {
      var i = Math.floor(num(v));
      if (!(i >= 0) || i >= n || seen[i]) return;
      seen[i] = 1; out.push(i);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  /* ── הרשומה שנשמרת ────────────────────────────────────────────────────────
     ⚠️ **תמונות, לא כתובות.** הפיתוי היה לשמור את כתובת מטמון-העמודים —
     מחרוזת אחת במקום מגה-בייטים. אבל כתובת חושפת את **כל** הריצה גם
     כשקדם-הדפוס בחר שני עמודים, וכאן נחשף בדיוק מה שנבחר ותו לא.
     ⚠️ עמוד בלי תמונה **מפיל את הבנייה** ואינו נשמר חלקית: עמוד לבן בטלפון
     גרוע מעמוד חסר, כי העובד יחשוב שזה מה שהודפס. */
  function buildPayload(o) {
    var s = o || {};
    var pages = Array.isArray(s.pages) ? s.pages : [];
    if (!pages.length) throw new Error('לא נבחר אף עמוד');
    var out = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i] || {};
      var img = str(p.img);
      if (!img) throw new Error('עמוד ' + (i + 1) + ' לא נטען — לא נשמר דבר');
      out.push({ label: str(p.label) || ('עמוד ' + (i + 1)), img: img });
    }
    return {
      name: str(s.name) || 'ריצה',
      span: str(s.span),
      at: num(s.at) || 0,
      pages: out
    };
  }

  /* ── לאן זה נכתב ─────────────────────────────────────────────────────────
     ⚠️ ממופתח ב**מזהה-הכרטיס**, כי ה-QR מודפס על הכרטיס ונושא אותו בלבד.
     ⚠️ מפתח-הריצה מקודד: מזהה-ריצה מהפורטל אינו מובטח נקי מ-‎/‎ ו-‎.‎,
     ותו כזה בנתיב RTDB יוצר צומת במקום אחר לגמרי — בשקט. */
  function nodePath(cardId, runKey) {
    var c = str(cardId), k = str(runKey);
    if (!c) throw new Error('חסר מזהה-כרטיס');
    if (!k) throw new Error('חסר מזהה-ריצה');
    return 'scanCards/' + encodeURIComponent(c) + '/runs/' + encodeURIComponent(k);
  }

  /* ── תצוגה: הריצות בסדר שנשמרו ───────────────────────────────────────────
     ⚠️ הסדר לפי ‎at‎ (מתי סומנה) ולא לפי מפתח: מפתחות-הריצה הם מזהים
     אטומיים מהפורטל, ומיון-מחרוזות עליהם היה מסדר ריצות באקראי. */
  function runsOrdered(runsObj) {
    var m = (runsObj && typeof runsObj === 'object') ? runsObj : {};
    return Object.keys(m)
      .map(function (k) { return { key: k, run: m[k] || {} }; })
      .filter(function (x) { return Array.isArray(x.run.pages) && x.run.pages.length; })
      .sort(function (a, b) { return num(a.run.at) - num(b.run.at); });
  }

  /* גודל משוער של מה שיירד לטלפון — כדי שאפשר יהיה להזהיר לפני שמירה
     ולא אחרי שהעובד ממתין על סלולרי. */
  function payloadKB(payload) {
    var p = (payload && payload.pages) || [];
    var n = 0;
    for (var i = 0; i < p.length; i++) n += str(p[i].img).length;
    return Math.round(n * 0.75 / 1024);      // base64 → בייטים
  }

  return {
    firstLast: firstLast, all: all, normalize: normalize,
    buildPayload: buildPayload, nodePath: nodePath,
    runsOrdered: runsOrdered, payloadKB: payloadKB
  };
});
