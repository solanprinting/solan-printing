/* ═══════════════════════════════════════════════════════════════════════════
   invoice-lines.js — שורות חשבונית מצולמת → מלאי. החלטות טהורות בלבד.

   ⚠️ **הבעיה שזה פותר (09/08/2026).** צילום חשבונית ייצר שורה **אחת**:
   ה-AI התבקש להחזיר ‎{paperName, qty, date, docNum}‎, והטופס בנה שדה-נייר
   יחיד. חשבונית עם חמישה סעיפים נכנסה כסעיף אחד, וארבעה נעלמו בלי שאיש
   ידע. וכשהזיהוי שגה בשם — לא הייתה שום דרך לתקן אותו לפני ההחלה.

   ⚠️ **אף שורה אינה נעלמת בשקט.** כל שורה מקבלת החלטה מפורשת: לאיזה
   פריט-מלאי היא הולכת, או שהיא נוצרת כפריט חדש, או שהמשתמש דילג עליה
   ביודעין. השלישייה הזו מדווחת בסיכום — כי "התווסף" ו"דילגתי" ו"נשמט"
   הם שלושה דברים שונים, והשלישי הוא באג.

   הרצת הבדיקות: node invoice-lines-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InvoiceLines = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '').replace(/,/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  var clean = function (s) { return String(s == null ? '' : s).trim(); };

  /* ── קליטת התשובה מה-AI ────────────────────────────────────────────────
     ⚠️ מקבל **שתי** צורות: המבנה החדש (‏items[]) והישן (‏paperName יחיד).
     הישן חייב להמשיך לעבוד — תמונות ישנות, מטמון, ותשובות של מודל שלא
     ציית לפורמט. תשובה שאינה מובנת מחזירה אפס שורות, ולא שורה ריקה
     שתיראה למשתמש כאילו הזיהוי הצליח. */
  function normalizeLines(parsed) {
    var p = parsed || {};
    var doc = { docNum: clean(p.docNum || p.doc_number), date: clean(p.date),
                orderNum: clean(p.orderNum || p.order_num) };
    var raw = [];
    if (Array.isArray(p.items) && p.items.length) raw = p.items;
    else if (Array.isArray(p.lines) && p.lines.length) raw = p.lines;
    else if (clean(p.paperName)) raw = [{ name: p.paperName, qty: p.qty, price: p.price }];

    var lines = [];
    raw.forEach(function (it) {
      var name = clean(it && (it.name || it.paperName || it.description));
      var qty = num(it && it.qty);
      var price = num(it && (it.price_per_sheet !== undefined ? it.price_per_sheet : it.price));
      /* ⚠️ שורה בלי שם ובלי כמות אינה שורה — היא רעש-זיהוי (כותרת, סה"כ,
         מע"מ). הכנסתה לטבלה הייתה מכריחה את המשתמש לדלג עליה ידנית. */
      if (!name && qty <= 0) return;
      lines.push({ raw: name, qty: qty, price: price });
    });
    return { doc: doc, lines: lines };
  }

  /* ── התאמה לפריט קיים ──────────────────────────────────────────────────
     ⚠️ מחזיר **ציון-ביטחון**, ולא רק אינדקס: הממשק צריך להבדיל בין
     "זוהה בוודאות" לבין "ניחוש" — ולסמן את השני כדי שהמשתמש יבדוק.
     ההתאמה עצמה מכוונת, לא חכמה: התאמה מדויקת → הכלה → מילות-מפתח. */
  function matchLine(name, inventory) {
    var inv = inventory || [];
    var n = clean(name).toLowerCase().replace(/['"*]/g, '');
    if (!n) return { idx: -1, score: 0 };

    for (var i = 0; i < inv.length; i++) {
      var iname = clean(inv[i] && inv[i].name).toLowerCase().replace(/['"*]/g, '');
      if (iname && iname === n) return { idx: i, score: 100 };
    }
    /* ⚠️ **תחילית שמתאימה ליותר מפריט אחד היא דו-משמעות, לא התאמה.**
       "כרומו" הוא תחילית של "כרומו מט 130" וגם של "כרומו מבריק 170";
       הניסוח הראשון שלי החזיר בביטחון את הראשון ברשימה — כלומר היה
       מזין מלאי לנייר הלא-נכון בלי שאיש יבחין. נתפס בבדיקה.
       כשיש יותר מאחד — מוטב להחזיר "לא נמצא" ולתת למשתמש להכריע. */
    var pre = [];
    for (var j = 0; j < inv.length; j++) {
      var jn = clean(inv[j] && inv[j].name).toLowerCase().replace(/['"*]/g, '');
      if (jn && (jn.indexOf(n) === 0 || n.indexOf(jn) === 0)) pre.push(j);
    }
    if (pre.length === 1) return { idx: pre[0], score: 80 };
    if (pre.length > 1) return { idx: -1, score: 0, ambiguous: true };
    var best = -1, bestScore = 0;
    var kws = n.split(/[\s\/,]+/).filter(function (w) { return w.length > 1; });
    inv.forEach(function (it, idx) {
      var iname = clean(it && it.name).toLowerCase().replace(/['"*]/g, '');
      if (!iname) return;
      var score = 0;
      kws.forEach(function (kw) { if (iname.indexOf(kw) >= 0) score++; });
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    /* ⚠️ סף 2: מילה אחת משותפת ("כרומו") מתאימה לעשרה ניירות שונים,
       והתאמה כזו גרועה מ"לא נמצא" — היא מוסיפה מלאי לנייר הלא-נכון. */
    return bestScore >= 2 ? { idx: best, score: 40 } : { idx: -1, score: 0 };
  }

  /* כל השורות עם ההצעה שלהן. ‏action: 'match' | 'new' | 'skip'. */
  function suggest(lines, inventory) {
    return (lines || []).map(function (ln) {
      var m = matchLine(ln.raw, inventory);
      return { raw: ln.raw, qty: ln.qty, price: ln.price,
               targetIdx: m.idx, score: m.score,
               newName: m.idx < 0 ? ln.raw : '',
               action: m.idx >= 0 ? 'match' : (ln.raw ? 'new' : 'skip') };
    });
  }

  /* ── תכנון ההחלה ───────────────────────────────────────────────────────
     ⚠️ מחזיר תוכנית ולא מבצע. כך אפשר להראות למשתמש **בדיוק** מה יקרה
     לפני שקורה, וגם לבדוק את ההחלטה בלי מלאי אמיתי. */
  function planApply(rows, inventory) {
    var inv = inventory || [];
    var adds = [], creates = [], skipped = [], errors = [];
    (rows || []).forEach(function (r, i) {
      var qty = num(r.qty), price = num(r.price);
      if (r.action === 'skip') { skipped.push({ i: i, raw: r.raw, why: 'דילוג' }); return; }
      if (r.action === 'new') {
        var nm = clean(r.newName || r.raw);
        if (!nm) { errors.push({ i: i, raw: r.raw, why: 'פריט חדש בלי שם' }); return; }
        creates.push({ i: i, name: nm, qty: qty, price: price });
        return;
      }
      var idx = Number(r.targetIdx);
      /* ⚠️ אינדקס שאינו קיים הוא **שגיאה**, לא דילוג: פירושו שהמלאי השתנה
         מאז שהטבלה נבנתה, והוספה לאינדקס שגוי מזינה נייר אחר. */
      if (!(idx >= 0 && idx < inv.length)) { errors.push({ i: i, raw: r.raw, why: 'פריט-יעד לא נמצא' }); return; }
      adds.push({ i: i, idx: idx, name: clean(inv[idx].name), qty: qty, price: price });
    });
    return { adds: adds, creates: creates, skipped: skipped, errors: errors,
             total: (rows || []).length };
  }

  /* ── החלה ──────────────────────────────────────────────────────────────
     ⚠️ מקבל את המלאי ומחזיר אותו מעודכן; הכתיבה לאחסון היא של הקורא.
     ⚠️ שורת-חשבונית נוספת **תמיד** כשיש מספר-מסמך, גם בכמות 0 (שורת-מחיר
     בלבד) — כך שהמחיר נשמר וההיסטוריה שלמה. */
  function applyPlan(plan, inventory, docMeta) {
    var inv = inventory || [];
    var meta = docMeta || {};
    var key = clean(meta.docNum), date = clean(meta.date), order = clean(meta.orderNum);
    var touched = [];

    function addInvoiceRow(item, qty, price) {
      if (!key && !price && !qty) return;
      if (!item.invoices) item.invoices = [];
      var ex = key ? item.invoices.find(function (v) { return v && v.inv === key; }) : null;
      if (ex) {
        ex.qty = num(ex.qty) + qty;
        if (price) ex.price = price;
      } else {
        item.invoices.push({ date: date, inv: key, orderNum: order, qty: qty, price: price });
      }
    }

    plan.adds.forEach(function (a) {
      var item = inv[a.idx];
      if (!item) return;
      addInvoiceRow(item, a.qty, a.price);
      item.qty = num(item.qty) + a.qty;
      touched.push({ name: item.name, qty: a.qty, created: false });
    });
    plan.creates.forEach(function (c) {
      var item = { name: c.name, qty: 0, invoices: [] };
      inv.push(item);
      addInvoiceRow(item, c.qty, c.price);
      item.qty = num(item.qty) + c.qty;
      touched.push({ name: item.name, qty: c.qty, created: true });
    });
    return { inventory: inv, touched: touched,
             added: plan.adds.length, created: plan.creates.length,
             skipped: plan.skipped.length, errors: plan.errors.length };
  }

  /* סיכום לקריאה אנושית. ⚠️ מזכיר במפורש דילוגים ושגיאות — סיכום שמונה
     רק הצלחות הוא בדיוק איך שארבע שורות נעלמות בלי שאיש ישים לב. */
  function summaryText(res) {
    var parts = [];
    if (res.added) parts.push('עודכנו ' + res.added);
    if (res.created) parts.push('נוצרו ' + res.created + ' פריטים חדשים');
    if (res.skipped) parts.push('דילגת על ' + res.skipped);
    if (res.errors) parts.push('⚠️ ' + res.errors + ' לא נוספו');
    return parts.length ? parts.join(' · ') : 'לא נוסף דבר';
  }

  return { normalizeLines: normalizeLines, matchLine: matchLine, suggest: suggest,
           planApply: planApply, applyPlan: applyPlan, summaryText: summaryText };
});
