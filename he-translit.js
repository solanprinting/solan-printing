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

  /* ── תוויות-ממשק: תרגום, לא תעתיק ─────────────────────────────────────────
     ⚠️ **בקשת-בעלים 19/08/2026:** "כל הכפתורים במסך של הדפסים שיהיו גם
     באנגלית וגם בעברית."
     ⚠️ **וכאן ההפך משם-העבודה.** שם-עבודה מתועתק כי העובד שומע אותו
     בעל-פה („Hadashot Hagalil"). תווית-ממשק צריכה להיות **מובנת**:
     „התחל הדפסה" → ‎Start printing‎, ולא ‎Hathel Hadpasa‎ שאינו אומר כלום
     לאיש. שני הצרכים שונים, ולכן שתי פונקציות נפרדות באותו מודול.
     ⚠️ מילון סגור וקטן — בלי שירות-תרגום, בלי רשת. מסך-מכונה חייב לעבוד
     גם כשהאינטרנט נופל (§2). */
  var LABELS = {
    /* כניסה ומכונה */
    'כניסה': 'Sign in', 'יציאה': 'Sign out',
    'קוד כניסה למכונה': 'Machine code', 'קוד עובד אישי': 'Worker code',
    'קוד עובד שגוי': 'Wrong worker code', 'הכניסה נכשלה': 'Sign-in failed',
    /* עבודה — הפעולות המרכזיות */
    'התחל הדפסה': 'Start printing', 'עבור לזה': 'Switch to this',
    'סיים עבודה': 'Finish job', 'בהדפסה': 'Printing now',
    'העבודה כבר בתור.': 'Already in the queue', 'העבודה הושלמה.': 'Job completed',
    'אין עבודות בתור': 'No jobs in queue', 'הושלמו היום': 'Completed today',
    /* תקלות ופעולות */
    'פרטי תקלה': 'Fault details', 'מספר תקלה': 'Fault no.',
    'נסה שוב': 'Retry', 'הפעולה נכשלה': 'Action failed',
    'סגור': 'Close', 'רענן': 'Refresh', 'התאם': 'Fit to screen',
    'העתק נתיב': 'Copy path', 'הועתק': 'Copied', 'לא הועתק': 'Not copied',
    /* מצבי-טעינה */
    'טוען…': 'Loading…', 'טוען פרופר…': 'Loading proof…',
    'מוריד…': 'Downloading…', 'מחדד…': 'Sharpening…',
    'פותח את הקובץ…': 'Opening file…', 'רגע…': 'One moment…',
    /* שונות */
    'פרופר': 'Proof', 'גודל הקובץ': 'File size', 'מתוך': 'of',
    'מנהל (בדיקה)': 'Manager (test)'
  };

  /* התווית הדו-לשונית. ⚠️ מפריד ‎·‎ ולא סוגריים — הוא קצר ולא שובר שורה
     בכפתור צר. ⚠️ מונח שאינו במילון מוחזר כמו-שהוא: **בלי המצאה**.
     טוב שכפתור יישאר עברי מאשר שיקבל אנגלית שגויה. */
  function label(he, sep) {
    var k = _s(he).trim();
    var en = LABELS[k];
    if (!en) return _s(he);
    return _s(he) + (sep || ' · ') + en;
  }
  /* רק החלק האנגלי — לשורה שנייה מתחת לתווית */
  function labelEn(he) { return LABELS[_s(he).trim()] || ''; }

  /* ── שם-האפוגי מקובצי-הפרופרים (בקשת-בעלים 20/08/2026) ──────────────────
     "לקחת את שמות העיתונים מהשמות שרשומים על הפרופרים" — הקדם-דפוס כבר
     נתן לכל עיתון שם לטיני קבוע (עוצמה=Ozma, ידיעון נתניה=Yedion Natania),
     והוא עדיף על תעתיק אוטומטי: זה השם שעל הקבצים ליד המכונה.
     ⚠️ מספר-הגיליון משתנה כל שבוע ("Golos 8", "Meudkan259") — נחתך.
     דפוסי-הייצור האמיתיים (נמדדו 20/08):
       "Meida Hair19.8_R-1     _8color.pdf" · "Golos 8__8color.pdf" ·
       "Meudkan259_Meudkan259    _4color.pdf" · "Minhat ahava 3 Sogim_8 color_1.pdf"
       (ה-3 באמצע-שם נשאר; ספרות בסוף נחתכות). */
  function apogeeBase(fileName) {
    var s = _s(fileName).replace(/\.[A-Za-z0-9]{2,5}$/, '');   // סיומת
    var segs = s.split('_').map(function (x) { return x.trim(); }).filter(Boolean);
    var junk = function (x) {
      return /^\d+$/.test(x)                                    // מונה (_1)
          || /^\d?\s*\d*\s*colou?r$/i.test(x)                   // 4color · 8 color
          || /^R[- ]?\d+$/i.test(x);                            // R-1
    };
    var base = '';
    for (var i = 0; i < segs.length; i++) { if (!junk(segs[i])) { base = segs[i]; break; } }
    if (!base) return '';
    /* ⚠️ 21/08/2026 — **הזנב נקלף בשכבות, לא במעבר אחד.** על
       "Yedion Natania R-11 8 color" תבנית-ה-color לא הייתה מעוגנת לגבול
       ובלעה ספרה מתוך מספר-הריצה ("1 8 color"), ואז מחיקת-R — שרצה
       **לפניה** ובמעבר יחיד — כבר לא יכלה לירות. נשאר "Yedion Natania R".
       שני התיקונים: עוגן-גבול לפני ספרות-ה-color, וקילוף חוזר עד-יציבות
       כדי שסדר-הסיומות לא יקבע את התוצאה. */
    /* ⚠️ **סיומת אחת בכל סבב.** בשרשור-מעבר-אחד כלל-הגיליון/תאריך אכל את
       "11" מתוך "R-11" באותו מעבר שבו ה-color הוסר, ולכן מחיקת-R כבר לא
       ראתה מספר-ריצה. הקילוף בסדר-עדיפות, סיומת אחת בכל פעם, עד יציבות. */
    var stripOnce = function (x) {
      var y;
      y = x.replace(/(^|[\s_-])\d{0,2}\s*colou?r\s*$/i, '$1').trim();   // 8color · 4 colour
      if (y !== x) return y;
      /* ⚠️ R חייבת להיות מילה עצמאית — "Rav Macher1199" מסתיים ב-r1199
         ובלי הגבול נחתך ל-"Rav Mache" */
      y = x.replace(/(^|[\s_-])R[- ]?\d+\s*$/i, '$1').trim();           // R-1 שנדבק לסוף
      if (y !== x) return y;
      y = x.replace(/\d+\s*[xX]\s*\d+\s*$/, '').trim();                 // מידה 14X23
      if (y !== x) return y;
      /* גיליון/תאריך בסוף: 259 · 19.8 — אבל אות-בודדת+ספרות ("A4", "B5")
         היא קוד-גודל וחלק מהשם ("Grapik kav Ayeshuot A4") */
      y = x.replace(/\d+(?:[./]\d+)*\s*$/, function (mm, off, whole) {
        return /(^|\s)[A-Za-z]$/.test(whole.slice(0, off)) ? mm : '';
      }).trim();
      if (y !== x) return y;
      y = x.replace(/[-_.,]+\s*$/, '').replace(/\s{2,}/g, ' ').trim();
      return y;
    };
    for (var g = 0; g < 8; g++) { var nx = stripOnce(base); if (nx === base) break; base = nx; }
    /* חייב להיות שם לטיני אמיתי — לא שאריות */
    if (!/[A-Za-z]{2}/.test(base)) return '';
    return base;
  }
  /* מכמה קבצים → השם השכיח (ריצות של אותו עיתון = אותו בסיס) */
  function fromProofNames(names) {
    var freq = {}, best = '';
    (Array.isArray(names) ? names : []).forEach(function (n) {
      var b = apogeeBase(n);
      if (!b) return;
      var k = b.toLowerCase();
      freq[k] = (freq[k] || 0) + 1;
      if (!best || freq[k] > freq[best.toLowerCase()]) best = b;
    });
    return best;
  }

  return { FINAL: FINAL, MAP: MAP, LABELS: LABELS, strip: strip, word: word,
           hasHebrew: hasHebrew, translit: translit, cardLine: cardLine,
           apogeeBase: apogeeBase, fromProofNames: fromProofNames,
           label: label, labelEn: labelEn };
});
