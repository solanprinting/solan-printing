/* ═══════════ card-marker.js — מרקר צהוב על כרטיס העבודה ═══════════
   שומר "מה סומן" על הכרטיס כך שהסימון שורד רענון, סנכרון ועריכה.

   כל סימון = { path, text }:
     path — מיקום האלמנט בתוך הכרטיס המודפס (אינדקסים מופרדים בנקודה)
     text — תקציר הטקסט שסומן, כדי לזהות אם המיקום עדיין נכון

   אחרי עריכת כרטיס המבנה יכול לזוז. resolve() מטפל בזה:
   • path+text תואמים        → מסמנים שם
   • ה-path זז אבל הטקסט קיים → מסמנים במיקום החדש (moved)
   • הטקסט נעלם              → הסימון מת (stale) ונמחק

   הקוד טהור — אין DOM — כדי שייבדק ב-Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CardMarker = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_TEXT = 80;

  function normText(s){
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  }

  function make(path, text){
    var p = String(path == null ? '' : path).trim();
    if (!p) return null;
    return { path: p, text: normText(text) };
  }

  function key(m){ return m ? String(m.path) : ''; }

  function has(marks, path){
    return (marks || []).some(function (m){ return key(m) === String(path); });
  }

  /* הוספה/הסרה — מחזיר מערך חדש (לא משנה את המקור) */
  function toggle(marks, mark){
    var list = (marks || []).filter(function (m){ return m && m.path; });
    if (!mark || !mark.path) return list;
    if (has(list, mark.path)) return list.filter(function (m){ return key(m) !== key(mark); });
    return list.concat([{ path: mark.path, text: normText(mark.text) }]);
  }

  function remove(marks, path){
    return (marks || []).filter(function (m){ return key(m) !== String(path); });
  }

  function clear(){ return []; }

  function count(marks){ return (marks || []).filter(function (m){ return m && m.path; }).length; }

  /* התאמת הסימונים לתוכן הנוכחי.
     nodes = [{path, text}] — כל האלמנטים שניתן לסמן בכרטיס המוצג עכשיו. */
  function resolve(marks, nodes){
    var list = (marks || []).filter(function (m){ return m && m.path; });
    var ns = (nodes || []).map(function (n){ return { path: String(n.path), text: normText(n.text) }; });
    var byPath = {}, byText = {};
    ns.forEach(function (n){
      byPath[n.path] = n;
      if (n.text && byText[n.text] === undefined) byText[n.text] = n.path;
      else if (n.text && byText[n.text] !== n.path) byText[n.text] = byText[n.text];   // הראשון קובע
    });
    var paths = [], moved = [], stale = [];
    list.forEach(function (m){
      var n = byPath[m.path];
      if (n && (!m.text || n.text === m.text)){ paths.push(m.path); return; }
      if (m.text && byText[m.text] !== undefined && !has(list, byText[m.text])){
        paths.push(byText[m.text]);
        moved.push({ from: m.path, to: byText[m.text], text: m.text });
        return;
      }
      if (n && !m.text){ paths.push(m.path); return; }
      stale.push(m);
    });
    return { paths: paths, moved: moved, stale: stale };
  }

  /* הסימונים אחרי resolve — מוכנים לשמירה חזרה על הכרטיס */
  function reanchor(marks, nodes){
    var r = resolve(marks, nodes), out = [], seen = {};
    r.paths.forEach(function (p){
      if (seen[p]) return; seen[p] = 1;
      var n = (nodes || []).filter(function (x){ return String(x.path) === p; })[0];
      out.push({ path: p, text: normText(n ? n.text : '') });
    });
    return out;
  }

  /* עיצוב המרקר — צהוב חי, קצוות לא-אחידים, נשמר גם בהדפסה */
  function css(cls){
    var c = '.' + (cls || 'mk-hl');
    return c + '{background-image:linear-gradient(104deg,rgba(255,240,0,0) 0.2%,rgba(255,236,20,.92) 2.2%,rgba(255,224,0,.78) 96%,rgba(255,240,0,0) 99%);'
      + 'border-radius:.75em .3em .85em .35em;padding:.06em .32em;margin:0 -.12em;'
      + 'box-decoration-break:clone;-webkit-box-decoration-break:clone;'
      + '-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}'
      + '@media print{' + c + '{background-image:linear-gradient(104deg,rgba(255,240,0,0) 0.2%,rgba(255,236,20,1) 2.2%,rgba(255,224,0,.9) 96%,rgba(255,240,0,0) 99%)}}';
  }

  return { normText: normText, make: make, key: key, has: has, toggle: toggle, remove: remove,
           clear: clear, count: count, resolve: resolve, reanchor: reanchor, css: css, MAX_TEXT: MAX_TEXT };
});
