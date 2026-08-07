/* ═══════════════════════════════════════════════════════════════════════════
   queue-client.js — הדרך **היחידה** שבה המסך נוגע בתור המכונות.

   ⚠️ עד 03/08/2026 ארבעה מסלולים בדפדפן כתבו את `machineQueue` כמערך שלם
   ישירות ל-RTDB. הוכח דטרמיניסטית באמולטור שכתיבה כזו דורסת סימון-סיום
   שנכתב ע"י ה-Function: שלוש רשומות בייצור נשארו `done:false` בעוד
   `press4Jobs` אמר `completed`.

   ⚠️ מעכשיו: אפס כתיבות ישירות. הכול עובר ב-queueWrite/queuePurge, שם
   המיזוג נעשה **בשרת לפי qid**, וארבעת שדות-הסיום נשמרים מהמצב השרתי.

   ⚠️ **אין fire-and-forget.** כל קריאה מוחזרת כ-Promise שצריך להמתין לו,
   וכשל מוצג למשתמש. "נשמר" שמוצג לפני אישור השרת הוא בדיוק תבנית
   הכשל-השקט שחזרה כאן שלוש פעמים.

   ⚠️ ‏operationId לכל בקשה: ניסיון-חוזר אחרי timeout לא ייצור רשומת-
   ביקורת שנייה ולא יחיל את הפעולה פעמיים.

   הרצת הבדיקות: node queue-write-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ⚠️ רשימת-היתר זהה לזו שבשרת. השרת הוא מקור-האמת ודוחה כל שדה אחר;
     כאן רק מסננים כדי ששמירה תקינה לא תיפול על שדה-תצוגה פנימי.
     ⚠️ ארבעת שדות-הסיום **אינם** כאן, ולכן לא נשלחים לעולם. */
  /* ⚠️ ‏addedBy **הוסר** (03/08/2026): הוא שדה-ביקורת, והשרת גוזר אותו
     מה-staffId שבטוקן. שליחתו מכאן פירושה שכל דפדפן יכול לכתוב "מי
     הכניס את העבודה לתור" — והשרת דוחה אותו עכשיו במפורש. */
  var SEND_FIELDS = ['qid', 'cardId', 'runIdx', 'machine', 'order',
                     'estMinutes', 'printDurationSec', 'addedAt', 'label'];

  /* ⚠️ שדות שהשרת מחזיק. אם אי-פעם יישלחו — השרת דוחה במפורש.
     ⚠️ שלושת שדות-ההחזרה (reopened*) נוספו יחד עם queueReopen. הרשימה
     כאן היא **מראה** של SERVER_FIELDS ב-queue.js, וסנטינל בבדיקות מוודא
     ששתיהן זהות: רשימה שתיסחף הייתה מחזירה בדיוק את הבאג שהקובץ הזה נולד
     כדי למנוע. */
  var SERVER_FIELDS = ['done', 'doneAt', 'doneBy', 'doneByStaffId', 'doneByName',
                       'reopenedAt', 'reopenedByStaffId', 'reopenedByName'];

  /* ⚠️ שדות שמותר לרוקן ב-null מפורש. בלי הרשימה הזו "בטל זמן משוער"
     לא היה עובד: השמטה אינה מחיקה, והשרת שומר את הערך הישן. הרשימה
     זהה לזו שבשרת, והשרת דוחה null על כל שדה אחר. */
  var CLEARABLE_FIELDS = ['estMinutes', 'label', 'printDurationSec'];

  function entryFor(e) {
    var out = {};
    if (!e) return out;
    SEND_FIELDS.forEach(function (k) {
      var v = e[k];
      if (v === null && CLEARABLE_FIELDS.indexOf(k) >= 0) { out[k] = null; return; }
      if (v === undefined || v === null || v === '') return;
      out[k] = v;
    });
    return out;
  }

  /* ⚠️ מזהה-פעולה אקראי לכל בקשה. ‏Date.now() לבדו מתנגש כששתי פעולות
     נוצרות באותה מילישנייה — זה כבר קרה כאן עם qid. */
  function newOperationId() {
    var r = '';
    /* ⚠️ **הדגל, ולא אורך-המחרוזת.** הגרסה הראשונה בדקה
       ‏r.length < 12 כדי להחליט אם ליפול ל-Math.random — אבל Uint8Array
       נולד מאופס, ולכן בסביבה בלי crypto התקבלה מחרוזת של אפסים באורך 18,
       הבדיקה עברה, וכל המזהים יצאו **זהים**. נתפס בבדיקה: 200 קריאות
       החזירו 2 ערכים. מזהה-פעולה שאינו ייחודי הופך את האידמפוטנטיות
       למלכודת — הפעולה השנייה הייתה מזוהה כחזרה על הראשונה ונבלעת. */
    var filled = false;
    try {
      var c = (typeof root !== 'undefined' && root.crypto) ||
              (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
      if (c && c.getRandomValues) {
        var b = new Uint8Array(9);
        c.getRandomValues(b);
        for (var i = 0; i < b.length; i++) r += ('0' + b[i].toString(16)).slice(-2);
        filled = true;
      }
    } catch (e) { filled = false; }
    if (!filled) {
      r = String(Math.random()).slice(2) + String(Math.random()).slice(2) + String(Math.random()).slice(2);
    }
    return 'op_' + Date.now().toString(36) + '_' + r.slice(0, 20);
  }

  root.QueueClient = {
    SEND_FIELDS: SEND_FIELDS,
    SERVER_FIELDS: SERVER_FIELDS,
    CLEARABLE_FIELDS: CLEARABLE_FIELDS,
    entryFor: entryFor,
    newOperationId: newOperationId,
    /* ⚠️ ההמרה טהורה ונבדקת ב-Node; הקריאה לרשת יושבת בעטיפה למטה. */
    payloadFor: function (entries) {
      return (entries || []).filter(Boolean).map(entryFor);
    },
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));

/* ── העטיפה שנוגעת ברשת ─────────────────────────────────────────────────────
   ⚠️ מחוץ ל-IIFE הטהור ורק בדפדפן. */
if (typeof window !== 'undefined') {
  window.QueueClient.FN = 'https://europe-west1-solan-printing.cloudfunctions.net/';

  window.QueueClient.call = async function (fn, body) {
    if (!window._fbAuthToken) throw new Error('אין חיבור מאומת');
    var t = await window._fbAuthToken();
    var r = await fetch(window.QueueClient.FN + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
      body: JSON.stringify({ data: body }),
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var e = new Error((j.error && j.error.message) || 'הפעולה נכשלה');
      e.code = (j.error && j.error.details && j.error.details.code) || '';
      e.status = (j.error && j.error.status) || '';
      throw e;
    }
    return j.result;
  };

  /* הוספה/עדכון. ⚠️ מחזיר Promise — **חובה להמתין לו**. */
  window.QueueClient.write = function (entries) {
    var ups = window.QueueClient.payloadFor(entries);
    if (!ups.length) return Promise.resolve({ ok: true, added: 0, updated: 0 });
    return window.QueueClient.call('queueWrite',
      { upserts: ups, operationId: window.QueueClient.newOperationId() });
  };

  /* ⚠️ מחיקה — פעולה נפרדת ומפורשת, עם סיבה. אינה נוסעת יחד עם שמירה. */
  window.QueueClient.purge = function (qids, reason) {
    var list = (qids || []).map(String).filter(Boolean);
    if (!list.length) return Promise.resolve({ ok: true, removed: 0 });
    return window.QueueClient.call('queuePurge',
      { removals: list, reason: String(reason || ''), operationId: window.QueueClient.newOperationId() });
  };
}
