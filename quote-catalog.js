/* ═══════════════════════════════════════════════════════════════════════════
   quote-catalog.js — מחירוני-הפלאיירים לתוך הפרומפט של תמחור ה-AI.

   ⚠️ **התקלה שזה פותר (10/08/2026, בעלים): "יש לי כבר מחירון פלאיירים
   אבל הוא לא לוקח משם פרטים".** ונכון: ‎_aiQuoteSys‎ לא הזכיר את
   ‎FLYER_CATALOG‎ אף פעם — הוא פשוט לא היה בפרומפט. הקטלוג חי במסך
   ("⚡ לחיצה על מחיר מוסיפה להצעה") ומעולם לא הגיע למודל.

   ⚠️ ‎flatRates‎ כן הגיע — אבל **בתוך גוש JSON גולמי, בלי מילה על מה
   המפתחות אומרים**. מבנה כמו ‎{flyerA4:{tiers:{5000:800}}}‎ אינו מסביר
   את עצמו, ולכן הוא היה שם בלי להיות שמיש. "נמצא בפרומפט" ו"ניתן
   לשימוש" הם שני דברים שונים.

   ⚠️ **אין אינטרפולציה בין מדרגות.** ‏15,000 פלאיירים אינו הממוצע של
   10,000 ו-20,000 — התמחור מדורג ולא לינארי. מודל שיחשב ממוצע ייתן
   מחיר שנראה סביר לגמרי ואינו קיים במחירון.

   ⚠️ **null אינו אפס.** תא ריק בקטלוג פירושו "אין מחיר לכמות הזו",
   והצגתו כ-0 הייתה נותנת פלאייר בחינם.

   הרצת הבדיקות: node quote-catalog-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuoteCatalog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var clean = function (s) { return String(s == null ? '' : s).trim(); };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v) && v > 0; };

  /* ── קטלוג הפלאיירים ───────────────────────────────────────────────────
     טבלה קריאה: שורה לכל גודל, מחיר לכל מדרגת-כמות. תא בלי מחיר מסומן
     "—" במפורש ולא מושמט, כדי שהמודל יראה שהכמות הזו **נשקלה ואין לה
     מחיר** — ולא יחשוב שהיא פשוט חסרה מהנתונים ויאלתר. */
  function flyerTable(catalog, qtys) {
    var rows = (catalog || []).filter(function (r) { return r && clean(r.name); });
    if (!rows.length) return '';
    var q = (qtys || []).map(clean);
    var head = 'גודל' + q.map(function (x) { return ' | ' + x; }).join('');
    var body = rows.map(function (r) {
      var cells = q.map(function (_, i) {
        var v = (r.p || [])[i];
        return ' | ' + (isNum(v) ? String(v) : '—');
      }).join('');
      return clean(r.name) + cells;
    }).join('\n');
    return head + '\n' + body;
  }

  /* ── המוצרים השטוחים שהבעלים מתחזק ─────────────────────────────────────
     ⚠️ מתורגם לשמות קריאים. אפס או חסר = **לא תומחר**, ולא "בחינם";
     שורה כזו מוצגת כך במפורש, אחרת המודל היה מציע מוצר במחיר 0. */
  function flatTable(flatRates, products, tiers) {
    var fr = flatRates || {};
    var out = [];
    (products || []).forEach(function (p) {
      if (!p || !p.id) return;
      var r = fr[p.id];
      if (!r) { return; }
      if (p.tiered) {
        var parts = (tiers || []).map(function (t) {
          var v = (r.tiers || {})[t] || (r.tiers || {})[String(t)];
          return t.toLocaleString() + ': ' + (isNum(v) ? v + ' ₪' : 'לא תומחר');
        });
        var folds = (tiers || []).map(function (t) {
          var v = (r.foldTiers || {})[t] || (r.foldTiers || {})[String(t)];
          return isNum(v) ? (t.toLocaleString() + ': ' + v + ' ₪') : null;
        }).filter(Boolean);
        out.push('- ' + clean(p.label) + ' — ' + parts.join(' · ')
                 + (folds.length ? ('  [תוספת קיפול: ' + folds.join(' · ') + ']') : ''));
      } else {
        var per = r.per1000;
        out.push('- ' + clean(p.label) + ' — '
                 + (isNum(per) ? (per + ' ₪ לאלף') : 'לא תומחר'));
      }
    });
    return out.join('\n');
  }

  /* ── הקטע השלם לפרומפט ─────────────────────────────────────────────────
     ⚠️ כללי-השימוש חשובים כמו המספרים. מחירון בלי הוראה מתי הוא חל הוא
     הזמנה לתמחר לפיו גם עבודה שאינה שייכת אליו — נייר אחר, גודל אחר,
     או כמות שאינה במדרגות. */
  function catalogBlock(opts) {
    var o = opts || {};
    var tbl = flyerTable(o.catalog, o.qtys);
    var flat = flatTable(o.flatRates, o.products, o.tiers);
    if (!tbl && !flat) return '';
    var s = '\n\n━━━ מחירוני מוצרים מוכנים — קודמים לחישוב מהתעריפון ━━━\n'
      + '⚠️ כשהעבודה מתאימה **בדיוק** לשורה במחירון (אותו גודל ואותה כמות),\n'
      + 'קח את המחיר מכאן ואל תחשב אותו מהתעריפון. החישוב מהתעריפון הוא\n'
      + 'למה שאינו במחירון.\n'
      + '⚠️ **אין אינטרפולציה בין מדרגות-הכמות.** התמחור מדורג ולא לינארי:\n'
      + '‏15,000 אינו הממוצע של 10,000 ו-20,000. כמות שאינה מדרגה — אמור\n'
      + 'אילו מדרגות קיימות ושאל לאיזו לתמחר, או חשב מהתעריפון ואמור זאת.\n'
      + '⚠️ "—" פירושו **אין מחיר לכמות הזו**, לא אפס ולא "זול". אל תציע\n'
      + 'מחיר לתא ריק.\n';
    if (tbl) {
      s += '\nמחירון פלאיירים (מחלקת גרפיקה) — ₪ לכמות, לפי גודל:\n' + tbl + '\n';
      /* ⚠️ ההסתייגות היא חלק מהמחיר, לא הערת-שוליים: המחירון מניח נייר
         מסוים ואינו כולל מע"מ, הובלה וגרפיקה. הצעה שיוצאת בלי זה היא
         הצעה שגויה כלפי הלקוח. */
      if (clean(o.note)) s += '⚠️ ' + clean(o.note) + '\n';
      s += '⚠️ המחירון הזה מניח את הנייר שצוין. נייר אחר, משקל אחר או\n'
        + 'גודל שאינו ברשימה — חשב מהתעריפון ואמור במפורש שלא השתמשת במחירון.\n';
    }
    if (flat) {
      s += '\nמוצרים שטוחים מהתעריפון שלך (מחיר לאלף / לפי מדרגה):\n' + flat + '\n'
        + '⚠️ "לא תומחר" פירושו שהמחיר לא הוזן — שאל, אל תניח.\n';
    }
    return s;
  }

  return { flyerTable: flyerTable, flatTable: flatTable, catalogBlock: catalogBlock };
});
