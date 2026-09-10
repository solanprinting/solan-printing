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
  /* ⚠️ 21/08/2026: ברירת-המחדל הייתה **זהות** — צרכן ששוכח להעביר ‎esc‎
     מזריק שם-קובץ שהלקוח כתב היישר ל-HTML, ובשקט מוחלט (הפלט נראה תקין).
     המודול מיוצא לשני מסכים; ברירת-מחדל בטוחה, לא נוחה. שני הצרכנים
     הנוכחיים כן מעבירים ‎esc‎ משלהם, ולכן זו הקשחה ולא תיקון-פרצה-חיה. */
  function _noEsc(s) {
    return _s(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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
        /* ⚠️ 21/08/2026 — הכיתוב היה "טרם הגיעה · N עמ׳" כש-N הוא מספר
           העמודים **החסרים**. בריצה שממנה לא הגיע דבר N שווה במקרה לגודל
           הריצה, וכך הצוות קרא את המספר כגודל — ואז ריצה שהגיעו ממנה 27
           מתוך 32 עמודים בקבצים בודדים נראתה זהה לחלוטין לריצה ריקה
           ("טרם הגיעה · 5 עמ׳"). אומרים כמה חסרים מתוך כמה. */
        var _span = Number(rn.pageCount) || (rn.pages && rn.pages.length) || rn.missing.length;
        var _sub = (rn.missing.length && rn.missing.length < _span)
          ? ('חלקית · חסרים ' + rn.missing.length + ' מתוך ' + _span + ' עמ׳')
          : ('טרם הגיעה · ' + _span + ' עמ׳');
        return tileHtml({
          esc: esc, cls: 'miss', miss: true, attrs: _act(A, 'runAttrs')(rn, 'missing'),
          name: rn.name + ' · ' + rng,
          sub: _sub,
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
      /* הערות-תקינות של הקובץ (10/09/2026): קבועות על האריח, לשני הצדדים.
         הערת-תצוגה ("אפקטי-שקיפות") מקבלת ℹ️ ולא ⚠️ — הקובץ תקין. */
      var fw = (ctx.fileWarnings && t.fileName && ctx.fileWarnings[t.fileName]) || [];
      var fwCaveat = fw.length && ctx.isPreviewCaveat && fw.every(function (w) { return ctx.isPreviewCaveat(w); });
      if (mk && mk.note) note = _s(mk.note).slice(0, 48) + (mk.spot ? ' 📍' : '');
      else if (t.slotMismatch) {
        note = '⚠️ שובץ לעמוד ' + t.pageNo + ' · בשם-הקובץ כתוב ' + t.nameNo;
        noteColor = '#b45309';
      } else if (fw.length) {
        note = fwCaveat ? 'ℹ️ התצוגה אינה מחייבת — הקובץ תקין' : ('⚠️ ' + fw.length + ' הערות-תקינות');
        noteColor = fwCaveat ? '#4b5563' : '#b45309';
      }
      return tileHtml({
        esc: esc, cls: mk ? (mk.kind === 'replace' ? 'mRep' : 'mOk') : '',
        attrs: _act(A, 'tileAttrs')(t, i, 'page'),
        thumbAttrs: _act(A, 'thumbAttrs')(t, i),
        badge: mk ? (mk.kind === 'replace' ? '🔁' : '✔') : (fw.length ? (fwCaveat ? 'ℹ️' : '⚠️') : ''),
        name: t.label, title: t.label + (mk && mk.note ? ' — ' + mk.note : '') + (fw.length ? ' — ' + fw.join(' · ') : ''),
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
    /* ⚠️ אישור פר-ריצה (23/08/2026): הדפוס חייב לראות **מה מותר להדפיס
       עכשיו**. "חלקית — 2 מתוך 4" ולא "מאושר", כדי שלא תודפס ריצה שהלקוח
       עוד לא אישר. ‏all → ירוק; חלקית → כתום עם המספרים. */
    if (o.approval && o.approval.total > 1) {
      var _a = o.approval;
      if (_a.all) bits.push('<b style="color:#166534">✓ כל ' + _a.total + ' הריצות אושרו ע״י הלקוח</b>');
      else if (_a.approved > 0) bits.push('<b style="color:#b45309">⚠️ הלקוח אישר: '
        + _a.approved + ' מתוך ' + _a.total + ' — השאר טרם אושרו</b>');
      /* ⚠️ שני מניינים נפרדים, ובכוונה: "הלקוח סיים" ו"הדפוס בדק ואישר"
         הם שני שערים שונים, וריצה יכולה לעבור אחד ולא את השני. */
      if (_a.shopAll) bits.push('<b style="color:#166534">✅ כל הריצות אושרו להדפסה בדפוס</b>');
      else if (_a.shopApproved > 0) bits.push('<b style="color:#166534">✅ אושרו בדפוס: '
        + _a.shopApproved + ' מתוך ' + _a.total + '</b>');
    }
    /* ⚠️ הקובץ מכיל פחות עמודי-PDF ממה שהוצהר — ההפרש הוא כפולות, ולכן
       המספרים על האריחים אינם בהכרח מספרי-העמוד האמיתיים. ההורדה מפצלת
       נכון; מה שלא-ודאי הוא **המפה**, ואומרים זאת במקום להשתיק. */
    if (o.uncertain) bits.push('<b style="color:#b91c1c">⚠️ יש כפולות בקובץ — '
      + 'מספרי-העמודים במפה אינם ודאיים (ההורדה מפצלת נכון)</b>');
    /* ⚠️ 09/09/2026: קובץ שקטן פי-יותר-מ-2 מההצהרה אינו כפולות אלא **חלק
       מהעיתון** — בדרך-כלל ריצה שהועלתה כקובץ-מלא. אומרים את זה במפורש,
       כי "יש כפולות" שלח את הדפוס לחפש בעיה שאינה קיימת. */
    /* סיכום הערות-תקינות ברמת-הגיליון (10/09/2026): כמה קבצים, ומה הן */
    if (o.fileWarnCount) bits.push('<b style="color:' + (o.fileWarnOnlyCaveat ? '#4b5563' : '#b45309') + '">'
      + (o.fileWarnOnlyCaveat ? 'ℹ️ ' + o.fileWarnCount + ' עמודים עם אפקטי-שקיפות — התצוגה שלהם אינה מחייבת, הקבצים תקינים'
                              : '⚠️ ' + o.fileWarnCount + ' קבצים עם הערות-תקינות (פרטים על האריח)') + '</b>');
    if (o.partial) bits.push('<b style="color:#b45309">⚠️ הקובץ מכיל ' + o.partial.have
      + ' עמודים מתוך ' + o.partial.declared + ' שהוצהרו — זהו חלק מהעיתון, לא הגיליון המלא; '
      + 'המספור על האריחים הוא לפי סדר-הקובץ</b>');
    /* ⚠️ שני קבצים על אותה משבצת. הרשת נראית מלאה, אבל ההורדה תיתן עמוד
       עודף — ורק הדפוס יודע איזו גרסה נכונה. אין הכרעה אוטומטית. */
    if (o.clashes && o.clashes.length) bits.push('<b style="color:#b91c1c">⚠️ שני קבצים על עמ׳ '
      + o.clashes.join(' · ') + ' — בחרו איזה מהם נכון (ההורדה תיתן עמוד עודף)</b>');
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
    /* ⚠️ 21/08/2026 — **"48 עמודים מתוך 48" כשהגיעו 16.** הספירה סכמה את
       ‎pages‎ של כל אריח בלי לקזז חפיפה, ולכן לקוח שהעלה את אותה ריצה
       שלוש פעמים (16+16+16) קיבל "הגיליון מלא" בזמן ש-32 אריחי-חסר
       מצוירים מתחת, על אותו מסך. גם "64 מתוך 48" הופיע — מספר בלתי-אפשרי.
       סופרים **משבצות ייחודיות שכוסו**, לא סכום-אורכים. */
    var _cov = {};
    tiles.forEach(function (t, ti) {
      if (t.kind !== 'page') return;
      /* ⚠️ **ריצה היא קונטרס, לא טווח רציף** — ריצה 1 של 48/32 היא
         1-8+41-48. לכן הכיסוי נלקח מ-‎seq‎ כשהוא קיים, ורק בהיעדרו
         נפרש טווח מ-‎pageNo‎. פרישה נאיבית סימנה 1..16 וגם שיקרה במניין. */
      if (Array.isArray(t.seq) && t.seq.length) {
        t.seq.forEach(function (q) { var n2 = Number(q); if (isFinite(n2) && n2 >= 1) _cov[n2] = 1; });
        return;
      }
      var no = Number(t.pageNo);
      var span = Math.max(1, Math.min(400, Number(t.pages) | 0));
      /* אריח בלי מספר-משבצת (רשת שטוחה) נספר לפי עצמו — אין מה לקזז מולו. */
      if (!isFinite(no) || no < 1) { _cov['t' + ti] = 1; return; }
      for (var c = 0; c < span; c++) _cov[no + c] = 1;
    });
    var gotPages = Object.keys(_cov).length;
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
      uncertain: tiles.some(function (t) { return t.invented; }),
      fileWarnCount: (function () {
        var m = ctx.fileWarnings || {}; return Object.keys(m).filter(function (k) { return (m[k] || []).length; }).length;
      })(),
      fileWarnOnlyCaveat: (function () {
        var m = ctx.fileWarnings || {}, ks = Object.keys(m).filter(function (k) { return (m[k] || []).length; });
        if (!ks.length || !ctx.isPreviewCaveat) return false;
        return ks.every(function (k) { return m[k].every(function (w) { return ctx.isPreviewCaveat(w); }); });
      })(),
      partial: (function () {
        var t0 = null;
        tiles.forEach(function (t) { if (!t0 && t.partial && t.partialOf) t0 = t.partialOf; });
        return t0;
      })(),
      approval: ctx.approval || null,
      clashes: (function () {
        var seen = {}, out2 = [];
        tiles.forEach(function (t) {
          (t.slotClash || []).forEach(function (q) { if (!seen[q]) { seen[q] = 1; out2.push(q); } });
        });
        return out2.sort(function (a, b) { return a - b; });
      })(),
      runs: grid && grid.ok ? grid.runs.length : 0,
      gotRuns: grid && grid.ok ? grid.gotRuns : 0,
      sheet: grid && grid.ok ? grid.sheet : 0,
    });
    var body = (grid && grid.ok) ? runsHtml(grid, ctx) : flatHtml(tiles, ctx);
    /* ⚠️ 21/08/2026: ‏runGrid כבר מסמן ‎dupOf‎ על ריצה שהועלתה פעמיים —
       ו-build התעלם ממנו והדפיס את נוסח-ברירת-המחדל ("גודל-הגיליון שמור
       שגוי / השם אינו מספר-הריצה"). שני ההסברים שקריים כשהשם והגיליון
       דווקא נכונים, והם שולחים את הצוות לתקן דבר תקין. */
    var _orphs = (grid && grid.ok && grid.orphans) ? grid.orphans : [];
    var _dups = _orphs.filter(function (o) { return o.dupOf; });
    var _unk  = _orphs.filter(function (o) { return !o.dupOf; });
    var orph = '';
    if (_dups.length) {
      var _dupNos = [];
      _dups.forEach(function (o) { if (_dupNos.indexOf(o.dupOf) < 0) _dupNos.push(o.dupOf); });
      orph += '<div class="isGridT" style="color:#b91c1c">⚠️ הועלה יותר מפעם אחת: ריצה '
        + _dupNos.map(function (n2) { return esc(n2); }).join(' · ריצה ')
        + ' (' + _dups.length + ' עותקים עודפים) — רק העותק ששובץ נספר. '
        + 'מחקו את המיותר, או ⇄ העבירו למספר-הריצה הנכון</div>';
    }
    if (_unk.length) {
      orph += '<div class="isGridT" style="color:#b91c1c">⚠️ מחוץ לפריסה: '
        + _unk.map(function (o) { return esc(o.name); }).join(' · ')
        + ' — או שגודל-הגיליון שמור שגוי, או שהשם אינו מספר-הריצה</div>';
    }
    return { mode: (grid && grid.ok) ? 'runs' : 'flat',
             html: head + '<div class="isPages">' + body + '</div>' + orph + _s(ctx.footer) };
  }

  return { build: build, tileHtml: tileHtml, runsHtml: runsHtml,
           flatHtml: flatHtml, headHtml: headHtml };
});
