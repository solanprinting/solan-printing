/* ═══════════ page-spine.js — צד השדרה והגלישות בתצוגת דפדוף (RTL) ═══════════
   חוק-הברזל של חוברות עברית: **עמוד אי-זוגי — שדרה מימין · עמוד זוגי — שדרה משמאל.**

   בתצוגת הדפדוף חותכים את הגלישה בצד השדרה בלבד (כדי ששני עמודי הכפולה
   יתחברו נקי), ומציגים את הגלישה + צלבי החיתוך בצד החיצוני.

   הבאג שזה מתקן: בכפולה הכלל יושם נכון, אבל לעמוד בודד (השער) צד השדרה היה
   מקובע ל-'left' — ולכן בשער הגלישה הוצגה מימין במקום משמאל. השער הוא עמוד 1
   (אי-זוגי) ולכן שדרתו מימין, והגלישה שלו חייבת להופיע משמאל.

   הקוד טהור (אין DOM) כדי שייבדק ב-Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PageSpine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* צד השדרה לפי מספר-עמוד 1-מבוסס. אי-זוגי → ימין, זוגי → שמאל. */
  function spineFor(pageNumber) {
    var p = parseInt(pageNumber, 10);
    if (!isFinite(p) || p < 1) return 'right';
    return (p % 2 === 0) ? 'left' : 'right';
  }
  /* אותו כלל לפי אינדקס 0-מבוסס (כמו מערך התמונות בצופה) */
  function spineForIndex(i) { return spineFor((parseInt(i, 10) || 0) + 1); }

  /* הצד שבו מוצגת הגלישה — תמיד ההפוך משדרה */
  function bleedSide(pageNumber) { return spineFor(pageNumber) === 'left' ? 'right' : 'left'; }

  /* שני עמודי כפולה הם שני הצדדים של אותו דף — השדרות שלהם הפוכות */
  function isMirrorPair(a, b) {
    return Math.abs((parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)) === 1 &&
           spineFor(a) !== spineFor(b);
  }

  /* חישוב אזור-התצוגה: חותך את הגלישה בצד השדרה, משאיר אותה בצד החיצוני.
     tf = {l,t,w,h} (יחסי-MediaBox) + wmm/hmm של ה-TrimBox.
     מחזיר יחס-תצוגה, פרמטרי background, ומיקום מסגרת ה-trim באחוזים. */
  function netSpec(tf, spine) {
    var mediaHmm = tf.hmm / tf.h, mediaWmm = tf.wmm / tf.w;
    var shownL, shownR;
    if (spine === 'left') { shownL = tf.l; shownR = 1; }               // שדרה משמאל → חותך שמאל
    else if (spine === 'right') { shownL = 0; shownR = tf.l + tf.w; }  // שדרה מימין → חותך ימין
    else { shownL = 0; shownR = 1; }                                    // בלי חיתוך — כל הגלישה
    var shownW = shownR - shownL;
    var arr = (shownW * mediaWmm) / mediaHmm;
    var posX = shownW < 1 ? (shownL / (1 - shownW) * 100) : 0;
    var sizeW = 100 / shownW;
    var trimL = (tf.l - shownL) / shownW, trimR = (tf.l + tf.w - shownL) / shownW;
    return { arr: arr, sizeW: sizeW, posX: posX,
      frame: { left: trimL * 100, top: tf.t * 100, width: (trimR - trimL) * 100, height: tf.h * 100, skip: spine } };
  }

  return { spineFor: spineFor, spineForIndex: spineForIndex, bleedSide: bleedSide,
           isMirrorPair: isMirrorPair, netSpec: netSpec };
});
