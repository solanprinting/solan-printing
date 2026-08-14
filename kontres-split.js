/* ═══════════════════════════════════════════════════════════════════════════
   kontres-split.js — חלוקת-עיתון לריצות + תוכנית-כפולות. **טהור, ללא DOM/pdf-lib.**

   חולץ מ-proof-admin.html ב-14/08/2026 (בקשת-בעלים: "הורדת כל העיתון מסודר
   לפי ריצות ופיצול אוטומטי של כפולות לעמודים בודדים") — כדי שהחשבון ייבדק
   ב-Node והדפדפן רק יבצע copyPages/embedPage לפי התוכנית.

   שלושה חלקים:
     · splitToKontresim — סדר-הריצות (saddle-stitch: חצי מקדימה, חצי מאחור).
       ⚠️ הועתק אחד-לאחד מהמימוש שרץ בייצור; ההתנהגות מקובעת בבדיקות-זהב.
     · spreadPlan — סיווג כפולות + תוכנית-עמודים בשני מצבים:
         'duplicate' — ההתנהגות הקיימת של normalizeSpreads: הכפולה נכנסת
           פעמיים כמו-שהיא, בתווית "n-(n+1)". נשארת למסלול "✂ פיצול לריצות".
         'split' — החדש: כל כפולה מתפצלת לשני חצאים אמיתיים, בסדר-הקריאה
           (RTL: החצי הימני קודם — הוא העמוד הנמוך; LTR הפוך). החצי מסומן
           half:'left'|'right' במונחי-גיאומטריית-PDF, והמבצע חותך בחצי-קופסה.
     · runOrderedEntries — שרשור התוכנית לפי סדר-הריצות: עמודי ריצה 1, אחר-
       כך ריצה 2… — הסדר שהדפוס באמת עובד בו, בקובץ אחד.

   הרצת הבדיקות: node kontres-split-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KontresSplit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── סדר-הריצות ──────────────────────────────────────────────────────────
     ⚠️ הועתק ללא-שינוי מ-proof-admin (splitToKontresim). המקרה המיוחד
     32/20|24 → [שארית,16] הוא החלטת-ייצור קיימת; אין "לשפר" אותה כאן. */
  function splitToKontresim(totalPages, fullSheet) {
    var layers = [];
    if (fullSheet === 32 && (totalPages === 20 || totalPages === 24)) layers.push(totalPages - 16, 16);
    else {
      var rem = totalPages % fullSheet;
      if (rem !== 0) layers.push(rem);
      var inner = totalPages - rem;
      while (inner > 0) { layers.push(fullSheet); inner -= fullSheet; }
    }
    var front = 1, back = totalPages;
    var range = function (a, b) { var o = []; for (var k = a; k <= b; k++) o.push(k); return o; };
    return layers.map(function (lp, i) {
      var isLast = i === layers.length - 1, half = lp / 2;
      var pages, label;
      if (isLast && lp === fullSheet) { pages = range(front, front + lp - 1); label = front + '-' + (front + lp - 1); front += lp; }
      else {
        var fe = front + half - 1, bs = back - half + 1;
        if (fe + 1 === bs) { pages = range(front, back); label = front + '-' + back; }
        else { pages = range(front, fe).concat(range(bs, back)); label = front + '-' + fe + '+' + bs + '-' + back; }
        front += half; back -= half;
      }
      return { num: i + 1, pages: pages, count: lp, label: label };
    });
  }

  /* ── סיווג-כפולות ────────────────────────────────────────────────────────
     ⚠️ אותם ספים בדיוק כמו normalizeSpreads בייצור: גודל-בסיס = השכיח
     בדליים של ~5 מ"מ (14.17pt); כפולה = רוחב > בסיס×1.6 וגובה בסטיית
     עד 12%. שינוי-סף כאן משנה איזה עמוד נחשב כפולה — אל בלי בדיקת-זהב. */
  function classifySpreads(sizes) {
    var n = (sizes || []).length;
    var none = { spread: (sizes || []).map(function () { return false; }), any: false };
    if (n < 2) return none;
    var bucket = function (v) { return Math.round(v / 14.17); };
    var freq = {}, bestK = null;
    sizes.forEach(function (s) {
      var k = bucket(s.w) + 'x' + bucket(s.h);
      freq[k] = (freq[k] || 0) + 1;
      if (bestK === null || freq[k] > freq[bestK]) bestK = k;
    });
    var base = null;
    for (var i = 0; i < n; i++) {
      if (bucket(sizes[i].w) + 'x' + bucket(sizes[i].h) === bestK) { base = sizes[i]; break; }
    }
    var spread = sizes.map(function (s) {
      return s.w > base.w * 1.6 && Math.abs(s.h - base.h) < base.h * 0.12;
    });
    return { spread: spread, any: spread.some(Boolean), baseW: base.w, baseH: base.h };
  }

  /* ── תוכנית-העמודים ──────────────────────────────────────────────────────
     מחזיר { entries, hasSpread }. כל entry: { src, half, label, spread }.
       src    — אינדקס עמוד-המקור (0-based) בקובץ המקורי.
       half   — null (עמוד שלם) | 'left'|'right' (חצי-כפולה, גיאומטריית-PDF).
       label  — מספר-העמוד בעיתון ("7" או "16-17" במצב-שכפול).
     ⚠️ מצב-split: סדר-החצאים לפי כיוון-הקריאה — RTL: העמוד הנמוך הוא
     החצי **הימני** של הכפולה (כך גם PageSpine.splitProvenance מכריע);
     ‏LTR הפוך. אלה שני עמודים אמיתיים עם מספרים אמיתיים. */
  function spreadPlan(sizes, opts) {
    var o = opts || {};
    var mode = o.mode === 'split' ? 'split' : 'duplicate';
    var rtl = o.readingDirection !== 'ltr';
    var cls = classifySpreads(sizes || []);
    var entries = [];
    var n = 1;
    (sizes || []).forEach(function (_, i) {
      if (!cls.spread[i]) {
        entries.push({ src: i, half: null, label: String(n), spread: false });
        n += 1;
        return;
      }
      if (mode === 'duplicate') {
        var lbl = n + '-' + (n + 1);
        entries.push({ src: i, half: null, label: lbl, spread: true });
        entries.push({ src: i, half: null, label: lbl, spread: true });
      } else {
        var first = rtl ? 'right' : 'left';
        var second = rtl ? 'left' : 'right';
        entries.push({ src: i, half: first, label: String(n), spread: true });
        entries.push({ src: i, half: second, label: String(n + 1), spread: true });
      }
      n += 2;
    });
    return { entries: entries, hasSpread: cls.any };
  }

  /* ── הסדר הסופי: עמודי-התוכנית משורשרים לפי הריצות ───────────────────────
     מחזיר { order, runs }: order = מערך entries בסדר ריצה-אחר-ריצה, כל
     אחד עם run/runLabel; runs = תוצאת splitToKontresim (לשם/תיעוד).
     ⚠️ עמוד-ריצה שמעבר לאורך התוכנית מדולג — בדיוק כמו הסינון בייצור
     (sp <= total), לא שגיאה: חוברת 30 עמ' על גיליון 32 מייצרת ריצה חסרה. */
  function runOrderedEntries(entries, fullSheet) {
    var total = (entries || []).length;
    var runs = splitToKontresim(total, fullSheet);
    var order = [];
    runs.forEach(function (run) {
      run.pages.forEach(function (sp) {
        if (sp < 1 || sp > total) return;
        var e = entries[sp - 1];
        order.push({ src: e.src, half: e.half, label: e.label, spread: e.spread,
                     run: run.num, runLabel: run.label });
      });
    });
    return { order: order, runs: runs };
  }

  return { splitToKontresim: splitToKontresim, classifySpreads: classifySpreads,
           spreadPlan: spreadPlan, runOrderedEntries: runOrderedEntries };
});
