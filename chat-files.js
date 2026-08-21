/* ═══════════════════════════════════════════════════════════════════════════
   chat-files.js — צילומי-מסך וקבצים בשיחה (בקשת-בעלים 21/08/2026).

   הודעת-צ'אט יכולה לשאת קובץ: ‏{fileUrl, fileName, fileType, fileSize}
   לצד הטקסט (או בלעדיו). הקובץ עולה ל-Storage תחת ‎chatFiles/<slug>/‎ —
   בלוק-חוקים ייעודי (לקוח לתיקיית עצמו · כל הצוות · תמונות/PDF · create
   בלבד). שלושת המסכים (פורטל · מסך-הדפוס · מרכז-השיחות) משתמשים באותו
   מודול — מעלה, שדות-הודעה ורינדור — כדי שקובץ ייראה אותו דבר בכולם.

   ⚠️ ‏Content-Type אמיתי: חוקי-Storage מאמתים סוג — העלאה שמתחזה
   ל-PDF (כמו xhrPost הוותיק) הייתה נדחית או משקרת לצופה.

   הרצת הבדיקות: node chat-files-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChatFiles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BUCKET = 'solan-printing.firebasestorage.app';
  var MAX_IMG = 25 * 1024 * 1024;    /* כמו isImg בחוקי-Storage */
  var MAX_PDF = 50 * 1024 * 1024;    /* צ'אט אינו ערוץ-עיתונים — לזה יש העלאה */

  var str = function (v) { return String(v == null ? '' : v); };

  /* אילו קבצים מתקבלים — אותם סוגים שהחוקים מתירים */
  function accepts(file) {
    var t = str(file && file.type), n = Number(file && file.size) || 0;
    if (t === 'image/png' || t === 'image/jpeg')
      return n < MAX_IMG ? { ok: true, kind: 'img' }
                         : { ok: false, why: 'התמונה גדולה מדי (מעל 25MB)' };
    if (t === 'application/pdf')
      return n < MAX_PDF ? { ok: true, kind: 'pdf' }
                         : { ok: false, why: 'הקובץ גדול מדי לצ׳אט (מעל 50MB) — השתמשו בהעלאת-העיתון' };
    return { ok: false, why: 'בצ׳אט אפשר לצרף תמונה (PNG/JPG) או PDF בלבד' };
  }

  function safeName(name) {
    return str(name || 'קובץ').replace(/[\\/:*?"<>|#%&{}\s]+/g, '_').slice(0, 80) || 'file';
  }
  function chatPath(slug, name, at) {
    return 'chatFiles/' + str(slug).trim() + '/' + (Number(at) || 0) + '_' + safeName(name);
  }

  /* שדות-הקובץ שמצטרפים להודעה — רשימה סגורה */
  function msgFields(up) {
    var u = up || {};
    return { fileUrl: str(u.fileUrl), fileName: str(u.fileName).slice(0, 120),
             fileType: str(u.fileType), fileSize: Number(u.fileSize) || 0 };
  }

  function sizeLabel(b) {
    b = Number(b) || 0;
    if (!b) return '';
    return b < 1024 * 1024 ? (Math.round(b / 1024) + ' KB') : ((b / (1024 * 1024)).toFixed(1) + ' MB');
  }

  /* רינדור הקובץ בתוך בועת-ההודעה — esc של המסך הקורא, כמו IssueGrid.
     תמונה: תמונונת שנפתחת בלשונית; אחר: שורת-📎. */
  function fileHtml(m, esc) {
    var e = esc || str;
    if (!m || !str(m.fileUrl)) return '';
    var url = e(m.fileUrl);
    if (/^image\//.test(str(m.fileType)))
      return '<a href="' + url + '" target="_blank" rel="noopener" class="chatImgA">'
        + '<img class="chatImg" src="' + url + '" alt="' + e(m.fileName || 'תמונה') + '" loading="lazy"></a>';
    return '<a href="' + url + '" target="_blank" rel="noopener" class="chatFileA">📎 '
      + e(m.fileName || 'קובץ') + (m.fileSize ? (' · ' + e(sizeLabel(m.fileSize))) : '') + '</a>';
  }

  /* ── ההעלאה עצמה (דפדפן בלבד) ──────────────────────────────────────────
     ‏getToken: אסימון-הזהות של הצד הקורא. ‏Content-Type אמיתי מהקובץ. */
  function upload(slug, file, getToken, onProgress) {
    var at = Date.now();
    var path = chatPath(slug, file && file.name, at);
    return Promise.resolve().then(function () { return getToken(); }).then(function (t) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o?name=' + encodeURIComponent(path));
        xhr.setRequestHeader('Content-Type', str(file.type) || 'application/octet-stream');
        try { if (t) xhr.setRequestHeader('Authorization', 'Firebase ' + t); } catch (e) {}
        xhr.upload.onprogress = function (ev) { if (ev.lengthComputable && onProgress) onProgress(ev.loaded, ev.total); };
        xhr.onload = function () {
          /* ⚠️ 403 היא תגובה, לא חריגה — נבדק במפורש */
          if (xhr.status < 200 || xhr.status >= 300) { reject(new Error('ההעלאה נדחתה (' + xhr.status + ')')); return; }
          var j = {}; try { j = JSON.parse(xhr.responseText); } catch (e) {}
          var tok = str(j.downloadTokens).split(',')[0];
          resolve(msgFields({
            fileUrl: 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/' + encodeURIComponent(path) + '?alt=media&token=' + tok,
            fileName: str(file.name || 'קובץ'), fileType: str(file.type), fileSize: file.size }));
        };
        xhr.onerror = function () { reject(new Error('שגיאת-רשת בהעלאת הקובץ')); };
        xhr.send(file);
      });
    });
  }

  return { BUCKET: BUCKET, MAX_IMG: MAX_IMG, MAX_PDF: MAX_PDF,
           accepts: accepts, safeName: safeName, chatPath: chatPath,
           msgFields: msgFields, sizeLabel: sizeLabel, fileHtml: fileHtml, upload: upload };
});
