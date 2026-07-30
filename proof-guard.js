/* ═══════════ שמירה על הגיליון הנכון ═══════════
   הרקע (2026-07-30): לקוח העלה את ריצת העיתון של השבוע לתוך גיליון שכבר
   הושלם. הקובץ נכנס לרשומה הלא-נכונה, ואף אחד לא ראה שזו טעות.

   שני כללים:
     1) לגיליון שנסגר (הודפס/הושלם/נסגר ידנית) אי-אפשר להוסיף ריצות. הלקוח
        מקבל הסבר ברור, לא כשל שקט.
     2) כשכבר קרתה טעות — אפשר להעביר ריצה מגיליון לגיליון בלי לאבד דבר.

   וכן: גזירת מסגרת-חיתוך כשהקובץ לא מצהיר TrimBox — כדי שכפתור "הצג גלישות"
   יעבוד גם על קבצים כאלה (רוב הקבצים שהלקוחות מעלים).
   טהור: בלי DOM ובלי רשת.                                                */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProofGuard = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000;
  var STALE_DAYS = 7;          // גיליון שאושר לפני יותר מזה — חשוד כ"של שבוע שעבר"

  function _int(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function _num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  /* ── האם הגיליון סגור להעלאות ────────────────────────────────────────── */
  function isClosed(rec) { return !!(rec && (rec.closedAt || rec.completedAt)); }

  /* גיליון "ישן": אושר לפני יותר מ-STALE_DAYS. שבועון חדש לעולם לא ייראה כך,
     ולכן העלאה לתוך גיליון כזה היא כמעט תמיד טעות. */
  function isStale(rec, now) {
    if (!rec) return false;
    var at = _int(rec.approvedAt);
    if (!at) return false;
    return ((_int(now) || 0) - at) > STALE_DAYS * DAY;
  }

  /* האם מותר להוסיף/לעדכן קבצים בגיליון הזה.
     מחזיר { ok, code, message } — ההודעה מנוסחת ללקוח, לא למפתח. */
  function canAcceptUpload(rec, now) {
    if (!rec) return { ok: false, code: 'NO_RECORD', message: 'הקישור לא נמצא. בקשו מבית-הדפוס קישור מעודכן.' };
    if (isClosed(rec)) return { ok: false, code: 'CLOSED',
      message: 'הגיליון הזה נסגר בבית-הדפוס ולא ניתן להוסיף לו קבצים.\nלגיליון החדש — בקשו מבית-הדפוס קישור מעודכן.' };
    if (isStale(rec, now)) return { ok: false, code: 'STALE',
      message: 'הגיליון הזה אושר לפני יותר משבוע, וכנראה אינו הגיליון הנוכחי.\n'
             + 'כדי שלא ייכנסו קבצים לגיליון הלא-נכון — בקשו מבית-הדפוס קישור לגיליון החדש.' };
    return { ok: true, code: 'OK', message: '' };
  }

  /* ── העברת ריצה מגיליון לגיליון ──────────────────────────────────────── */
  /* מחזיר תוכנית-העברה מלאה (בלי לבצע): איזה מזהה תקבל הריצה ביעד, ומה
     נמחק במקור. ה-partId נשמר כשהוא פנוי ביעד, כדי שקישורים קיימים יישארו
     קריאים; אם תפוס — נוצר מזהה פנוי (…-2, …-3). */
  function planMoveRun(from, to, partId, opts) {
    opts = opts || {};
    var errs = [];
    if (!from || !to) errs.push('MISSING_RECORD');
    if (!partId) errs.push('MISSING_PART');
    var part = (from && from.parts) ? from.parts[partId] : null;
    if (from && to && !part) errs.push('PART_NOT_FOUND');
    if (from && to && from === to) errs.push('SAME_RECORD');
    if (from && to && from.id && to.id && String(from.id) === String(to.id)) errs.push('SAME_RECORD');
    if (to && isClosed(to)) errs.push('TARGET_CLOSED');
    if (!opts.allowStale && to && isStale(to, opts.now)) errs.push('TARGET_STALE');
    if (errs.length) return { ok: false, errors: errs };

    var taken = to.parts || {};
    var id = partId, i = 2;
    while (Object.prototype.hasOwnProperty.call(taken, id)) { id = partId + '-' + i; i++; }

    var moved = {};
    Object.keys(part).forEach(function (k) { moved[k] = part[k]; });
    moved.movedFrom = String(from.id || '') || null;
    moved.movedAt = _int(opts.now) || null;
    if (opts.by) moved.movedBy = String(opts.by);

    return { ok: true, errors: [], toPartId: id, part: moved,
             fromPath: 'parts/' + partId, toPath: 'parts/' + id };
  }

  /* ── גזירת מסגרת-חיתוך כשאין TrimBox בקובץ ───────────────────────────── */
  /* למה: רוב הקבצים שהלקוחות מעלים לא מצהירים TrimBox — ה-TrimBox שווה
     ל-MediaBox. אומת מול קובץ אמיתי ("עוצמה"): כל העמודים TrimBox==MediaBox,
     ולכן כפתור "הצג גלישות" לא הציג כלום ונראה שבור. אבל העמוד *כן* גדול
     מהגודל הנטו (170×247 מול 165×240 נטו) — כלומר הגלישה שם, רק לא מוצהרת.
     כאן גוזרים ממנה מסגרת נטו ממורכזת, ביחסים (0..1) כמו trimFrac אמיתי. */
  function deriveTrim(pageW, pageH, netW, netH, tolMm) {
    var pw = _num(pageW), ph = _num(pageH), nw = _num(netW), nh = _num(netH);
    var tol = (tolMm == null) ? 0.8 : _num(tolMm);
    if (!(pw > 0 && ph > 0 && nw > 0 && nh > 0)) return null;
    // גודל-נטו יכול להיות רשום הפוך (240×165 מול 165×240)
    if (Math.abs(pw - nh) < Math.abs(pw - nw) && Math.abs(ph - nw) < Math.abs(ph - nh)) {
      var t = nw; nw = nh; nh = t;
    }
    var dw = pw - nw, dh = ph - nh;
    if (dw < tol && dh < tol) return null;          // אין עודף → אין מה להציג
    if (dw < -tol || dh < -tol) return null;        // העמוד *קטן* מהנטו — לא גלישה, זו בעיה אחרת
    var bw = Math.max(0, dw) / 2, bh = Math.max(0, dh) / 2;   // בליד ממורכז
    return { l: bw / pw, t: bh / ph, w: nw / pw, h: nh / ph, derived: true,
             wmm: nw, hmm: nh, bleedMm: Math.round(Math.max(bw, bh) * 10) / 10 };
  }

  /* מה להציג בכפתור "גלישות" — כדי שלא יהיה כפתור שלא עושה כלום בשקט */
  function bleedStatus(trimFrac, derived) {
    if (trimFrac && !trimFrac.derived) return { has: true, kind: 'declared', note: 'לפי קו-החיתוך שבקובץ' };
    if (derived) return { has: true, kind: 'derived',
      note: 'הקובץ לא מצהיר קו-חיתוך — הגלישה מחושבת מול הגודל הנדרש' + (derived.bleedMm ? (' (' + derived.bleedMm + ' מ״מ)') : '') };
    return { has: false, kind: 'none',
      note: 'בקובץ הזה אין גלישות — הוא בגודל הסופי בלבד' };
  }

  return { DAY: DAY, STALE_DAYS: STALE_DAYS, isClosed: isClosed, isStale: isStale,
           canAcceptUpload: canAcceptUpload, planMoveRun: planMoveRun,
           deriveTrim: deriveTrim, bleedStatus: bleedStatus };
});
