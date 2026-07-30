/* ═══════════ זיהוי ציור עם מסכת-שקיפות בעמוד PDF ═══════════
   הרקע — "עוצמה" עמ' 28 (2026-07-30): חלק מהגרפיקה (ג'וק, לוגו "עין אפק")
   הופיע דהוי/חסר בתצוגת הדפדוף, בזמן שהקובץ עצמו תקין לחלוטין (הורדה, מייל
   ופרופר — כולם בסדר). מדידה מול הקובץ האמיתי הראתה:

     • הפענוח של התמונות ב-pdf.js תקין — גם ב-3.11 וגם ב-5.4 (אותן 8 תמונות,
       אותם ערכי אלפא בדיוק: 65/56/30 — זהים למסכה האמיתית שבקובץ).
     • רשימת-הפעולות של העמוד חושפת את המבנה שמייצר את הבעיה:

           beginGroup                      ← קבוצת-שקיפות
             beginGroup
               paintImageXObject  (אטום)   ← הגרפיקה עצמה
             endGroup
             setGState SMask={...}         ← הפעלת מסכת-שקיפות
             paintImageXObject  (ממוסך)    ← אותה גרפיקה, כבר עם אלפא
           endGroup

       כלומר האלפא מוחל *פעמיים* — פעם בתמונה עצמה ופעם דרך ה-gstate — ולכן
       הגרפיקה יוצאת רוח דהויה. זה באג-ציור במנוע התצוגה, לא בקובץ.

   המודול הזה טהור: מקבל operatorList של pdf.js ומחזיר את הממצאים, כדי ש-
     1) הדפדוף יסמן את העמודים שבהם התצוגה עלולה להחליש גרפיקה, ויציע לפתוח
        את הקובץ המקורי — שלא יאשרו עיתון לפי תצוגה שאינה נאמנה;
     2) תהיה בדיקה אוטומטית שמונעת רגרסיה.                                */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PdfTransparency = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* סורק רשימת-פעולות של עמוד.
     ops = { fnArray, argsArray } כמו ש-pdf.js מחזיר; OPS = מפת קודי-הפעולות.
     מחזיר:
       softMaskPaints — כמה ציורים בוצעו כשמסכת-שקיפות פעילה
       doubleMasked   — כמה מהם הם *אותה תמונה* שנצבעה גם אטומה וגם ממוסכת
                        (זו הבנייה שמייצרת את הדהייה)
       images         — שמות התמונות החשודות
       risky          — האם כדאי להזהיר על העמוד */
  function scanPage(ops, OPS) {
    var out = { softMaskPaints: 0, doubleMasked: 0, images: [], risky: false, groups: 0 };
    if (!ops || !ops.fnArray || !ops.argsArray || !OPS) return out;
    var fn = ops.fnArray, args = ops.argsArray;
    var PAINTS = {};
    ['paintImageXObject', 'paintJpegXObject', 'paintImageXObjectRepeat', 'paintInlineImageXObject']
      .forEach(function (k) { if (OPS[k] != null) PAINTS[OPS[k]] = 1; });
    var smaskOn = false;
    var opaqueSeen = {};      // תמונות שנצבעו בלי מסכה
    var seenNames = {};
    for (var i = 0; i < fn.length; i++) {
      var f = fn[i];
      if (f === OPS.beginGroup) { out.groups++; continue; }
      if (f === OPS.setGState) {
        var list = args[i] && args[i][0];
        if (Array.isArray(list)) {
          for (var j = 0; j < list.length; j++) {
            var p = list[j];
            if (p && p[0] === 'SMask') smaskOn = !!p[1];   // null/'none' → כיבוי
          }
        }
        continue;
      }
      if (PAINTS[f]) {
        var nm = args[i] && args[i][0];
        var key = (typeof nm === 'string') ? nm : ('#' + i);
        if (smaskOn) {
          out.softMaskPaints++;
          // אותה תמונה נצבעה קודם אטומה, ועכשיו שוב עם מסכה → אלפא כפול
          if (opaqueSeen[key] || opaqueSeen[_pairKey(key)]) out.doubleMasked++;
          if (!seenNames[key]) { seenNames[key] = 1; out.images.push(key); }
        } else {
          opaqueSeen[key] = 1;
        }
      }
    }
    out.risky = out.doubleMasked > 0 || out.softMaskPaints > 0;
    return out;
  }

  /* pdf.js נותן לזוג "אטום/ממוסך" שמות עוקבים (img_p0_4 ו-img_p0_5), ולכן
     התאמה לפי השם הקודם מזהה גם את המקרה שבו הווריאנטים אינם אותו אובייקט. */
  function _pairKey(name) {
    var m = /^(.*?)(\d+)$/.exec(String(name || ''));
    if (!m) return name;
    return m[1] + (parseInt(m[2], 10) - 1);
  }

  // ניסוח ההודעה לצופה — אותה מילה בדפדוף ובמסך הדפוס
  function warningText(scan) {
    if (!scan || !scan.risky) return '';
    return scan.doubleMasked > 0
      ? 'בעמוד הזה יש גרפיקה עם שקיפות שהתצוגה עלולה להציג חלשה מדי — כדאי לוודא מול הקובץ המקורי'
      : 'בעמוד הזה יש שקיפויות — אם משהו נראה חלש, בדקו מול הקובץ המקורי';
  }

  return { scanPage: scanPage, warningText: warningText, _pairKey: _pairKey };
});
