/* ═══════════ פתיחת פורטלים לכל לקוחות היומן השבועי ═══════════
   בקשת-בעלים 2026-07-31: "אני רוצה לפתוח פורטל לכל הלקוחות שקיימים ביומן השבועי".

   למה זה לא לולאת-PUT פשוטה:
   1. **שם-העיתון ביומן אינו תמיד שם-הלקוח בפורטל.** ביומן יש "הנקודה הצפונית"
      בעוד שהפורטל הקיים הוא "נקודה צפונית". יצירה עיוורת הייתה מייצרת פורטל
      שני, מקביל, לאותו לקוח — ואז חצי מהקבצים נוחתים בכתובת שאיש לא פותח.
   2. **ביומן יש שורות כפולות** (אותו עיתון פעמיים).
   3. **פורטל קיים לעולם לא נדרס.** ה-token הוא מפתח-הגישה של הלקוח; יצירה
      מחדש שוברת כל קישור שכבר נשלח.

   לכן: `plan()` מסווג כל שורה, והמסך מציג לאישור לפני שנכתב משהו.
   הסיווג הוא המלצה — ההחלטה של הבעלים.                                      */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PortalBatch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _s(v){ return String(v == null ? '' : v); }

  /* אותו slug בדיוק כמו `_slug` ב-proof-admin — אסור שיתפצלו, אחרת התוכנית
     תבטיח כתובת אחת והיצירה תכתוב לאחרת. */
  function slugOf(name){
    return _s(name).trim().toLowerCase().replace(/[.#$\[\]\/\\]+/g, '').replace(/\s+/g, '_');
  }
  // נרמול להשוואת-דמיון בלבד (לא לכתיבה): בלי ה"א-הידיעה ובלי סימני-פיסוק
  function normLoose(name){
    return _s(name).trim().toLowerCase()
      .replace(/["'.,\-()]/g, '').replace(/\s+/g, ' ')
      .split(' ').map(function(w){ return w.length > 3 && w.charAt(0) === 'ה' ? w.slice(1) : w; })
      .join(' ').trim();
  }

  /* דמיון: זהה אחרי נרמול-רופף, או שאחד מוכל בשני כרצף-מילים שלם.
     ⚠️ מילה בודדת משותפת אינה דמיון — אחרת כל "השבועון *" היה נראה כפול. */
  function similar(a, b){
    var x = normLoose(a), y = normLoose(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var xw = x.split(' '), yw = y.split(' ');
    if (xw.length < 2 && yw.length < 2) return false;
    var big = xw.length >= yw.length ? xw : yw, small = xw.length >= yw.length ? yw : xw;
    if (small.length < 2) return false;
    for (var i = 0; i + small.length <= big.length; i++){
      var hit = true;
      for (var j = 0; j < small.length; j++) if (big[i+j] !== small[j]) { hit = false; break; }
      if (hit) return true;
    }
    return false;
  }

  /* newspapers → רשימת-שורות מסווגת.
     status: 'exists'  — כבר יש פורטל בדיוק לשם הזה (לא נוגעים)
             'similar' — יש פורטל לשם דומה (חשד לכפילות → לא מסומן כברירת-מחדל)
             'dup'     — השורה חוזרת ביומן (רק המופע הראשון נשמר)
             'new'     — ייווצר                                                */
  function plan(newspapers, portals, opts){
    opts = opts || {};
    var arr = Array.isArray(newspapers) ? newspapers
            : (newspapers && typeof newspapers === 'object' ? Object.keys(newspapers).map(function(k){ return newspapers[k]; }) : []);
    var have = portals && typeof portals === 'object' ? portals : {};
    var haveNames = Object.keys(have).map(function(k){ return (have[k] && have[k].name) || k.replace(/_/g, ' '); });
    var seen = {}, out = [];
    arr.forEach(function(n){
      if (!n) return;
      var name = _s(n.name).trim();
      if (!name) return;                                  // שורה בלי שם אינה לקוח
      if (opts.onlyTypes && opts.onlyTypes.indexOf(_s(n.type)) < 0) return;
      var slug = slugOf(name);
      if (seen[slug]) { out.push({ name: name, slug: slug, day: _s(n.day), type: _s(n.type), status: 'dup', pick: false }); return; }
      seen[slug] = true;
      if (have[slug]) { out.push({ name: name, slug: slug, day: _s(n.day), type: _s(n.type), status: 'exists', pick: false }); return; }
      var near = '';
      for (var i = 0; i < haveNames.length; i++) if (similar(name, haveNames[i])) { near = haveNames[i]; break; }
      out.push({ name: name, slug: slug, day: _s(n.day), type: _s(n.type),
                 status: near ? 'similar' : 'new', similarTo: near, pick: !near });
    });
    return out;
  }

  function counts(rows){
    var c = { total: 0, exists: 0, similar: 0, dup: 0, "new": 0, picked: 0 };
    (rows || []).forEach(function(r){ c.total++; c[r.status] = (c[r.status] || 0) + 1; if (r.pick) c.picked++; });
    return c;
  }

  // רשומת-הפורטל. אותו מבנה שיוצרת `portalLink` — כדי ששני המסלולים יתלכדו.
  function portalRecord(name, now, rnd){
    var t = 'k' + Number(now).toString(36) + String(rnd == null ? '' : rnd);
    return { name: _s(name), token: t, createdAt: Number(now), createdBy: 'batch' };
  }
  function portalUrl(base, name, token){
    return _s(base) + 'customer-portal.html?cust=' + encodeURIComponent(_s(name)) + '&k=' + encodeURIComponent(_s(token));
  }
  // טקסט מוכן להעתקה — שורה ללקוח, מסודר לפי יום
  function copyText(items){
    return (items || []).slice().sort(function(a,b){ return _s(a.day).localeCompare(_s(b.day), 'he') || _s(a.name).localeCompare(_s(b.name), 'he'); })
      .map(function(i){ return _s(i.name) + (i.day ? ' (' + i.day + ')' : '') + ': ' + _s(i.url); }).join('\n');
  }

  return { slugOf: slugOf, normLoose: normLoose, similar: similar, plan: plan,
           counts: counts, portalRecord: portalRecord, portalUrl: portalUrl, copyText: copyText };
});
