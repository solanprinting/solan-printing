/* ═══════════════════════════════════════════════════════════════════════════
   quotes-import.js — ייבוא הצעות-מחיר מקובץ אקסל. החלטות טהורות בלבד.

   הרקע: ההצעות מנוהלות במערכת חיצונית, והייצוא ממנה הוא גיליון שבו כל
   שורה היא הצעה. המטרה: להכניס אותן לאפליקציה כדי שאפשר יהיה למצוא
   בעתיד מה הוצע לכל לקוח.

   ⚠️ **זיהוי-העמודות הוא ניחוש, ולכן הוא ניתן לתיקון.** כל ייצוא כותב
   כותרות אחרת ("לקוח" · "שם לקוח" · "Customer" · "לקוח/ספק"), ומיפוי
   שגוי בשקט הוא הצעות שנכנסות עם השדות מוחלפים. המודול מחזיר מיפוי
   **מוצע** עם ציון-ביטחון; הממשק מציג ומאפשר לשנות.

   ⚠️ **ייבוא חוזר אינו מכפיל.** אותו מספר-מסמך מזוהה כקיים ומעודכן.
   בלי זה כל ייבוא נוסף היה מייצר עותק שני של כל ההצעות.

   הרצת הבדיקות: node quotes-import-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuotesImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var clean = function (v) { return String(v == null ? '' : v).trim(); };
  var num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = clean(v).replace(/[^\d.,-]/g, '').replace(/,/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  var norm = function (v) { return clean(v).toLowerCase().replace(/["'׳״]/g, '').replace(/\s+/g, ' '); };

  /* ── תאריך ─────────────────────────────────────────────────────────────
     ⚠️ **הבאג שנמדד בייבוא אמיתי (09/08/2026).** הגיליון נקרא עם
     ‏cellDates:false, ולכן תא-תאריך מגיע כ**מספר סידורי** של אקסל
     (‏45678) ולא כתאריך. המרה ל-String נתנה "45678", והתצוגה נפלה
     לתאריך של היום — כלומר כל ההצעות נראו כאילו הופקו היום.

     ⚠️ הבסיס הוא 1899-12-30 ולא 01-01: אקסל סופר את 1900 כשנה מעוברת
     אף שאינה, וזו הדרך המקובלת לפצות על כך.
     ⚠️ מזהה גם dd/mm/yyyy — הצורה הנפוצה בייצוא ישראלי — ומחזיר תמיד
     ‏yyyy-mm-dd, שזה מה שהאפליקציה מצפה לו. */
  function normDate(v) {
    if (v instanceof Date && !isNaN(v)) return iso(v);
    var n = (typeof v === 'number') ? v : (/^\d+(\.\d+)?$/.test(clean(v)) ? parseFloat(clean(v)) : NaN);
    if (isFinite(n) && n > 20000 && n < 80000) {
      var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
      return iso(d);
    }
    var t = clean(v);
    if (!t) return '';
    var m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) {
      var yy = m[3].length === 2 ? ('20' + m[3]) : m[3];
      return yy + '-' + pad(m[2]) + '-' + pad(m[1]);
    }
    var m2 = t.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
    if (m2) return m2[1] + '-' + pad(m2[2]) + '-' + pad(m2[3]);
    return t;
  }
  function pad(x) { return String(x).length < 2 ? '0' + x : String(x); }
  function iso(d) {
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  /* ── התאמת עובד ────────────────────────────────────────────────────────
     ⚠️ הסינון היה `q.employee === 'אמיר'` — השוואה מדויקת. בייצוא כתוב
     "אמיר כהן" או עם רווח נגרר, ולכן ההצעות שיובאו לא הופיעו תחת אף
     עובד. השוואה סובלנית: אחד מכיל את השני. */
  function matchesEmployee(quoteEmp, filterEmp) {
    var a = norm(filterEmp);
    if (!a) return true;
    var b = norm(quoteEmp);
    if (!b) return false;
    return b === a || b.indexOf(a) >= 0 || a.indexOf(b) >= 0;
  }

  /* השדות שאנחנו יודעים לקלוט, והמילים שמזהות כל אחד.
     ⚠️ הסדר חשוב: 'customerEmail' לפני 'customer', אחרת "אימייל לקוח"
     היה נתפס כשם-הלקוח. */
  var FIELDS = [
    { key: 'docNum',        label: 'מספר מסמך',   words: ['מספר מסמך', 'מס מסמך', 'מספר הצעה', 'מס הצעה', 'אסמכתא', 'doc', 'number', 'מספר'] },
    { key: 'customerEmail', label: 'אימייל לקוח', words: ['אימייל', 'מייל', 'email', 'mail'] },
    { key: 'customer',      label: 'שם לקוח',     words: ['שם לקוח', 'לקוח', 'customer', 'client', 'שם'] },
    { key: 'date',          label: 'תאריך',       words: ['תאריך', 'date', 'הופק'] },
    { key: 'total',         label: 'סכום',        words: ['סה כ', 'סהכ', 'סכום', 'total', 'amount', 'לתשלום'] },
    { key: 'desc',          label: 'תיאור',       words: ['תיאור', 'פירוט', 'נושא', 'desc', 'subject', 'הערות'] },
    { key: 'employee',      label: 'עובד',        words: ['עובד', 'נציג', 'איש קשר', 'employee', 'agent'] },
    { key: 'status',        label: 'סטטוס',       words: ['סטטוס', 'מצב', 'status'] },
  ];

  /* ── זיהוי עמודות ──────────────────────────────────────────────────────
     מחזיר { field -> {col, header, score} }. ציון 100 = כותרת זהה,
     60 = הכלה. ⚠️ עמודה נתפסת פעם אחת בלבד: בלי זה "תאריך הצעה" ו-
     "תאריך תוקף" היו שניהם נבחרים לאותו שדה, והשני היה דורס. */
  function detectColumns(headerRow) {
    var hdr = (headerRow || []).map(function (h) { return norm(h); });
    var out = {}, taken = {};
    FIELDS.forEach(function (f) {
      var best = -1, bestScore = 0;
      hdr.forEach(function (h, i) {
        if (!h || taken[i]) return;
        var score = 0;
        f.words.forEach(function (w) {
          var nw = norm(w);
          if (h === nw) score = Math.max(score, 100);
          else if (h.indexOf(nw) >= 0) score = Math.max(score, 60);
        });
        if (score > bestScore) { bestScore = score; best = i; }
      });
      if (best >= 0 && bestScore > 0) { out[f.key] = { col: best, header: clean(headerRow[best]), score: bestScore }; taken[best] = true; }
    });
    return out;
  }

  /* ── שורות → הצעות ─────────────────────────────────────────────────────
     ⚠️ שורה בלי לקוח **ובלי** מספר-מסמך אינה הצעה — היא כותרת-ביניים
     או שורת-סיכום. הכנסתה הייתה מזהמת את הרשימה ברשומות ריקות.
     ⚠️ הסכום נשמר כשורת-פריט אחת, כי כך בנוי מודל-ההצעה באפליקציה
     (‏items[] עם qty/price) — וכך הסכום מופיע ברשימה בלי מודל נפרד. */
  function rowsToQuotes(rows, mapping, opts) {
    var o = opts || {};
    var map = mapping || {};
    var get = function (row, key) {
      var m = map[key];
      return (m && m.col >= 0) ? row[m.col] : '';
    };
    var out = [], dropped = 0;
    (rows || []).forEach(function (row) {
      if (!row || !row.length) { return; }
      var customer = clean(get(row, 'customer'));
      var docNum = clean(get(row, 'docNum'));
      if (!customer && !docNum) { dropped++; return; }
      var total = num(get(row, 'total'));
      var desc = clean(get(row, 'desc')) || 'הצעת מחיר';
      out.push({
        type: 'quote',
        docNum: docNum,
        customer: customer,
        customerEmail: clean(get(row, 'customerEmail')),
        employee: clean(get(row, 'employee')),
        date: normDate(get(row, 'date')),
        notes: clean(get(row, 'status')),
        items: [{ desc: desc, qty: 1, price: total }],
        vatPct: o.vatPct === undefined ? 0 : o.vatPct,
        imported: true,
      });
    });
    return { quotes: out, dropped: dropped };
  }

  /* ── מיזוג עם הקיים ────────────────────────────────────────────────────
     ⚠️ הזהות היא **מספר-המסמך**, לא השם: אותו לקוח יכול לקבל עשר הצעות.
     הצעה בלי מספר-מסמך נחשבת חדשה תמיד — עדיף כפילות שרואים מאשר
     דריסה של הצעה אחרת.
     ⚠️ מחזיר תוכנית ולא מבצע, כדי שאפשר להראות מה ייווצר ומה יעודכן. */
  function planMerge(existing, incoming) {
    var ex = existing || [];
    var byDoc = {};
    ex.forEach(function (q, i) { var d = clean(q && q.docNum); if (d) byDoc[d] = i; });
    var creates = [], updates = [];
    (incoming || []).forEach(function (q) {
      var d = clean(q.docNum);
      if (d && byDoc[d] !== undefined) updates.push({ idx: byDoc[d], quote: q });
      else creates.push(q);
    });
    return { creates: creates, updates: updates };
  }

  function applyMerge(plan, existing, mkId) {
    var ex = existing || [];
    var newId = mkId || function () { return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); };
    plan.updates.forEach(function (u) {
      /* ⚠️ שומר את המזהה ואת חותמת-הזמן המקוריים: החלפתם הייתה שוברת
         קישורים קיימים ומקפיצה הצעה ישנה לראש הרשימה. */
      var old = ex[u.idx] || {};
      ex[u.idx] = Object.assign({}, old, u.quote, { id: old.id, ts: old.ts || Date.now() });
    });
    plan.creates.forEach(function (q) {
      ex.push(Object.assign({}, q, { id: newId(), ts: Date.now() }));
    });
    return { quotes: ex, created: plan.creates.length, updated: plan.updates.length };
  }

  /* ── חיפוש ─────────────────────────────────────────────────────────────
     ⚠️ מחפש גם בשם-הלקוח, גם במספר-המסמך וגם בתיאורי-השורות — כי
     "מה הצעתי לו על הכריכה" הוא חיפוש נפוץ בדיוק כמו חיפוש לפי שם. */
  function search(quotes, term) {
    var q = norm(term);
    if (!q) return quotes || [];
    return (quotes || []).filter(function (x) {
      if (norm(x.customer).indexOf(q) >= 0) return true;
      if (norm(x.docNum).indexOf(q) >= 0) return true;
      if (norm(x.employee).indexOf(q) >= 0) return true;
      if (norm(x.notes).indexOf(q) >= 0) return true;
      return (x.items || []).some(function (it) { return norm(it && it.desc).indexOf(q) >= 0; });
    });
  }

  return { FIELDS: FIELDS, detectColumns: detectColumns, rowsToQuotes: rowsToQuotes,
           normDate: normDate, matchesEmployee: matchesEmployee,
           planMerge: planMerge, applyMerge: applyMerge, search: search };
});
