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

  /* ── גלישה סביב ה-TrimBox ──────────────────────────────────────────────────
     בקובץ אמיתי יש MediaBox (הקובץ כולו) ו-TrimBox (קו החיתוך). הגלישה היא
     האזור *שמחוץ* ל-TrimBox. לכל צד בנפרד:
       • אם בקובץ יש תוכן אמיתי מעבר ל-Trim (real) — פשוט לוקחים אותו.
       • אם אין (או שלא מספיק) — משלימים סינתטית מקצה ה-Trim לפי השיטה.
     כך לא ממציאים גרפיקה כשיש כבר גלישה בקובץ. */
  function planTrimBleed(opts) {
    opts = opts || {};
    var mw = _int(opts.mediaWidth), mh = _int(opts.mediaHeight), b = _int(opts.bleedPx);
    var t = opts.trim || {};
    var tx = _int(t.x), ty = _int(t.y), tw = _int(t.w), th = _int(t.h);
    var method = opts.method || 'mirror';
    if (mw <= 0 || mh <= 0) return { ok: false, errors: ['BAD_MEDIA'] };
    if (tw <= 0 || th <= 0) return { ok: false, errors: ['BAD_TRIM'] };
    if (tx < 0 || ty < 0 || tx + tw > mw || ty + th > mh) return { ok: false, errors: ['TRIM_OUTSIDE_MEDIA'] };
    if (b < 0) return { ok: false, errors: ['BAD_BLEED'] };
    if (!isAvailable(method)) return { ok: false, errors: ['METHOD_UNAVAILABLE:' + method] };

    // כמה תוכן אמיתי יש מעבר ל-Trim בכל צד, עד רוחב הגלישה המבוקש
    var real = { left: Math.min(b, tx), top: Math.min(b, ty),
                 right: Math.min(b, mw - (tx + tw)), bottom: Math.min(b, mh - (ty + th)) };
    var out = { ok: true, method: method, bleedPx: b, real: real,
      canvas: { width: tw + 2 * b, height: th + 2 * b },
      // חיתוך המקור: התמונה מוצבת כך שה-Trim יושב במרכז הקנבס
      base: { src: { x: tx - real.left, y: ty - real.top,
                     w: tw + real.left + real.right, h: th + real.top + real.bottom },
              dst: { x: b - real.left, y: b - real.top,
                     w: tw + real.left + real.right, h: th + real.top + real.bottom } },
      trimRect: { x: b, y: b, w: tw, h: th },
      ops: [], synth: { left: b - real.left, top: b - real.top, right: b - real.right, bottom: b - real.bottom } };
    if (b === 0) return out;

    var mir = (method === 'mirror');
    var sample = method === 'edge' ? 1 : Math.max(1, Math.min(_int(opts.samplePx) || b, tw, th));
    // הזחה פנימה: הדגימה מתחילה N פיקסלים אחרי קו החיתוך (ברירת מחדל 2 מ"מ)
    var inset = Math.max(0, Math.min(_int(opts.sampleInsetPx), Math.floor(tw / 4), Math.floor(th / 4)));
    out.sampleInset = inset;
    var bs = out.base, sx = bs.dst.x, sy = bs.dst.y, sw = bs.dst.w, sh = bs.dst.h;
    function op(src, dst, fx, fy) { if (dst.w > 0 && dst.h > 0) out.ops.push({ src: src, dst: dst, flipX: !!fx, flipY: !!fy }); }
    // רק החלקים שחסרים מושלמים סינתטית
    if (out.synth.left > 0)   op({ x: bs.src.x + inset,         y: bs.src.y, w: sample, h: bs.src.h }, { x: 0,          y: sy, w: out.synth.left,  h: sh }, mir, false);
    if (out.synth.right > 0)  op({ x: bs.src.x + bs.src.w - sample - inset, y: bs.src.y, w: sample, h: bs.src.h }, { x: sx + sw, y: sy, w: out.synth.right, h: sh }, mir, false);
    if (out.synth.top > 0)    op({ x: bs.src.x, y: bs.src.y + inset,             w: bs.src.w, h: sample }, { x: sx, y: 0,          w: sw, h: out.synth.top },    false, mir);
    if (out.synth.bottom > 0) op({ x: bs.src.x, y: bs.src.y + bs.src.h - sample - inset, w: bs.src.w, h: sample }, { x: sx, y: sy + sh,   w: sw, h: out.synth.bottom }, false, mir);
    // פינות — נדרשות רק כשחסר בשני הצירים
    if (out.synth.left > 0 && out.synth.top > 0)      op({ x: bs.src.x + inset, y: bs.src.y + inset, w: sample, h: sample }, { x: 0, y: 0, w: out.synth.left, h: out.synth.top }, mir, mir);
    if (out.synth.right > 0 && out.synth.top > 0)     op({ x: bs.src.x + bs.src.w - sample - inset, y: bs.src.y + inset, w: sample, h: sample }, { x: sx + sw, y: 0, w: out.synth.right, h: out.synth.top }, mir, mir);
    if (out.synth.left > 0 && out.synth.bottom > 0)   op({ x: bs.src.x + inset, y: bs.src.y + bs.src.h - sample - inset, w: sample, h: sample }, { x: 0, y: sy + sh, w: out.synth.left, h: out.synth.bottom }, mir, mir);
    if (out.synth.right > 0 && out.synth.bottom > 0)  op({ x: bs.src.x + bs.src.w - sample - inset, y: bs.src.y + bs.src.h - sample - inset, w: sample, h: sample }, { x: sx + sw, y: sy + sh, w: out.synth.right, h: out.synth.bottom }, mir, mir);
    return out;
  }

  /* ── התאמת TrimBox ──
     centeredTrim  — מידה מבוקשת לקובץ, ממורכזת בתוך המדיה (שוליים שווים).
     symmetricTrim — שוליים שווים: X מימין ומשמאל, Y מלמעלה ומלמטה.
     שניהם נחתכים לגבולות המדיה כדי שלא ייווצר טרים לא-חוקי. */
  function centeredTrim(opts) {
    opts = opts || {};
    var mw = _int(opts.mediaWidth), mh = _int(opts.mediaHeight);
    var tw = _int(opts.trimWidth), th = _int(opts.trimHeight);
    if (mw <= 0 || mh <= 0) return { ok: false, errors: ['BAD_MEDIA'] };
    if (tw <= 0 || th <= 0) return { ok: false, errors: ['BAD_TRIM'] };
    var w = Math.min(tw, mw), h = Math.min(th, mh);
    return { ok: true, clamped: (w !== tw || h !== th),
      trim: { x: Math.round((mw - w) / 2), y: Math.round((mh - h) / 2), w: w, h: h } };
  }
  function symmetricTrim(opts) {
    opts = opts || {};
    var mw = _int(opts.mediaWidth), mh = _int(opts.mediaHeight);
    var sx = Math.max(0, _int(opts.sideX)), sy = Math.max(0, _int(opts.sideY));
    if (mw <= 0 || mh <= 0) return { ok: false, errors: ['BAD_MEDIA'] };
    if (2 * sx >= mw || 2 * sy >= mh) return { ok: false, errors: ['MARGIN_TOO_BIG'] };
    return { ok: true, trim: { x: sx, y: sy, w: mw - 2 * sx, h: mh - 2 * sy } };
  }
  // השוליים הנוכחיים של הטרים בתוך המדיה (לתצוגה ולבדיקת סימטריה)
  function trimMargins(mediaWidth, mediaHeight, trim) {
    var t = trim || {};
    var left = _int(t.x), top = _int(t.y);
    var right = _int(mediaWidth) - (_int(t.x) + _int(t.w));
    var bottom = _int(mediaHeight) - (_int(t.y) + _int(t.h));
    return { left: left, right: right, top: top, bottom: bottom,
             symmetricX: left === right, symmetricY: top === bottom };
  }

  /* ── זום ── התקרבות/התרחקות סביב נקודה שהעכבר מצביע עליה. */
  function zoomAt(view, pointPx, factor, limits) {
    view = view || {}; limits = limits || {};
    var min = limits.min || 0.1, max = limits.max || 32;
    var z0 = Number(view.zoom) || 1;
    var z1 = Math.max(min, Math.min(max, z0 * (Number(factor) || 1)));
    var px = Number(pointPx && pointPx.x) || 0, py = Number(pointPx && pointPx.y) || 0;
    // הנקודה שמתחת לסמן נשארת במקומה: pan מתוקן ביחס לשינוי הזום
    return { zoom: z1,
      panX: px - (px - (Number(view.panX) || 0)) * (z1 / z0),
      panY: py - (py - (Number(view.panY) || 0)) * (z1 / z0) };
  }
  // סימון מלבן → הגדלה שלו לכל שטח התצוגה
  function zoomToRect(rect, viewport, limits) {
    rect = rect || {}; viewport = viewport || {}; limits = limits || {};
    var rw = Math.abs(Number(rect.w) || 0), rh = Math.abs(Number(rect.h) || 0);
    var vw = Number(viewport.width) || 0, vh = Number(viewport.height) || 0;
    if (rw < 2 || rh < 2 || vw <= 0 || vh <= 0) return null;      // סימון זעיר = לחיצה, לא מלבן
    var rx = Math.min(Number(rect.x) || 0, (Number(rect.x) || 0) + (Number(rect.w) || 0));
    var ry = Math.min(Number(rect.y) || 0, (Number(rect.y) || 0) + (Number(rect.h) || 0));
    var z = Math.max(limits.min || 0.1, Math.min(limits.max || 32, Math.min(vw / rw, vh / rh)));
    return { zoom: z, panX: (vw - rw * z) / 2 - rx * z, panY: (vh - rh * z) / 2 - ry * z };
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
           mmToPx: mmToPx, planBleed: planBleed, planMarkClean: planMarkClean,
           planTrimBleed: planTrimBleed, zoomAt: zoomAt, zoomToRect: zoomToRect,
           centeredTrim: centeredTrim, symmetricTrim: symmetricTrim, trimMargins: trimMargins };
});
