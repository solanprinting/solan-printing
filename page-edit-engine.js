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

  var OPS = ['bleed', 'shrink', 'center', 'moveRegion', 'crop', 'whiteFrame', 'frameAdd', 'addMarks'];

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
      /* עומק-הדגימה מהקצה (14/08/2026, בקשת-בעלים): "לשכפל או למתוח N מ"מ
         מהקצה". ‏edge=שכפול הפס כמו-שהוא (אריחים), stretch=מתיחתו. ברירת-
         מחדל 1 מ"מ; ‏mirror מתעלם — הוא משקף את רוחב-הגלישה עצמו. */
      var smp = _num(op.sampleMm, 1);
      if (!(smp > 0 && smp <= 15)) smp = 1;
      return { type: 'bleed', mm: mm, method: method, sampleMm: smp };
    }
    if (op.type === 'crop') {
      /* שני מצבים: insetMm (חיתוך אחיד מסביב) או box באחוזי-עמוד (תרים-בוקס). */
      if (op.box && typeof op.box === 'object') {
        var bx = _clampPct(op.box.x), by = _clampPct(op.box.y);
        var bw = Math.min(_clampPct(op.box.w), 100 - bx), bh = Math.min(_clampPct(op.box.h), 100 - by);
        if (!(bw >= 5 && bh >= 5)) return null;          // חיתוך שמשאיר פחות מ-5% הוא טעות, לא כוונה
        return { type: 'crop', box: { x: bx, y: by, w: bw, h: bh } };
      }
      var ci = _num(op.insetMm);
      if (!(ci > 0 && ci <= 50)) return null;
      return { type: 'crop', insetMm: ci };
    }
    if (op.type === 'whiteFrame') {
      /* מסגרת-לבנה בקצוות: ניקוי צלבי-חיתוך, או "שידרה" — הרחקת הגרפיקה
         מהחיתוך-נטו. אותה פעולה, שני שימושים; הגודל אינו משתנה. */
      var wf = _num(op.mm);
      if (!(wf > 0 && wf <= 30)) return null;
      return { type: 'whiteFrame', mm: wf };
    }
    if (op.type === 'frameAdd') {
      /* ⚠️ 14/08/2026, דיוק-בעלים: "שהמסגרת תתווסף ולא תהיה על חשבון
         הגרפיקה" — הדף **גדל** ב-N מ"מ מכל צד, התוכן נשאר שלם במרכז.
         ‏whiteFrame (הצובעת) נשארת לניקוי-צלבים — שם הצביעה היא הכוונה. */
      var fa = _num(op.mm);
      if (!(fa > 0 && fa <= 30)) return null;
      return { type: 'frameAdd', mm: fa };
    }
    if (op.type === 'addMarks') {
      /* צלבי-חיתוך לגודל-עמוד נדרש: מסגרת-היעד ממורכזת בעמוד, טיקים שחורים
         מחוץ לפינותיה. יעד גדול מהעמוד → null (אין לאן לצייר). */
      var mw = _num(op.wMm), mh = _num(op.hMm);
      if (!(mw > 10 && mh > 10)) return null;
      var len = _num(op.lenMm, 4); if (!(len > 0 && len <= 10)) len = 4;
      var off = _num(op.offMm, 2); if (!(off >= 0 && off <= 10)) off = 2;
      return { type: 'addMarks', wMm: mw, hMm: mh, lenMm: len, offMm: off };
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
      /* שמונה אזורי-קצה. ‏sampleMm = עומק-הדגימה מהקצה (בקשת-בעלים):
           edge    — הפס משוכפל כמו-שהוא, אריח-אחר-אריח, עד מילוי הגלישה.
           stretch — הפס נמתח למלוא רוחב-הגלישה.
           mirror  — שיקוף רוחב-הגלישה עצמו (sampleMm לא רלוונטי). */
      var n = o.method === 'mirror' ? b : Math.max(1, Math.min(mmToPx(o.sampleMm, dpi), o.method === 'edge' ? b : curW));
      var flip = o.method === 'mirror';
      var S = function (sx, sy, sw, sh, dx, dy, dw, dh, fx, fy) {
        steps.push({ op: 'drawSelf', sx: sx, sy: sy, sw: sw, sh: sh, dx: dx, dy: dy, dw: dw, dh: dh,
                     flipX: !!(flip && fx), flipY: !!(flip && fy) });
      };
      if (o.method === 'edge') {
        /* שכפול-אריחים: כמה פסי-sample שממלאים את הגלישה, החיצוני נחתך */
        var tiles = Math.ceil(b / n);
        for (var ti = 0; ti < tiles; ti++) {
          var th = Math.min(n, b - ti * n);
          S(0, 0, curW, th, b, b - (ti + 1) * n + (n - th), curW, th);                 // עליון
          S(0, curH - th, curW, th, b, b + curH + ti * n, curW, th);                    // תחתון
          S(0, 0, th, curH, b - (ti + 1) * n + (n - th), b, th, curH);                  // צד x=0
          S(curW - th, 0, th, curH, b + curW + ti * n, b, th, curH);                    // צד x=max
        }
        steps.push({ op: 'fillRect', x: 0, y: 0, w: b, h: b });                         // פינות — לבן
        steps.push({ op: 'fillRect', x: b + curW, y: 0, w: b, h: b });
        steps.push({ op: 'fillRect', x: 0, y: b + curH, w: b, h: b });
        steps.push({ op: 'fillRect', x: b + curW, y: b + curH, w: b, h: b });
      } else {
        S(0, 0, curW, n, b, 0, curW, b, false, true);                        // עליון
        S(0, curH - n, curW, n, b, b + curH, curW, b, false, true);          // תחתון
        S(0, 0, n, curH, 0, b, b, curH, true, false);                        // צד x=0
        S(curW - n, 0, n, curH, b + curW, b, b, curH, true, false);          // צד x=max
        S(0, 0, n, n, 0, 0, b, b, true, true);                               // פינות
        S(curW - n, 0, n, n, b + curW, 0, b, b, true, true);
        S(0, curH - n, n, n, 0, b + curH, b, b, true, true);
        S(curW - n, curH - n, n, n, b + curW, b + curH, b, b, true, true);
      }
      return { outW: curW + 2 * b, outH: curH + 2 * b, steps: steps, bleedPx: b };
    }

    if (o.type === 'crop') {
      var cx2, cy2, cw2, ch2;
      if (o.box) {
        cx2 = Math.round(o.box.x / 100 * curW); cy2 = Math.round(o.box.y / 100 * curH);
        cw2 = Math.round(o.box.w / 100 * curW); ch2 = Math.round(o.box.h / 100 * curH);
      } else {
        var ins = mmToPx(o.insetMm, dpi);
        cx2 = ins; cy2 = ins; cw2 = curW - 2 * ins; ch2 = curH - 2 * ins;
      }
      if (!(cw2 > 10 && ch2 > 10)) return null;
      return { outW: cw2, outH: ch2, steps: [
        { op: 'drawBase', sx: cx2, sy: cy2, sw: cw2, sh: ch2, dx: 0, dy: 0, dw: cw2, dh: ch2 } ] };
    }

    if (o.type === 'whiteFrame') {
      var fw = mmToPx(o.mm, dpi);
      if (!(curW - 2 * fw > 10 && curH - 2 * fw > 10)) return null;
      return { outW: curW, outH: curH, steps: [
        { op: 'drawBase', sx: 0, sy: 0, sw: curW, sh: curH, dx: 0, dy: 0, dw: curW, dh: curH },
        { op: 'fillRect', x: 0, y: 0, w: curW, h: fw },
        { op: 'fillRect', x: 0, y: curH - fw, w: curW, h: fw },
        { op: 'fillRect', x: 0, y: 0, w: fw, h: curH },
        { op: 'fillRect', x: curW - fw, y: 0, w: fw, h: curH },
      ] };
    }

    if (o.type === 'frameAdd') {
      var fa2 = mmToPx(o.mm, dpi);
      return { outW: curW + 2 * fa2, outH: curH + 2 * fa2, steps: [
        { op: 'drawBase', sx: 0, sy: 0, sw: curW, sh: curH, dx: fa2, dy: fa2, dw: curW, dh: curH },
      ] };
    }

    if (o.type === 'addMarks') {
      var tw = mmToPx(o.wMm, dpi), th2 = mmToPx(o.hMm, dpi);
      if (tw > curW || th2 > curH) return null;          // יעד גדול מהעמוד — אין לאן
      var fx0 = Math.round((curW - tw) / 2), fy0 = Math.round((curH - th2) / 2);
      var L = mmToPx(o.lenMm, dpi), G = mmToPx(o.offMm, dpi), T = Math.max(1, mmToPx(0.15, dpi));
      var st2 = [{ op: 'drawBase', sx: 0, sy: 0, sw: curW, sh: curH, dx: 0, dy: 0, dw: curW, dh: curH }];
      /* ⚠️ טיק שחורג מהעמוד **נחתך** לחלק שנכנס — עמוד עם שוליים צרים עדיין
         מקבל סימון קצר; רק כשאין שום מקום (אפס-חיתוך) הטיק מדולג, ואם
         כל השמונה דולגו — null בקול (העמוד קטן מדי ליעד+היסט). */
      var mk = function (x, y, w, h) {
        var x2 = Math.max(0, x), y2 = Math.max(0, y);
        var w2 = Math.min(x + w, curW) - x2, h2 = Math.min(y + h, curH) - y2;
        if (w2 < 1 || h2 < 1) return;
        st2.push({ op: 'blackRect', x: x2, y: y2, w: w2, h: h2 });
      };
      [[fx0, fy0, -1, -1], [fx0 + tw, fy0, 1, -1], [fx0, fy0 + th2, -1, 1], [fx0 + tw, fy0 + th2, 1, 1]]
        .forEach(function (c) {
          var px2 = c[0], py2 = c[1], sxn = c[2], syn = c[3];
          mk(sxn < 0 ? px2 - G - L : px2 + G, py2 - Math.round(T / 2), L, T);   // אופקי
          mk(px2 - Math.round(T / 2), syn < 0 ? py2 - G - L : py2 + G, T, L);   // אנכי
        });
      if (!st2.some(function (s) { return s.op === 'blackRect'; })) return null;
      return { outW: curW, outH: curH, steps: st2, frame: { x: fx0, y: fy0, w: tw, h: th2 } };
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

  /* ═══ תוכנית-וקטור לשמירה (14/08/2026, בקשת-בעלים: "להשתמש בגרסה
     הווקטורית") ═══════════════════════════════════════════════════════════
     אותם ops בדיוק, מנוסחים כהרכבת-embedPage של pdf-lib — התוכן נשאר
     וקטורי. הרסטר נשאר רק לרצועות-**שיקוף** של גלישה (אין דרך לשקף
     embedPage בלי מטריצה שלילית, שנמנעים ממנה): item מסוג 'rasterStrip'
     שהמבצע ממלא מתצוגת-300dpi.

     ⚠️ **צירי-Y מלמעלה-למטה** — כמו הרסטר וכמו כל שאר המנוע. המבצע
     (page-editor) הופך ל-PDF (‏y_pdf = outH − y − h). המידות בנקודות.
     items בסדר-ציור: page (חתיכת-מקור, bbox במקור, dst+scale) ·
     whiteRect · blackRect · rasterStrip. */
  function mmToPt(mm) { return _num(mm) * 72 / 25.4; }
  function vectorPlan(curW, curH, op) {
    var o = normalizeOp(op);
    if (!o || !(curW > 0 && curH > 0)) return null;
    var items = [];
    var PG = function (bx, by, bw, bh, dx, dy, dw, dh) {
      items.push({ kind: 'page', bbox: { x: bx, y: by, w: bw, h: bh }, dst: { x: dx, y: dy, w: dw, h: dh } });
    };

    if (o.type === 'bleed') {
      var b = mmToPt(o.mm);
      PG(0, 0, curW, curH, b, b, curW, curH);
      var n = o.method === 'mirror' ? b : Math.max(0.5, Math.min(mmToPt(o.sampleMm), o.method === 'edge' ? b : curW));
      if (o.method === 'mirror') {
        /* שיקוף — רצועות-רסטר; הפינות כלולות (המבצע דוגם מהתצוגה) */
        var R = function (sx, sy, sw, sh, dx, dy, dw, dh, fx, fy) {
          items.push({ kind: 'rasterStrip', src: { x: sx, y: sy, w: sw, h: sh },
                       dst: { x: dx, y: dy, w: dw, h: dh }, flipX: !!fx, flipY: !!fy });
        };
        R(0, 0, curW, n, b, 0, curW, b, false, true);
        R(0, curH - n, curW, n, b, b + curH, curW, b, false, true);
        R(0, 0, n, curH, 0, b, b, curH, true, false);
        R(curW - n, 0, n, curH, b + curW, b, b, curH, true, false);
        R(0, 0, n, n, 0, 0, b, b, true, true);
        R(curW - n, 0, n, n, b + curW, 0, b, b, true, true);
        R(0, curH - n, n, n, 0, b + curH, b, b, true, true);
        R(curW - n, curH - n, n, n, b + curW, b + curH, b, b, true, true);
      } else if (o.method === 'stretch') {
        PG(0, 0, curW, n, b, 0, curW, b);
        PG(0, curH - n, curW, n, b, b + curH, curW, b);
        PG(0, 0, n, curH, 0, b, b, curH);
        PG(curW - n, 0, n, curH, b + curW, b, b, curH);
        PG(0, 0, n, n, 0, 0, b, b);
        PG(curW - n, 0, n, n, b + curW, 0, b, b);
        PG(0, curH - n, n, n, 0, b + curH, b, b);
        PG(curW - n, curH - n, n, n, b + curW, b + curH, b, b);
      } else {
        var tiles = Math.ceil(b / n);
        for (var ti = 0; ti < tiles; ti++) {
          var th = Math.min(n, b - ti * n);
          PG(0, 0, curW, th, b, b - (ti + 1) * n + (n - th), curW, th);
          PG(0, curH - th, curW, th, b, b + curH + ti * n, curW, th);
          PG(0, 0, th, curH, b - (ti + 1) * n + (n - th), b, th, curH);
          PG(curW - th, 0, th, curH, b + curW + ti * n, b, th, curH);
        }
        items.push({ kind: 'whiteRect', x: 0, y: 0, w: b, h: b });
        items.push({ kind: 'whiteRect', x: b + curW, y: 0, w: b, h: b });
        items.push({ kind: 'whiteRect', x: 0, y: b + curH, w: b, h: b });
        items.push({ kind: 'whiteRect', x: b + curW, y: b + curH, w: b, h: b });
      }
      return { outW: curW + 2 * b, outH: curH + 2 * b, items: items };
    }

    if (o.type === 'crop') {
      var cx, cy, cw, ch;
      if (o.box) { cx = o.box.x / 100 * curW; cy = o.box.y / 100 * curH;
                   cw = o.box.w / 100 * curW; ch = o.box.h / 100 * curH; }
      else { var ins = mmToPt(o.insetMm); cx = ins; cy = ins; cw = curW - 2 * ins; ch = curH - 2 * ins; }
      if (!(cw > 5 && ch > 5)) return null;
      PG(cx, cy, cw, ch, 0, 0, cw, ch);
      return { outW: cw, outH: ch, items: items };
    }
    if (o.type === 'whiteFrame') {
      var fw = mmToPt(o.mm);
      if (!(curW - 2 * fw > 5 && curH - 2 * fw > 5)) return null;
      PG(0, 0, curW, curH, 0, 0, curW, curH);
      items.push({ kind: 'whiteRect', x: 0, y: 0, w: curW, h: fw });
      items.push({ kind: 'whiteRect', x: 0, y: curH - fw, w: curW, h: fw });
      items.push({ kind: 'whiteRect', x: 0, y: 0, w: fw, h: curH });
      items.push({ kind: 'whiteRect', x: curW - fw, y: 0, w: fw, h: curH });
      return { outW: curW, outH: curH, items: items };
    }
    if (o.type === 'frameAdd') {
      var fa3 = mmToPt(o.mm);
      PG(0, 0, curW, curH, fa3, fa3, curW, curH);
      return { outW: curW + 2 * fa3, outH: curH + 2 * fa3, items: items };
    }
    if (o.type === 'addMarks') {
      var tw = mmToPt(o.wMm), th2 = mmToPt(o.hMm);
      if (tw > curW || th2 > curH) return null;
      var fx0 = (curW - tw) / 2, fy0 = (curH - th2) / 2;
      var L = mmToPt(o.lenMm), G = mmToPt(o.offMm), T = Math.max(0.4, mmToPt(0.15));
      PG(0, 0, curW, curH, 0, 0, curW, curH);
      var mk = function (x, y, w, h) {
        var x2 = Math.max(0, x), y2 = Math.max(0, y);
        var w2 = Math.min(x + w, curW) - x2, h2 = Math.min(y + h, curH) - y2;
        if (w2 < 0.3 || h2 < 0.3) return;
        items.push({ kind: 'blackRect', x: x2, y: y2, w: w2, h: h2 });
      };
      [[fx0, fy0, -1, -1], [fx0 + tw, fy0, 1, -1], [fx0, fy0 + th2, -1, 1], [fx0 + tw, fy0 + th2, 1, 1]]
        .forEach(function (c) {
          mk(c[2] < 0 ? c[0] - G - L : c[0] + G, c[1] - T / 2, L, T);
          mk(c[0] - T / 2, c[3] < 0 ? c[1] - G - L : c[1] + G, T, L);
        });
      return { outW: curW, outH: curH, items: items };
    }
    if (o.type === 'shrink') {
      var m = mmToPt(o.mm);
      var availW = curW - 2 * m, availH = curH - 2 * m;
      if (!(availW > 5 && availH > 5)) return null;
      var sc = Math.min(availW / curW, availH / curH);
      var dw = curW * sc, dh = curH * sc;
      PG(0, 0, curW, curH, (curW - dw) / 2, (curH - dh) / 2, dw, dh);
      return { outW: curW, outH: curH, items: items };
    }
    if (o.type === 'center') {
      var cb = o.contentBounds;
      var bx = cb.x / 100 * curW, by = cb.y / 100 * curH;
      var bw = cb.w / 100 * curW, bh = cb.h / 100 * curH;
      PG(bx, by, bw, bh, (curW - bw) / 2, (curH - bh) / 2, bw, bh);
      return { outW: curW, outH: curH, items: items };
    }
    /* moveRegion — הכול וקטורי: החור לבן/מתיחת-קצה, האזור חתיכת-embedPage */
    var fr = o.from;
    var rx = fr.x / 100 * curW, ry = fr.y / 100 * curH;
    var rw = fr.w / 100 * curW, rh = fr.h / 100 * curH;
    var tx = o.to.x / 100 * curW, ty = o.to.y / 100 * curH;
    PG(0, 0, curW, curH, 0, 0, curW, curH);
    if (o.fill === 'edge') {
      var ey = ry > 0.5 ? ry - 0.5 : Math.min(curH - 0.5, ry + rh);
      PG(rx, ey, rw, 0.5, rx, ry, rw, rh);
    } else items.push({ kind: 'whiteRect', x: rx, y: ry, w: rw, h: rh });
    PG(rx, ry, rw, rh, tx, ty, rw, rh);
    return { outW: curW, outH: curH, items: items };
  }

  /* גודל-הפלט אחרי רשימת-ops (גלישה מגדילה, חיתוך מקטין) — לחיווי ולשמירה */
  function outSize(w0, h0, dpi, ops) {
    var w = w0, h = h0;
    (ops || []).forEach(function (op) {
      var o = normalizeOp(op);
      if (!o) return;
      if (o.type === 'bleed') { var b = mmToPx(o.mm, dpi); w += 2 * b; h += 2 * b; }
      else if (o.type === 'frameAdd') { var fb = mmToPx(o.mm, dpi); w += 2 * fb; h += 2 * fb; }
      else if (o.type === 'crop') {
        if (o.box) { w = Math.round(o.box.w / 100 * w); h = Math.round(o.box.h / 100 * h); }
        else { var ci = mmToPx(o.insetMm, dpi); w -= 2 * ci; h -= 2 * ci; }
      }
    });
    return { w: w, h: h };
  }

  /* תיאור-לביקורת של רשימת-ops — נכנס ל-correctedNote של הגרסה */
  var LABELS = { bleed: 'גלישה', shrink: 'הקטנה-לשוליים', center: 'מירכוז', moveRegion: 'הזזת-אזור',
                 crop: 'חיתוך', whiteFrame: 'ניקוי-קצוות לבן', frameAdd: 'מסגרת-לבנה מוסיפה', addMarks: 'צלבי-חיתוך' };
  function describeOps(ops) {
    var parts = [];
    (ops || []).forEach(function (op) {
      var o = normalizeOp(op);
      if (!o) return;
      if (o.type === 'bleed') parts.push('גלישה ' + o.mm + ' מ"מ (' + o.method + ')');
      else if (o.type === 'shrink') parts.push('הקטנה-לשוליים ' + o.mm + ' מ"מ');
      else if (o.type === 'crop') parts.push(o.box ? 'חיתוך לפי תרים-בוקס' : ('חיתוך ' + o.insetMm + ' מ"מ מסביב'));
      else if (o.type === 'whiteFrame') parts.push('ניקוי-קצוות ' + o.mm + ' מ"מ');
      else if (o.type === 'frameAdd') parts.push('מסגרת-לבנה +' + o.mm + ' מ"מ');
      else if (o.type === 'addMarks') parts.push('צלבי-חיתוך ל-' + o.wMm + '×' + o.hMm);
      else parts.push(LABELS[o.type]);
    });
    return parts.length ? ('תוקן בעורך-הדפוס: ' + parts.join(' · ')) : '';
  }

  return { OPS: OPS, LABELS: LABELS, mmToPx: mmToPx, mmToPt: mmToPt,
           normalizeOp: normalizeOp, planOp: planOp, vectorPlan: vectorPlan,
           outSize: outSize, describeOps: describeOps };
});
