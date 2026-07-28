/* ═══════════════════════════════════════════════════════════════════════════
 * bleed-engine.js — יצירת גלישות לקובץ (UMD · Node + דפדפן)
 * ───────────────────────────────────────────────────────────────────────────
 * מחשב *תוכנית ציור* בלבד (מלבני מקור→יעד + שיקוף), בלי DOM ובלי canvas —
 * כך שהחישוב נבדק ב-Node, והדפדפן רק מבצע drawImage לפי התוכנית.
 *
 * השיטות:
 *   edge    — שכפול קצה: פס הפיקסלים הקיצוני נמתח החוצה כמו שהוא.
 *   stretch — מתיחת קצה: N הפיקסלים האחרונים נמתחים החוצה (מעבר רך יותר).
 *   mirror  — שיקוף: הקצה משוכפל כתמונת-מראה. הכי טוב לרקעים וטקסטורות.
 *   ai      — המשך חכם. ⚠️ דורש שירות יצירת-תמונות (outpainting) שאינו מחובר,
 *             ולכן isAvailable=false ואין ליפול אליו בשקט.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BleedEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var METHODS = [
    { id: 'edge',    label: 'שכפול קצה',            desc: 'העתקת פס התמונה הקרוב ביותר לקצה.', available: true },
    { id: 'stretch', label: 'מתיחת קצה',            desc: 'מתיחת מספר הפיקסלים האחרונים החוצה.', available: true },
    { id: 'mirror',  label: 'שיקוף',                desc: 'שכפול הקצה כתמונת מראה. מתאים לרקעים וטקסטורות.', available: true },
    { id: 'ai',      label: 'המשך חכם באמצעות AI',  desc: 'יצירת המשך טבעי של רקע/שמיים/קיר/טקסטורה.', available: false,
      why: 'דורש שירות יצירת-תמונות (outpainting) שאינו מחובר כרגע.' }
  ];
  function methods() { return METHODS.map(function (m) { var o = {}; Object.keys(m).forEach(function (k) { o[k] = m[k]; }); return o; }); }
  function isAvailable(id) { var m = METHODS.find(function (x) { return x.id === id; }); return !!(m && m.available); }

  function _int(v) { var n = Math.round(Number(v)); return isFinite(n) ? n : 0; }
  function mmToPx(mm, dpi) { return Math.max(0, Math.round((Number(mm) || 0) / 25.4 * (Number(dpi) || 300))); }

  /* תוכנית הציור: הקנבס הסופי הוא (w+2b)×(h+2b); התמונה המקורית ממוקמת במרכז,
     ומסביבה 8 אזורים (4 צדדים + 4 פינות) שנמשכים מהקצה לפי השיטה.
     sample = כמה פיקסלים מהקצה משמשים כמקור (1 לשכפול, N למתיחה/שיקוף). */
  function planBleed(opts) {
    opts = opts || {};
    var w = _int(opts.width), h = _int(opts.height), b = _int(opts.bleedPx);
    var method = opts.method || 'edge';
    if (w <= 0 || h <= 0) return { ok: false, errors: ['BAD_SIZE'] };
    if (b < 0) return { ok: false, errors: ['BAD_BLEED'] };
    if (!isAvailable(method)) return { ok: false, errors: ['METHOD_UNAVAILABLE:' + method] };

    var sample = method === 'edge' ? 1
      : Math.max(1, Math.min(_int(opts.samplePx) || b, method === 'mirror' ? Math.min(b, w, h) : Math.min(b, w, h)));

    var out = { ok: true, method: method, sample: sample,
      canvas: { width: w + 2 * b, height: h + 2 * b },
      image: { dst: { x: b, y: b, w: w, h: h } }, ops: [] };
    if (b === 0) return out;                                   // בלי גלישה — רק התמונה עצמה

    var mir = (method === 'mirror');
    function op(src, dst, flipX, flipY) { out.ops.push({ src: src, dst: dst, flipX: !!flipX, flipY: !!flipY }); }

    // ── ארבעת הצדדים ──
    op({ x: 0,          y: 0, w: sample, h: h }, { x: 0,         y: b, w: b, h: h }, mir, false);   // שמאל
    op({ x: w - sample, y: 0, w: sample, h: h }, { x: b + w,     y: b, w: b, h: h }, mir, false);   // ימין
    op({ x: 0, y: 0,          w: w, h: sample }, { x: b, y: 0,         w: w, h: b }, false, mir);   // עליון
    op({ x: 0, y: h - sample, w: w, h: sample }, { x: b, y: b + h,     w: w, h: b }, false, mir);   // תחתון
    // ── ארבע הפינות ──
    op({ x: 0,          y: 0,          w: sample, h: sample }, { x: 0,     y: 0,     w: b, h: b }, mir, mir);
    op({ x: w - sample, y: 0,          w: sample, h: sample }, { x: b + w, y: 0,     w: b, h: b }, mir, mir);
    op({ x: 0,          y: h - sample, w: sample, h: sample }, { x: 0,     y: b + h, w: b, h: b }, mir, mir);
    op({ x: w - sample, y: h - sample, w: sample, h: sample }, { x: b + w, y: b + h, w: b, h: b }, mir, mir);
    return out;
  }

  /* ניקוי סימוני חיתוך (צלבים/סרגלים) — צביעת מסגרת בשוליים החיצוניים בלבן.
     marginPx = רוחב הפס שמנוקה מכל צד; הגרפיקה עצמה לא נוגעת. */
  function planMarkClean(opts) {
    opts = opts || {};
    var w = _int(opts.width), h = _int(opts.height), m = _int(opts.marginPx);
    if (w <= 0 || h <= 0) return { ok: false, errors: ['BAD_SIZE'] };
    if (m <= 0) return { ok: false, errors: ['BAD_MARGIN'] };
    if (m * 2 >= w || m * 2 >= h) return { ok: false, errors: ['MARGIN_TOO_BIG'] };
    return { ok: true, color: opts.color || '#ffffff', rects: [
      { x: 0,     y: 0,     w: w,         h: m },              // עליון
      { x: 0,     y: h - m, w: w,         h: m },              // תחתון
      { x: 0,     y: m,     w: m,         h: h - 2 * m },      // שמאל
      { x: w - m, y: m,     w: m,         h: h - 2 * m }       // ימין
    ], keep: { x: m, y: m, w: w - 2 * m, h: h - 2 * m } };
  }

  return { METHODS: METHODS, methods: methods, isAvailable: isAvailable,
           mmToPx: mmToPx, planBleed: planBleed, planMarkClean: planMarkClean };
});
