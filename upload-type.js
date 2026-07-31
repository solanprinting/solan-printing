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

  return { normalize: normalize, extOf: extOf,
           PDF: PDF, JPEG: JPEG, PNG: PNG, JSON: JSON_,
           ALLOWED_UPLOAD: ALLOWED_UPLOAD, ALLOWED_INTERNAL: ALLOWED_INTERNAL };
});
