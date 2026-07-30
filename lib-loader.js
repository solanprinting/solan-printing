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

  /* מראות לפי סדר ניסיון. cdnjs ראשון (הכי מהיר אצלנו), ואז חלופות. */
  var MIRRORS = {
    pdfjs: [
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.min.js',
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/build/pdf.min.js',
      'https://unpkg.com/pdfjs-dist@' + PDFJS_VER + '/build/pdf.min.js'
    ],
    pdflib: [
      'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/' + PDFLIB_VER + '/pdf-lib.min.js',
      'https://cdn.jsdelivr.net/npm/pdf-lib@' + PDFLIB_VER + '/dist/pdf-lib.min.js',
      'https://unpkg.com/pdf-lib@' + PDFLIB_VER + '/dist/pdf-lib.min.js'
    ]
  };
  /* המשתנה הגלובלי שכל ספרייה מייצרת — כך בודקים אם באמת נטענה */
  var GLOBALS = { pdfjs: 'pdfjsLib', pdflib: 'PDFLib' };

  function names() { return Object.keys(MIRRORS); }
  function mirrors(name) { return (MIRRORS[name] || []).slice(); }
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

  /* מוודא את כל הספריות. מחזיר {ok, loaded:{name:url}, failed:[names], message} */
  function ensureAll(opt) {
    opt = opt || {};
    var win = opt.win || (typeof self !== 'undefined' ? self : {});
    var need = missing(win);
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

  return {
    PDFJS_VER: PDFJS_VER, PDFLIB_VER: PDFLIB_VER,
    names: names, mirrors: mirrors, globalOf: globalOf, workerFor: workerFor,
    missing: missing, allReady: allReady, hosts: hosts, blockedMessage: blockedMessage,
    loadScript: loadScript, ensure: ensure, ensureAll: ensureAll
  };
});
