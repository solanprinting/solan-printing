/* ═══════════ בחירת מנוע התצוגה של pdf.js ═══════════
   הרקע — "עוצמה" עמ' 28 (2026-07-30): גרפיקה עם מסכת-שקיפות (ג'וק, לוגו
   "עין אפק") הוצגה דהויה/חסרה בדפדוף, בזמן שהקובץ תקין לחלוטין. הפענוח היה
   תקין בשתי הגרסאות — מה ששבור היה ה*ציור*: אותה גרפיקה נצבעה גם אטומה וגם
   דרך מסכה, כלומר האלפא הוחל פעמיים. הבעלים אימת שהמנוע החדש מצייר נכון,
   ולכן הוא ברירת-המחדל בכל מסלול שבו מאשרים או בודקים קובץ.

   המנוע הישן (3.11.174) נשאר כנפילה-לאחור: אצל לקוח עם סינון-תוכן שחוסם את
   המראות של המנוע החדש, עדיף דפדוף עם באג-שקיפות מאשר מסך מת. במצב כזה
   האזהרה על עמודי-שקיפות כן מוצגת (PdfTransparency) — כי אז היא נכונה.
   ?engine=old בכתובת מכריח את הישן (להשוואה/מקרה חירום).                */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PdfEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MODERN = '5.4.149';    // מצייר נכון מסכות-שקיפות (אומת מול עוצמה עמ' 28)
  var LEGACY = '3.11.174';   // מה שהיה בדפים עד כה — נפילה-לאחור בלבד

  /* ⚠️ ‏vendor/ הוא **אחרון** כאן, ובכוונה — הפוך מ-lib-loader.
     ההבדל: שתי המראות הראשונות מגישות לצדן גם cmaps/standard_fonts,
     ו-assetsFor() מצרף אותן. בלעדיהן גופן שלא הוטבע בקובץ עלול ליפול
     לגופן-חלופי — קריטי בעברית. ‎vendor/‎ אינו כולל את הנכסים (הם מאות
     קבצים), ולכן העדפתו כברירת-מחדל הייתה פוגעת **בכל** הלקוחות כדי
     לעזור לחסומים בלבד.
     לכן: מי שאינו חסום מקבל את הגרסה המלאה; מי שחסום נופל ל-vendor/
     ומקבל דפדוף עובד בלי הנכסים — עדיף בהרבה על מסך שלא עולה.
     ⚠️ וגם אם המנוע החדש נכשל לגמרי — ‎ensure()‎ נופל למנוע הישן, שכבר
     נטען מ-vendor/ דרך lib-loader. כלומר יש שתי רשתות-ביטחון, לא אחת. */
  function mirrors(version) {
    var v = version || MODERN;
    return ['https://cdn.jsdelivr.net/npm/pdfjs-dist@' + v + '/build/',
            'https://unpkg.com/pdfjs-dist@' + v + '/build/',
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + v + '/',
            'vendor/'];
  }
  function moduleFor(base) { return base + 'pdf.min.mjs'; }
  function workerFor(base) { return base + 'pdf.worker.min.mjs'; }

  /* נכסי-עזר (cmaps + גופנים תקניים) יושבים ליד build/ בחבילת npm. בלעדיהם
     טקסט בגופן שלא הוטבע בקובץ עלול להיעלם — קריטי בעברית. ב-cdnjs הנכסים
     האלה חסומים (403), ולכן שם לא מצרפים אותם בכלל. */
  function assetsFor(base) {
    var m = /^(.*\/)build\/$/.exec(String(base || ''));
    if (!m) return null;
    return { cMapUrl: m[1] + 'cmaps/', cMapPacked: true, standardFontDataUrl: m[1] + 'standard_fonts/' };
  }

  /* עוטף getDocument כדי לצרף את הנכסים לכל קריאה — בלי לגעת בכל מקום בקוד
     שקורא ל-pdfjsLib.getDocument. לא דורס מה שהקורא ביקש במפורש. */
  function withAssets(mod, base) {
    var a = assetsFor(base);
    if (!a || typeof mod.getDocument !== 'function') return mod;
    var orig = mod.getDocument;
    mod.getDocument = function (src) {
      if (src && typeof src === 'object' && !(src instanceof Uint8Array) && !(src instanceof ArrayBuffer)) {
        if (src.cMapUrl == null) { src.cMapUrl = a.cMapUrl; src.cMapPacked = true; }
        if (src.standardFontDataUrl == null) src.standardFontDataUrl = a.standardFontDataUrl;
      }
      return orig.call(mod, src);
    };
    return mod;
  }

  /* איזה מנוע לבקש. ברירת-המחדל היא החדש; רק ?engine=old מכריח את הישן.
     כל ערך אחר (כולל 'new', ריק, זבל) → החדש, כדי שקישור שגוי לא יחזיר
     לקוחות לבאג. */
  function chooseEngine(param) {
    return String(param == null ? '' : param).trim().toLowerCase() === 'old' ? 'old' : 'new';
  }

  /* האם להזהיר על עמוד עם מסכות-שקיפות. במנוע החדש הציור נכון, ולכן אזהרה
     שם היא רעש-שקר שמפחיד לקוחות סתם. */
  function shouldWarn(engine, scan) {
    return engine === 'old' && !!(scan && scan.risky);
  }

  /* טוען את המנוע החדש ומציב אותו כ-pdfjsLib. מחזיר {ok, engine, version, base}.
     נכשל בשקט אם כל המראות חסומות — הקורא נופל-לאחור למנוע הישן. */
  function loadModern(opts) {
    opts = opts || {};
    var win = opts.win || (typeof window !== 'undefined' ? window : null);
    var list = opts.mirrors || mirrors(opts.version || MODERN);
    var imp = opts.importer || function (u) { return import(/* webpackIgnore: true */ u); };
    var i = 0;
    function tryNext() {
      if (i >= list.length) return Promise.resolve({ ok: false, engine: 'old', version: LEGACY });
      var base = list[i++];
      return Promise.resolve().then(function () { return imp(moduleFor(base)); }).then(function (m) {
        if (!m || typeof m.getDocument !== 'function') return tryNext();
        try { m.GlobalWorkerOptions.workerSrc = workerFor(base); } catch (e) {}
        try { withAssets(m, base); } catch (e) {}
        if (win) win.pdfjsLib = m;
        return { ok: true, engine: 'new', version: m.version || (opts.version || MODERN), base: base };
      }, function () { return tryNext(); });
    }
    return tryNext();
  }

  /* נקודת-הכניסה לדפים: מבטיח שיהיה pdfjsLib, ומחזיר איזה מנוע התקבל בפועל.
     force='old' → לא מנסה בכלל את החדש. */
  function ensure(opts) {
    opts = opts || {};
    var win = opts.win || (typeof window !== 'undefined' ? window : null);
    var want = chooseEngine(opts.force);
    if (want === 'old') return Promise.resolve({ ok: !!(win && win.pdfjsLib), engine: 'old', version: LEGACY });
    return loadModern(opts).then(function (r) {
      if (r.ok) return r;
      return { ok: !!(win && win.pdfjsLib), engine: 'old', version: LEGACY };
    });
  }

  return { MODERN: MODERN, LEGACY: LEGACY, mirrors: mirrors, moduleFor: moduleFor,
           workerFor: workerFor, assetsFor: assetsFor, withAssets: withAssets,
           chooseEngine: chooseEngine, shouldWarn: shouldWarn,
           loadModern: loadModern, ensure: ensure };
});
