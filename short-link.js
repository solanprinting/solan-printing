/* ═══════════ קישורים קצרים וידידותיים ═══════════
   הכאב (בקשת-בעלים 2026-07-31): הקישורים שנשלחים ללקוחות ארוכים ומלחיצים —
   שם-לקוח מקודד, מזהה-עבודה באורך 36 תווים וטוקן ארוך. לקוח שמקבל בוואטסאפ
   שורה כזו חושש ללחוץ.

   הפתרון באתר סטטי (GitHub Pages — אין שרת ואין rewrite): קוד קצר שנשמר
   ב-Firebase וממופה לכתובת המלאה, ודף-הפניה זעיר (s.html) שמפנה אליה.
       לפני:  …/proof-client.html?id=9f2c1e7a-4b8d-4a11-9c3e-77bb0e5d1a20
       אחרי:  …/s.html?c=K7M2QX4

   ⚠️ הקוד הקצר הוא מפתח-גישה לכל דבר (הוא מוביל לכתובת שכוללת את הטוקן).
   לכן: אלפבית ללא תווים מתבלבלים, 7 תווים (≈3.4 מיליארד צירופים), והגרלה
   ממקור-אקראיות קריפטוגרפי כשקיים.
   תאימות-לאחור: קישורים ארוכים שכבר נשלחו ממשיכים לעבוד — לא נוגעים בהם. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShortLink = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // בלי 0/O/1/I/L — כדי שאפשר יהיה גם להקריא קוד בטלפון בלי טעויות
  var ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var CODE_LEN = 7;
  var NODE = 'shortLinks';

  function _rand(n, rng){
    var out = '';
    if (!rng && typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var buf = new Uint32Array(n);
      crypto.getRandomValues(buf);
      for (var i = 0; i < n; i++) out += ALPHABET[buf[i] % ALPHABET.length];
      return out;
    }
    var r = rng || Math.random;
    for (var j = 0; j < n; j++) out += ALPHABET[Math.floor(r() * ALPHABET.length) % ALPHABET.length];
    return out;
  }
  function newCode(rng, len){ return _rand(len || CODE_LEN, rng); }
  function isCode(s){
    s = String(s == null ? '' : s).trim();
    if (s.length < 4 || s.length > 12) return false;
    for (var i = 0; i < s.length; i++) if (ALPHABET.indexOf(s[i]) < 0) return false;
    return true;
  }

  /* בסיס-האתר מתוך כתובת נוכחית: מוריד את שם-הקובץ והשאילתה.
     …/solan-printing/proof-admin.html?x=1  →  …/solan-printing/ */
  function baseOf(href){
    var s = String(href || '');
    s = s.split('#')[0].split('?')[0];
    return s.replace(/[^/]*$/, '');
  }
  function shortUrl(base, code){ return baseOf(base) + 's.html?c=' + encodeURIComponent(code); }

  // הקוד מהכתובת (?c=… או #c=… — שניהם נתמכים)
  function codeFromUrl(href){
    var s = String(href || '');
    var m = /[?&]c=([^&#]+)/.exec(s) || /#c=([^&]+)/.exec(s);
    if (!m) return '';
    var v = '';
    try { v = decodeURIComponent(m[1]); } catch(e){ v = m[1]; }
    return isCode(v) ? v : '';
  }

  /* רשומה שנשמרת ב-Firebase תחת shortLinks/<code>.
     שומרים גם kind/by/at — כדי שאפשר יהיה לדעת מה נשלח ולמי, ולבטל אם צריך. */
  function record(url, meta){
    meta = meta || {};
    return {
      url: String(url || ''),
      kind: String(meta.kind || '') || null,
      customer: String(meta.customer || '') || null,
      by: String(meta.by || '') || null,
      at: (typeof meta.at === 'number' ? meta.at : null),
      hits: 0
    };
  }
  function nodePath(code){ return NODE + '/' + code; }

  /* יעד תקין להפניה: רק כתובת יחסית באותו אתר, או כתובת מלאה באותו מקור.
     מונע שימוש בקישור-הקצר שלנו כדי להפנות לאתר זר. */
  function safeTarget(url, origin){
    var u = String(url || '').trim();
    if (!u) return '';
    if (/^javascript:/i.test(u) || /^data:/i.test(u)) return '';
    if (/^https?:\/\//i.test(u)) {
      if (!origin) return '';
      return (u.indexOf(String(origin)) === 0) ? u : '';
    }
    if (u.charAt(0) === '/' || u.indexOf('..') >= 0) return '';   // לא יוצאים מהתיקייה
    return u;
  }

  // תווית קצרה לתצוגה ליד הכפתור ("קישור קצר: K7M2QX4")
  function pretty(code){ return String(code || '').replace(/(.{4})(?=.)/g, '$1-'); }

  return { ALPHABET: ALPHABET, CODE_LEN: CODE_LEN, NODE: NODE,
           newCode: newCode, isCode: isCode, baseOf: baseOf, shortUrl: shortUrl,
           codeFromUrl: codeFromUrl, record: record, nodePath: nodePath,
           safeTarget: safeTarget, pretty: pretty };
});
