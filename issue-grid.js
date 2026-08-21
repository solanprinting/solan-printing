/* ═══════════════════════════════════════════════════════════════════════════
   issue-grid.js — פריסת-הגיליון, **מקור-אמת יחיד לשני המסכים**.

   בקשת-בעלים 20/08/2026: "אני רוצה שללקוחות תהיה תצוגה כמו בפורטל-הלקוחות
   מהצד של הדפוס — שנראה אותו דבר, רק שלדפוס יהיו לחצנים שונים. ככה יהיה
   קל יותר להסביר ללקוח איך להשתמש בפורטל."

   ⚠️ עד היום היו **שתי** פריסות שנכתבו בנפרד (‏isPages/pgT במסך-הדפוס ·
   ‏sgGrid/sgT בפורטל). כל תיקון היה צריך להיעשות פעמיים, ובפועל נעשה
   פעם אחת — וזה בדיוק מקור הפער שהבעלים ראה. מכאן: **המבנה כאן**, וכל
   צד מוסיף רק את הכפתורים שלו.

   הפרדת-האחריות:
     · מה יש בגיליון      → ShopIssue (pageTiles/runGrid) — כבר משותף.
     · איך זה **נראה**    → כאן. אותן מחלקות, אותו סדר, אותן תוויות.
     · מה אפשר **לעשות** → ‏actions של כל צד (מחרוזות-HTML של כפתורים).

   ⚠️ טהור: אין DOM, אין fetch, אין window. מקבל esc/fmt מבחוץ כדי שכל
   מסך ישתמש בבורח-ה-HTML שלו (‏escHtml מול esc) בלי כפילות.

   הרצת הבדיקות: node issue-grid-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IssueGrid = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _s(v) { return v == null ? '' : String(v); }
  function _noEsc(s) { return _s(s); }

  /* ברירות-מחדל: אם צד לא סיפק פעולה — לא מוצג כלום. לעולם לא נופלים
     לכפתור של הצד השני. */
  var NOOP = function () { return ''; };
  function _act(o, k) { return (o && typeof o[k] === 'function') ? o[k] : NOOP; }

  /* ── אריח-עמוד/ריצה אחד ────────────────────────────────────────────────
     המבנה זהה בשני הצדדים:
       .pgT[.miss|.mOk|.mRep]
         .pgTh   — תיבת-התצוגה (תמונונת נטענת מאוחר, או ✚ למשבצת-חסרה)
         .pgNm   — השם/המספר
         .pgSub  — שורת-משנה אפורה (זמן-הגעה, "טרם הגיעה")
         .pgNote — הערה צבעונית (חסרים, אי-התאמה, סימון-הדפוס)
         [כפתורי-הצד]                                                     */
  function tileHtml(o) {
    var esc = o.esc || _noEsc;
    var cls = 'pgT' + (o.cls ? ' ' + o.cls : '');
    var thumb = o.miss
      ? '<div class="pgTh">✚</div>'
      : '<div class="pgTh"' + _s(o.thumbAttrs) + '><span class="pgPh">📄</span>'
        + (o.badge ? '<span class="pgMk">' + esc(o.badge) + '</span>' : '')
        + (o.corner ? '<span class="pgSpread">' + esc(o.corner) + '</span>' : '') + '</div>';
    return '<div class="' + cls + '"' + _s(o.attrs) + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>'
      + thumb
      + '<div class="pgNm">' + (o.nameHtml != null ? _s(o.nameHtml) : esc(o.name)) + '</div>'
      + (o.note ? '<div class="pgNote"' + (o.noteColor ? ' style="color:' + o.noteColor + '"' : '') + '>' + esc(o.note) + '</div>' : '')
      + (o.sub ? '<div class="pgSub"' + (o.subColor ? ' style="color:' + o.subColor + '"' : '') + '>' + esc(o.sub) + '</div>' : '')
      + _s(o.extra)
      + '</div>';
  }

  /* ── רשת-הריצות ────────────────────────────────────────────────────────
     שלושה מצבים לריצה, בדיוק כמו ב-ShopIssue.runGrid:
       הגיעה (קובץ-ריצה) · מכוסה-בקבצים-בודדים · טרם הגיעה.             */
  function runsHtml(grid, ctx) {
    var esc = ctx.esc || _noEsc;
    var A = ctx.actions || {};
    return (grid.runs || []).map(function (rn) {
      var rng = rn.label;
      if (!rn.got && rn.coveredByFiles) {
        return tileHtml({
          esc: esc, cls: 'mOk', attrs: _act(A, 'runAttrs')(rn, 'covered'),
          badge: '✔', name: rn.name + ' · ' + rng,
          sub: 'הגיעו כל ' + rn.pageCount + ' העמודים' + (rn.coveredVia === 'full' ? ' · בקובץ המלא' : ' · בקבצים בודדים'), subColor: '#15803d',
          title: rn.name + ' · ' + rng,
          extra: _act(A, 'runExtra')(rn, 'covered'),
        });
      }
      if (!rn.got) {
        return tileHtml({
          esc: esc, cls: 'miss', miss: true, attrs: _act(A, 'runAttrs')(rn, 'missing'),
          name: rn.name + ' · ' + rng,
          sub: 'טרם הגיעה · ' + rn.missing.length + ' עמ׳',
          title: rn.name + ' · ' + rng,
          extra: _act(A, 'runExtra')(rn, 'missing'),
        });
      }
      var t = (ctx.tiles || [])[rn.tileIndex] || {};
      var mk = t.mark;
      var note = '', noteColor = '';
      if (rn.pagesMismatch) {
        note = '⚠️ הגיעו ' + rn.pagesMismatch.got + ' עמ׳ · הקונטרס ' + rn.pagesMismatch.want
             + (rn.pagesMismatch.likely ? ' — כנראה זו ריצה ' + rn.pagesMismatch.likely + ' (⇄ להעברה)' : '');
        noteColor = '#b91c1c';
      } else if (rn.missing.length) {
        note = '⚠️ ' + rn.missing.length + ' עמ׳ חסרים בריצה';
        noteColor = '#b45309';
      }
      return tileHtml({
        esc: esc, cls: mk ? (mk.kind === 'replace' ? 'mRep' : 'mOk') : '',
        attrs: _act(A, 'runAttrs')(rn, 'got'),
        thumbAttrs: _act(A, 'thumbAttrs')(t, rn.tileIndex),
        badge: mk ? (mk.kind === 'replace' ? '🔁' : '✔') : '',
        name: rn.name + ' · ' + rng, title: rn.name + ' · ' + rng,
        note: note, noteColor: noteColor,
        sub: (!note && t.at && ctx.fmt) ? ctx.fmt(t.at) : '',
        extra: _act(A, 'runExtra')(rn, 'got'),
      });
    }).join('');
  }

  /* ── הרשת השטוחה (עמוד-לקובץ) ────────────────────────────────────────── */
  function flatHtml(tiles, ctx) {
    var esc = ctx.esc || _noEsc;
    var A = ctx.actions || {};
    return (tiles || []).map(function (t, i) {
      if (t.kind === 'missing') {
        return tileHtml({
          esc: esc, cls: 'miss', miss: true, attrs: _act(A, 'tileAttrs')(t, i, 'missing'),
          name: t.label, sub: _act(A, 'missHint')(t, i),
          extra: _act(A, 'tileExtra')(t, i, 'missing'),
        });
      }
      var mk = t.mark;
      var note = '', noteColor = '';
      if (mk && mk.note) note = _s(mk.note).slice(0, 48) + (mk.spot ? ' 📍' : '');
      else if (t.slotMismatch) {
        note = '⚠️ שובץ לעמוד ' + t.pageNo + ' · בשם-הקובץ כתוב ' + t.nameNo;
        noteColor = '#b45309';
      }
      return tileHtml({
        esc: esc, cls: mk ? (mk.kind === 'replace' ? 'mRep' : 'mOk') : '',
        attrs: _act(A, 'tileAttrs')(t, i, 'page'),
        thumbAttrs: _act(A, 'thumbAttrs')(t, i),
        badge: mk ? (mk.kind === 'replace' ? '🔁' : '✔') : '',
        name: t.label, title: t.label + (mk && mk.note ? ' — ' + mk.note : ''),
        note: note, noteColor: noteColor,
        sub: (!note && t.at && ctx.fmt) ? ctx.fmt(t.at) : '',
        extra: _act(A, 'tileExtra')(t, i, 'page'),
      });
    }).join('');
  }

  /* ── שורת-הכותרת ───────────────────────────────────────────────────────
     ⚠️ אותו נוסח בשני הצדדים חוץ מסיפא-ההסבר: הדפוס מקבל "לחיצה על עמוד:
     הגדלה · סימון · הורדה", הלקוח מקבל את ההסבר שלו. */
  function headHtml(o) {
    var esc = o.esc || _noEsc;
    var bits = [];
    if (o.runs) bits.push('ריצות: <b>' + o.gotRuns + '</b> מתוך <b>' + o.runs + '</b>');
    bits.push('<b>' + o.gotPages + '</b> עמודים' + (o.totalPages ? ' מתוך <b>' + o.totalPages + '</b>' : ''));
    if (o.sheet) bits.push('גיליון: <b>' + o.sheet + '</b> עמ׳');
    if (o.marked) bits.push('<b style="color:#dc2626">🔁 ' + o.marked + ' לדרישת-החלפה</b>');
    return '<div class="isGridT">' + bits.join(' · ')
      + (o.hint ? ' — ' + esc(o.hint) : '')
      + _s(o.extra) + '</div>';
  }

  /* ── הרכבה מלאה ────────────────────────────────────────────────────────
     מחזיר {mode, html}: ‏runs · flat · empty. שני הצדדים קוראים לזה
     ומקבלים את אותו מבנה בדיוק. */
  function build(ctx) {
    var tiles = ctx.tiles || [];
    var grid = ctx.grid;
    var esc = ctx.esc || _noEsc;
    var gotPages = tiles.reduce(function (n, t) {
      return n + (t.kind === 'page' ? Math.max(1, Number(t.pages) | 0) : 0);
    }, 0);
    var marked = tiles.filter(function (t) { return t.mark && t.mark.kind === 'replace'; }).length;
    if (!tiles.length) {
      /* ⚠️ 21/08/2026 (ביקורת): ‏headExtra נשמט במצב-ריק — וכפתור "📐 כמה
         עמודים בגיליון?" נעלם בדיוק כשהגיליון ריק והלקוח הכי צריך אותו. */
      return { mode: 'empty', html: '<div class="isEmpty">' + esc(ctx.emptyText || 'טרם התקבלו קבצים לגיליון הזה.')
        + _s(ctx.headExtra) + '</div>' };
    }
    var head = headHtml({
      esc: esc, hint: ctx.hint, extra: ctx.headExtra,
      gotPages: gotPages, totalPages: ctx.totalPages, marked: marked,
      runs: grid && grid.ok ? grid.runs.length : 0,
      gotRuns: grid && grid.ok ? grid.gotRuns : 0,
      sheet: grid && grid.ok ? grid.sheet : 0,
    });
    var body = (grid && grid.ok) ? runsHtml(grid, ctx) : flatHtml(tiles, ctx);
    var orph = (grid && grid.ok && grid.orphans && grid.orphans.length)
      ? '<div class="isGridT" style="color:#b91c1c">⚠️ מחוץ לפריסה: '
        + grid.orphans.map(function (o) { return esc(o.name); }).join(' · ')
        + ' — או שגודל-הגיליון שמור שגוי, או שהשם אינו מספר-הריצה</div>' : '';
    return { mode: (grid && grid.ok) ? 'runs' : 'flat',
             html: head + '<div class="isPages">' + body + '</div>' + orph + _s(ctx.footer) };
  }

  return { build: build, tileHtml: tileHtml, runsHtml: runsHtml,
           flatHtml: flatHtml, headHtml: headHtml };
});
