/* ═══════════════════════════════════════════════════════════════════════════
   proof-fetch.js — שליפת רשומת-עיתון לצפייה, ודיווח כן כשהיא נכשלת.

   ⚠️ **התקלה (10/08/2026, לקוח חסום).** לקוח פתח "דפדף בעיתון" מהפורטל
   וקיבל "עדיין לא הועלה/אושר קובץ לעיתון זה". הקובץ היה שם. מה שקרה:

     1. ‏proof-viewer קורא ‎/customerProofs/<id>.json‎ — קריאה **לפי מזהה**.
     2. החוקים החיים מתירים ללקוח לקרוא את הצומת **רק כשאילתה מסוננת**
        לפי שמו (‎orderBy="customer"&equalTo=<שלו>‎). קריאה לפי מזהה
        אינה שאילתה, ולכן היא נדחית ב-401.
     3. ‏RTDB מחזיר על 401 גוף JSON תקין: ‎{"error":"Permission denied"}‎.
        הבדיקה בקוד הייתה ‎if (!rec)‎ — ואובייקט-שגיאה הוא **אמיתי**,
        ולכן היא עברה, והזרימה נפלה לענף האחרון: "לא הועלה קובץ".

   ⚠️ כלומר שגיאת-הרשאה דווחה ללקוח כ"בית-הדפוס עוד לא העלה" — הודעה
   שמפנה אותו להמתין במקום להתלונן, ושולחת את בית-הדפוס לחפש קובץ חסר
   שלא היה חסר מעולם. זו בדיוק תבנית הכשל-השקט.

   ⚠️ **הפתרון עובד בתוך מודל-ההרשאות ואינו מרחיב אותו.** הלקוח נשלף
   דרך אותה שאילתה מסוננת שהפורטל כבר משתמש בה — ולכן אין נגיעה בחוקים,
   ובידוד-בין-לקוחות נשמר במלואו.

   הרצת הבדיקות: node proof-fetch-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProofFetch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ⚠️ ‏RTDB מחזיר גוף-JSON גם על 401. אובייקט עם ‎error‎ ובלי שדות-רשומה
     הוא **דחייה**, לא רשומה — וזו ההבחנה שכל התקלה נשענה עליה. */
  function isDenied(body) {
    if (!body || typeof body !== 'object') return false;
    if (Array.isArray(body)) return false;
    return typeof body.error === 'string' && body.error.length > 0;
  }

  /* רשומה שמישה = אובייקט שאינו דחייה. ‏null (צומת ריק) אינו דחייה —
     הוא "לא נמצא", וזה מסר אחר לגמרי למשתמש. */
  function isRecord(body) {
    return !!body && typeof body === 'object' && !Array.isArray(body) && !isDenied(body);
  }

  /* ── בחירת הרשומה מתוך תוצאת השאילתה המסוננת ──────────────────────────
     ⚠️ התוצאה היא מפה של ‎{id: record}‎ — כל העיתונים של אותו לקוח.
     בוחרים לפי מזהה בלבד. התאמה "בערך" (למשל הראשון ברשימה) הייתה
     מציגה ללקוח עיתון אחר שלו — טעות שקשה מאוד להבחין בה. */
  function pickById(queryResult, id) {
    if (!isRecord(queryResult)) return null;
    var key = String(id == null ? '' : id);
    if (!key) return null;
    var rec = queryResult[key];
    return isRecord(rec) ? rec : null;
  }

  /* ⚠️ יש בכלל תוכן להציג? אותו תנאי בדיוק כמו במסך — כאן כדי שאפשר
     יהיה לבדוק אותו, ובעיקר כדי להבדיל בין "אין קובץ" לבין "לא הורשית". */
  function hasContent(rec) {
    if (!isRecord(rec)) return false;
    if (rec.fileUrl) return true;
    return !!(rec.parts && typeof rec.parts === 'object' && Object.keys(rec.parts).length);
  }

  /* ── ההודעה ────────────────────────────────────────────────────────────
     ⚠️ **ארבעה מצבים שונים, ארבע הודעות שונות.** קודם כולם התמזגו ל"לא
     הועלה קובץ", וזו הסיבה שהתקלה הסתתרה: הלקוח המתין, ובית-הדפוס חיפש
     קובץ שלא היה חסר. */
  function diagnose(o) {
    var s = o || {};
    if (s.denied) {
      return s.hasIdentity
        ? { code: 'denied', msg: 'אין הרשאה לצפות בעיתון הזה מהחשבון הנוכחי. חזרו לפורטל ופתחו את העיתון משם.' }
        : { code: 'no_identity', msg: 'הקישור נפתח בלי חיבור לחשבון. חזרו לפורטל שלכם ולחצו על "דפדף בעיתון" משם.' };
    }
    if (s.record === null || s.record === undefined) {
      return { code: 'not_found', msg: 'העיתון לא נמצא או הוסר.' };
    }
    if (!hasContent(s.record)) {
      return { code: 'no_file', msg: 'עדיין לא הועלה/אושר קובץ לעיתון זה.' };
    }
    return { code: 'ok', msg: '' };
  }

  return { isDenied: isDenied, isRecord: isRecord, pickById: pickById,
           hasContent: hasContent, diagnose: diagnose };
});
