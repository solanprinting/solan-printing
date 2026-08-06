/* ═══════════ lib-loader.js — טעינת ספריות חיצוניות עם מראות-גיבוי ═══════════
   הבעיה שזה פותר: דפי הלקוח נשענים על pdf.js ו-pdf-lib מ-cdnjs. אצל לקוחות עם
   סינון-תוכן (אינטרנט כשר), פרוקסי ארגוני או חוסם-פרסומות — cdnjs נחסם, הספרייה
   לא נטענת, והשורה הראשונה בסקריפט (`pdfjsLib.…`) זורקת ReferenceError שהורג את
   *כל* קובץ הסקריפט. התוצאה אצל הלקוח: דף מת בלי שום הודעה ("לא מצליח לפתוח את
   הקישור"). כאן: מנסים כמה מראות, ואם כולן חסומות — מחזירים הודעה מפורשת בעברית
   עם הכתובות שצריך לאשר.

   החלק הטהור נבדק ב-Node; הטעינה עצמה (document/script) רצה רק בדפדפן. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LibLoader = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PDFJS_VER = '3.11.174', PDFLIB_VER = '1.17.1';

  /* ── מראות לפי סדר ניסיון ──────────────────────────────────────────────
     ⚠️ **המראה הראשונה היא אצלנו** (‎vendor/‎, נפרס עם האתר), ורק אחריה
     ה-CDN-ים. הסיבה נמדדה בייצור 06/08/2026: לקוחות ברשת מסוננת
     (אינטרנט כשר) — שהם בסיס-הלקוחות — נחסמים משלושת ה-CDN-ים **יחד**,
     כי כולם ציבוריים. התוצאה: 5 מתוך 6 העלאות מהפורטל נכשלו ומסך
     אישור-הפרופר לא עלה, בזמן שהמסלול שאינו דורש רינדור דווקא עבד.
     מראה שיושבת באותו origin של הדף אינה יכולה להיחסם בלי לחסום את האתר
     כולו — ולכן היא ראשונה, ולא אחרונה.
     ⚠️ אותו לקח כבר יושם כאן על הגופן Heebo (ראה upload.ps1): קישור ל-
     fonts.googleapis לא הספיק, והגופן עבר לאירוח-עצמי. הספריות נשארו מאחור.
     ⚠️ נתיב **יחסי** ולא מוחלט: כל דפי-הלקוח יושבים בשורש האתר לצד
     vendor/, וכתובת מוחלטת הייתה שוברת בדיקות מקומיות ותצוגה-מקדימה. */
  var LOCAL = 'vendor/';
  var MIRRORS = {
    pdfjs: [
      LOCAL + 'pdf.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.min.js',
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/build/pdf.min.js',
      'https://unpkg.com/pdfjs-dist@' + PDFJS_VER + '/build/pdf.min.js'
    ],
    pdflib: [
      LOCAL + 'pdf-lib.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/' + PDFLIB_VER + '/pdf-lib.min.js',
      'https://cdn.jsdelivr.net/npm/pdf-lib@' + PDFLIB_VER + '/dist/pdf-lib.min.js',
      'https://unpkg.com/pdf-lib@' + PDFLIB_VER + '/dist/pdf-lib.min.js'
    ]
  };
  /* ספריות-משנה של הדפים הפנימיים (אקסל, זיפ, PDF-מהמסך, QR, ברקוד). הן לא חלק מ-CORE:
     אין להן חלק בטעינה-חוסמת של דפי-הלקוח, אבל גם הן מגיעות מ-cdnjs ולכן גם הן נחסמות.
     `names()` נשאר CORE בכוונה — כדי ש-ensureAll בדפי-הלקוח לא יגרור ספריות מיותרות. */
  var EXTRA_MIRRORS = {
    xlsx: [
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ],
    jszip: [
      'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
      'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
      'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
    ],
    jspdf: [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ],
    html2canvas: [
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
    ],
    qrcode: [
      'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
      'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
      'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js'
    ],
    jsbarcode: [
      'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
      'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
      'https://unpkg.com/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'
    ]
  };

  /* המשתנה הגלובלי שכל ספרייה מייצרת — כך בודקים אם באמת נטענה */
  var GLOBALS = { pdfjs: 'pdfjsLib', pdflib: 'PDFLib',
    xlsx: 'XLSX', jszip: 'JSZip', jspdf: 'jspdf',
    html2canvas: 'html2canvas', qrcode: 'qrcode', jsbarcode: 'JsBarcode' };

  function names() { return Object.keys(MIRRORS); }                    /* CORE בלבד */
  function extraNames() { return Object.keys(EXTRA_MIRRORS); }
  function allNames() { return names().concat(extraNames()); }
  function mirrors(name) { return (MIRRORS[name] || EXTRA_MIRRORS[name] || []).slice(); }
  function globalOf(name) { return GLOBALS[name] || ''; }

  /* ה-worker של pdf.js חייב להגיע מאותה מראה כמו הספרייה עצמה —
     אחרת חוזרים בדיוק לאותה חסימה. */
  function workerFor(pdfjsUrl) {
    var u = String(pdfjsUrl || '');
    if (!u) return '';
    return u.replace(/pdf\.min\.js(\?.*)?$/, 'pdf.worker.min.js');
  }

  /* אילו ספריות עדיין חסרות בחלון הנתון */
  function missing(win) {
    var w = win || {};
    return names().filter(function (n) { return !w[GLOBALS[n]]; });
  }
  function allReady(win) { return missing(win).length === 0; }

  /* המארחים שצריך לאשר בסינון — לרשימת-היתר של הלקוח */
  function hosts(missingNames) {
    var list = (missingNames && missingNames.length) ? missingNames : names();
    var out = [];
    list.forEach(function (n) {
      mirrors(n).forEach(function (u) {
        var h = String(u).split('/')[2];
        if (h && out.indexOf(h) < 0) out.push(h);
      });
    });
    return out;
  }

  /* הודעה בעברית ללקוח — מסבירה שזו חסימת-רשת ולא תקלה באתר */
  function blockedMessage(missingNames) {
    var hs = hosts(missingNames);
    return 'רכיבי הצפייה בקבצים לא נטענו — כנראה חסימת אינטרנט (סינון תוכן / פרוקסי / חוסם פרסומות).\n\n'
      + 'מה לעשות:\n'
      + '1) לנסות בדפדפן אחר או ברשת אחרת (למשל נתונים סלולריים).\n'
      + '2) לבקש מספק הסינון לאשר את הכתובות:\n   ' + hs.join('\n   ') + '\n\n'
      + 'אם זה נמשך — אפשר לשלוח את הקבצים לבית הדפוס ישירות.';
  }

  /* טוען סקריפט יחיד; מחזיר Promise שנדחה בכישלון/פסק-זמן */
  function loadScript(url, doc, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var d = doc || (typeof document !== 'undefined' ? document : null);
      if (!d) return reject(new Error('NO_DOCUMENT'));
      var s = d.createElement('script');
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('TIMEOUT')); } },
        timeoutMs || 12000);
      s.src = url;
      s.onload = function () { if (!done) { done = true; clearTimeout(t); resolve(url); } };
      s.onerror = function () { if (!done) { done = true; clearTimeout(t); reject(new Error('LOAD_FAILED')); } };
      (d.head || d.documentElement).appendChild(s);
    });
  }

  /* מוודא שספרייה זמינה — עובר על המראות עד שאחת מצליחה.
     מחזיר {ok, url} או {ok:false}. */
  function ensure(name, opt) {
    opt = opt || {};
    var win = opt.win || (typeof self !== 'undefined' ? self : {});
    var doc = opt.doc || (typeof document !== 'undefined' ? document : null);
    var load = opt.load || function (u) { return loadScript(u, doc, opt.timeoutMs); };
    var g = GLOBALS[name];
    if (!g) return Promise.resolve({ ok: false, why: 'UNKNOWN_LIB' });
    if (win[g]) return Promise.resolve({ ok: true, url: 'already-loaded', cached: true });
    var list = mirrors(name), i = 0;
    function attempt() {
      if (i >= list.length) return Promise.resolve({ ok: false, why: 'ALL_MIRRORS_FAILED' });
      var url = list[i++];
      return load(url).then(
        function () { return win[g] ? { ok: true, url: url } : attempt(); },
        function () { return attempt(); }
      );
    }
    return attempt();
  }

  /* מוודא רשימת-ספריות מפורשת (כולל ספריות-משנה כמו xlsx/jszip). אותה תבנית-תשובה
     כמו ensureAll, כך שהדפים הפנימיים יכולים לבקש בדיוק את מה שהם צריכים. */
  function ensureNames(list, opt) {
    opt = opt || {};
    var win = opt.win || (typeof self !== 'undefined' ? self : {});
    var need = (list || []).filter(function (n) { return GLOBALS[n] && !win[GLOBALS[n]]; });
    return _ensureList(need, opt);
  }

  /* מוודא את כל הספריות (CORE). מחזיר {ok, loaded:{name:url}, failed:[names], message} */
  function ensureAll(opt) {
    opt = opt || {};
    var win = opt.win || (typeof self !== 'undefined' ? self : {});
    return _ensureList(missing(win), opt);
  }

  function _ensureList(need, opt) {
    if (!need.length) return Promise.resolve({ ok: true, loaded: {}, failed: [], message: '' });
    var loaded = {}, failed = [];
    return need.reduce(function (chain, n) {
      return chain.then(function () {
        return ensure(n, opt).then(function (r) {
          if (r.ok) loaded[n] = r.url; else failed.push(n);
        });
      });
    }, Promise.resolve()).then(function () {
      return { ok: failed.length === 0, loaded: loaded, failed: failed,
               message: failed.length ? blockedMessage(failed) : '' };
    });
  }

  /* טקסט הבאנר לדפים הפנימיים — קצר יותר מהודעת-הלקוח, ומכוון לעובד */
  function bannerText(failedNames) {
    return 'חלק מרכיבי הקבצים לא נטענו (' + (failedNames || []).join(', ') + ') — כנראה חסימת אינטרנט '
      + 'או תקלת-רשת. פעולות שדורשות קריאה/יצירה של PDF ואקסל עלולות להיכשל. '
      + 'כתובות לאישור: ' + hosts(failedNames).join(' · ');
  }

  /* מציג באנר-אזהרה בראש הדף (פעם אחת). אין תלות בשום CSS של הדף. */
  function showBanner(failedNames, doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;
    function put() {
      if (d.getElementById('libBlockedBanner')) return;
      var box = d.createElement('div');
      box.id = 'libBlockedBanner';
      box.setAttribute('dir', 'rtl');
      box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#7f1d1d;color:#fff;'
        + 'font:600 14px/1.5 Heebo,system-ui,Arial,sans-serif;padding:10px 44px 10px 14px;text-align:center;'
        + 'box-shadow:0 2px 10px rgba(0,0,0,.35)';
      box.textContent = '⚠️ ' + bannerText(failedNames);
      var x = d.createElement('button');
      x.textContent = '✕';
      x.style.cssText = 'position:absolute;top:6px;left:8px;background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer';
      x.onclick = function () { box.remove(); };
      box.appendChild(x);
      (d.body || d.documentElement).appendChild(box);
    }
    if (d.readyState === 'loading' && d.addEventListener) d.addEventListener('DOMContentLoaded', put);
    else put();
    return true;
  }

  /* מילוי-רקע לדפים הפנימיים: משלים כל ספרייה חסרה ממראה חלופית, מיישר את ה-worker
     לאותה מראה, ואם משהו נשאר חסום — מזהיר בבירור במקום שהפעולה תיפול אחר-כך
     עם שגיאה סתמית ("XLSX is not defined"). לא משנה שום נתיב-קוד קיים. */
  function autoFill(list, opt) {
    opt = opt || {};
    var win = opt.win || (typeof self !== 'undefined' ? self : {});
    var doc = opt.doc || (typeof document !== 'undefined' ? document : null);
    return ensureNames((list && list.length) ? list : names(), opt).then(function (r) {
      try {
        if (r.loaded && r.loaded.pdfjs && win.pdfjsLib)
          win.pdfjsLib.GlobalWorkerOptions.workerSrc = workerFor(r.loaded.pdfjs);
      } catch (e) {}
      if (!r.ok && opt.banner !== false) { try { showBanner(r.failed, doc); } catch (e) {} }
      return r;
    });
  }

  return {
    PDFJS_VER: PDFJS_VER, PDFLIB_VER: PDFLIB_VER,
    names: names, extraNames: extraNames, allNames: allNames,
    mirrors: mirrors, globalOf: globalOf, workerFor: workerFor,
    missing: missing, allReady: allReady, hosts: hosts, blockedMessage: blockedMessage,
    loadScript: loadScript, ensure: ensure, ensureAll: ensureAll, ensureNames: ensureNames,
    bannerText: bannerText, showBanner: showBanner, autoFill: autoFill
  };
});
