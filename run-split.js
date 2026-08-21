/* ═══════════ run-split.js — פיצול ידני של עבודה לריצות ═══════════
   המערכת מפצלת אוטומטית לפי חתימות סטנדרטיות (24 עמ׳ בגיליון 32 → 8+16),
   אבל בשטח יש חלוקות אחרות: עיתון A5 של 24 עמ׳ שבו העטיפה 4 עמ׳ בנייר
   157 גר׳ ועוד 4 עמ׳ ו-16 עמ׳ בנייר 115 → 4+4+16.

   כאן מנתחים מה שהמשתמש כותב ("4+4+16" / "4 4 16" / "4,4,16") ומוודאים
   שזו חלוקה חוקית לכריכת-סיכות: כל חלק כפולה של 4, לא גדול מגיליון מלא,
   והסכום שווה למספר העמודים.

   סדר החלקים = סדר הריצות: הראשון הוא השכבה החיצונית (העטיפה).
   הקוד טהור — אין DOM — כדי שייבדק ב-Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RunSplit = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIG = 4;   // חתימת-מינימום בכריכת סיכות: 4 עמודים (גיליון מקופל פעם אחת)

  function _nums(text){
    return String(text == null ? '' : text)
      .replace(/[×xX]/g, ' ')
      .split(/[^0-9]+/)
      .filter(function (s){ return s !== ''; })
      .map(function (s){ return parseInt(s, 10); });
  }

  /* ניתוח + ולידציה. מחזיר {ok, parts, why, total}. */
  function parse(text, totalPages, fullSheet){
    var parts = _nums(text);
    var total = parseInt(totalPages, 10) || 0;
    var fs = parseInt(fullSheet, 10) || 0;
    if (!parts.length) return { ok: false, parts: [], total: 0, why: 'לא הוזנה חלוקה' };
    if (parts.length === 1) return { ok: false, parts: parts, total: parts[0], why: 'חלוקה לריצה אחת — אין מה לפצל' };
    var sum = 0, i;
    for (i = 0; i < parts.length; i++){
      var p = parts[i];
      if (!(p > 0)) return { ok: false, parts: parts, total: 0, why: 'חלק ' + (i + 1) + ' אינו מספר חוקי' };
      if (p % SIG !== 0) return { ok: false, parts: parts, total: 0, why: p + ' אינו כפולה של 4 — בכריכת סיכות כל ריצה היא כפולה של 4 עמודים' };
      if (fs > 0 && p > fs) return { ok: false, parts: parts, total: 0, why: p + ' עמ׳ גדול מגיליון מלא (' + fs + ' עמ׳)' };
      sum += p;
    }
    if (total > 0 && sum !== total)
      return { ok: false, parts: parts, total: sum,
               why: 'הסכום ' + sum + ' לא שווה למספר העמודים (' + total + ')' + (sum < total ? ' — חסרים ' + (total - sum) : ' — עודף ' + (sum - total)) };
    return { ok: true, parts: parts, total: sum, why: '' };
  }

  function isValid(text, totalPages, fullSheet){ return parse(text, totalPages, fullSheet).ok; }

  function format(parts){ return (parts || []).join('+'); }

  /* טווח העמודים של כל חלק — בדיוק כמו כריכת סיכות: החלק הראשון הוא
     החיצוני (עמודים ראשונים + אחרונים), והפנימי ביותר הוא רצוף. */
  function ranges(parts, totalPages){
    var ps = (parts || []).slice();
    var front = 1, back = parseInt(totalPages, 10) || ps.reduce(function (a, b){ return a + b; }, 0);
    return ps.map(function (p, i){
      var half = p / 2;
      var frontEnd = front + half - 1, backStart = back - half + 1;
      var r = (frontEnd + 1 === backStart)
        ? { pages: p, from: front, to: back, contiguous: true, text: 'עמ\' ' + front + '–' + back }
        : { pages: p, from: front, to: frontEnd, from2: backStart, to2: back, contiguous: false,
            text: 'עמ\' ' + front + '–' + frontEnd + ' + עמ\' ' + backStart + '–' + back };
      front += half; back -= half;
      if (i === ps.length - 1 && r.contiguous) { /* הפנימי ביותר */ }
      return r;
    });
  }

  /* הצעות חלוקה נפוצות למספר עמודים נתון — לכפתורי-קיצור בממשק */
  function suggestions(totalPages, fullSheet){
    var total = parseInt(totalPages, 10) || 0, fs = parseInt(fullSheet, 10) || 0;
    if (total <= 0 || total % SIG !== 0) return [];
    /* ⚠️ 21/08/2026 — **הלשונית מתה בהקלדה בשדה "עמודים".** הפונקציה רצה
       מ-‎oninput‎ (‎krtis-avoda.html #f-pages → calcRuns → _manualSplitHtml‎),
       והלולאות החמדניות לינאריות ב-‎total‎: הדבקת מספר ארוך נתנה 31 מיליון
       ‎push‎ ו-OOM — נמדד גם בערימת ברירת-המחדל של הדפדפן (71 שנ׳ ואז
       קריסה), לא רק תחת דגל-זיכרון מוקטן. אין עיתון בן 4,096 עמודים;
       מעבר לזה זו טעות-הקלדה, ותשובה ריקה עדיפה על לשונית מתה. */
    if (total > 4096) return [];
    var out = [], seen = {};
    var add = function (parts){
      if (!parts.length) return;
      var s = format(parts);
      if (seen[s]) return;
      if (!parse(s, total, fs).ok) return;
      seen[s] = 1; out.push({ parts: parts, text: s });
    };
    // חמדני סטנדרטי (16/8/4) + וריאציה שמפרידה עטיפה 4 בנפרד
    var greedy = [], rest = total, sizes = [fs || 32, 16, 8, 4];
    sizes.forEach(function (s){ while (s > 0 && rest >= s){ greedy.push(s); rest -= s; } });
    add(greedy.slice().sort(function (a, b){ return a - b; }));
    if (total - 4 > 0){
      var cover = [4], rest2 = total - 4;
      sizes.forEach(function (s){ while (s > 0 && rest2 >= s){ cover.push(s); rest2 -= s; } });
      add(cover);
    }
    if (total - 8 > 0){
      var c2 = [4, 4], rest3 = total - 8;
      sizes.forEach(function (s){ while (s > 0 && rest3 >= s){ c2.push(s); rest3 -= s; } });
      add(c2);
    }
    return out;
  }

  function describe(res){
    if (!res || !res.ok) return (res && res.why) || '';
    return res.parts.length + ' ריצות: ' + format(res.parts) + ' = ' + res.total + ' עמ׳';
  }

  return { SIG: SIG, parse: parse, isValid: isValid, format: format, ranges: ranges,
           suggestions: suggestions, describe: describe };
});
