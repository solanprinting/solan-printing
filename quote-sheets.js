/* ═══════════ גיליונות מול מוצרים — הכלל שנשבר בהצעת-מחיר ═══════════
   טעות שנתפסה (2026-07-31): בהצעה ל-20,000 פליירים ההדפסה חושבה על 20,000
   "עותקים", בזמן שבפועל עוברים במכונה רק 1,917 גיליונות (12 פליירים בגיליון).
   ההדפסה יצאה 2,700 ₪ במקום 900 ₪ — פי שלושה.

   הכלל: **מחיר ההדפסה, הלוחות והנייר מחושבים על גיליונות שעוברים במכונה,
   לא על מספר המוצרים.** בחוברת/עיתון עותק אחד = גיליון אחד בכל ריצה, ולכן
   שם ההבדל לא מורגש — במוצר שטוח (פלאייר/פוסטר/פלייסמנט/כרטיס) הוא דרמטי.
   גימורים (קיפול/כריכה/חיתוך-למוצר) כן נספרים לפי מספר המוצרים.

   טהור: בלי DOM ובלי רשת — כדי שיהיה אפשר לבדוק את זה, ולא רק לקוות. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuoteSheets = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _n(v){ var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function _i(v){ var x = parseInt(v, 10); return isFinite(x) ? x : 0; }

  /* ⚠️ חסם-עליון גיאומטרי בלבד — לא מספר-העבודה בפועל.
     החישוב הזה מתעלם משוליים-לתפיסה, גלישות וחיתוך, ולכן הוא *תמיד* אופטימי:
     A5 על גיליון 70×100 יוצא כאן 18, בעוד שבפועל מדפיסים 12. בתמחור, ניחוש
     אופטימי = הצעה זולה מדי — ולכן `flatQuote` **דורש** up מפורש ואינו מנחש.
     השימוש היחיד כאן: להציע טווח/לבדוק שהמספר שהוזן אינו בלתי-אפשרי. */
  function maxUpGeometric(prodW, prodH, sheetW, sheetH){
    var pw = _n(prodW), ph = _n(prodH), sw = _n(sheetW), sh = _n(sheetH);
    if (!(pw > 0 && ph > 0 && sw > 0 && sh > 0)) return 0;
    var a = Math.floor(sw / pw) * Math.floor(sh / ph);
    var b = Math.floor(sw / ph) * Math.floor(sh / pw);
    return Math.max(a, b);
  }
  // האם ה-up שהוזן אפשרי בכלל על הגיליון הזה
  function upPlausible(up, prodW, prodH, sheetW, sheetH){
    var u = _i(up), max = maxUpGeometric(prodW, prodH, sheetW, sheetH);
    if (u <= 0) return { ok: false, message: 'לא הוזן כמה יוצאים בגיליון' };
    if (!max) return { ok: true, message: '' };            // אין מידות — אין מה לבדוק
    if (u > max) return { ok: false, max: max,
      message: u + ' בגיליון אינו אפשרי — גם בלי שוליים נכנסים לכל היותר ' + max + '.' };
    return { ok: true, max: max, message: '' };
  }

  /* גיליונות-נטו לכמות מוצרים. up=1 (או חסר) → מוצר-לגיליון (חוברת/עיתון). */
  function netSheets(qty, up){
    var q = _i(qty), u = _i(up) || 1;
    if (q <= 0 || u <= 0) return 0;
    return Math.ceil(q / u);
  }

  // גיליונות בפועל = נטו + פחת (הפחת הוא לכל ריצה, לא לכל אלף)
  function totalSheets(qty, up, wastePerRun, runs){
    var n = netSheets(qty, up);
    if (!n) return 0;
    return n + (_i(runs) || 1) * _i(wastePerRun);
  }

  /* מחיר הדפסה לריצה אחת — "אלף ראשון" + "אלף רץ" לכל אלף מעבר לאלף הראשון.
     ⚠️ sheets = גיליונות, לא מוצרים. זו בדיוק הנקודה שנשברה. */
  function printCostForRun(sheets, tariff, opts){
    opts = opts || {}; tariff = tariff || {};
    var s = _i(sheets);
    if (s <= 0) return 0;
    var first = opts.isTurn ? _n(tariff.printFirstKTurn) : _n(tariff.printFirstK);
    var cost = first;
    if (s > 1000) cost += Math.ceil((s - 1000) / 1000) * _n(tariff.printRunningK);
    return cost;
  }

  // לוחות: ריצה רגילה = צבעים×2 · ריצה מתהפכת = צבעים×1
  function plateCount(colors, isTurn){ return _i(colors) * (isTurn ? 1 : 2); }

  /* ═══ מתהפך במוצר שטוח — חיסכון בלוחות, ורק כשיש זמן ═══
     כלל מבית-הדפוס (2026-07-31): אם הכמות-בגיליון מתחלקת ב-2 וחצי מהמוצרים
     נכנסים בחצי גיליון (למשל 12 בגיליון 70×100, ו-6 נכנסים ב-70×50) — אפשר
     להדפיס מתהפך ולחסוך חצי מהלוחות.
     ⚠️ תלוי בדחיפות: עבודה שיש לה עד 7 ימי-עבודה יכולה להיכנס מתהפך.
     עבודה מיידית נכנסת ל-8 צבעים (פרפקטור) — שם חייבים 8 לוחות ואין מתהפך. */
  var TURN_MAX_DAYS = 7;
  function turnEligible(opts){
    opts = opts || {};
    var up = _i(opts.up);
    if (up < 2 || up % 2 !== 0) return { ok: false, reason: 'ODD_UP',
      message: 'מתהפך אפשרי רק כשהכמות-בגיליון מתחלקת ב-2 (כאן ' + (up || 0) + ').' };
    if (opts.rush) return { ok: false, reason: 'RUSH',
      message: 'עבודה מיידית נכנסת ל-8 צבעים עם 8 לוחות — בלי מתהפך.' };
    var days = (opts.days == null) ? null : _i(opts.days);
    if (days != null && days > TURN_MAX_DAYS) return { ok: false, reason: 'TOO_LONG',
      message: 'מתהפך מתאים לעבודה שיש לה עד ' + TURN_MAX_DAYS + ' ימי-עבודה.' };
    if (opts.halfFits === false) return { ok: false, reason: 'HALF_NO_FIT',
      message: 'חצי מהמוצרים לא נכנסים בחצי גיליון — אי-אפשר מתהפך.' };
    return { ok: true, reason: '', halfUp: up / 2,
      message: 'אפשר מתהפך: ' + (up / 2) + ' בחצי גיליון → חצי מהלוחות.' };
  }

  /* כמה לוחות בפועל, לפי דחיפות/מתהפך.
     rush → פרפקטור 8 צבעים = 8 לוחות (קבוע, לא תלוי בבחירת-הצבעים). */
  function platesFor(opts){
    opts = opts || {};
    if (opts.rush) return { plates: 8, colors: 8, isTurn: false, rush: true,
      note: 'עבודה מיידית — 8 צבעים (פרפקטור), 8 לוחות' };
    var colors = _i(opts.colors) || 4;
    var isTurn = !!opts.isTurn;
    return { plates: plateCount(colors, isTurn), colors: colors, isTurn: isTurn, rush: false,
      note: isTurn ? ('מתהפך — ' + colors + ' לוחות (חצי)') : (colors + '×2 לוחות') };
  }

  /* משקל-נייר בק"ג לפי גיליונות (מידות ס"מ, משקל גר/מ"ר) */
  function paperKg(sheets, sheetW, sheetH, gram){
    return _i(sheets) * (_n(sheetW) * _n(sheetH) * _n(gram) / 10000000);
  }
  function paperCost(sheets, sheetW, sheetH, gram, tonPrice){
    return paperKg(sheets, sheetW, sheetH, gram) * _n(tonPrice) / 1000;
  }

  /* הצעה למוצר שטוח (פלאייר/פוסטר/פלייסמנט) — הנתיב שבו הטעות קרתה.
     מחזיר גם את מספר-הגיליונות, כדי שאפשר יהיה להראות אותו בהצעה ולבדוק. */
  function flatQuote(spec, tariff){
    spec = spec || {}; tariff = tariff || {};
    /* up חייב להיות מפורש — לא מנחשים אותו מהמידות (ראה maxUpGeometric).
       ניחוש כאן היה מייצר הצעה זולה מדי, וזו טעות שעולה כסף אמיתי. */
    var up = _i(spec.up);
    if (up <= 0) return { ok: false, need: 'up',
      message: 'כדי לתמחר צריך לדעת כמה יוצאים בגיליון. שאל את בית-הדפוס.',
      maxGeometric: maxUpGeometric(spec.prodW, spec.prodH, spec.sheetW, spec.sheetH) };
    var runs = _i(spec.runs) || 1;
    var net = netSheets(spec.qty, up);
    var sheets = net ? net + runs * _i(spec.wastePerRun != null ? spec.wastePerRun : tariff.wastePerRun) : 0;
    var plates = plateCount(spec.colors, !!spec.isTurn) * runs;
    var out = {
      up: up, netSheets: net, sheets: sheets, runs: runs,
      paper: paperCost(sheets, spec.sheetW, spec.sheetH, spec.gram, spec.tonPrice),
      print: printCostForRun(sheets, tariff, { isTurn: !!spec.isTurn }) * runs,
      plates: plates * _n(tariff.platePrice)
    };
    out.subtotal = out.paper + out.print + out.plates;
    return out;
  }

  /* שער-שפיות: האם ההדפסה חושבה על מוצרים במקום על גיליונות?
     מחזיר אזהרה כשמספר-האלפים שחויב גדול ממספר-הגיליונות בפועל. */
  function printSanity(billedThousands, sheets){
    var b = _i(billedThousands), s = _i(sheets);
    if (b <= 0 || s <= 0) return { ok: true, message: '' };
    var expected = Math.max(1, Math.ceil(s / 1000));
    if (b <= expected) return { ok: true, message: '' };
    return { ok: false, expected: expected,
      message: 'ההדפסה חושבה על ' + b + ' אלפים, אך במכונה עוברים רק ' + s.toLocaleString('he-IL')
             + ' גיליונות (' + expected + ' אלפים). ההדפסה מחושבת על גיליונות, לא על מספר המוצרים.' };
  }

  return { maxUpGeometric: maxUpGeometric, upPlausible: upPlausible,
           netSheets: netSheets, totalSheets: totalSheets,
           TURN_MAX_DAYS: TURN_MAX_DAYS, turnEligible: turnEligible, platesFor: platesFor,
           printCostForRun: printCostForRun, plateCount: plateCount,
           paperKg: paperKg, paperCost: paperCost, flatQuote: flatQuote,
           printSanity: printSanity };
});
