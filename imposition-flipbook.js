/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-flipbook.js — לוגיקת-תצוגה טהורה לדפדוף החוברת (Decoder V2)
 * ───────────────────────────────────────────────────────────────────────────
 * שכבת-Flipbook נפרדת משכבת-ה-Decoder: מקבלת עמודים שכבר פוענחו (1..N) ומגדירה
 * *איך* הם מוצגים — שער בודד, כפולות, גב בודד — בלי לגעת במיפוי/סדר/PDF.
 *
 * עקרונות (לפי דרישות-המשתמש):
 *  · מודל-מצבים מפורש: [{type:'single',pages:[1]},{type:'double',pages:[2,3]},…,{type:'single',pages:[N]}]
 *  · אין עמוד-0, אין placeholder לבן, אין mirror/transform על תוכן.
 *  · RTL משפיע רק על *מיקום*: בכפולה — הזוגי מימין, האי-זוגי משמאל.
 *  · fit-to-viewport: scale = min(availW/spreadW, availH/pageH) — בלי גלילה.
 *  · cache לפי pageNumber+scale (מונע רינדור-חוזר).
 * לוגיקה טהורה · אין DOM/רשת/pdf.js — הרינדור עצמו בדף.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionFlipbook = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  // מודל-מצבי-תצוגה: שער בודד → כפולות (זוגי,אי-זוגי) → גב בודד. אין עמוד-0/ריק.
  function flipSpreads(n) {
    n = n | 0; var out = [];
    if (n <= 0) return out;
    out.push({ type: 'single', pages: [1] });
    var p = 2;
    while (p + 1 <= n - 1) { out.push({ type: 'double', pages: [p, p + 1] }); p += 2; }
    if (p <= n) out.push({ type: 'single', pages: [p] });
    return out;
  }

  // RTL: בכפולה [זוגי,אי-זוגי] — הזוגי בצד ימין, האי-זוגי בצד שמאל. בודד — במרכז.
  function rtlSlots(spread) {
    if (!spread) return [];
    if (spread.type === 'single') return [{ page: spread.pages[0], pos: 'center' }];
    return [{ page: spread.pages[0], pos: 'right' }, { page: spread.pages[1], pos: 'left' }];
  }
  // סדר-DOM פיזי שמאל→ימין (container ב-direction:ltr, בלי RTL על התוכן):
  // כפולה [2,3] → בשמאל 3, בימין 2 → סדר-DOM [3,2]. בודד → [p].
  function ltrOrder(spread) {
    if (!spread) return [];
    if (spread.type === 'single') return [spread.pages[0]];
    return [spread.pages[1], spread.pages[0]];
  }

  // scale כך שכל הכפולה/העמוד נכנסים ב-viewport, שמירת יחס, בלי overflow.
  function fitScale(type, pageWpt, pageHpt, availW, availH, maxScale) {
    if (!(pageWpt > 0) || !(pageHpt > 0) || !(availW > 0) || !(availH > 0)) return 0;
    var spreadW = pageWpt * (type === 'double' ? 2 : 1);
    var s = Math.min(availW / spreadW, availH / pageHpt);
    var cap = maxScale > 0 ? maxScale : 2;
    return Math.min(s, cap);
  }
  function quantScale(s) { return Math.round((Number(s) || 0) * 100) / 100; }
  function cacheKey(pageNumber, scale) { return pageNumber + '@' + quantScale(scale); }

  // גיזום-cache (Map, לפי סדר-הכנסה — הישן ראשון). מחזיר כמה נמחקו.
  function trimCache(map, limit) {
    limit = limit || 40; var removed = 0;
    if (!map || typeof map.size !== 'number') return 0;
    var it = map.keys();
    while (map.size > limit) { var k = it.next(); if (k.done) break; map.delete(k.value); removed++; }
    return removed;
  }

  return { flipSpreads: flipSpreads, rtlSlots: rtlSlots, ltrOrder: ltrOrder,
           fitScale: fitScale, quantScale: quantScale, cacheKey: cacheKey, trimCache: trimCache };
});
