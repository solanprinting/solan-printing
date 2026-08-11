/* ═══════════════════════════════════════════════════════════════════════════
   portal-return.js — חזרה לפורטל מיד אחרי שליחה, עם פרטי העבודה שנשלחה.

   ⚠️ **הבקשה (בעלים 11/08/2026):** "לאחר שלקוח מעלה ריצה או עיתון הוא ישר
   יעובר למסך הראשי של הפורטל שלו, ושם יופיעו לו כל הפרטים לגבי העבודה
   שלו." עד היום הלקוח נשאר על מסך-ההעלאה מול כפתור "סגור", ולא היה לו
   סימן שהעבודה **קיימת** אצלנו — רק שההעלאה לא נכשלה.

   ⚠️ **החזרה אינה מיידית-לגמרי, ובכוונה.** קפיצה ברגע שההעלאה נגמרה מוחקת
   מהמסך את אישור-השליחה לפני שנקרא, והלקוח מגיע לפורטל בלי לדעת אם נשלח
   משהו. לכן: אישור גלוי + מונה קצר + כפתור "עכשיו". ‎AUTO_MS‎ הוא המספר
   היחיד שקובע.

   ⚠️ **פרצת-הפניה שהייתה כאן.** ‎?back=‎ נלקח מהכתובת ונכתב ישירות ל-
   ‎location.href‎ בלי בדיקה. קישור-העלאה שנשלח ללקוח עם ‎back=https://‎
   של מישהו אחר היה מעביר אותו לשם מיד אחרי שהעלה קבצים — במסך שנראה
   כמו המשך התהליך. מכאן והלאה מותרים **נתיבים יחסיים בלבד**.

   הרצת הבדיקות: node portal-return-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PortalReturn = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AUTO_MS = 3500;

  var str = function (v) { return String(v == null ? '' : v).trim(); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };

  function param(search, key) {
    var m = new RegExp('[?&]' + key + '=([^&#]*)').exec(str(search));
    if (!m) return '';
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
  }

  /* ── יעד-החזרה ──────────────────────────────────────────────────────────
     ⚠️ **נתיב יחסי בלבד.** כל דבר שמתחיל בסכימה (‎http:‎ · ‎javascript:‎ ·
     ‎data:‎) או ב-‎//‎ הוא יעד חיצוני, ומכאן לא יוצאים לשום יעד חיצוני.
     ⚠️ גם ‎/‎ יחיד נדחה: הוא מוביל לשורש-הדומיין ולא לפורטל, ובאתר-פרויקט
     (GitHub Pages תחת תיקייה) זה מסך-שגיאה. */
  function safeBack(raw) {
    var b = str(raw);
    if (!b) return '';
    if (b.charAt(0) === '/' || b.charAt(0) === '\\') return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(b)) return '';          /* כל סכימה */
    if (b.indexOf('\\') >= 0) return '';                    /* \\host — נקרא כ-// בדפדפנים */
    /* ⚠️ תו-שליטה או רווח בתחילת הכתובת מנטרל את בדיקת-הסכימה בדפדפנים
       ותיקים ("\tjavascript:"), ולכן נדחה במלואו. */
    if (/[\x00-\x20]/.test(b)) return '';
    return b;
  }
  function backFromUrl(search) { return safeBack(param(search, 'back')); }

  /* ‎job=‎ הוא מה שאומר לפורטל **איזו** עבודה להבליט. */
  function returnUrl(back, proofId) {
    var b = safeBack(back);
    if (!b) return '';
    var id = str(proofId);
    if (!id) return b;
    if (new RegExp('[?&]job=').test(b)) return b;           /* כבר מסומן — לא מכפילים */
    return b + (b.indexOf('?') >= 0 ? '&' : '?') + 'job=' + encodeURIComponent(id);
  }
  function highlightId(search) { return param(search, 'job'); }

  /* תווית המונה. ⚠️ אומרת גם לאן וגם מתי — "מעביר…" בלי יעד נראה כמו תקלה. */
  function countdownLabel(msLeft) {
    var s = Math.max(1, Math.ceil(num(msLeft) / 1000));
    return 'עוברים לפורטל שלכם בעוד ' + s + '…';
  }

  /* ── פרטי העבודה שנשלחה, לתצוגה בפורטל ─────────────────────────────────
     ⚠️ נבנה **אך ורק משדות שכבר קיימים ברשומה** — אין כאן שדה חדש ואין
     סטטוס חדש. ריצה בלי קובץ אינה נספרת: היא טרם הועלתה. */
  function jobSummary(rec) {
    var r = rec || {};
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    var runs = Object.keys(parts).map(function (k) {
      var p = parts[k] || {};
      return { id: k, name: str(p.name) || 'ריצה', pages: num(p.pageCount),
               at: num(p.approvedAt), fileUrl: str(p.fileUrl), version: num(p.version) || 1 };
    }).filter(function (x) { return !!x.fileUrl; })
      .sort(function (a, b) { return a.at - b.at; });
    var pages = runs.length ? runs.reduce(function (s, x) { return s + x.pages; }, 0) : num(r.pageCount);
    var pend = [];
    (r.pendingPages || []).forEach(function (x) { if (pend.indexOf(x) < 0) pend.push(x); });
    runs.forEach(function (x) {
      ((parts[x.id] || {}).pendingPages || []).forEach(function (y) { if (pend.indexOf(y) < 0) pend.push(y); });
    });
    return {
      id: str(r.id || r._id), title: str(r.title) || 'העיתון', issue: str(r.issue),
      pages: pages, runs: runs, runCount: runs.length,
      bytes: num(r.fileSize), at: num(r.approvedAt) || num(r.createdAt),
      version: num(r.version) || 1,
      pendingPages: pend.sort(function (a, b) { return num(a) - num(b); }),
      received: !!(num(r.approvedAt) || runs.length),
      seenByShop: shopSeen(r) > 0
    };
  }
  /* "בית-הדפוס קיבל" — מספיק שריצה אחת סומנה. */
  function shopSeen(rec) {
    var r = rec || {}, m = num(r.shopSeenAt);
    var parts = (r.parts && typeof r.parts === 'object') ? r.parts : {};
    Object.keys(parts).forEach(function (k) {
      var t = num((parts[k] || {}).shopSeenAt); if (t > m) m = t;
    });
    return m;
  }

  /* ⚠️ **מה קורה עכשיו — בלשון שאינה מטילה על הלקוח פעולה שאינה שלו.**
     הניסוח "ממתין לאישור" גרם ללקוחות לחשוב שהם צריכים לאשר שוב, אחרי
     שכבר אישרו בהעלאה. מה שממתין הוא הבדיקה אצלנו. */
  function nextStep(sum) {
    var s = sum || {};
    if (s.pendingPages && s.pendingPages.length)
      return 'נשארו עמודים להשלמה: עמ׳ ' + s.pendingPages.join(', ') + '. אפשר להעלות אותם בהמשך — הגיליון ממתין להם.';
    if (s.seenByShop) return 'בית-הדפוס קיבל את הקבצים ועובר עליהם. אין צורך בפעולה מצדכם.';
    return 'הקבצים הגיעו לבית-הדפוס וממתינים לבדיקת קדם-דפוס. אין צורך בפעולה מצדכם — נעדכן אם יימצא משהו.';
  }

  return {
    AUTO_MS: AUTO_MS,
    safeBack: safeBack, backFromUrl: backFromUrl, returnUrl: returnUrl,
    highlightId: highlightId, countdownLabel: countdownLabel,
    jobSummary: jobSummary, shopSeen: shopSeen, nextStep: nextStep
  };
});
