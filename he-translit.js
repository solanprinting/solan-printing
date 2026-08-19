/* ═══════════ he-translit.js — שם-עבודה באותיות לטיניות ═══════════════════
   ⚠️ **הבקשה (בעלים 19/08/2026):** "בכרטיסי עבודה שהשם יהיה רשום גם
   באנגלית — יש לנו עובד שלא יודע לקרוא בעברית."

   ⚠️ **תעתיק, לא תרגום — וזו החלטה.** העובד צריך **לזהות** את העבודה
   ולהתאים אותה לערימה, לקובץ ולמה שאומרים לו בעל-פה. „חדשות הגליל"
   בתעתיק הוא ‎Hadashot HaGalil‎ — בדיוק מה שישמע מהקולגות. תרגום
   (‏Galilee News) היה יוצר שם שאיש בבית-הדפוס לא משתמש בו, והעובד היה
   מחזיק ביד כרטיס עם שם שלא קיים בשום מקום אחר.

   ⚠️ **בלי רשת ובלי AI.** תעתיק הוא טבלה; תרגום דורש שירות. במסך שהעובד
   פותח בעמדה, תלות-רשת פירושה כרטיס בלי שם כשהיא נופלת (§2).

   ⚠️ **בעברית אין תנועות בכתב**, ולכן התעתיק מקורב מעצם טבעו: „דפוס"
   ייצא ‎Dfus‎ ולא ‎Dfoos‎. זה מספיק לזיהוי וזו כל המטרה. מי שרוצה שם
   מדויק — יש שדה-עקיפה ידני (‎nameEn‎), והוא גובר תמיד.

   הרצת הבדיקות: node he-translit-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HeTranslit = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* אות-סוף ← האות הרגילה. מתבצע לפני הכול, כדי שטבלה אחת תספיק. */
  var FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

  /* ⚠️ צירופים לפני אותיות בודדות — אחרת „צ׳" ייצא ts' ולא ch. */
  var PAIRS = [
    ["צ'", 'ch'], ['צ׳', 'ch'],
    ["ג'", 'j'],  ['ג׳', 'j'],
    ["ז'", 'zh'], ['ז׳', 'zh'],
    ["ת'", 'th'], ['ת׳', 'th']
  ];

  var MAP = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
    'ח': 'h', 'ט': 't', 'י': 'y', 'כ': 'k', 'ל': 'l', 'מ': 'm', 'נ': 'n',
    'ס': 's', 'ע': 'a', 'פ': 'p', 'צ': 'ts', 'ק': 'k', 'ר': 'r',
    'ש': 'sh', 'ת': 't'
  };

  function _s(v) { return String(v == null ? '' : v); }

  /* ניקוד, טעמים וגרשיים-עבריים — יורדים. ⚠️ הגרש **אחרי** צ/ג/ז כבר
     טופל ב-PAIRS, ולכן מה שנשאר כאן הוא מפריד ולא חלק מהאות. */
  function strip(s) {
    return _s(s).replace(/[֑-ׇ]/g, '').replace(/["״]/g, '');
  }

  /* מילה → לטינית. ⚠️ ו' ו-י' בתחילת מילה נשמעות כתנועה ולא כעיצור:
     „ירושלים" → Yerushalaim, לא Yrushlym. זו התאמה קטנה שמכריעה
     בין שם קריא לשם שנראה כמו שגיאת-קידוד. */
  var VOWEL = /[aeiou]/;
  function word(w) {
    var s = strip(w);
    if (!s) return '';
    PAIRS.forEach(function (p) { s = s.split(p[0]).join(p[1]); });
    var out = '', i = 0;
    /* ⚠️ **ה"א הידיעה.** מילה שמתחילה ב-ה ואחריה עוד שתי אותיות היא כמעט
       תמיד מיודעת: "הגליל" → HaGalil, "היום" → HaYom. בלי הכלל הזה יוצא
       ‎Hglil‎ — וזו מחרוזת, לא שם. */
    if (s.charAt(0) === 'ה' && s.replace(/[^א-ת]/g, '').length >= 3) { out = 'Ha'; i = 1; }
    for (; i < s.length; i++) {
      var c = s[i];
      var he = FINAL[c] || c;
      if (!MAP[he]) { out += c; continue; }
      var t = MAP[he];
      var first = (out === '');
      /* י בתחילת מילה = Y; באמצע = i (תנועה) */
      if (he === 'י') t = first ? 'y' : 'i';
      /* ו בתחילה = v; באמצע = o */
      if (he === 'ו') t = first ? 'v' : 'o';
      /* א/ע בסוף מילה שותקות */
      if ((he === 'א' || he === 'ע') && i === s.length - 1 && !first) t = '';
      /* ⚠️ **ה סופית נשמעת a** ולא h: "אהבה" → Ahava, לא Ahbh. */
      if (he === 'ה' && i === s.length - 1 && !first) t = 'a';
      /* ⚠️ **תנועת-ברירת-מחדל בין שני עיצורים.** בעברית אין תנועות בכתב,
         ובלעדיה כל שם יוצא רצף עיצורים בלתי-קריא. עיצור שבא אחרי עיצור
         מקבל ‎a‎ לפניו: "חדשות" → H-a-D-a-SH-O-T = Hadashot.
         מקורב במכוון — המטרה זיהוי, לא דקדוק. */
      if (t && !VOWEL.test(t.charAt(0)) && out && !VOWEL.test(out.charAt(out.length - 1))) out += 'a';
      out += t;
    }
    return out;
  }

  /* ⚠️ אות ראשונה גדולה בכל מילה — כך זה נקרא כשם ולא כמחרוזת. */
  function cap(w) { return w ? (w.charAt(0).toUpperCase() + w.slice(1)) : w; }

  /* האם יש בכלל עברית בטקסט? שם שכבר לטיני מוחזר כמו-שהוא. */
  function hasHebrew(s) { return /[א-ת]/.test(_s(s)); }

  /* השם המלא. מפרידים (רווח · מקף · נקודה · סוגריים) נשמרים כמו שהם. */
  function translit(name) {
    var s = strip(name).trim();
    if (!s) return '';
    if (!hasHebrew(s)) return s;                 // כבר לטיני — לא נוגעים
    return s.split(/(\s+|[-–—_/\\().,+]+)/).map(function (tok) {
      if (!tok || /^(\s+|[-–—_/\\().,+]+)$/.test(tok)) return tok;
      return hasHebrew(tok) ? cap(word(tok)) : tok;
    }).join('').replace(/\s{2,}/g, ' ').trim();
  }

  /* מה להציג על הכרטיס. ⚠️ עקיפה ידנית גוברת תמיד — היא נכתבה ע"י אדם
     שיודע מה השם הנכון. שם שכבר לטיני אינו מקבל שורה שנייה. */
  function cardLine(name, manualEn) {
    var man = _s(manualEn).trim();
    if (man) return man;
    var n = _s(name).trim();
    if (!n || !hasHebrew(n)) return '';
    return translit(n);
  }

  return { FINAL: FINAL, MAP: MAP, strip: strip, word: word,
           hasHebrew: hasHebrew, translit: translit, cardLine: cardLine };
});
