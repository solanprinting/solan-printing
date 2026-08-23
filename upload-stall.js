/* ═══════════════════════════════════════════════════════════════════════════
   upload-stall.js — שומר-תקיעה להעלאות-XHR. מימוש **אחד** לכל המסכים.

   ⚠️ **תקלת-ייצור 22/08/2026** (דיווח-בעלים: "הודעת שגיאה כשההעלאה מגיעה
   ל-98 אחוז"). הגלאי המקורי, שנכתב inline בפורטל, התאפס **רק** מאירוע
   ‎xhr.upload.progress‎ — והאירוע הזה מדווח בייטים שנמסרו לחוצץ-הסוקט של
   מערכת-ההפעלה, **לא** בייטים שהשרת קיבל. על קובץ גדול החוצץ נמלא הרבה
   לפני שהרשת ניקזה אותו: המד קופץ לסוף, ואז יש שקט ארוך **וצפוי לגמרי**
   עד תשובת-השרת. הגלאי פירש את השקט כתקיעה וביטל העלאה בריאה.

   מדידה על גדלי-הייצור האמיתיים (ריצה בודדת = 101,451,682 בתים): בקו
   5Mbps הניקוז לוקח 162 שנ׳, כלומר ‎~157‎ שנ׳ בלי אף אירוע — מול חלון של 90.
   ‏(המספר "98%" עצמו הוא סימן-המים של בריכת-ההעלאה: קובץ יחיד נעצר על 99%,
   שישה קבצים בבריכה של 4 על 98%.)

   ⚠️ **ולמה מודול ולא עוד עותק:** ארבעה מסכים מעלים קבצים, ורק אחד קיבל
   גלאי. השלושה האחרים (‏proof-client · proof-admin · page-editor) נתקעים
   **לנצח** על כיסוי-מסך מלא, בלי הודעה, בלי ביטול, ו-‎beforeunload‎ אף חוסם
   סגירת-לשונית. תיקון נקודתי במסך אחד הוא בדיוק מה שהוליד את התקלה הזו —
   ‏CLAUDE.md §2: ההכללה היא החלק החשוב.

   שימוש:
     var st = UploadStall.arm(xhr, bytesLength, function(err){ reject(err); });
     ... xhr.onload = function(){ st.clear(); ... };

   ⚠️ המודול מאזין דרך ‎addEventListener‎ ולא דורס ‎onprogress‎/‎onload‎ של
   הקורא — מסך שמצייר מד-התקדמות ממשיך לעבוד בדיוק כמו קודם.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UploadStall = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* בזמן שהבייטים זזים: 90 שנ׳ בלי התקדמות זו באמת תקיעה. זה מה שהגלאי
     נועד לתפוס מלכתחילה — רשת-מסוננת שמפסיקה לקרוא באמצע. */
  var SEND_STALL_MS = 90000;
  /* אחרי שכל הבייטים נמסרו: שקט הוא **המצב הנורמלי**. החלון נגזר מגודל
     הקובץ בהנחת קו איטי מאוד (200KB/שנ׳ ≈ 1.6Mbps), עם רצפה של 10 דקות.
     עדיין נכשל-סגור — רק לא על מה שתקין. */
  var RESP_FLOOR_MS = 600000;
  var SLOW_BYTES_PER_SEC = 200 * 1024;

  var MSG_SEND = 'ההעלאה נתקעה (הרשת הפסיקה להגיב) — נסו שוב';
  /* ⚠️ הנוסח כאן **אינו** מאשים את הרשת: הבייטים כבר יצאו, וייתכן מאוד
     שהקובץ הגיע. שליחה חוזרת עיוורת תיצור כפילות בבית-הדפוס. */
  var MSG_RESP = 'הקובץ נשלח אבל בית-הדפוס לא אישר קליטה — בדקו במסך העבודות לפני שליחה חוזרת';

  function lenOf(bytes) {
    if (bytes == null) return 0;
    if (typeof bytes === 'number') return isFinite(bytes) && bytes > 0 ? bytes : 0;
    var n = (bytes.byteLength != null) ? bytes.byteLength
          : (bytes.size != null) ? bytes.size
          : (bytes.length != null) ? bytes.length : 0;
    n = Number(n);
    return (isFinite(n) && n > 0) ? n : 0;
  }

  function responseMsFor(bytes) {
    var n = lenOf(bytes);
    return Math.max(RESP_FLOOR_MS, Math.round(n / SLOW_BYTES_PER_SEC * 1000));
  }

  function failure(message) {
    var e = new Error(message);
    e.code = 0;
    e.stalled = true;      // הקורא מזהה לפי זה שאין טעם לשדר שוב ושוב
    return e;
  }

  /* ⚠️ ‎onFail‎ נקרא **פעם אחת לכל היותר**, וגם ‎clear‎ אחריו אינו מחייה.
     שומר ששולח שתי דחיות מייצר "הצליח" ו"נכשל" על אותה העלאה. */
  function arm(xhr, bytes, onFail, opts) {
    var o = opts || {};
    var sendMs = Number(o.sendMs) > 0 ? Number(o.sendMs) : SEND_STALL_MS;
    var respMs = Number(o.responseMs) > 0 ? Number(o.responseMs) : responseMsFor(bytes);
    var setT = o.setTimeout || setTimeout;
    var clrT = o.clearTimeout || clearTimeout;

    var timer = null, done = false, sent = false;

    function fire(message) {
      if (done) return;
      done = true;
      try { xhr.abort(); } catch (e) { /* כבר סגור — אין מה לבטל */ }
      try { onFail(failure(message)); } catch (e) {
        try { console.error('UploadStall: onFail זרק', e); } catch (_) {}
      }
    }
    function armWith(ms, message) {
      if (done) return;
      clrT(timer);
      timer = setT(function () { fire(message); }, ms);
    }
    function clear() { done = true; clrT(timer); timer = null; }

    /* ⚠️ ‎addEventListener‎ ולא השמה — כדי לא לדרוס מד-התקדמות של הקורא. */
    try {
      xhr.upload.addEventListener('progress', function () {
        if (!sent) armWith(sendMs, MSG_SEND);
      });
      /* כל הבייטים נמסרו. מכאן ואילך שקט אינו תקלה. */
      xhr.upload.addEventListener('load', function () {
        sent = true;
        armWith(respMs, MSG_RESP);
      });
    } catch (e) {
      /* דפדפן בלי upload-events — עדיף בלי שומר מאשר להפיל את ההעלאה. */
      try { console.error('UploadStall: אין אירועי-העלאה, השומר לא הותקן', e); } catch (_) {}
      return { clear: function () {}, armSend: function () {} };
    }

    /* חימוש ראשוני: גם שליחה שמתה לפני האירוע הראשון תיתפס. */
    armWith(sendMs, MSG_SEND);

    return {
      clear: clear,
      /* לשימוש הקורא ברגע ‎send()‎ — מאתחל את חלון-השליחה. */
      armSend: function () { if (!sent) armWith(sendMs, MSG_SEND); },
      responseMs: respMs,
    };
  }

  return {
    arm: arm,
    responseMsFor: responseMsFor,
    lenOf: lenOf,
    SEND_STALL_MS: SEND_STALL_MS,
    RESP_FLOOR_MS: RESP_FLOOR_MS,
    MSG_SEND: MSG_SEND,
    MSG_RESP: MSG_RESP,
  };
});
