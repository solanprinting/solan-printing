/* ═══════════ sheet-template.js — טמפלט גיליון מטקסט חופשי ═══════════
   המשתמש כותב בעברית מה הוא רוצה על הגיליון, לדוגמה:

       3 פעמים A3 קיפול
       2 פעמים A4
       פעם אחת A5

   parse()  → פריטים מנורמלים (כמות · מידה במ״מ · קיפול)
   layout() → סידור בפועל על שטח ההדפסה (אריזת מדפים עם סיבוב)

   כל היחידות במ״מ. הקוד טהור — אין DOM — כדי שייבדק ב-Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SheetTemplate = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* סדרת A במ״מ (לאורך: רוחב×גובה) */
  var SIZES = {
    A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420],
    A4: [210, 297],  A5: [148, 210], A6: [105, 148], A7: [74, 105]
  };

  var WORD_NUM = {
    'אחת': 1, 'אחד': 1, 'פעמיים': 2, 'שתיים': 2, 'שניים': 2, 'שתי': 2, 'שני': 2,
    'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
    'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
    'עשר': 10, 'עשרה': 10
  };

  function _norm(s){
    return String(s == null ? '' : s)
      .replace(/[×хX]/g, 'x')
      .replace(/["״'׳]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sizeNames(){ return Object.keys(SIZES); }

  /* כמות מהשורה. מחזיר null אם לא נמצאה כמות מפורשת (ואז 1). */
  function _count(line){
    var m = line.match(/(\d+)\s*(?:פעמים|פעם|יח|יחידות|עותקים|כפול)?\b/);
    var xm = line.match(/\bx\s*(\d+)\b/) || line.match(/\b(\d+)\s*x(?!\s*\d)/);
    var w;
    for (var k in WORD_NUM) if (new RegExp('(^|\\s)' + k + '(\\s|$)').test(line)) { w = WORD_NUM[k]; break; }
    if (xm) return parseInt(xm[1], 10);
    if (w) return w;
    if (m && !/^\s*\d+\s*x/.test(line)) {
      // "3 פעמים A3" — המספר הראשון הוא הכמות, אלא אם הוא חלק ממידה (297x420) או מסדרת A
      var idx = line.indexOf(m[0]);
      var after = line.slice(idx + m[0].length);
      if (!/^\s*x/i.test(after) && !/A\s*$/i.test(line.slice(0, idx))) return parseInt(m[1], 10);
    }
    return null;
  }

  /* מידה מהשורה: A3 / 297x420 / 32x45 ס"מ */
  function _size(line){
    var cm = /(?:ס"מ|סמ|cm)/i.test(line);
    var d = line.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if (d){
      var w = parseFloat(d[1]), h = parseFloat(d[2]);
      if (cm){ w *= 10; h *= 10; }
      if (w > 0 && h > 0) return { w: w, h: h, name: Math.round(w) + '×' + Math.round(h) };
    }
    var a = line.match(/\bA\s*([0-7])\b/i);
    if (a){
      var nm = 'A' + a[1], s = SIZES[nm];
      return { w: s[0], h: s[1], name: nm };
    }
    return null;
  }

  function _orient(line, sz){
    var land = /לרוחב|רוחבי|landscape/i.test(line);
    var port = /לאורך|אורכי|portrait/i.test(line);
    var w = sz.w, h = sz.h;
    if (land && h > w) { var t = w; w = h; h = t; }
    if (port && w > h) { var t2 = w; w = h; h = t2; }
    return { w: w, h: h, forced: !!(land || port) };
  }

  /* ניתוח הטקסט כולו. מחזיר {ok, items, errors}. */
  function parse(text){
    var lines = String(text == null ? '' : text).split(/\r?\n|;/);
    var items = [], errors = [];
    lines.forEach(function (raw, i){
      var line = _norm(raw);
      if (!line || /^[#\/]/.test(line)) return;
      var sz = _size(line);
      if (!sz){ errors.push({ line: i + 1, raw: line, why: 'לא זוהתה מידה (A3 / 297x420 / 32x45 ס״מ)' }); return; }
      var o = _orient(line, sz);
      var c = _count(line);
      var n = (c == null) ? 1 : c;
      if (!(n > 0)){ errors.push({ line: i + 1, raw: line, why: 'כמות לא תקינה' }); return; }
      var fold = /קיפול|מקופל|קפל/.test(line);
      items.push({ count: n, widthMm: o.w, heightMm: o.h, sizeName: sz.name, fold: fold,
        forcedOrientation: o.forced, label: sz.name + (fold ? ' קיפול' : ''), line: i + 1, raw: line });
    });
    return { ok: items.length > 0, items: items, errors: errors };
  }

  function totalCount(items){
    return (items || []).reduce(function (a, it){ return a + (it.count || 0); }, 0);
  }

  /* פירוק לפריטים בודדים, בסדר שנכתב */
  function expand(items){
    var out = [];
    (items || []).forEach(function (it, gi){
      for (var i = 0; i < it.count; i++)
        out.push({ widthMm: it.widthMm, heightMm: it.heightMm, label: it.label, fold: !!it.fold,
          sizeName: it.sizeName, group: gi, copy: i + 1, forcedOrientation: !!it.forcedOrientation });
    });
    return out;
  }

  /* ── אריזה: MaxRects עם Best-Short-Side-Fit וסיבוב ──
     המרווח מטופל בהגדלת כל פריט ב-gap ובהגדלת המכל ב-gap, כך שנשמר
     רווח בין פריטים ואין רווח מיותר בקצה הגיליון. */
  function _overlaps(a, b){
    return a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 &&
           a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
  }
  function _contains(a, b){   // a מכיל את b
    return b.x >= a.x - 1e-6 && b.y >= a.y - 1e-6 &&
           b.x + b.w <= a.x + a.w + 1e-6 && b.y + b.h <= a.y + a.h + 1e-6;
  }
  function _prune(list){
    var out = [];
    list.forEach(function (r){
      if (!(r.w > 1e-6 && r.h > 1e-6)) return;
      for (var i = 0; i < list.length; i++){
        var o = list[i];
        if (o !== r && o.w > 1e-6 && o.h > 1e-6 && _contains(o, r) && !(o.x === r.x && o.y === r.y && o.w === r.w && o.h === r.h)) return;
      }
      for (var j = 0; j < out.length; j++)
        if (_contains(out[j], r)) return;
      out.push(r);
    });
    return out;
  }
  function _pack(units, W, H, gap, rotate, preferRotated){
    var free = [{ x: 0, y: 0, w: W + gap, h: H + gap }], boxes = [], unplaced = [];
    units.forEach(function (u){
      var cands = [{ w: u.widthMm + gap, h: u.heightMm + gap, rot: false }];
      if (rotate && !u.forcedOrientation && u.widthMm !== u.heightMm)
        cands.push({ w: u.heightMm + gap, h: u.widthMm + gap, rot: true });
      if (preferRotated) cands.reverse();
      var best = null;
      free.forEach(function (fr){
        cands.forEach(function (c){
          if (c.w > fr.w + 1e-6 || c.h > fr.h + 1e-6) return;
          var s1 = Math.min(fr.w - c.w, fr.h - c.h), s2 = Math.max(fr.w - c.w, fr.h - c.h);
          if (!best || s1 < best.s1 - 1e-6 || (Math.abs(s1 - best.s1) < 1e-6 && s2 < best.s2 - 1e-6))
            best = { x: fr.x, y: fr.y, w: c.w, h: c.h, rot: c.rot, s1: s1, s2: s2 };
        });
      });
      if (!best){ unplaced.push(u); return; }
      boxes.push({ xMm: best.x, yMm: best.y, widthMm: best.w - gap, heightMm: best.h - gap,
        rotated: best.rot, label: u.label, fold: u.fold, sizeName: u.sizeName,
        group: u.group, copy: u.copy, index: u._i });
      var used = { x: best.x, y: best.y, w: best.w, h: best.h }, next = [];
      free.forEach(function (fr){
        if (!_overlaps(fr, used)){ next.push(fr); return; }
        if (used.x > fr.x) next.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
        if (used.x + used.w < fr.x + fr.w) next.push({ x: used.x + used.w, y: fr.y, w: fr.x + fr.w - (used.x + used.w), h: fr.h });
        if (used.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
        if (used.y + used.h < fr.y + fr.h) next.push({ x: fr.x, y: used.y + used.h, w: fr.w, h: fr.y + fr.h - (used.y + used.h) });
      });
      free = _prune(next);
    });
    return { boxes: boxes, unplaced: unplaced };
  }
  /* מריץ כמה אסטרטגיות ובוחר את זו שמכניסה הכי הרבה (ואז את הקומפקטית ביותר) */
  function layout(opt){
    opt = opt || {};
    var W = +opt.widthMm || 0, H = +opt.heightMm || 0;
    var gap = (opt.gapMm == null) ? 3 : (+opt.gapMm || 0);
    var rotate = opt.allowRotate !== false;
    var units = (opt.units || expand(opt.items || [])).map(function (u, i){
      return Object.assign({}, u, { _i: i });
    });
    if (!(W > 0 && H > 0)) return { ok: false, why: 'מידות שטח ההדפסה לא תקינות', boxes: [], unplaced: units.slice(), usedPct: 0, rows: 0 };
    var byArea = units.slice().sort(function (a, b){
      var d = (b.widthMm * b.heightMm) - (a.widthMm * a.heightMm);
      return d || (a._i - b._i);
    });
    var tries = [[units, false], [units, true], [byArea, false], [byArea, true]];
    var best = null;
    tries.forEach(function (t){
      var r = _pack(t[0], W, H, gap, rotate, t[1]);
      var bottom = r.boxes.reduce(function (a, b){ return Math.max(a, b.yMm + b.heightMm); }, 0);
      if (!best || r.boxes.length > best.r.boxes.length ||
         (r.boxes.length === best.r.boxes.length && bottom < best.bottom - 1e-6))
        best = { r: r, bottom: bottom };
    });
    var boxes = best.r.boxes.slice().sort(function (a, b){ return a.index - b.index; });
    var ys = {}; boxes.forEach(function (b){ ys[Math.round(b.yMm)] = 1; });
    var used = boxes.reduce(function (a, b){ return a + b.widthMm * b.heightMm; }, 0);
    return { ok: boxes.length > 0, boxes: boxes, unplaced: best.r.unplaced, rows: Object.keys(ys).length,
      usedPct: Math.round(used / (W * H) * 1000) / 10 };
  }

  /* קו הקיפול של פריט — במרכז הצלע הארוכה */
  function foldLine(box){
    if (!box || !box.fold) return null;
    return (box.widthMm >= box.heightMm)
      ? { orient: 'v', xMm: box.xMm + box.widthMm / 2, y1Mm: box.yMm, y2Mm: box.yMm + box.heightMm }
      : { orient: 'h', yMm: box.yMm + box.heightMm / 2, x1Mm: box.xMm, x2Mm: box.xMm + box.widthMm };
  }

  /* תקציר קריא לחיווי בממשק */
  function describe(res){
    if (!res || !res.items || !res.items.length) return 'לא זוהו פריטים';
    return res.items.map(function (it){
      return it.count + '× ' + it.label + ' (' + Math.round(it.widthMm) + '×' + Math.round(it.heightMm) + ' מ״מ)';
    }).join(' · ');
  }

  function example(){
    return '3 פעמים A3 קיפול\n2 פעמים A4\nפעם אחת A5';
  }

  return { SIZES: SIZES, sizeNames: sizeNames, parse: parse, expand: expand, layout: layout,
           foldLine: foldLine, totalCount: totalCount, describe: describe, example: example };
});
