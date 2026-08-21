/* ═══════════ נרמול Content-Type להעלאות ═══════════
   בקשת-בעלים 2026-07-31.

   ⚠️ הבעיה שזה סוגר: `_uploadProofOnce` שלח
       xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
   כלומר כשהדפדפן לא זיהה את סוג-הקובץ (קורה במכשירי אנדרואיד מסוימים,
   ובקבצים שהגיעו מאפליקציות-שיתוף), נשלח octet-stream. כל עוד חוקי-האחסון
   היו גורפים זה "עבד"; ברגע שהחוקים מפרטים סוגים, אותה העלאה נחסמת —
   והמשתמש לא היה מבין למה.

   הפתרון: לקבוע את הסוג בעצמנו ולא לסמוך על הדפדפן, ואם הסוג אינו נתמך —
   לחסום *לפני* ההעלאה עם הודעה ברורה, במקום להיכשל מול השרת.

   הסוגים הנתמכים נקבעו לפי מפקד מלא של 393 הקבצים בדלי + ה-input שבמסכים:
     application/pdf · image/jpeg · image/png · application/json (פנימי)
   סוג נוסף ייתמך רק אחרי שיוכח שכל שרשרת ההצגה/העיבוד/ההדפסה מכירה אותו. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UploadType = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PDF  = 'application/pdf';
  var JPEG = 'image/jpeg';
  var PNG  = 'image/png';
  var JSON_ = 'application/json';

  // סיומת → סוג. מקור-האמת כשהדפדפן לא יודע, וגם כשהוא טועה.
  var BY_EXT = { pdf: PDF, jpg: JPEG, jpeg: JPEG, jfif: JPEG, png: PNG, json: JSON_ };
  // סוגים שהדפדפן עשוי לשלוח ושהם למעשה אותו דבר
  var ALIAS = { 'image/jpg': JPEG, 'image/pjpeg': JPEG, 'image/x-png': PNG, 'text/json': JSON_ };

  function extOf(name){
    var m = /\.([A-Za-z0-9]+)\s*$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  /* מחזיר { ok, contentType, ext } או { ok:false, reason, message }.
     allowJson=true רק למסלולים פנימיים (pages-*.json, גיבוי) — לא לקובץ שמשתמש בוחר. */
  function normalize(file, opts){
    opts = opts || {};
    var name = (file && file.name) || '';
    var raw  = String((file && file.type) || '').toLowerCase().split(';')[0].trim();
    var ext  = extOf(name);

    // 1. הסיומת קודמת: היא מה שהמשתמש התכוון אליו, והדפדפן לפעמים שותק או טועה
    var byExt = BY_EXT[ext] || '';
    // 2. אחרת — הסוג שהדפדפן דיווח, אחרי נרמול כינויים
    var byType = ALIAS[raw] || ((raw === PDF || raw === JPEG || raw === PNG || raw === JSON_) ? raw : '');

    var chosen = byExt || byType;
    if (chosen === JSON_ && !opts.allowJson) chosen = '';

    if (!chosen) {
      return { ok: false, reason: ext || raw ? 'unsupported' : 'unknown',
               ext: ext, reported: raw,
               message: 'סוג הקובץ אינו נתמך' + (name ? ' (' + name + ')' : '') +
                        '. ניתן להעלות PDF, JPG או PNG בלבד.' };
    }
    return { ok: true, contentType: chosen, ext: ext, reported: raw };
  }

  // רשימת-הסוגים לחוקי-האחסון — כדי ששני הצדדים לא יתפצלו
  var ALLOWED_UPLOAD = [PDF, JPEG, PNG];
  var ALLOWED_INTERNAL = [PDF, JPEG, PNG, JSON_];

  /* ═══ תקרות-גודל ═══════════════════════════════════════════════════════
     ⚠️ **התקלה שזה סוגר (09/08/2026).** לקוח שלח עיתון של 48 עמודים במשקל
     210MB. תקרת-ה-PDF בחוקי-האחסון הייתה 200MB, ולכן Storage החזיר 403 —
     וקוד-ההעלאה עוצר מיד ב-403 בלי ניסיון חוזר, ובצדק.
     מה שהיה שבור הוא **ההודעה**: הלקוח קיבל "נסו שוב בעוד מספר דקות",
     והוא יכול לנסות עד מחר — זה לעולם לא יעבוד. שום בדיקת-גודל לא רצה
     בצד-הלקוח לפני ההעלאה, ולכן הכשל התגלה רק אחרי שהקובץ כולו נשלח.

     ⚠️ 300MB — החלטת-בעלים 09/08/2026, אחרי שנמדד קובץ אמיתי של 210MB.
     המדידה שעליה נקבעו 200MB (הגדול ביותר בדלי היה 123MB) כבר אינה
     מייצגת.

     ⚠️ הערכים כאן הם **מקור-האמת היחיד**, ו-upload-type-tests משווה אותם
     למספרים שבתוך storage.rules. בלי זה שני הצדדים סוטים בשקט: הלקוח
     מאשר קובץ שהשרת ידחה, או חוסם קובץ שהשרת היה מקבל. */
  var MB = 1024 * 1024;
  var MAX_PDF_BYTES   = 300 * MB;
  var MAX_IMAGE_BYTES =  25 * MB;
  var MAX_JSON_BYTES  =  25 * MB;

  /* ⚠️ 21/08/2026: הפונקציה החזירה 0 לסוג לא-מוכר, ו-checkSize תרגם
     ‎!max‎ ל"אין תקרה" — כלומר **דווקא הסוג הלא-מוכר היה בלתי-מוגבל**.
     ברירת-המחדל היא התקרה המחמירה, לא היעדר-תקרה. */
  function maxBytesFor(contentType) {
    if (contentType === PDF) return MAX_PDF_BYTES;
    if (contentType === JSON_) return MAX_JSON_BYTES;
    if (contentType === JPEG || contentType === PNG) return MAX_IMAGE_BYTES;
    return MAX_IMAGE_BYTES;
  }

  function fmtMB(b) {
    var n = Number(b) || 0;
    return (n / MB).toFixed(n >= 10 * MB ? 0 : 1) + 'MB';
  }

  /* בדיקה **לפני** ההעלאה. ההודעה אומרת את האמת — מה הגודל, מה המותר —
     ולא "נסו שוב", שהוא עצה שלא יכולה לעבוד. */
  function checkSize(bytes, contentType, name) {
    var max = maxBytesFor(contentType);
    var n = Number(bytes);
    /* ⚠️ גודל שאינו מספר סופי אינו "0" — הוא "לא ידוע", והשומר לא יכול
       להעיד עליו. עדיף לומר זאת מאשר להחזיר ok על קובץ שלא נמדד. */
    if (!isFinite(n) || n < 0) {
      return { ok: false, code: 'unknown_size',
               message: 'לא הצלחנו לקרוא את גודל הקובץ' + (name ? ' (' + name + ')' : '') +
                        '. נסו לבחור אותו שוב.' };
    }
    if (n <= max) return { ok: true };
    return { ok: false, code: 'too_large', size: n, max: max,
             message: 'הקובץ גדול מדי' + (name ? ' (' + name + ')' : '') + ' — ' + fmtMB(n) +
                      '. הגודל המרבי לשליחה הוא ' + fmtMB(max) + '.' };
  }

  return { normalize: normalize, extOf: extOf,
           PDF: PDF, JPEG: JPEG, PNG: PNG, JSON: JSON_,
           ALLOWED_UPLOAD: ALLOWED_UPLOAD, ALLOWED_INTERNAL: ALLOWED_INTERNAL,
           MAX_PDF_BYTES: MAX_PDF_BYTES, MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
           MAX_JSON_BYTES: MAX_JSON_BYTES,
           maxBytesFor: maxBytesFor, checkSize: checkSize, fmtMB: fmtMB };
});
