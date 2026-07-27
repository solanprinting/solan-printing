/* ═══════════════════════════════════════════════════════════════════════════
 * framework-orders.js — הסכמי-מסגרת ללקוחות · לוגיקה טהורה (UMD · Node + דפדפן)
 * ───────────────────────────────────────────────────────────────────────────
 * מודל: הסכם-מסגרת לכל לקוח, ובו פריטים (מק"ט אופציונלי) עם כמות מוסכמת ומחיר-יחידה.
 * כל משיכה (הזמנה על-חשבון-ההסכם) מורידה כמות — והמעקב הוא *כפול*: יתרת-כמות ויתרת-כסף.
 * הכל טהור: אין DOM/Firebase/רשת. החישוב הוא מקור-האמת היחיד לתצוגה ולשמירה.
 *
 * ⚠️ כללי-ברזל:
 *   • משיכות נשמרות כתנועות (movements) — היתרה תמיד *נגזרת* מהן, לא נשמרת בנפרד.
 *     כך אין "יתרה שנתקעה" אחרי עריכה/מחיקה, ותמיד יש היסטוריה מלאה לביקורת.
 *   • כמויות שלמות ולא-שליליות; מחירים במספרים (₪). חריגה מותרת אך *מסומנת*.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FrameworkOrders = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var STATUSES = ['active', 'closed', 'suspended'];
  var MOVE_TYPES = ['draw', 'return', 'adjust'];   // משיכה · זיכוי/החזרה · תיקון-ידני

  function _num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function _int(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function _s(v) { return String(v == null ? '' : v).trim(); }

  // ── מזהים ──────────────────────────────────────────────────────────────────
  function makeId(prefix, rng) {
    var r = rng ? rng() : Math.random();
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + r.toString(36).slice(2, 7);
  }

  // ── פריט בהסכם ─────────────────────────────────────────────────────────────
  //    sku אופציונלי (יש פריטים בלי מק"ט). name חובה.
  function buildItem(input) {
    input = input || {};
    var name = _s(input.name);
    if (!name) return { ok: false, errors: ['ITEM_NAME_REQUIRED'] };
    var qty = _int(input.qty);
    if (qty < 0) return { ok: false, errors: ['ITEM_QTY_NEGATIVE'] };
    return {
      ok: true,
      item: {
        itemId: _s(input.itemId) || makeId('it', input.rng),
        sku: _s(input.sku) || null,              // מק"ט — אופציונלי
        name: name,
        unit: _s(input.unit) || 'יח׳',
        qty: qty,                                 // כמות מוסכמת בהסכם (ביחידות)
        // ⚠️ תמחור בענף: המחיר הוא ל-**1000 יח׳** ולא ליחידה.
        //    20 קרטונים × 2000 = 40,000 יח׳ ⇒ לחיוב: 40 × המחיר-ל-1000.
        price1000: _num(input.price1000 != null ? input.price1000 : input.unitPrice),
        unitPrice: _num(input.price1000 != null ? input.price1000 : input.unitPrice),   // תאימות-לאחור (אותו ערך)
        packSize: _int(input.packSize) > 0 ? _int(input.packSize) : 0,   // יח' בקרטון/חבילה (0 = לא רלוונטי)
        packName: _s(input.packName) || 'קרטון',                        // קרטון / חבילה / אריזה
        notes: _s(input.notes) || null
      }
    };
  }

  // ── הסכם-מסגרת ─────────────────────────────────────────────────────────────
  function buildAgreement(input) {
    input = input || {};
    var customer = _s(input.customer);
    var errors = [];
    if (!customer) errors.push('CUSTOMER_REQUIRED');
    var items = [];
    (input.items || []).forEach(function (it, i) {
      var b = buildItem(it);
      if (!b.ok) errors.push('ITEM_' + i + ':' + b.errors.join(','));
      else items.push(b.item);
    });
    if (errors.length) return { ok: false, errors: errors };
    return {
      ok: true,
      agreement: {
        agreementId: _s(input.agreementId) || makeId('fw', input.rng),
        customer: customer,
        // 'framework' = הסכם מסגרת עם מלאי · 'orders' = לקוח רגיל שרק נרשמות לו הזמנות
        kind: input.kind === 'orders' ? 'orders' : 'framework',
        title: _s(input.title) || ((input.kind === 'orders' ? 'הזמנות — ' : 'הסכם מסגרת — ') + customer),
        agreementNo: _s(input.agreementNo) || null,   // מספר הסכם (פנימי/מול הלקוח)
        poNumber: _s(input.poNumber) || null,         // מספר הזמנת-רכש (PO) של הלקוח
        status: STATUSES.indexOf(input.status) >= 0 ? input.status : 'active',
        startDate: _s(input.startDate) || null,
        endDate: _s(input.endDate) || null,        // תוקף — לתזכורת פקיעה
        budget: _num(input.budget),                // תקרה כספית כוללת (0 = ללא תקרה)
        items: items,
        movements: [],                             // תנועות — מקור-האמת ליתרה (נוצרות רק באישור אספקה)
        orders: [],                                // הזמנות לקוח: 'pending' משריינות, 'supplied' כבר ירדו
        notes: _s(input.notes) || null,
        createdAt: _s(input.createdAt) || null,
        createdBy: _s(input.createdBy) || null
      }
    };
  }

  // ── תנועה (משיכה / החזרה / תיקון) ──────────────────────────────────────────
  function buildMovement(input) {
    input = input || {};
    var type = MOVE_TYPES.indexOf(input.type) >= 0 ? input.type : 'draw';
    var itemId = _s(input.itemId);
    if (!itemId) return { ok: false, errors: ['MOVE_ITEM_REQUIRED'] };
    var qty = _int(input.qty);
    if (qty <= 0) return { ok: false, errors: ['MOVE_QTY_POSITIVE'] };
    return {
      ok: true,
      movement: {
        moveId: _s(input.moveId) || makeId('mv', input.rng),
        itemId: itemId,
        type: type,
        qty: qty,                                  // תמיד ביחידות (מקור-אמת יחיד)
        packs: input.packs != null ? _int(input.packs) : null,   // כמה קרטונים הוזמנו (לתיעוד)
        packSize: input.packSize != null ? _int(input.packSize) : null,
        // עקיפת-מחיר לתנועה (מבצע/הנחה) — ל-1000 יח׳, כמו בפריט. null → מחיר-הפריט בהסכם.
        price1000: input.price1000 != null ? _num(input.price1000) : (input.unitPrice != null ? _num(input.unitPrice) : null),
        unitPrice: input.price1000 != null ? _num(input.price1000) : (input.unitPrice != null ? _num(input.unitPrice) : null),
        orderRef: _s(input.orderRef) || null,     // מס' הזמנה/כרטיס-עבודה
        date: _s(input.date) || null,
        by: _s(input.by) || null,
        notes: _s(input.notes) || null
      }
    };
  }

  // כיוון-התנועה: משיכה מורידה · החזרה/תיקון מוסיפים בחזרה
  function _sign(type) { return type === 'draw' ? -1 : 1; }

  // השורות הקובעות של הזמנה: מה שיצא בפועל מהייצור (אם סומנה "מוכנה"), אחרת מה שהוזמן.
  function effectiveLines(order) {
    if (!order) return [];
    if (order.ready && (order.ready.lines || []).length) return order.ready.lines;
    return order.lines || [];
  }

  // ── חישוב יתרות — הלב של הכלי ──────────────────────────────────────────────
  //    מחזיר לכל פריט: מוסכם · נמשך · יתרה · ערך-כספי, וסיכום כולל להסכם.
  function computeBalances(agreement) {
    var ag = agreement || {};
    var items = ag.items || [], moves = ag.movements || [];
    var byId = {};
    items.forEach(function (it) {
      byId[it.itemId] = {
        itemId: it.itemId, sku: it.sku || null, name: it.name, unit: it.unit || 'יח׳',
        agreedQty: _int(it.qty),
        // מחיר ל-1000 יח׳ (מקור-אמת לתמחור). unitPrice נשמר לתאימות בלבד.
        price1000: _num(it.price1000 != null ? it.price1000 : it.unitPrice),
        unitPrice: _num(it.price1000 != null ? it.price1000 : it.unitPrice),
        packSize: _int(it.packSize), packName: it.packName || 'קרטון',
        drawnQty: 0, returnedQty: 0, remainingQty: 0,
        pendingQty: 0, pendingValue: 0,            // משוריין בהזמנות ממתינות — עדיין לא ירד מהמלאי
        agreedValue: (_int(it.qty) / 1000) * _num(it.price1000 != null ? it.price1000 : it.unitPrice),
        drawnValue: 0, remainingValue: 0,
        over: false
      };
    });
    var orphanMoves = [];
    moves.forEach(function (m) {
      var row = byId[m.itemId];
      if (!row) { orphanMoves.push(m.moveId || null); return; }   // תנועה לפריט שנמחק
      var q = _int(m.qty);
      var p1000 = (m.price1000 != null ? _num(m.price1000) : (m.unitPrice != null ? _num(m.unitPrice) : row.price1000));
      var val = (q / 1000) * p1000;                                 // ⚠️ מחיר ל-1000 יח׳
      if (m.type === 'draw') { row.drawnQty += q; row.drawnValue += val; }
      else { row.returnedQty += q; row.drawnValue -= val; }
    });
    // ⚠️ 'pending' ו-'ready' משריינות בלבד — המלאי יורד רק באספקה בפועל (supplyOrder → תנועה).
    //    להזמנה שסומנה "מוכנה" משריינים את הכמות שיצאה בפועל מהייצור.
    (ag.orders || []).forEach(function (o) {
      if (!o || (o.status !== 'pending' && o.status !== 'ready')) return;
      (effectiveLines(o) || []).forEach(function (ln) {
        var row = byId[ln.itemId]; if (!row) return;
        var q = _int(ln.qty);
        row.pendingQty += q;
        row.pendingValue += (q / 1000) * (ln.price1000 != null ? _num(ln.price1000) : row.price1000);
      });
    });

    var list = items.map(function (it) {
      var r = byId[it.itemId];
      r.remainingQty = r.agreedQty - r.drawnQty + r.returnedQty;
      // "פנוי" = היתרה בפועל פחות מה שכבר הובטח בהזמנות ממתינות
      r.availableQty = r.remainingQty - r.pendingQty;
      r.shortForPending = r.availableQty < 0;
      r.remainingValue = r.agreedValue - r.drawnValue;
      r.over = r.remainingQty < 0;                                 // חריגה מהכמות המוסכמת
      // המרה לחבילות (כשהוגדר גודל-חבילה) — לתצוגה בלבד; מקור-האמת הוא היחידות
      r.remainingPacks = r.packSize > 0 ? Math.floor(r.remainingQty / r.packSize) : null;
      r.agreedPacks    = r.packSize > 0 ? Math.floor(r.agreedQty / r.packSize) : null;
      r.availablePacks = r.packSize > 0 ? Math.floor(r.availableQty / r.packSize) : null;
      r.pendingPacks   = r.packSize > 0 ? Math.floor(r.pendingQty / r.packSize) : null;
      return r;
    });
    var totals = list.reduce(function (a, r) {
      a.agreedQty += r.agreedQty; a.drawnQty += (r.drawnQty - r.returnedQty);
      a.remainingQty += r.remainingQty;
      a.pendingQty += r.pendingQty; a.pendingValue += r.pendingValue; a.availableQty += r.availableQty;
      a.agreedValue += r.agreedValue; a.drawnValue += r.drawnValue; a.remainingValue += r.remainingValue;
      if (r.over) a.overItems++;
      if (r.shortForPending) a.shortItems++;
      return a;
    }, { agreedQty: 0, drawnQty: 0, remainingQty: 0, pendingQty: 0, pendingValue: 0, availableQty: 0,
         agreedValue: 0, drawnValue: 0, remainingValue: 0, overItems: 0, shortItems: 0 });
    totals.pendingOrders = (ag.orders || []).filter(function (o) { return o && o.status === 'pending'; }).length;
    totals.readyOrders   = (ag.orders || []).filter(function (o) { return o && o.status === 'ready'; }).length;

    // תקרה כספית (אם הוגדרה) — נמדדת מול הערך שנמשך בפועל
    var budget = _num(ag.budget);
    totals.budget = budget;
    totals.budgetRemaining = budget > 0 ? (budget - totals.drawnValue) : null;
    totals.budgetOver = budget > 0 && totals.drawnValue > budget;
    totals.pctUsed = totals.agreedQty > 0 ? Math.round((totals.drawnQty / totals.agreedQty) * 100) : 0;
    return { items: list, totals: totals, orphanMoves: orphanMoves };
  }

  // ── בדיקה לפני משיכה: האם יש מספיק יתרה? (לא חוסם — מתריע) ─────────────────
  function checkDraw(agreement, itemId, qty) {
    var b = computeBalances(agreement);
    var row = b.items.find(function (r) { return r.itemId === itemId; });
    if (!row) return { ok: false, reason: 'ITEM_NOT_FOUND' };
    var q = _int(qty);
    if (q <= 0) return { ok: false, reason: 'QTY_POSITIVE' };
    var after = row.remainingQty - q;
    return {
      ok: true, remainingBefore: row.remainingQty, remainingAfter: after,
      exceeds: after < 0, shortBy: after < 0 ? -after : 0,
      valueAfter: row.remainingValue - (q / 1000) * row.price1000   // מחיר ל-1000 יח׳
    };
  }

  // ── הוספת תנועה (מחזיר הסכם חדש — ללא מוטציה) ──────────────────────────────
  function applyMovement(agreement, movementInput) {
    var mb = buildMovement(movementInput);
    if (!mb.ok) return { ok: false, errors: mb.errors };
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    if (!(ag.items || []).some(function (it) { return it.itemId === mb.movement.itemId; }))
      return { ok: false, errors: ['ITEM_NOT_IN_AGREEMENT'] };
    ag.movements = (ag.movements || []).concat([mb.movement]);
    return { ok: true, agreement: ag, movement: mb.movement };
  }

  // ── התראות: פריטים שאזלו/נמוכים · תקרה · פקיעת-תוקף ────────────────────────
  function alerts(agreement, opts) {
    opts = opts || {};
    var lowPct = opts.lowPct != null ? opts.lowPct : 15;    // "נמוך" = פחות מ-15% מהמוסכם
    var b = computeBalances(agreement), out = [];
    b.items.forEach(function (r) {
      if (r.agreedQty <= 0) return;
      // המלאי הפנוי לא מכסה את ההזמנות הממתינות — אי-אפשר לספק הכל
      if (r.shortForPending) out.push({ level: 'short', itemId: r.itemId, name: r.name, sku: r.sku, remaining: r.remainingQty, pending: r.pendingQty, shortBy: -r.availableQty });
      if (r.remainingQty <= 0) out.push({ level: 'out', itemId: r.itemId, name: r.name, sku: r.sku, remaining: r.remainingQty });
      else if ((r.remainingQty / r.agreedQty) * 100 <= lowPct) out.push({ level: 'low', itemId: r.itemId, name: r.name, sku: r.sku, remaining: r.remainingQty });
    });
    if (b.totals.budgetOver) out.push({ level: 'budget', over: b.totals.drawnValue - b.totals.budget });
    if (agreement && agreement.endDate && opts.todayIso && String(opts.todayIso) > String(agreement.endDate))
      out.push({ level: 'expired', endDate: agreement.endDate });
    return out;
  }

  // ── חיפוש פריט לפי מק"ט או שם (לשיוך הזמנה נכנסת) ──────────────────────────
  function findItem(agreement, query) {
    var q = _s(query).toLowerCase(); if (!q) return null;
    var items = (agreement && agreement.items) || [];
    var bySku = items.find(function (it) { return it.sku && String(it.sku).toLowerCase() === q; });
    if (bySku) return bySku;
    var byName = items.find(function (it) { return String(it.name).toLowerCase() === q; });
    if (byName) return byName;
    return items.find(function (it) { return String(it.name).toLowerCase().indexOf(q) >= 0; }) || null;
  }

  // ── קליטת הזמנה: טקסט/CSV → שורות {sku?, name?, qty} ──────────────────────
  //    תומך בפורמטים נפוצים: "AL-100, 5000" · "AL-100 x5000" · "עלון שבועי 5000" ·
  //    "5000 עלון שבועי" · שורות CSV עם כותרת. מתעלם משורות ריקות/כותרות.
  function parseOrderText(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/), out = [];
    var HEAD = /^\s*(מק|sku|פריט|item|כמות|qty|תיאור|desc)/i;
    lines.forEach(function (raw) {
      var s = _s(raw); if (!s) return;
      if (HEAD.test(s) && !/\d/.test(s)) return;                  // שורת-כותרת
      var parts = s.split(/[,\t;|]/).map(_s).filter(function (x) { return x !== ''; });
      var sku = null, name = null, qty = 0;
      if (parts.length >= 2) {
        // עמודות: מזהה + כמות (הכמות = העמודה המספרית האחרונה)
        var nums = parts.filter(function (p) { return /^\d[\d,\.]*$/.test(p); });
        if (nums.length) {
          qty = _int(String(nums[nums.length - 1]).replace(/[,\.]/g, ''));
          var rest = parts.filter(function (p) { return p !== nums[nums.length - 1]; });
          if (rest.length) { name = rest[rest.length - 1]; if (rest.length > 1) sku = rest[0]; }
        }
      }
      if (!qty) {
        // שורה חופשית: "…x5000" / "5000 …" / "… 5000"
        var m = s.match(/[xX*×]\s*(\d[\d,]*)\s*$/) || s.match(/(\d[\d,]{2,})\s*$/) || s.match(/^\s*(\d[\d,]{2,})\b/);
        if (m) { qty = _int(m[1].replace(/,/g, '')); name = _s(s.replace(m[0], '')).replace(/[xX*×]\s*$/, ''); }
      }
      if (!qty || !(name || sku)) return;                          // בלי כמות/מזהה — מדלגים
      // מזהה שנראה כמק"ט (אותיות+ספרות/מקפים, בלי רווח) → sku
      if (!sku && name && /^[A-Za-z0-9][A-Za-z0-9\-_.\/]{1,}$/.test(name) && /\d/.test(name)) { sku = name; name = null; }
      out.push({ raw: s, sku: sku || null, name: name || null, qty: qty });
    });
    return out;
  }

  // ── קריאת גיליון (אקסל/CSV) לפי *עמודות* — אמין בהרבה מהמרה-לטקסט ─────────
  //    rows = מערך-שורות (כל שורה מערך-תאים), כמו sheet_to_json(header:1).
  //    מזהה שורת-כותרת בעברית/אנגלית וממפה מק"ט/שם/כמות/מחיר. בלי כותרת —
  //    היוריסטיקה: עמודה מספרית = כמות, הטקסטואלית הארוכה ביותר = שם.
  function parseSheetRows(rows) {
    rows = (rows || []).map(function (r) { return (r || []).map(function (c) { return _s(c); }); })
                       .filter(function (r) { return r.some(function (c) { return c !== ''; }); });
    if (!rows.length) return { lines: [], header: null };

    var RX = {
      sku:   /^(מק["׳']?ט|מקט|קטלוג|sku|code|item\s*code|barcode|ברקוד)/i,
      name:  /^(שם|תיאור|פריט|מוצר|name|item|desc|product)/i,
      qty:   /^(כמות|יחידות|qty|quantity|amount|units)/i,
      price: /^(מחיר|price|unit\s*price|מחיר\s*יח)/i,
      packs: /^(קרטונ|חבילות|חבילה|אריזות|אריזה|packs?|cartons?|boxes?)/i   // הזמנה בקרטונים
    };
    var map = null, headerRow = -1;
    for (var i = 0; i < Math.min(rows.length, 8); i++) {          // כותרת בדרך-כלל ב-8 השורות הראשונות
      var cand = {}, hits = 0;
      rows[i].forEach(function (c, ci) {
        if (map) return;
        Object.keys(RX).forEach(function (k) {
          if (cand[k] === undefined && RX[k].test(c)) { cand[k] = ci; hits++; }
        });
      });
      if ((cand.qty !== undefined || cand.packs !== undefined) && (cand.name !== undefined || cand.sku !== undefined)) { map = cand; headerRow = i; break; }
    }

    var out = [];
    if (map) {
      rows.slice(headerRow + 1).forEach(function (r) {
        var qty = map.qty !== undefined ? _int(String(r[map.qty] || '').replace(/[,\s]/g, '')) : 0;
        var packs = map.packs !== undefined ? _int(String(r[map.packs] || '').replace(/[,\s]/g, '')) : 0;
        var name = map.name !== undefined ? r[map.name] : '';
        var sku = map.sku !== undefined ? r[map.sku] : '';
        if ((!qty && !packs) || (!name && !sku)) return;   // צריך כמות *או* קרטונים
        out.push({ raw: r.join(' | '), sku: sku || null, name: name || null, qty: qty, packs: packs || 0,
                   unitPrice: map.price !== undefined ? _num(String(r[map.price] || '').replace(/[^\d.\-]/g, '')) : 0 });
      });
      return { lines: out, header: map };
    }

    // בלי כותרת: הכמות = התא המספרי האחרון בשורה; השם = התא הטקסטואלי הארוך ביותר
    rows.forEach(function (r) {
      var numIdx = -1;
      for (var j = r.length - 1; j >= 0; j--) { if (/^\d[\d,\s]*$/.test(r[j])) { numIdx = j; break; } }
      if (numIdx < 0) return;
      var qty = _int(r[numIdx].replace(/[,\s]/g, ''));
      if (!qty) return;
      var texts = r.filter(function (c, k) { return k !== numIdx && c && !/^\d[\d,.\s]*$/.test(c); });
      if (!texts.length) return;
      // מזהה שנראה כמק"ט (אותיות+ספרות בלי רווח) → sku; הארוך ביותר → שם
      var sku = texts.find(function (t) { return /^[A-Za-z0-9][A-Za-z0-9\-_.\/]+$/.test(t) && /\d/.test(t); }) || null;
      var name = texts.filter(function (t) { return t !== sku; }).sort(function (x, y) { return y.length - x.length; })[0] || sku;
      out.push({ raw: r.join(' | '), sku: sku, name: name, qty: qty, unitPrice: 0 });
    });
    return { lines: out, header: null };
  }

  // ── שיוך שורות-ההזמנה לפריטי-ההסכם + חישוב לפני/יורד/אחרי ─────────────────
  function matchOrder(agreement, lines) {
    var b = computeBalances(agreement);
    var byId = {}; b.items.forEach(function (r) { byId[r.itemId] = r; });
    var used = {};                                                  // כמויות מצטברות באותה הזמנה
    var rows = (lines || []).map(function (ln) {
      var it = findItem(agreement, ln.sku || '') || findItem(agreement, ln.name || '');
      if (!it) return { raw: ln.raw, sku: ln.sku, name: ln.name, qty: _int(ln.qty), matched: false, itemId: null };
      var r = byId[it.itemId];
      var prior = used[it.itemId] || 0;
      // "לפני" = המלאי ה*פנוי*: היתרה פחות שריון של הזמנות ממתינות, פחות שורות קודמות באותה הזמנה
      var before = r.availableQty - prior;
      // הזמנה בקרטונים → המרה ליחידות לפי גודל-החבילה של הפריט (60 קרטון × 3000 = 180,000 יח')
      var packs = _int(ln.packs), q = _int(ln.qty);
      if (!q && packs > 0 && r.packSize > 0) q = packs * r.packSize;
      else if (!packs && q > 0 && r.packSize > 0) packs = Math.floor(q / r.packSize);
      used[it.itemId] = prior + q;
      var after = before - q;
      return {
        raw: ln.raw, matched: true, itemId: it.itemId, sku: it.sku || null, name: it.name,
        unit: r.unit, qty: q, before: before, after: after,
        stockQty: r.remainingQty, pendingQty: r.pendingQty,   // יתרה בפועל · כמה כבר משוריין
        packs: packs || 0, packSize: r.packSize || 0, packName: r.packName || 'קרטון',
        exceeds: after < 0, shortBy: after < 0 ? -after : 0,
        price1000: r.price1000, unitPrice: r.price1000,
        thousands: q / 1000,                       // כמה "אלפים" לחיוב (40,000 יח׳ = 40)
        value: (q / 1000) * r.price1000            // ⚠️ חיוב = (יח׳/1000) × מחיר-ל-1000
      };
    });
    var sum = rows.reduce(function (a, r) {
      if (r.matched) { a.qty += r.qty; a.value += r.value; if (r.exceeds) a.exceeding++; } else a.unmatched++;
      return a;
    }, { qty: 0, value: 0, exceeding: 0, unmatched: 0 });
    return { rows: rows, summary: sum };
  }

  // ── החלת הזמנה שלמה (כל השורות המשויכות) — מחזיר הסכם חדש ─────────────────
  function applyOrder(agreement, matchedRows, meta) {
    meta = meta || {};
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    var added = [], errors = [];
    (matchedRows || []).forEach(function (r, i) {
      if (!r.matched || !r.itemId) return;
      var mb = buildMovement({ itemId: r.itemId, type: 'draw', qty: r.qty, packs: r.packs || null, packSize: r.packSize || null,
        orderRef: _s(meta.orderRef) || null, date: _s(meta.date) || null, by: _s(meta.by) || null,
        notes: _s(meta.notes) || null });
      if (!mb.ok) { errors.push('ROW_' + i + ':' + mb.errors.join(',')); return; }
      added.push(mb.movement);
    });
    if (!added.length) return { ok: false, errors: errors.length ? errors : ['NO_ROWS'] };
    ag.movements = (ag.movements || []).concat(added);
    return { ok: true, agreement: ag, added: added.length, errors: errors };
  }

  /* ═══════════ הזמנת לקוח: שריון → אספקה ═══════════
     ⚠️ חוק: קליטת הזמנה *אינה* מורידה מהמלאי. היא נרשמת כהזמנה 'pending' שמשריינת
     את הכמות (המלאי הפנוי קטן, היתרה בפועל לא). המלאי יורד רק ב-supplyOrder —
     כלומר כשהאספקה ללקוח אושרה — ואז ורק אז נוצרות תנועות 'draw'. */

  // קליטת הזמנה כ"ממתינה" (שריון בלבד)
  function placeOrder(agreement, matchedRows, meta) {
    meta = meta || {};
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    var lines = [];
    (matchedRows || []).forEach(function (r) {
      if (!r) return;
      var q = _int(r.qty); if (q <= 0) return;
      // שורה "חופשית": הזמנה מלקוח שאין לו פריט בהסכם (או לקוח בלי הסכם מסגרת כלל).
      // נרשמת לתיעוד ולזרימת-העבודה בלבד — לא משריינת ולא מורידה מלאי.
      if (!r.itemId) {
        var nm = _s(r.name) || _s(r.sku);
        if (!r.free || !nm) return;
        lines.push({ itemId: null, free: true, sku: _s(r.sku) || null, name: nm, qty: q,
          packs: _int(r.packs) || null, packSize: _int(r.packSize) || null,
          packName: _s(r.packName) || null,
          price1000: r.price1000 != null ? _num(r.price1000) : null,
          value: (q / 1000) * _num(r.price1000) });
        return;
      }
      if (!r.matched) return;
      if (!(ag.items || []).some(function (it) { return it.itemId === r.itemId; })) return;
      lines.push({
        itemId: r.itemId, sku: r.sku || null, name: r.name || null, qty: q,
        packs: _int(r.packs) || null, packSize: _int(r.packSize) || null,
        price1000: r.price1000 != null ? _num(r.price1000) : null,
        value: (q / 1000) * _num(r.price1000)
      });
    });
    if (!lines.length) return { ok: false, errors: ['NO_ROWS'] };
    var order = {
      orderId: _s(meta.orderId) || makeId('or', meta.rng),
      orderRef: _s(meta.orderRef) || null,
      poNumber: _s(meta.poNumber) || null,
      status: 'pending',                       // ← לא ירד מהמלאי
      date: _s(meta.date) || null,
      dueDate: _s(meta.dueDate) || null,
      by: _s(meta.by) || null,
      notes: _s(meta.notes) || null,
      suppliedAt: null, suppliedBy: null,
      lines: lines,
      qty: lines.reduce(function (a, l) { return a + l.qty; }, 0),
      value: lines.reduce(function (a, l) { return a + l.value; }, 0)
    };
    ag.orders = (ag.orders || []).concat([order]);
    return { ok: true, agreement: ag, order: order, lines: lines.length };
  }

  function findOrder(agreement, orderId) {
    return ((agreement && agreement.orders) || []).find(function (o) { return o && o.orderId === orderId; }) || null;
  }

  // אישור אספקה → כאן ורק כאן המלאי יורד (הזמנה → תנועות 'draw')
  function supplyOrder(agreement, orderId, meta) {
    meta = meta || {};
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    var o = (ag.orders || []).find(function (x) { return x && x.orderId === orderId; });
    if (!o) return { ok: false, errors: ['ORDER_NOT_FOUND'] };
    if (o.status === 'supplied') return { ok: false, errors: ['ALREADY_SUPPLIED'] };
    if (o.status === 'cancelled') return { ok: false, errors: ['ORDER_CANCELLED'] };
    var added = [];
    effectiveLines(o).forEach(function (ln) {      // מה שיצא בפועל, לא מה שהוזמן
      var mb = buildMovement({
        itemId: ln.itemId, type: 'draw', qty: ln.qty, packs: ln.packs, packSize: ln.packSize,
        price1000: ln.price1000, orderRef: o.orderRef || o.poNumber || null,
        date: _s(meta.date) || o.date || null, by: _s(meta.by) || null,
        notes: 'אספקה להזמנה ' + (o.orderRef || o.orderId)
      });
      if (mb.ok) { mb.movement.orderId = o.orderId; added.push(mb.movement); }
    });
    // הזמנה שכולה שורות חופשיות (לקוח בלי מלאי בהסכם) — אין תנועות מלאי, אבל היא עדיין מסופקת
    if (!added.length && !effectiveLines(o).length) return { ok: false, errors: ['NO_LINES'] };
    o.status = 'supplied';
    o.suppliedAt = _s(meta.date) || null;
    o.suppliedBy = _s(meta.by) || null;
    ag.movements = (ag.movements || []).concat(added);
    return { ok: true, agreement: ag, order: o, added: added.length };
  }

  // ביטול הזמנה ממתינה — משחרר את השריון (ללא השפעה על המלאי, כי מעולם לא ירד)
  function cancelOrder(agreement, orderId, meta) {
    meta = meta || {};
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    var o = (ag.orders || []).find(function (x) { return x && x.orderId === orderId; });
    if (!o) return { ok: false, errors: ['ORDER_NOT_FOUND'] };
    if (o.status === 'supplied') return { ok: false, errors: ['ALREADY_SUPPLIED'] };  // כבר ירד — צריך זיכוי, לא ביטול
    o.status = 'cancelled';
    o.notes = _s(meta.notes) || o.notes;
    return { ok: true, agreement: ag, order: o };
  }

  /* ═══════════ הוספה למלאי (הזמנת רכש / הסכם חדש של אותו לקוח) ═══════════
     פריט שכבר קיים אצל הלקוח (לפי מק״ט, ואם אין — לפי שם) *מצטבר* לכמות הקיימת
     ולא נפתח פריט כפול. כל הוספה נרשמת ב-topups עם מס' ההסכם/הזמנת-הרכש. */
  function applyStock(agreement, rows, meta) {
    meta = meta || {};
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    ag.items = ag.items || []; ag.topups = ag.topups || [];
    var added = 0, merged = 0, log = [], errors = [];
    (rows || []).forEach(function (r, i) {
      var qty = _int(r && r.qty);
      var name = _s(r && r.name) || _s(r && r.sku);
      if (!name || qty <= 0) return;
      var p1000 = _num(r.price1000 != null ? r.price1000 : r.unitPrice);
      var packSize = _int(r.packSize);
      var ex = (_s(r.sku) && findItem(ag, r.sku)) || findItem(ag, name);
      var before, after, itemId;
      if (ex) {
        before = _int(ex.qty); after = before + qty;
        ex.qty = after;
        if (p1000 > 0) { ex.price1000 = p1000; ex.unitPrice = p1000; }   // מחיר מעודכן גובר
        if (packSize > 0) ex.packSize = packSize;
        if (!ex.sku && _s(r.sku)) ex.sku = _s(r.sku);
        itemId = ex.itemId; merged++;
      } else {
        var b = buildItem({ name: name, sku: r.sku, qty: qty, price1000: p1000, packSize: packSize, packName: r.packName, unit: r.unit });
        if (!b.ok) { errors.push('ROW_' + i + ':' + b.errors.join(',')); return; }
        ag.items.push(b.item);
        before = 0; after = qty; itemId = b.item.itemId; added++;
      }
      log.push({ itemId: itemId, sku: _s(r.sku) || null, name: name, qty: qty, before: before, after: after, isNew: !ex });
    });
    if (!added && !merged) return { ok: false, errors: errors.length ? errors : ['NO_ROWS'] };
    ag.topups = ag.topups.concat([{
      topupId: makeId('tp', meta.rng),
      source: _s(meta.source) || 'import',            // 'po' = הזמנת רכש · 'agreement' = הסכם חדש
      agreementNo: _s(meta.agreementNo) || null,
      poNumber: _s(meta.poNumber) || null,
      date: _s(meta.date) || null, by: _s(meta.by) || null, notes: _s(meta.notes) || null,
      lines: log, addedItems: added, mergedItems: merged,
      qty: log.reduce(function (a, l) { return a + l.qty; }, 0)
    }]);
    return { ok: true, agreement: ag, added: added, merged: merged, lines: log, errors: errors };
  }

  /* ═══════════ "מוכן לאספקה" → תעודת משלוח ═══════════
     המנהל מסמן שההזמנה מוכנה וכמה יצא בפועל (בקרטונים) → הפקיד רואה אותה ב"מוכנות",
     ומוציא עליה תעודת משלוח. הוצאת התעודה היא אירוע האספקה: אז המלאי יורד. */

  // סימון "מוכן" + כמה יצא בפועל. rows = [{itemId, packs?, qty?}] — ריק = בדיוק מה שהוזמן.
  function markReady(agreement, orderId, meta) {
    meta = meta || {};
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    var o = (ag.orders || []).find(function (x) { return x && x.orderId === orderId; });
    if (!o) return { ok: false, errors: ['ORDER_NOT_FOUND'] };
    if (o.status === 'supplied') return { ok: false, errors: ['ALREADY_SUPPLIED'] };
    if (o.status === 'cancelled') return { ok: false, errors: ['ORDER_CANCELLED'] };
    var byId = {}; (meta.rows || []).forEach(function (r) { if (r && r.itemId) byId[r.itemId] = r; });
    var lines = (o.lines || []).map(function (ln) {
      var r = byId[ln.itemId];
      var packSize = _int(ln.packSize);
      var packs = r && r.packs != null ? _int(r.packs) : _int(ln.packs);
      var qty;
      if (r && r.qty != null) qty = _int(r.qty);
      else if (r && r.packs != null && packSize > 0) qty = packs * packSize;   // קרטונים שיצאו → יחידות
      else qty = _int(ln.qty);
      if (!packs && packSize > 0) packs = Math.floor(qty / packSize);
      return {
        itemId: ln.itemId || null, free: !!ln.free, sku: ln.sku || null, name: ln.name || null,
        qty: qty, packs: packs || null, packSize: packSize || null,
        packName: ln.packName || null,
        price1000: ln.price1000 != null ? _num(ln.price1000) : null,
        value: (qty / 1000) * _num(ln.price1000),
        orderedQty: _int(ln.qty)                       // כדי לראות פער בין מוזמן למיוצר
      };
    }).filter(function (l) { return l.qty > 0; });
    if (!lines.length) return { ok: false, errors: ['NO_LINES'] };
    o.status = 'ready';
    o.ready = {
      lines: lines,
      qty: lines.reduce(function (a, l) { return a + l.qty; }, 0),
      packs: lines.reduce(function (a, l) { return a + (l.packs || 0); }, 0),
      value: lines.reduce(function (a, l) { return a + l.value; }, 0),
      at: _s(meta.date) || null, by: _s(meta.by) || null, notes: _s(meta.notes) || null
    };
    return { ok: true, agreement: ag, order: o };
  }

  // ביטול סימון "מוכן" — חוזר להמתנה (השריון נשמר, המלאי ממילא לא ירד)
  function unmarkReady(agreement, orderId) {
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    var o = (ag.orders || []).find(function (x) { return x && x.orderId === orderId; });
    if (!o) return { ok: false, errors: ['ORDER_NOT_FOUND'] };
    if (o.status !== 'ready') return { ok: false, errors: ['NOT_READY'] };
    o.status = 'pending'; o.ready = null;
    return { ok: true, agreement: ag, order: o };
  }

  // מספר-רץ לתעודת משלוח, על-פני כל ההסכמים (מתחיל ב-1001)
  function nextNoteNumber(allNotes) {
    var max = 1000;
    (allNotes || []).forEach(function (n) { var v = _int(n && n.number); if (v > max) max = v; });
    return max + 1;
  }

  // בניית תעודת משלוח מהזמנות שסומנו "מוכנות" — טהור, בלי לגעת בהסכם
  function buildDeliveryNote(agreement, orderIds, meta) {
    meta = meta || {};
    var ag = agreement || {};
    var ids = orderIds || [];
    var orders = (ag.orders || []).filter(function (o) { return o && ids.indexOf(o.orderId) >= 0; });
    if (!orders.length) return { ok: false, errors: ['NO_ORDERS'] };
    var bad = orders.filter(function (o) { return o.status !== 'ready'; });
    if (bad.length) return { ok: false, errors: ['NOT_READY:' + bad.map(function (o) { return o.orderRef || o.orderId; }).join(',')] };
    var byItem = {}, order2 = [];
    orders.forEach(function (o) {
      order2.push({ orderId: o.orderId, orderRef: o.orderRef || null, poNumber: o.poNumber || null });
      effectiveLines(o).forEach(function (ln) {
        var it = (ag.items || []).find(function (x) { return x.itemId === ln.itemId; }) || {};
        var k = ln.itemId || ('free:' + (ln.sku || ln.name || ''));   // שורה חופשית — מפתח לפי שם/מק״ט
        if (!byItem[k]) byItem[k] = { itemId: ln.itemId || null, free: !!ln.free, sku: ln.sku || it.sku || null, name: ln.name || it.name || '',
          packName: ln.packName || it.packName || 'קרטון', packSize: _int(ln.packSize || it.packSize) || null,
          qty: 0, packs: 0, price1000: _num(ln.price1000 != null ? ln.price1000 : it.price1000), value: 0 };
        byItem[k].qty += _int(ln.qty);
        byItem[k].packs += _int(ln.packs);
        byItem[k].value += (_int(ln.qty) / 1000) * _num(ln.price1000 != null ? ln.price1000 : it.price1000);
      });
    });
    var lines = Object.keys(byItem).map(function (k) { return byItem[k]; });
    return {
      ok: true,
      note: {
        noteId: makeId('dn', meta.rng),
        number: _int(meta.number) || 1001,
        agreementId: ag.agreementId || null,
        agreementNo: ag.agreementNo || null,
        customer: ag.customer || '',
        date: _s(meta.date) || null,
        by: _s(meta.by) || null,
        reference: _s(meta.reference) || null,       // מס' הזמנת-רכש / אסמכתא ללקוח
        notes: _s(meta.notes) || null,
        orders: order2,
        lines: lines,
        qty: lines.reduce(function (a, l) { return a + l.qty; }, 0),
        packs: lines.reduce(function (a, l) { return a + l.packs; }, 0),
        value: lines.reduce(function (a, l) { return a + l.value; }, 0)
      }
    };
  }

  // הוצאת תעודת משלוח = אירוע האספקה: התעודה נשמרת, ההזמנות מסומנות שסופקו, והמלאי יורד
  function issueDeliveryNote(agreement, orderIds, meta) {
    meta = meta || {};
    var b = buildDeliveryNote(agreement, orderIds, meta);
    if (!b.ok) return b;
    var ag = JSON.parse(JSON.stringify(agreement || {}));
    var errs = [];
    (orderIds || []).forEach(function (id) {
      var r = supplyOrder(ag, id, { date: meta.date, by: meta.by });
      if (r.ok) ag = r.agreement; else errs.push(id + ':' + r.errors.join(','));
    });
    if (errs.length) return { ok: false, errors: errs };
    b.note.noteId = b.note.noteId;
    ag.deliveryNotes = (ag.deliveryNotes || []).concat([b.note]);
    // קישור התנועות לתעודה — כדי שאפשר יהיה לעקוב אחורה מהמלאי לתעודה
    (ag.movements || []).forEach(function (m) {
      if (m && !m.noteId && (orderIds || []).indexOf(m.orderId) >= 0) m.noteId = b.note.noteId;
    });
    return { ok: true, agreement: ag, note: b.note };
  }

  /* ── תעודת משלוח על כרטיסי-עבודה רגילים (לא הסכם מסגרת) ──
     המשרד מוציא תעודה גם על עבודות דפוס שהושלמו. אותו מבנה-תעודה בדיוק,
     כדי שההדפסה והמספור יהיו זהים; השורות הן "חופשיות" (אין מלאי מאחוריהן). */
  /* שלב בלוח-הזרימה של המשרד — מאחד שני עולמות למסלול אחד:
     כרטיס-עבודה של הדפוס (status: pending/inprogress/finishing/done/trash)
     והזמנת-מסגרת (pending/ready/supplied/cancelled).  null = לא מוצג. */
  function jobStage(card, hasNote) {
    if (!card) return null;
    var st = _s(card.status);
    if (st === 'trash') return null;
    if (hasNote) return 'delivered';
    if (st === 'done') return 'ready';                       // הודפס והושלם — ממתין למסירה
    if (st === 'inprogress' || st === 'finishing' || st === 'printing') return 'production';
    return 'new';
  }
  function orderStage(order) {
    if (!order) return null;
    var st = _s(order.status);
    if (st === 'cancelled') return null;
    if (st === 'supplied') return 'delivered';
    if (st === 'ready') return 'ready';
    return 'new';
  }

  function buildJobNote(jobs, meta) {
    meta = meta || {};
    var lines = (jobs || []).map(function (j) {
      if (!j) return null;
      var nm = _s(j.name); if (!nm) return null;
      return {
        itemId: null, free: true, cardId: j.cardId != null ? String(j.cardId) : null,
        sku: _s(j.sku) || null, name: nm,
        qty: _int(j.qty), packs: _int(j.packs) || 0,
        packSize: _int(j.packSize) || null, packName: _s(j.packName) || 'קרטון',
        price1000: 0, value: 0, notes: _s(j.notes) || null
      };
    }).filter(Boolean);
    if (!lines.length) return { ok: false, errors: ['NO_JOBS'] };
    return {
      ok: true,
      note: {
        noteId: makeId('dn', meta.rng),
        number: _int(meta.number) || 1001,
        source: 'jobs',                         // להבדיל מתעודה על הסכם מסגרת
        agreementId: null, agreementNo: null,
        customer: _s(meta.customer) || '',
        date: _s(meta.date) || null, by: _s(meta.by) || null,
        reference: _s(meta.reference) || null, notes: _s(meta.notes) || null,
        orders: [], cardIds: lines.map(function (l) { return l.cardId; }).filter(Boolean),
        lines: lines,
        qty: lines.reduce(function (a, l) { return a + l.qty; }, 0),
        packs: lines.reduce(function (a, l) { return a + l.packs; }, 0),
        value: 0
      }
    };
  }

  // הסכם פעיל קיים של אותו לקוח — כדי לצבור לתוכו במקום לפתוח כפילות
  function findAgreementForCustomer(agreements, customer) {
    var c = _s(customer).toLowerCase(); if (!c) return null;
    var list = (agreements || []).filter(function (a) { return a && _s(a.customer).toLowerCase() === c; });
    return list.find(function (a) { return a.status === 'active'; }) || list[0] || null;
  }

  function validate(agreement) {
    var errors = [];
    if (!agreement) return { valid: false, errors: ['NULL'] };
    if (!_s(agreement.customer)) errors.push('NO_CUSTOMER');
    if (STATUSES.indexOf(agreement.status) < 0) errors.push('BAD_STATUS');
    var seen = {};
    (agreement.items || []).forEach(function (it) {
      if (!_s(it.name)) errors.push('ITEM_NO_NAME');
      if (it.sku) { var k = String(it.sku).toLowerCase(); if (seen[k]) errors.push('DUP_SKU:' + it.sku); seen[k] = 1; }
    });
    return { valid: errors.length === 0, errors: errors };
  }

  /* ═══════════ ניתוח וורד (DOCX) ═══════════
     מקבל את ה-XML הגולמי של word/document.xml (פתיחת ה-ZIP נעשית בדפדפן ע"י JSZip)
     ומחזיר { rows, text } באותו מבנה שמחזירה קריאת אקסל — כדי ש-parseSheetRows
     יזהה עמודות (מק״ט/שם/כמות/קרטונים) בדיוק כמו בגיליון.
       · טבלת-וורד → שורה לכל <w:tr>, תא לכל <w:tc>   ← המקרה הנפוץ בהזמנות רכש
       · פסקה חופשית → שורה אחת, מפוצלת בטאבים / רווחים מרובים
     טבלה מקוננת בתוך תא תיקרא כשורות נוספות — לא מפיל, והמשתמש עורך לפני אישור. */

  function _xmlDecode(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, '&');          // אחרון — אחרת "&amp;lt;" ייפתח פעמיים
  }

  // טקסט של קטע-וורד: <w:t> לפי הסדר, <w:tab/> → tabAs, <w:br/> → רווח.
  function _wText(frag, tabAs) {
    var out = '', re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?tab\s*\/?>|<(?:\w+:)?(?:br|cr)\s*\/?>/g, m;
    while ((m = re.exec(frag))) {
      if (m[1] != null) out += _xmlDecode(m[1]);
      else if (m[0].indexOf('tab') !== -1) out += tabAs;
      else out += ' ';
    }
    return out.replace(/[  ]+/g, ' ').trim();
  }

  // סוף <w:tbl> התואם, עם ספירת-עומק (טבלאות מקוננות)
  function _tblEnd(s, from) {
    var re = /<(\/?)(?:\w+:)?tbl(?:\s[^>]*)?>/g, depth = 0, m;
    re.lastIndex = from;
    while ((m = re.exec(s))) {
      if (m[1]) { depth--; if (depth <= 0) return re.lastIndex; }
      else depth++;
    }
    return s.length;
  }

  function _docxTable(frag, rows) {
    var tr = /<(?:\w+:)?tr(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?tr>/g, m;
    while ((m = tr.exec(frag))) {
      var cells = [], tc = /<(?:\w+:)?tc(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?tc>/g, c;
      while ((c = tc.exec(m[1]))) cells.push(_wText(c[1], ' '));
      if (cells.join('')) rows.push(cells);
    }
  }

  function _docxParas(frag, rows) {
    var p = /<(?:\w+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?p>/g, m;
    while ((m = p.exec(frag))) {
      var t = _wText(m[1], '\t');
      if (!t) continue;
      var cells = t.split(/\t+|\s{3,}/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
      rows.push(cells.length > 1 ? cells : [t]);
    }
  }

  function parseDocxXml(xml) {
    var s = String(xml || ''), rows = [], i = 0;
    var open = /<(?:\w+:)?tbl(?:\s[^>]*)?>/g;
    for (;;) {
      open.lastIndex = i;
      var mo = open.exec(s);
      _docxParas(s.slice(i, mo ? mo.index : s.length), rows);   // פסקאות שמחוץ לטבלה
      if (!mo) break;
      var end = _tblEnd(s, mo.index);
      _docxTable(s.slice(mo.index, end), rows);
      i = end;
    }
    return { rows: rows, text: rows.map(function (r) { return r.filter(Boolean).join(', '); }).join('\n') };
  }

  return {
    STATUSES: STATUSES, MOVE_TYPES: MOVE_TYPES,
    parseDocxXml: parseDocxXml,
    makeId: makeId, buildItem: buildItem, buildAgreement: buildAgreement, buildMovement: buildMovement,
    computeBalances: computeBalances, checkDraw: checkDraw, applyMovement: applyMovement,
    parseOrderText: parseOrderText, parseSheetRows: parseSheetRows, matchOrder: matchOrder, applyOrder: applyOrder,
    placeOrder: placeOrder, supplyOrder: supplyOrder, cancelOrder: cancelOrder, findOrder: findOrder,
    markReady: markReady, unmarkReady: unmarkReady, effectiveLines: effectiveLines,
    buildDeliveryNote: buildDeliveryNote, issueDeliveryNote: issueDeliveryNote, nextNoteNumber: nextNoteNumber,
    buildJobNote: buildJobNote, jobStage: jobStage, orderStage: orderStage,
    applyStock: applyStock, findAgreementForCustomer: findAgreementForCustomer,
    alerts: alerts, findItem: findItem, validate: validate
  };
});
