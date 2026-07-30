/* ═══════════ clerk-memory.js — זיכרון לומד למסך המשרד ═══════════════════════
 * המשרד מקליד את אותם דברים שוב ושוב: אותו לקוח, אותם פריטים, אותן כמויות,
 * אותה אסמכתא, אותו יעד. כאן נשמר מה שכבר נעשה בפועל, וממנו נגזרות הצעות-השלמה
 * לפעם הבאה — בלי למלא אוטומטית משהו שלא נאמר, ובלי להמציא.
 *
 * מודל: profile לכל לקוח (מנורמל) —
 *   { orders, lastAt, titles:{t:n}, refs:{r:n}, sites:{s:n}, items:{ name:{n,lastQty,qtys:{q:n}} } }
 * נשמר ב-Firebase `clerkMemory` (משותף לכל המשרד) — עובדה נלמדת פעם אחת ומשרתת את כולם.
 *
 * הכל טהור: בלי DOM ובלי רשת. נבדק ב-Node.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClerkMemory = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_PER_FIELD = 12;      // כמה ערכים שונים נזכור לכל שדה (הנפוצים ביותר)
  var MIN_HITS = 1;            // מספיק שנעשה פעם אחת כדי להציע (המשרד רוצה עזרה מיד)

  function _s(v){ return v == null ? '' : String(v).trim(); }
  function _n(v){ v = parseInt(v, 10); return isFinite(v) && v > 0 ? v : 0; }
  function normName(v){ return _s(v).replace(/["'.,\-()]/g, '').replace(/\s+/g, ' ').toLowerCase(); }

  function emptyProfile(){ return { orders: 0, lastAt: 0, titles: {}, refs: {}, sites: {}, items: {} }; }

  function _bump(map, key, max){
    key = _s(key); if (!key) return;
    map[key] = (map[key] || 0) + 1;
    var ks = Object.keys(map);
    if (ks.length > (max || MAX_PER_FIELD)) {            // שומרים את הנפוצים בלבד
      ks.sort(function (a, b){ return map[b] - map[a]; }).slice(max || MAX_PER_FIELD)
        .forEach(function (k){ delete map[k]; });
    }
  }

  /* לומדים מהזמנה שנרשמה בפועל.
     order = { customer, title, reference, siteNum, at, lines:[{name,qty,packs}] } */
  function learn(mem, order){
    mem = (mem && typeof mem === 'object') ? mem : {};
    order = order || {};
    var key = normName(order.customer);
    if (!key) return mem;
    var p = mem[key] = Object.assign(emptyProfile(), mem[key] || {});
    p.titles = p.titles || {}; p.refs = p.refs || {}; p.sites = p.sites || {}; p.items = p.items || {};
    p.orders = (p.orders || 0) + 1;
    p.lastAt = Math.max(p.lastAt || 0, _n(order.at));
    p.name = _s(order.customer) || p.name;               // שם-התצוגה כפי שהוקלד
    _bump(p.titles, order.title);
    _bump(p.refs, order.reference);
    _bump(p.sites, order.siteNum);
    (order.lines || []).forEach(function (l){
      var nm = _s(l && l.name); if (!nm) return;
      var it = p.items[nm] = p.items[nm] || { n: 0, lastQty: 0, qtys: {} };
      it.n++;
      var q = _n(l.qty) || _n(l.packs);
      if (q) { it.lastQty = q; _bump(it.qtys, String(q), 6); }
    });
    // תקרה: שומרים עד 40 פריטים שונים לכל לקוח (הנפוצים)
    var inames = Object.keys(p.items);
    if (inames.length > 40) inames.sort(function (a, b){ return p.items[b].n - p.items[a].n; })
      .slice(40).forEach(function (k){ delete p.items[k]; });
    return mem;
  }

  function profileFor(mem, customer){
    var p = (mem || {})[normName(customer)];
    return p ? Object.assign(emptyProfile(), p) : null;
  }

  function _top(map, limit){
    return Object.keys(map || {})
      .filter(function (k){ return (map[k] || 0) >= MIN_HITS; })
      .sort(function (a, b){ return map[b] - map[a] || a.localeCompare(b, 'he'); })
      .slice(0, limit || 5);
  }

  /* הצעות-השלמה ללקוח: מה הכי מתאים למלא עכשיו לפי מה שכבר נעשה */
  function suggest(mem, customer){
    var p = profileFor(mem, customer);
    if (!p) return { known: false, orders: 0, titles: [], refs: [], sites: [], items: [] };
    var items = Object.keys(p.items).map(function (nm){
      var it = p.items[nm];
      return { name: nm, times: it.n, lastQty: it.lastQty || 0, topQty: _n(_top(it.qtys, 1)[0]) || it.lastQty || 0 };
    }).sort(function (a, b){ return b.times - a.times || a.name.localeCompare(b.name, 'he'); }).slice(0, 12);
    return { known: true, orders: p.orders || 0, lastAt: p.lastAt || 0,
             titles: _top(p.titles, 5), refs: _top(p.refs, 3), sites: _top(p.sites, 3), items: items };
  }

  /* שורות מוצעות להזמנה חדשה — הפריטים הקבועים של הלקוח עם הכמות הרגילה שלו */
  function suggestedLines(mem, customer, limit){
    return suggest(mem, customer).items.slice(0, limit || 6)
      .filter(function (it){ return it.times >= MIN_HITS; })
      .map(function (it){ return { name: it.name, qty: it.topQty || 0, times: it.times }; });
  }

  /* תקציר קריא לתצוגה: "3 הזמנות · בד״כ: פלייסמנט רפאל (10)" */
  function summaryText(mem, customer){
    var s = suggest(mem, customer);
    if (!s.known) return '';
    var bits = [s.orders + ' הזמנות קודמות'];
    if (s.items.length) bits.push('בד״כ: ' + s.items.slice(0, 3)
      .map(function (i){ return i.name + (i.topQty ? (' (' + i.topQty + ')') : ''); }).join(' · '));
    if (s.sites.length) bits.push('אתר ' + s.sites[0]);
    return bits.join(' · ');
  }

  return { MAX_PER_FIELD: MAX_PER_FIELD, normName: normName, emptyProfile: emptyProfile,
           learn: learn, profileFor: profileFor, suggest: suggest,
           suggestedLines: suggestedLines, summaryText: summaryText };
});
