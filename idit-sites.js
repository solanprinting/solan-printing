/* ═══════════════════════════════════════════════════════════════════════════
 * idit-sites.js — רשימת אתרי עידית (UMD · Node + דפדפן)
 * ───────────────────────────────────────────────────────────────────────────
 * מקור-אמת יחיד לשני המסכים: האפליקציה הראשית ומסך המשרד.
 * ⚠️ הרשימה ניתנת לעריכה באפליקציה ונשמרת ב-localStorage(`iditSites`);
 *    list() מחזיר את הגרסה הערוכה אם קיימת, אחרת את ברירת-המחדל שכאן.
 * בהזמנות של עידית מופיע *מספר אתר* בלבד — findSite מתרגם אותו לשם וכתובת.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolanIditSites = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var SITES = [{"name":"מכתשים 37 רמת חובב","num":"37(33700)","address":"שד דקל  רמת חובב","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"משה להב","role":"מנהל אתר","phone":"054-4401898"},{"name":"ורדית","role":"פקידה","phone":"08-6560861"}]},{"name":"מכתשים באר שבע","num":"36(33600)","address":"רח סעדיה מלל  3ב\"ש צפון","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"שמוליק","role":"מנהל אתר","phone":"054-5231285"},{"name":"","role":"משרד","phone":"073-2156794"}]},{"name":"דימונה","num":"29(22900)","address":"קמג דימונה","notes":"נדרש למלא טפסים אישור כניסה לדימונה ולברר מול כרמית שמות נהגים מאושרי כניסה","contacts":[{"name":"תומר","role":"מנהל","phone":"050-6244526"},{"name":"יגאל","role":"מחסנאי","phone":"052-8452669"},{"name":"כרמית","role":"פקידה","phone":"08-6567060"},{"name":"כרמית","role":"נייד","phone":"053-9290011"},{"name":"פקס","role":"","phone":"08-6568344"}]},{"name":"אלביט","num":"22(22222)","address":"רח המחשב 2 נתניה","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"","role":"משרד","phone":"09-8357362"},{"name":"אופיר דלאל","role":"מנהל אתר","phone":"054-3277915"},{"name":"מאיה","role":"פקידה","phone":"054-3228987"}]},{"name":"רוה\"מ איירפוט סיטי","num":"45-44500","address":"איירפורט סיטי","notes":"אין כניסת ספקים - תיאום מול מנהל האתר","contacts":[{"name":"ישראל","role":"מנהל אתר","phone":"055-6611373"},{"name":"דובי","role":"נהג","phone":"050-6316690"}]},{"name":"רפאל - מכון דוד (קריות)","num":"48-44800","address":"מול איזור תעשייה ביאליק כביש חיפה - עכו","notes":"נדרש אישור כניסה ומילוי טפסים שאלון רמה 6 רפאל + תיאום מול שלי","contacts":[{"name":"רועי דהאן","role":"מנהל אתר","phone":"050-2037029"},{"name":"עליזה","role":"פקידה","phone":"050-2037764"},{"name":"מירית","role":"","phone":"502037037"},{"name":"חן","role":"מנהל אתר","phone":"052-690-0450"},{"name":"משה","role":"מנהל מחסן - לליווים ובדיקת ספקים","phone":"054-5897712"},{"name":"נטלי","role":"פקידה","phone":"050-7829349"}]},{"name":"פוד קורד  רפאל מכון דויד","num":"98600","address":"","notes":"","contacts":[{"name":"משה","role":"מחסנאי","phone":"054-5897712"},{"name":"נטלי","role":"פקידה","phone":"050-7829349"}]},{"name":"רפאל - מכון לשם","num":"49-44900","address":"כביש 784 מול הישוב רקפת","notes":"","contacts":[{"name":"אייל","role":"מנהל אתר","phone":"052-2545154"},{"name":"חמי","role":"מנהל בתי קפה","phone":""},{"name":"אוריאל","role":"מחסנאי - לאישור הגעה, ליווי ובדיקת סחורות","phone":"054-8632458"},{"name":"נטלי","role":"פקידה","phone":"050-7829349"},{"name":"חנניה","role":"מנהל אתר","phone":"054-3228966"}]},{"name":"רפאל -הגבעה","num":"50-45000","address":"","notes":"","contacts":[{"name":"משה גבריאלוב","role":"מנהל אתר","phone":"054-3277917"}]},{"name":"רפאל - פלמחים","num":"51-45100","address":"בסיס פלמחים","notes":"נדרש אישור כניסה  + מילוי טפסים שאלון רמה 6 רפאל","contacts":[{"name":"חנניה","role":"מנהל אתר","phone":"054-3228966"},{"name":"משה גבריאלוב","role":"מנהל אתר","phone":"054-3277917"}]},{"name":"כ\"ד מתקן חיפה","num":"53-45300","address":"לוחמי הגטאות 7 חיפה","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"תמי","role":"מנהלת אתר","phone":"052-3888040"}]},{"name":"מתקן  כ\"ד רמת  השרון","num":"54-45400","address":"תעשייה צבאית  רמת השרון","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"ליזה","role":"מנהלת אתר","phone":"050-5580300"}]},{"name":"כ\"ד אשקלון","num":"52-45200","address":"ליד משטרת אשקלון","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"גולן","role":"מנהל אתר","phone":"050-9449271"}]},{"name":"נגב","num":"82-48200","address":"","notes":"","contacts":[{"name":"גולן","role":"מנהל אתר","phone":"050-9449271"}]},{"name":"נגבה","num":"61-46100","address":"","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"דורון","role":"מנהל אתר","phone":"052-8967016"},{"name":"משרד","role":"","phone":"076-802-4061"},{"name":"שי","role":"שף","phone":"054-3228983"}]},{"name":"רפאל- חג'ג'","num":"60(46000)","address":"","notes":"","contacts":[{"name":"ענת","role":"מנהלת אתר","phone":"054-3228941"}]},{"name":"תדיראן","num":"34-33400","address":"שד' יצחק רבין 34 קרית עקרון.","notes":"לא נדרש אישור כניסה","contacts":[{"name":"יסמין","role":"מנהלת אתר","phone":"050-6373417"}]},{"name":"ירושלים","num":"71-47100","address":"הרוזמרין, ירושלים","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"ירמי","role":"מנהל אתר","phone":"054-4555171"},{"name":"מיטל","role":"פקידה","phone":"054-8019725"}]},{"name":"כ\"ד בית ליד","num":"75-47500","address":"מחנה 21, בית ליד","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"אורי","role":"מחסנאי","phone":"055-8821955"},{"name":"","role":"","phone":"09-8946884"},{"name":"אריאל","role":"","phone":"054-3277931"}]},{"name":"כ\"ד תל אביב","num":"85-48500","address":"רח בן ישי, ליד מכללת רידמן ת\"א","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"דודו","role":"מנהל אתר","phone":"054-3228915"},{"name":"קאסיי","role":"מחסנאי","phone":"054-9285882"},{"name":"אתי","role":"פקידה","phone":"054-3726209"}]},{"name":"כ\"ד קיבוץ","num":"38-33800","address":"המכון המטראולוגי ראשון לציון","notes":"אישור כניסה -  להעביר לאישור שם נהג + ת.ז","contacts":[{"name":"לירן","role":"מנהל אתר","phone":"052-8728174"},{"name":"תמר","role":"פקידה","phone":"0504-403060"},{"name":"אבי מיכאלוב","role":"מנהל אתר","phone":"053-3033238"},{"name":"","role":"יוליה פקידה","phone":"050-9959722"}]},{"name":"כלמוביל","num":"31(43100)","address":"העמל 20 פארק תעשיות ראש העין","notes":"לא נדרש אישור כניסה","contacts":[{"name":"אנדריי","role":"מנהל אתר","phone":"0544-250015"}]},{"name":"גילת","num":"25(42500)","address":"יגיע כפיים 21 פתח תקווה","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"מיכאל","role":"מנהל אתר","phone":"054-8132979"}]},{"name":"אינטל ירושלים","num":"26(42600)","address":"המרפא  9 הר החוצבים ירושלים","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"קובי","role":"מנהל אתר","phone":"054-3228945"},{"name":"שירלי","role":"פקידה","phone":"054-4620913"}]},{"name":"אינטל ירושלים - מטבחונים","num":"27(42700)","address":"המרפא  9 הר החוצבים ירושלים","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"קובי","role":"מנהל אתר","phone":"054-3228945"},{"name":"אבי","role":"מנהל חדר אוכל","phone":"052-662-7223"}]},{"name":"אגן אדמה אשדוד","num":"24(42400)","address":"האשלג 5, אשדוד","notes":"לא נדרש  אישור כניסה מיוחד - יש צורך לעבור הדרכה בפעם הראשונה שמגיעים","contacts":[{"name":"יניב","role":"מנהל אתר","phone":"503502207"}]},{"name":"אינטל פ\"ת","num":"23(42300(","address":"החרוצים 7 פ\"ת","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"יוסי בן דוד","role":"מנהל אתר","phone":"050-7176611"}]},{"name":"אינטל פ\"ת מטבחונים","num":"28(42800)","address":"החרוצים 7 פ\"ת","notes":"לא נדרש  אישור כניסה מיוחד","contacts":[{"name":"יוסי בן דוד","role":"מנהל אתר","phone":"050-7176611"},{"name":"יוסי בן דוד","role":"יוסי נייד נוסף","phone":"052-8973764"},{"name":"גיל סידלסקי","role":"מחסנאי","phone":"054-9252208"}]}];

  // הרשימה הפעילה — כולל עריכות שנשמרו באפליקציה
  function list() {
    try {
      var s = (typeof localStorage !== 'undefined') && localStorage.getItem('iditSites');
      if (s) { var a = JSON.parse(s); if (a && a.length) return a; }
    } catch (e) {}
    return SITES;
  }

  /* איתור אתר לפי מספר שחולץ מההזמנה. שדה num נראה כמו "37(33700)" או "45-44500",
     ולכן משווים מול *כל* מקטע ספרות, ורק אחר-כך מול המספר שבתחילת השדה. */
  function findSite(raw, sites) {
    var want = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
    var arr = sites || list();
    if (!want || !arr || !arr.length) return null;
    for (var i = 0; i < arr.length; i++) {
      var parts = String(arr[i].num || '').split(/[^0-9]+/).filter(Boolean);
      if (parts.indexOf(want) !== -1) return arr[i];
    }
    for (var j = 0; j < arr.length; j++) {
      var m = String(arr[j].num || '').match(/^s*([0-9]+)/);
      if (m && m[1] === want) return arr[j];
    }
    return null;
  }

  // תיאור קצר לשורת-הזמנה: "61 · נגבה — כתובת"
  function siteLabel(site) {
    if (!site) return '';
    return [site.num, site.name].filter(Boolean).join(' · ') + (site.address ? (' — ' + site.address) : '');
  }

  /* אנשי-הקשר של האתר כטקסט קריא: "רועי דהאן (מנהל אתר) 050-2037029 · עליזה (פקידה) …"
     מאפשר למשרד לראות מי מקבל את המשלוח בלי לחפש בקובץ. */
  function siteContactsText(site, max) {
    var cs = (site && site.contacts) || [];
    var lim = (max == null) ? 6 : max;
    var out = [];
    for (var i = 0; i < cs.length && out.length < lim; i++) {
      var c = cs[i] || {};
      var nm = String(c.name || '').trim(), role = String(c.role || '').trim(), ph = String(c.phone || '').trim();
      if (!nm && !ph) continue;
      out.push((nm || 'איש קשר') + (role ? (' (' + role + ')') : '') + (ph ? (' ' + ph) : ''));
    }
    return out.join(' · ');
  }

  /* כל מה שהמשרד צריך לדעת על יעד-האספקה: מקום · דרישות-כניסה · אנשי-קשר.
     מוחזר כטקסט אחד לשדה-ההערה של ההזמנה. */
  function siteDetailsText(site) {
    if (!site) return '';
    var parts = [];
    if (site.name) parts.push('📍 ' + site.name + (site.num ? (' (' + site.num + ')') : ''));
    if (site.address) parts.push(site.address);
    if (site.notes) parts.push('⚠️ ' + site.notes);
    var cc = siteContactsText(site);
    if (cc) parts.push('☎ ' + cc);
    return parts.join(' · ');
  }

  return { SITES: SITES, list: list, findSite: findSite, siteLabel: siteLabel,
           siteContactsText: siteContactsText, siteDetailsText: siteDetailsText };
});
