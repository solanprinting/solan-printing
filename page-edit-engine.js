/* ═══════════════════════════════════════════════════════════════════════════
   page-edit-engine.js — מנוע עריכת-עמוד לדפוס. **טהור: תוכניות-ציור בלבד.**

   נבנה 14/08/2026 (בקשת-בעלים: "מערכת עריכה חדשה") עבור page-editor.html —
   תיקוני-דפוס פשוטים על עמוד בודד: הוספת-גלישה, הקטנה-לשוליים, מירכוז,
   והזזת-אזור (מודעה). אותה פילוסופיה של bleed-engine: החשבון כאן ונבדק
   ב-Node; הדפדפן רק מבצע drawImage/fillRect לפי התוכנית.

   ⚠️ **מודל-הפעולות**: רשימת-ops מוחלת בסדר, כל op על תוצאת קודמתה.
   ‏Undo = הורדת ה-op האחרון ורינדור-מחדש מהמקור — דטרמיניסטי, בלי
   snapshots של פיקסלים. כל המידות באחוזי-עמוד (0..100) או במ"מ — לעולם
   לא בפיקסלים — כדי שהתוכנית לא תלויה ב-DPI של הרסטר.

   ⚠️ הזזת-אזור היא רסטרית: האזור מצויר במקומו החדש, ומקורו מתמלא לבן
   (ברירת-מחדל) או במתיחת-קצה. בעיתונות-שחור-לבן על רקע לבן זה בדיוק
   "הזזת מודעה"; תוכן-וקטורי אינו נשמר — כמו ב-File Studio, וזה מוצהר
   למשתמש במסך.

   הרצת הבדיקות: node page-edit-engine-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PageEditEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPS = ['bleed', 'shrink', 'center', 'moveRegion'];

  function _num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }
  function _clampPct(v) { return Math.max(0, Math.min(100, _num(v))); }
  function mmToPx(mm, dpi) { return Math.round(_num(mm) / 25.4 * _num(dpi, 300)); }

  /* ── ולידציית-op ─────────────────────────────────────────────────────────
     ‏fail-closed: op לא-מוכר או ערכים חסרי-פשר → null, לא "מתקנים בשקט". */
  function normalizeOp(op) {
    if (!op || OPS.indexOf(op.type) < 0) return null;
    if (op.type === 'bleed') {
      var mm = _num(op.mm);
      if (!(mm > 0 && mm <= 15)) return null;
      var method = ['edge', 'stretch', 'mirror'].indexOf(op.method) >= 0 ? op.method : 'mirror';
      return { type: 'bleed', mm: mm, method: method };
    }
    if (op.type === 'shrink') {
      var s = _num(op.mm);
      if (!(s > 0 && s <= 50)) return null;
      return { type: 'shrink', mm: s };
    }
    if (op.type === 'center') {
      /* מירכוז לפי מלבן-התוכן שנמדד בדפדפן (contentBounds באחוזים).
         בלי מדידה — אין מה למרכז; לא ממציאים. */
      var b = op.contentBounds;
      if (!b || !(_num(b.w) > 0 && _num(b.h) > 0)) return null;
      return { type: 'center', contentBounds: { x: _clampPct(b.x), y: _clampPct(b.y),
               w: _clampPct(b.w), h: _clampPct(b.h) } };
    }
    /* moveRegion */
    var f = op.from, t = op.to;
    if (!f || !t) return null;
    var fx = _clampPct(f.x), fy = _clampPct(f.y);
    var fw = Math.min(_clampPct(f.w), 100 - fx), fh = Math.min(_clampPct(f.h), 100 - fy);
    if (!(fw >= 1 && fh >= 1)) return null;
    var tx = Math.max(0, Math.min(100 - fw, _num(t.x)));
    var ty = Math.max(0, Math.min(100 - fh, _num(t.y)));
    var fill = op.fill === 'edge' ? 'edge' : 'white';
    return { type: 'moveRegion', from: { x: fx, y: fy, w: fw, h: fh }, to: { x: tx, y: ty }, fill: fill };
  }

  /* ── תוכנית-ביצוע ל-op אחד ───────────────────────────────────────────────
     קלט: מידות-הרסטר הנוכחי (px) + dpi. פלט: { outW, outH, steps } —
     ‏steps בסדר-ציור, במונחי-פיקסלים של הפלט:
       { op:'drawBase', sx,sy,sw,sh, dx,dy,dw,dh }   העתקת-בסיס/סקייל
       { op:'fillRect', x,y,w,h }                    מילוי-לבן
       { op:'drawSelf', sx,sy,sw,sh, dx,dy,dw,dh }   העתקה מתוך הבסיס (אזור/קצה)
     ⚠️ שקוף למבצע: אין כאן ידע-canvas, רק גיאומטריה. */
  function planOp(curW, curH, dpi, op) {
    var o = normalizeOp(op);
    if (!o || !(curW > 0 && curH > 0)) return null;

    if (o.type === 'bleed') {
      var b = mmToPx(o.mm, dpi);
      var steps = [{ op: 'drawBase', sx: 0, sy: 0, sw: curW, sh: curH, dx: b, dy: b, dw: curW, dh: curH }];
      /* שמונה אזורי-קצה — mirror כברירת-מחדל: שיקוף הקצה החוצה. ‏edge
         נדגם כפס-1px נמתח; stretch מותח את N הפיקסלים האחרונים. אותם
         עקרונות של BleedEngine.planBleed, מנוסחים כ-drawSelf. */
      var n = o.method === 'edge' ? 1 : b;
      var flip = o.method === 'mirror';
      var S = function (sx, sy, sw, sh, dx, dy, dw, dh, fx, fy) {
        steps.push({ op: 'drawSelf', sx: sx, sy: sy, sw: sw, sh: sh, dx: dx, dy: dy, dw: dw, dh: dh,
                     flipX: !!(flip && fx), flipY: !!(flip && fy) });
      };
      S(0, 0, curW, n, b, 0, curW, b, false, true);                        // עליון
      S(0, curH - n, curW, n, b, b + curH, curW, b, false, true);          // תחתון
      S(0, 0, n, curH, 0, b, b, curH, true, false);                        // ימין-גיאומטרי (x=0)
      S(curW - n, 0, n, curH, b + curW, b, b, curH, true, false);          // שמאל-גיאומטרי
      S(0, 0, n, n, 0, 0, b, b, true, true);                               // פינות
      S(curW - n, 0, n, n, b + curW, 0, b, b, true, true);
      S(0, curH - n, n, n, 0, b + curH, b, b, true, true);
      S(curW - n, curH - n, n, n, b + curW, b + curH, b, b, true, true);
      return { outW: curW + 2 * b, outH: curH + 2 * b, steps: steps, bleedPx: b };
    }

    if (o.type === 'shrink') {
      /* הקטנה-לשוליים: התוכן קטן כך שנוצרים שוליים של mm מכל צד; הדף
         נשאר באותו גודל, הרקע לבן. יחס-הממדים נשמר — מקטינים לפי הציר
         המחמיר וממרכזים. */
      var m = mmToPx(o.mm, dpi);
      var availW = curW - 2 * m, availH = curH - 2 * m;
      if (!(availW > 10 && availH > 10)) return null;
      var sc = Math.min(availW / curW, availH / curH);
      var dw = Math.round(curW * sc), dh = Math.round(curH * sc);
      var dx = Math.round((curW - dw) / 2), dy = Math.round((curH - dh) / 2);
      return { outW: curW, outH: curH, steps: [
        { op: 'fillRect', x: 0, y: 0, w: curW, h: curH },
        { op: 'drawBase', sx: 0, sy: 0, sw: curW, sh: curH, dx: dx, dy: dy, dw: dw, dh: dh },
      ] };
    }

    if (o.type === 'center') {
      var cb = o.contentBounds;
      var cx = Math.round(cb.x / 100 * curW), cy = Math.round(cb.y / 100 * curH);
      var cw = Math.round(cb.w / 100 * curW), ch = Math.round(cb.h / 100 * curH);
      var ndx = Math.round((curW - cw) / 2), ndy = Math.round((curH - ch) / 2);
      if (ndx === cx && ndy === cy) return { outW: curW, outH: curH, steps: [
        { op: 'drawBase', sx: 0, sy: 0, sw: curW, sh: curH, dx: 0, dy: 0, dw: curW, dh: curH } ] };
      return { outW: curW, outH: curH, steps: [
        { op: 'fillRect', x: 0, y: 0, w: curW, h: curH },
        { op: 'drawBase', sx: cx, sy: cy, sw: cw, sh: ch, dx: ndx, dy: ndy, dw: cw, dh: ch },
      ] };
    }

    /* moveRegion */
    var fr = o.from;
    var rx = Math.round(fr.x / 100 * curW), ry = Math.round(fr.y / 100 * curH);
    var rw = Math.round(fr.w / 100 * curW), rh = Math.round(fr.h / 100 * curH);
    var txp = Math.round(o.to.x / 100 * curW), typ = Math.round(o.to.y / 100 * curH);
    var mv = { outW: curW, outH: curH, steps: [
      { op: 'drawBase', sx: 0, sy: 0, sw: curW, sh: curH, dx: 0, dy: 0, dw: curW, dh: curH },
    ] };
    if (o.fill === 'edge') {
      /* מילוי-קצה: מותחים פס-1px מהצד הרחב של החור — טוב לרקעים אחידים */
      var edgeY = ry > 0 ? ry - 1 : Math.min(curH - 1, ry + rh);
      mv.steps.push({ op: 'drawSelf', sx: rx, sy: edgeY, sw: rw, sh: 1, dx: rx, dy: ry, dw: rw, dh: rh });
    } else {
      mv.steps.push({ op: 'fillRect', x: rx, y: ry, w: rw, h: rh });
    }
    mv.steps.push({ op: 'drawSelf', sx: rx, sy: ry, sw: rw, sh: rh, dx: txp, dy: typ, dw: rw, dh: rh });
    return mv;
  }

  /* גודל-הפלט אחרי רשימת-ops (רק bleed משנה מידות) — לחיווי ולשמירה */
  function outSize(w0, h0, dpi, ops) {
    var w = w0, h = h0;
    (ops || []).forEach(function (op) {
      var o = normalizeOp(op);
      if (o && o.type === 'bleed') { var b = mmToPx(o.mm, dpi); w += 2 * b; h += 2 * b; }
    });
    return { w: w, h: h };
  }

  /* תיאור-לביקורת של רשימת-ops — נכנס ל-correctedNote של הגרסה */
  var LABELS = { bleed: 'גלישה', shrink: 'הקטנה-לשוליים', center: 'מירכוז', moveRegion: 'הזזת-אזור' };
  function describeOps(ops) {
    var parts = [];
    (ops || []).forEach(function (op) {
      var o = normalizeOp(op);
      if (!o) return;
      if (o.type === 'bleed') parts.push('גלישה ' + o.mm + ' מ"מ (' + o.method + ')');
      else if (o.type === 'shrink') parts.push('הקטנה-לשוליים ' + o.mm + ' מ"מ');
      else parts.push(LABELS[o.type]);
    });
    return parts.length ? ('תוקן בעורך-הדפוס: ' + parts.join(' · ')) : '';
  }

  return { OPS: OPS, LABELS: LABELS, mmToPx: mmToPx,
           normalizeOp: normalizeOp, planOp: planOp, outSize: outSize, describeOps: describeOps };
});
