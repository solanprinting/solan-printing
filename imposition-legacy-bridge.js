/* ═══════════════════════════════════════════════════════════════════════════
 * imposition-legacy-bridge.js — גשר same-origin למנוע-הקיפול הישן (U2 · Beta)
 * ───────────────────────────────────────────────────────────────────────────
 * טוען את imposition-tool.html ב-iframe נסתר (אותו origin) וקורא *ישירות* ל-
 * contentWindow.fold() — הפונקציה המקורית של הייצור. אינו נוגע בכלי, אינו קורא
 * לפונקציות שליחה/אישור/Storage/Firebase, ואינו ממתין ל-App Check.
 *
 * ⚠️ דפדפן בלבד (DOM/iframe). הלוגיקה הטהורה (מיפוי-תוצאה/requestId) ב-fold-adapter.
 *    App Check מאותחל אוטומטית בכלי (read/token בלבד) — לא חוסם fold, לא כתיבה.
 *    האסור: monkey-patch/site-key/srcdoc/עותק/חסימת-fetch/לחיצת-כפתור/_foldedBytes.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImpositionLegacyBridge = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var STATES = ['idle', 'loading', 'ready', 'folding', 'success', 'error', 'disposed'];

  function createLegacyBridge(cfg) {
    cfg = cfg || {};
    var iframeUrl = cfg.iframeUrl || 'imposition-tool.html';
    var iframeLoadTimeout = cfg.iframeLoadTimeoutMs || 15000;
    var bridgeReadyTimeout = cfg.bridgeReadyTimeoutMs || 18000;   // כולל המתנה קצרה לזמינות fold
    var foldTimeout = cfg.foldTimeoutMs || 60000;
    var allowGlobalStateFallback = cfg.allowGlobalStateFallback === true;   // _foldedBytes — אסור כברירת-מחדל

    var state = 'idle', iframe = null, readyPromise = null;
    var counter = { n: 0, next: function () { return ++this.n; } };
    var activeRequestId = 0;
    var diag = { iframeLoaded: false, foldAccessible: false, sameOrigin: false,
                 appCheckObserved: 'unknown', appCheckRequiredForFold: false, version: null, state: 'idle', activeRequestId: 0, lastError: null };

    function _set(s) { state = s; diag.state = s; }
    function _sameOrigin(url) { try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; } }

    function ready() {
      if (readyPromise) return readyPromise;
      if (!_sameOrigin(iframeUrl)) { _set('error'); diag.lastError = 'CROSS_ORIGIN_BLOCKED'; return Promise.reject(new Error('CROSS_ORIGIN_BLOCKED')); }
      diag.sameOrigin = true;
      _set('loading');
      readyPromise = new Promise(function (resolve, reject) {
        var settled = false;
        function fail(code) { if (settled) return; settled = true; _set('error'); diag.lastError = code; reject(new Error(code)); }
        function done() { if (settled) return; settled = true; _set('ready'); resolve(bridgeApi); }

        iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.setAttribute('tabindex', '-1');
        iframe.setAttribute('title', 'legacy-fold-engine');
        iframe.setAttribute('scrolling', 'no');
        // מוסתר, מחוץ לזרימה, בלי focus/scroll/השפעה על גודל-הדף (בלי sandbox — כדי לשמור same-origin+contentWindow.fold)
        iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;border:0;visibility:hidden;pointer-events:none';
        var loadTimer = setTimeout(function () { fail('IFRAME_LOAD_TIMEOUT'); }, iframeLoadTimeout);
        var readyTimer = setTimeout(function () { fail('FOLD_NOT_ACCESSIBLE'); }, bridgeReadyTimeout);

        iframe.onload = function () {
          clearTimeout(loadTimer); diag.iframeLoaded = true;
          var cw; try { cw = iframe.contentWindow; } catch (e) { clearTimeout(readyTimer); return fail('CROSS_ORIGIN_BLOCKED'); }
          // polling קצר לזמינות fold (הסקריפט של הכלי רץ ב-parse; בד"כ כבר זמין). לא ממתינים ל-App Check.
          (function poll(tries) {
            var ok = false;
            try { ok = typeof cw.fold === 'function'; } catch (e) { clearTimeout(readyTimer); return fail('CROSS_ORIGIN_BLOCKED'); }
            if (ok) {
              clearTimeout(readyTimer);
              diag.foldAccessible = true;
              try { diag.version = cw.APP_VERSION || (cw.window && cw.window.APP_VERSION) || null; } catch (e) {}
              try { diag.appCheckObserved = (typeof cw._appCheckReady !== 'undefined') ? (cw._appCheckReady !== null) : 'unknown'; } catch (e) { diag.appCheckObserved = 'unknown'; }
              return done();
            }
            if (tries <= 0) { clearTimeout(readyTimer); return fail('FOLD_NOT_ACCESSIBLE'); }
            setTimeout(function () { poll(tries - 1); }, 120);
          })(40);
        };
        iframe.onerror = function () { clearTimeout(loadTimer); clearTimeout(readyTimer); fail('IFRAME_LOAD_ERROR'); };
        try { document.body.appendChild(iframe); iframe.src = iframeUrl; }
        catch (e) { clearTimeout(loadTimer); clearTimeout(readyTimer); fail('IFRAME_APPEND_FAILED'); }
      });
      return readyPromise;
    }

    // מקבל arrayBuffer + פרמטרים; מפעיל את fold המקורית עם עותק-בטוח; timeout נפרד ל-fold.
    function runFold(opts) {
      opts = opts || {};
      if (state === 'disposed') return Promise.reject(new Error('DISPOSED'));
      if (state === 'folding') return Promise.reject(new Error('ALREADY_FOLDING'));   // אין הרצה מקבילה
      var requestId = opts.requestId != null ? opts.requestId : counter.next();
      activeRequestId = requestId; diag.activeRequestId = requestId;
      return ready().then(function () {
        var cw = iframe.contentWindow;
        if (typeof cw.fold !== 'function') { _set('error'); diag.lastError = 'FOLD_NOT_ACCESSIBLE'; throw new Error('FOLD_NOT_ACCESSIBLE'); }
        _set('folding');
        var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        // עותק נפרד לכל ריצה (מניעת mutation) *במרחב-הריאלם של ה-iframe* — אחרת pdf-lib
        // בתוך ה-iframe לא מזהה ArrayBuffer/Uint8Array של ה-parent (instanceof חוצה-ריאלם נכשל).
        var src = opts.arrayBuffer;
        var srcU8 = (src instanceof Uint8Array) ? src : new Uint8Array(src);
        var IU8 = cw.Uint8Array || Uint8Array;
        var buf = new IU8(srcU8);           // Uint8Array של ה-iframe
        var foldPromise = Promise.resolve().then(function () {
          return cw.fold(buf, { type: opts.type, firstSide: opts.firstSide || 0, mirror: !!opts.mirror, bleedMm: opts.bleedMm || 0 });
        });
        var timeoutPromise = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('FOLD_TIMEOUT')); }, foldTimeout); });
        return Promise.race([foldPromise, timeoutPromise]).then(function (res) {
          var durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
          // תוצאה של request ישן (הקלט השתנה) → stale → נזרקת, לא-נשמרת
          if (requestId !== activeRequestId || state === 'disposed') { var e = new Error('STALE_RESULT'); e.stale = true; throw e; }
          _set('success');
          return { requestId: requestId, bytes: res.bytes, report: res.report, durationMs: durationMs };
        }).catch(function (err) {
          if (err && err.stale) throw err;
          if (state !== 'disposed') { _set('error'); diag.lastError = (err && err.message) || 'FOLD_FAILED'; }
          throw err;
        });
      });
    }

    function diagnostics() { var d = {}; for (var k in diag) d[k] = diag[k]; return d; }
    function getState() { return state; }
    function dispose() {
      activeRequestId = -1;                       // כל תוצאה תלויה תהפוך stale
      try { if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (e) {}
      iframe = null; readyPromise = null; _set('disposed');
    }

    var bridgeApi = { ready: ready, runFold: runFold, diagnostics: diagnostics, getState: getState, dispose: dispose,
                      STATES: STATES, nextRequestId: function () { return counter.next(); } };
    return bridgeApi;
  }

  return { createLegacyBridge: createLegacyBridge, STATES: STATES };
});
