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

  /* ⚠️ **הפסיק אינו תמיד מפריד-אלפים.** ספקים כותבים "199,88" באותה
     שכיחות שכותבים "1,234.56". הניסוח הקודם מחק כל פסיק, ולכן "199,88"
     נקרא כ-19,988 — פי-100 מהאמת, ובשקט. שלוש ספרות אחרי פסיק = מפריד
     אלפים; ספרה או שתיים = נקודה עשרונית. */
  var num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
    if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  var clean = function (s) { return String(s == null ? '' : s).trim(); };

  /* ── יחידת-המחיר ───────────────────────────────────────────────────────
     ⚠️ **הבאג שדווח (09/08/2026): ‏199.88 נכנס כ-200.** הפרומפט ביקש
     מה-AI "מחיר ליחידה", בעוד שבחשבונית המחיר כתוב **לאלף גיליונות**.
     כלומר הורינו למודל להמיר — והוא עשה מה שמודלים עושים כשמבקשים מהם
     חשבון בעל-פה: עיגל. מחיר נייר הוא נתון-חוזה ולא הערכה, ופער של
     0.12 ₪ לאלף מכפיל את עצמו בכל תמחור עתידי.

     ⚠️ התיקון הוא **שלילת החשבון מהמודל**: הוא מעתיק את המספר כלשונו
     ומציין באיזו יחידה הוא כתוב. ההמרה נעשית כאן, בקוד דטרמיניסטי.

     ⚠️ וכשהיחידה אינה ידועה — **אין ניחוש**. המספר נכנס כמות-שהוא
     לעמודת "לאלף" ומסומן ‎uncertain‎ כדי שהטופס יבליט אותו. ניחוש שקט
     הוא בדיוק איך שמחיר נכנס פי-1000 מהאמת בלי שאיש מבחין. */
  function toPer1000(price, unit, qty) {
    var p = num(price), u = clean(unit).toLowerCase();
    if (!p) return { price: 0, uncertain: false };
    if (u === 'per1000' || u === 'לאלף' || u === 'per_1000') return { price: p, uncertain: false };
    if (u === 'perunit' || u === 'per_unit' || u === 'ליחידה' || u === 'לגיליון') {
      return { price: p * 1000, uncertain: false };
    }
    /* סה"כ-שורה: מחיר-לאלף = סה"כ ÷ כמות × 1000. בלי כמות אין המרה. */
    if (u === 'total' || u === 'סהכ' || u === 'סה"כ') {
      var q = num(qty);
      return q > 0 ? { price: (p / q) * 1000, uncertain: false } : { price: p, uncertain: true };
    }
    return { price: p, uncertain: true };
  }

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
      /* ⚠️ ‎price_per_sheet‎ הוא השדה של המלאי שלנו, ולכן היחידה שלו
         ידועה בוודאות. ‎price‎/‎price_per_unit‎ מגיעים מה-AI, ושם היחידה
         היא **בדיוק הדבר שאי אפשר להניח** — לכן בלי ‎priceUnit‎ מפורש
         המספר נכנס כמות-שהוא ומסומן. הכפלה-בעיוור פי-1000 של מספר
         שכבר היה לאלף היא טעות של פי-מיליון בערך המלאי. */
      var rawPrice, unit;
      if (it && it.price_per_sheet !== undefined) { rawPrice = it.price_per_sheet; unit = 'perUnit'; }
      else {
        rawPrice = (it && it.price !== undefined) ? it.price : (it && it.price_per_unit);
        unit = it && (it.priceUnit || it.price_unit);
      }
      /* ⚠️ **הטקסט כפי שנכתב בחשבונית נשמר.** בלעדיו אין למשתמש שום
         דרך לראות שהמספר בטופס אינו מה שמופיע במסמך — וזו בדיוק הדרך
         שבה 199.88 הפך ל-200 בלי שאיש הבחין. */
      var conv = toPer1000(rawPrice, unit, qty);
      /* ⚠️ שורה בלי שם ובלי כמות אינה שורה — היא רעש-זיהוי (כותרת, סה"כ,
         מע"מ). הכנסתה לטבלה הייתה מכריחה את המשתמש לדלג עליה ידנית. */
      if (!name && qty <= 0) return;
      lines.push({ raw: name, qty: qty, price: conv.price,
                   priceRaw: clean(it && (it.priceRaw || it.price_raw)) || (rawPrice == null ? '' : String(rawPrice)),
                   priceUncertain: conv.uncertain });
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

  /* ── זיכרון-שמות: "ללמד את הבוט" ─────────────────────────────────────
     ⚠️ ספק כותב "בריסטול 250 לבן" ובמלאי רשום "בריסטול 250 גר לבן".
     שום מתאם לא יגשר על זה — וגם לא צריך: ברגע שהמשתמש הכריע פעם אחת,
     ההכרעה נשמרת ובפעם הבאה השורה מזוהה לבד. זה מה שהופך את הטופס
     מעבודה חוזרת לעבודה חד-פעמית לכל ספק.

     ⚠️ המפתח מנורמל (רווחים/גרשיים/רישיות) כדי שהבדל-הקלדה לא ייצור
     שני זיכרונות נפרדים לאותו דבר.
     ⚠️ הזיכרון מצביע על **שם** ולא על אינדקס: אינדקס משתנה בכל מיון או
     מחיקה, ואז הלמידה הייתה מפנה לנייר אחר. */
  function aliasKey(name) {
    return clean(name).toLowerCase().replace(/['"*]/g, '').replace(/\s+/g, ' ');
  }
  function learn(aliases, rawName, targetName) {
    var a = aliases || {};
    var k = aliasKey(rawName), v = clean(targetName);
    if (!k || !v) return a;
    a[k] = v;
    return a;
  }
  /* מחזיר אינדקס לפי הזיכרון, או -1. ⚠️ שם שנשמר ואחר-כך נמחק מהמלאי
     מחזיר -1 ולא מתאים בכוח — אחרת הלמידה הייתה שולחת לפריט שאינו קיים. */
  function fromAlias(aliases, rawName, inventory) {
    var a = aliases || {}, k = aliasKey(rawName);
    if (!k || !a[k]) return -1;
    var want = clean(a[k]).toLowerCase();
    var inv = inventory || [];
    for (var i = 0; i < inv.length; i++) {
      if (clean(inv[i] && inv[i].name).toLowerCase() === want) return i;
    }
    return -1;
  }

  /* כל השורות עם ההצעה שלהן. ‏action: 'match' | 'new' | 'skip'. */
  function suggest(lines, inventory, aliases) {
    return (lines || []).map(function (ln) {
      /* ⚠️ הזיכרון **קודם** למתאם: הכרעה אנושית קודמת גוברת על ניחוש
         אוטומטי, וזו כל הנקודה של הלימוד. */
      var ai = fromAlias(aliases, ln.raw, inventory);
      var m = ai >= 0 ? { idx: ai, score: 100, learned: true } : matchLine(ln.raw, inventory);
      return { raw: ln.raw, qty: ln.qty, price: ln.price,
               targetIdx: m.idx, score: m.score, learned: !!m.learned,
               newName: m.idx < 0 ? ln.raw : '',
               action: m.idx >= 0 ? 'match' : (ln.raw ? 'new' : 'skip') };
    });
  }

  /* ── תכנון ההחלה ───────────────────────────────────────────────────────
     ⚠️ מחזיר תוכנית ולא מבצע. כך אפשר להראות למשתמש **בדיוק** מה יקרה
     לפני שקורה, וגם לבדוק את ההחלטה בלי מלאי אמיתי. */
  function planApply(rows, inventory) {
    var inv = inventory || [];
    var adds = [], creates = [], skipped = [], errors = [], merged = [];
    var addByIdx = {}, createByName = {};

    /* ⚠️ **חוק-הבעלים (09/08/2026): אסור שיהיו כפילויות במלאי — אותו סוג
       נייר עם אותו מספר-חשבונית לא יכול להופיע פעמיים.**

       ⚠️ הניסוח הקודם היה מפר אותו **בשקט ובכיוון הגרוע**: שתי שורות
       בטופס שממופות לאותו פריט היו מייצרות שתי קריאות ל-‎addInvoiceRow‎
       עם אותו מספר-מסמך, והשנייה הייתה **דורסת** את הראשונה. חשבונית עם
       שני סעיפים של אותו נייר הייתה נכנסת בכמות של סעיף אחד בלבד.

       ⚠️ ההבחנה הקריטית: **שתי שורות באותה החלה = איחוד** (שני סעיפים
       של חשבונית אחת), אבל **סריקה חוזרת מאוחרת = החלפה** (אותו מסמך
       שוב, אסור לצבור). שני מקרים שנראים זהים בנתונים ודורשים הפוך. */
    function mergeInto(t, r, i, qty, price) {
      t.qty += qty;
      var conflict = !!(price && t.price && Math.abs(price - t.price) > 1e-9);
      if (!t.price && price) t.price = price;
      merged.push({ i: i, raw: clean(r.raw), into: t.name, qty: qty,
                    price: price, kept: t.price, conflict: conflict });
    }

    (rows || []).forEach(function (r, i) {
      var qty = num(r.qty), price = num(r.price);
      if (r.action === 'skip') { skipped.push({ i: i, raw: r.raw, why: 'דילוג' }); return; }
      if (r.action === 'new') {
        var nm = clean(r.newName || r.raw);
        if (!nm) { errors.push({ i: i, raw: r.raw, why: 'פריט חדש בלי שם' }); return; }
        var ck = nm.toLowerCase();
        if (createByName[ck]) { mergeInto(createByName[ck], r, i, qty, price); return; }
        var c = { i: i, name: nm, qty: qty, price: price };
        createByName[ck] = c; creates.push(c);
        return;
      }
      var idx = Number(r.targetIdx);
      /* ⚠️ אינדקס שאינו קיים הוא **שגיאה**, לא דילוג: פירושו שהמלאי השתנה
         מאז שהטבלה נבנתה, והוספה לאינדקס שגוי מזינה נייר אחר. */
      if (!(idx >= 0 && idx < inv.length)) { errors.push({ i: i, raw: r.raw, why: 'פריט-יעד לא נמצא' }); return; }
      if (addByIdx[idx] !== undefined) { mergeInto(addByIdx[idx], r, i, qty, price); return; }
      var a = { i: i, idx: idx, name: clean(inv[idx].name), qty: qty, price: price };
      addByIdx[idx] = a; adds.push(a);
    });
    return { adds: adds, creates: creates, skipped: skipped, errors: errors,
             merged: merged, total: (rows || []).length };
  }

  /* ── בדיקת כפילויות במלאי ──────────────────────────────────────────────
     ⚠️ **הבעלים ביקש התראה, לא חסימה — וזה נכון.** חשבונית אחת *יכולה*
     בהחלט לכסות שני סוגי נייר, וזה המצב הרגיל. לכן אותו מספר-חשבונית על
     שני פריטים אינו באג בפני עצמו; הוא **הצורה שבה מיפוי שגוי נראה**.

     ⚠️ ולכן ההתראה מדורגת. שתי רשומות עם **אותה כמות ואותו מחיר** תחת
     אותו מספר-חשבונית הן כמעט תמיד אותו סעיף שמופה פעמיים — זה חשד ממשי.
     אותו מספר עם כמויות שונות הוא חשבונית רב-סעיפית תקינה. התראה שצועקת
     על שניהם באותה עוצמה מאמנת את המשתמש להתעלם ממנה. */
  function findDuplicates(inventory) {
    var dupRows = [], cross = [], byInv = {};
    (inventory || []).forEach(function (item, idx) {
      var seen = {};
      ((item && item.invoices) || []).forEach(function (r, j) {
        var k = clean(r && r.inv);
        if (!k) return;
        /* אותו פריט + אותו מספר-חשבונית פעמיים = הפרה של חוק-הברזל.
           נמנע מעכשיו והלאה, אבל נתונים ישנים יכולים להחזיק אותו. */
        if (seen[k] !== undefined) {
          dupRows.push({ idx: idx, name: clean(item.name), inv: k, rows: [seen[k], j] });
        } else { seen[k] = j; }
        (byInv[k] = byInv[k] || []).push({ idx: idx, name: clean(item.name),
                                           qty: num(r.qty), price: num(r.price) });
      });
    });
    Object.keys(byInv).forEach(function (k) {
      var g = byInv[k], names = {};
      g.forEach(function (x) { names[x.name] = 1; });
      if (Object.keys(names).length < 2) return;
      var suspect = g.some(function (a, i) {
        return g.some(function (b, j) {
          return j > i && a.name !== b.name && a.qty > 0 &&
                 a.qty === b.qty && a.price === b.price;
        });
      });
      cross.push({ inv: k, items: g, suspect: suspect });
    });
    return { dupRows: dupRows, cross: cross,
             suspect: cross.filter(function (c) { return c.suspect; }) };
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

    /* ⚠️ **חוק-התחום (בעלים, 09/08/2026): כל חשבונית היא שורה בפני עצמה.**
       נייר מחשבונית חדשה נכנס תחת **אותו סוג נייר** במלאי — "כרומו מט 80"
       הולך עם שאר הכרומו מט 80 — אבל כ**שורת-חשבונית נפרדת**, כי לכל
       חשבונית תמחור משלה. מיזוג שתי חשבוניות לשורה אחת מאבד את ההפרדה
       הזו, ואיתה את היכולת לדעת מה שילמנו על כל מנה.

       ⚠️ מיזוג קורה **רק** כשזו אותה חשבונית ממש (אותו מספר-מסמך על
       אותו נייר) — כלומר סריקה חוזרת של אותו מסמך. ואז הכמות **מוחלפת
       ולא נצברת**: הניסוח הראשון שלי עשה ‎ex.qty += qty‎, כך שצילום שני
       של אותה חשבונית היה מכפיל את המלאי בשקט. זה גרוע יותר מהבעיה
       שדווחה, והוא נתפס רק כשישבתי לנסח את החוק במפורש.

       ⚠️ חשבונית בלי מספר-מסמך אינה מתמזגת עם כלום — אין לה זהות,
       ועדיף שורה כפולה שרואים מאשר שתי חשבוניות שנדבקו זו לזו. */
    function addInvoiceRow(item, qty, price) {
      if (!key && !price && !qty) return;
      if (!item.invoices) item.invoices = [];
      var ex = key ? item.invoices.find(function (v) { return v && v.inv === key; }) : null;
      if (ex) {
        ex.qty = qty;
        ex.date = date || ex.date;
        if (order) ex.orderNum = order;
        if (price) ex.price = price;
      } else {
        item.invoices.push({ date: date, inv: key, orderNum: order, qty: qty, price: price });
      }
    }

    /* ⚠️ הכמות הכוללת נגזרת **מסכום השורות פחות הניכויים**, ולא מחיבור
       עיוור. חיבור לערך הקודם היה סוטה מהאמת בכל תיקון ידני של שורה.

       ⚠️ **יתרה פותחת.** פריט ותיק במלאי יכול להחזיק כמות שאינה מגובה
       בשורות-חשבונית — מלאי שהוזן ידנית או לפני שהמעקב הזה קיים. חישוב
       מהשורות בלבד היה **מאפס אותה בשקט** בפעם הראשונה שנוגעים בפריט.
       לכן ההפרש הבלתי-מוסבר נלכד פעם אחת ונשמר. נתפס בבדיקה שנכשלה. */
    function opening(item) {
      if (item._openingQty === undefined) {
        var tin = (item.invoices || []).reduce(function (s, x) { return s + num(x && x.qty); }, 0);
        var tout = (item.deductions || []).reduce(function (s, x) { return s + num(x && x.qty); }, 0);
        item._openingQty = Math.max(0, num(item.qty) - (tin - tout));
      }
      return num(item._openingQty);
    }
    function recalc(item) {
      var tin = (item.invoices || []).reduce(function (s, x) { return s + num(x && x.qty); }, 0);
      var tout = (item.deductions || []).reduce(function (s, x) { return s + num(x && x.qty); }, 0);
      item.qty = Math.max(0, num(item._openingQty) + tin - tout);
    }

    plan.adds.forEach(function (a) {
      var item = inv[a.idx];
      if (!item) return;
      opening(item);                 /* ⚠️ **לפני** ההוספה — אחריה ההפרש כבר מזוהם */
      addInvoiceRow(item, a.qty, a.price);
      recalc(item);
      touched.push({ name: item.name, qty: a.qty, created: false });
    });
    plan.creates.forEach(function (c) {
      var item = { name: c.name, qty: 0, invoices: [], _openingQty: 0 };
      inv.push(item);
      addInvoiceRow(item, c.qty, c.price);
      recalc(item);
      touched.push({ name: item.name, qty: c.qty, created: true });
    });
    return { inventory: inv, touched: touched,
             added: plan.adds.length, created: plan.creates.length,
             skipped: plan.skipped.length, errors: plan.errors.length,
             merged: (plan.merged || []).length,
             conflicts: (plan.merged || []).filter(function (m) { return m.conflict; }) };
  }

  /* סיכום לקריאה אנושית. ⚠️ מזכיר במפורש דילוגים ושגיאות — סיכום שמונה
     רק הצלחות הוא בדיוק איך שארבע שורות נעלמות בלי שאיש ישים לב. */
  function summaryText(res) {
    var parts = [];
    if (res.added) parts.push('עודכנו ' + res.added);
    if (res.created) parts.push('נוצרו ' + res.created + ' פריטים חדשים');
    if (res.skipped) parts.push('דילגת על ' + res.skipped);
    /* ⚠️ איחוד מדווח במפורש: המשתמש הזין שתי שורות וקיבל אחת, ואם לא
       נאמר לו — הוא יחפש את השורה החסרה ויסיק שמשהו נשמט. */
    if (res.merged) parts.push('אוחדו ' + res.merged + ' שורות לאותו נייר');
    if (res.errors) parts.push('⚠️ ' + res.errors + ' לא נוספו');
    return parts.length ? parts.join(' · ') : 'לא נוסף דבר';
  }

  return { normalizeLines: normalizeLines, matchLine: matchLine, suggest: suggest,
           aliasKey: aliasKey, learn: learn, fromAlias: fromAlias, toPer1000: toPer1000,
           planApply: planApply, applyPlan: applyPlan, summaryText: summaryText,
           findDuplicates: findDuplicates };
});
