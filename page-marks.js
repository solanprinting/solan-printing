/* ═══════════════════════════════════════════════════════════════════════════
   page-marks.js — סימוני-עמודים על פרופר (עיצוב-מחדש 13/08/2026, שרטוט-בעלים).

   שני צרכנים, קובץ אחד: proof-admin (רשת-העמודים + חלון-ההגדלה) ו-proof-viewer
   (סימון תוך-כדי-דפדוף). אילו כל אחד היה מצייר את הסימון בעצמו, המלבן של
   "איפה הבעיה" היה זז בין המסכים — והלקוח היה רואה בעיה במקום הלא-נכון.

   ⚠️ **מקור-האמת**: ‏customerProofs/<id>/pageMarks/<target>/<n>‎ — המבנה
   וה-ולידציה ב-ShopIssue.markPatch (shop-issue.js), לא כאן. כאן רק:
     · rectFromDrag — גרירת-עכבר/מגע → מלבן באחוזי-עמוד (טהור, נבדק ב-Node)
     · overlayHtml  — ציור הסימון (מלבן + תג) על עמוד מוצג
     · attachSpotDrag — מצב-סימון חד-פעמי על אלמנט-עמוד

   ⚠️ ‏overlayHtml מוצג **גם ללקוח** (proof-viewer נפתח מהפורטל) — זו
   המטרה: שהלקוח יבין איפה הבעיה. הכתיבה, לעומת זאת, מוגבלת בצד-הקורא
   לצוות (SolanGuard claims), והשרת הוא הגבול האמיתי.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PageMarks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _clamp(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; }

  /* ── גרירה → מלבן באחוזי-עמוד ────────────────────────────────────────────
     מקבל את מלבן-האלמנט (getBoundingClientRect) ושתי נקודות-מסך, ומחזיר
     ‏{x,y,w,h} באחוזים — בלתי-תלוי בזום ובגודל-תצוגה. גרירה זעירה (פחות
     מ-1% בשני הצירים) נחשבת לחיצה, לא סימון → null. */
  function rectFromDrag(box, p1, p2) {
    if (!box || !box.width || !box.height || !p1 || !p2) return null;
    var x1 = _clamp((Math.min(p1.x, p2.x) - box.left) / box.width * 100);
    var x2 = _clamp((Math.max(p1.x, p2.x) - box.left) / box.width * 100);
    var y1 = _clamp((Math.min(p1.y, p2.y) - box.top) / box.height * 100);
    var y2 = _clamp((Math.max(p1.y, p2.y) - box.top) / box.height * 100);
    var w = x2 - x1, h = y2 - y1;
    if (w < 1 && h < 1) return null;
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    return { x: r2(x1), y: r2(y1), w: r2(Math.max(w, 0.5)), h: r2(Math.max(h, 0.5)) };
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── ציור הסימון על עמוד ─────────────────────────────────────────────────
     ההורה חייב position:relative. ‏mark = {kind, note, spot}. התג יושב
     צמוד למלבן כשיש spot, אחרת בראש-העמוד. אדום לדרישת-החלפה, ירוק
     לאישור-כמו-שהוא — אותם צבעים בכל המסכים. */
  function overlayHtml(mark) {
    if (!mark || !mark.kind) return '';
    var isRep = mark.kind === 'replace';
    var color = isRep ? '#dc2626' : '#16a34a';
    var label = (isRep ? '🔁 דרוש החלפה' : '✔ הלקוח אישר להדפסה כך')
              + (mark.note ? ' — ' + _esc(String(mark.note).slice(0, 120)) : '');
    var tag = '<span style="position:absolute;z-index:6;background:' + color + ';color:#fff;'
      + 'font-size:.68rem;font-weight:800;border-radius:6px;padding:2px 8px;line-height:1.4;'
      + 'max-width:92%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;';
    var s = mark.spot;
    if (s && isFinite(Number(s.x))) {
      var x = _clamp(s.x), y = _clamp(s.y), w = _clamp(s.w), h = _clamp(s.h);
      var rect = '<span class="pmSpot" style="position:absolute;z-index:5;pointer-events:none;'
        + 'left:' + x + '%;top:' + y + '%;width:' + w + '%;height:' + h + '%;'
        + 'border:2.5px solid ' + color + ';border-radius:4px;'
        + 'box-shadow:0 0 0 2000px ' + (isRep ? 'rgba(220,38,38,.06)' : 'rgba(22,163,74,.05)') + ' inset"></span>';
      /* התג מתחת למלבן, או מעליו כשהמלבן בתחתית-העמוד */
      var tagTop = (y + h) > 88 ? Math.max(0, y - 7) : Math.min(96, y + h + 1);
      return rect + tag + 'left:' + x + '%;top:' + tagTop + '%">' + label + '</span>';
    }
    return tag + 'left:4%;top:2%">' + label + '</span>';
  }

  /* ── מצב-סימון חד-פעמי ───────────────────────────────────────────────────
     ‏attachSpotDrag(el, onDone): גרירה אחת על el (עכבר או מגע) → onDone(rect).
     ‏Escape או לחיצה-בלי-גרירה → onDone(null). מסיר את עצמו תמיד. */
  function attachSpotDrag(el, onDone) {
    if (!el || typeof onDone !== 'function') return function () {};
    var start = null, ghost = null;
    function pt(ev) { return { x: ev.clientX, y: ev.clientY }; }
    function clean() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      document.removeEventListener('keydown', key);
      el.style.cursor = '';
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
    }
    function down(ev) { ev.preventDefault(); start = pt(ev);
      try { el.setPointerCapture(ev.pointerId); } catch (e) {}
      ghost = document.createElement('span');
      ghost.style.cssText = 'position:absolute;z-index:9;border:2px dashed #dc2626;border-radius:4px;pointer-events:none';
      el.appendChild(ghost);
    }
    function move(ev) {
      if (!start || !ghost) return;
      var b = el.getBoundingClientRect(), r = rectFromDrag(b, start, pt(ev));
      if (!r) { ghost.style.display = 'none'; return; }
      ghost.style.display = '';
      ghost.style.left = r.x + '%'; ghost.style.top = r.y + '%';
      ghost.style.width = r.w + '%'; ghost.style.height = r.h + '%';
    }
    function up(ev) {
      var r = start ? rectFromDrag(el.getBoundingClientRect(), start, pt(ev)) : null;
      clean(); onDone(r);
    }
    function key(ev) { if (ev.key === 'Escape') { clean(); onDone(null); } }
    el.style.cursor = 'crosshair';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    document.addEventListener('keydown', key);
    return clean;
  }

  return { rectFromDrag: rectFromDrag, overlayHtml: overlayHtml, attachSpotDrag: attachSpotDrag };
});
