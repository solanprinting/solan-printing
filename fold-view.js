/* ═══════════ fold-view.js — סימולציית קריאה של עלון/חוברת ═══════════
   מקבל מספר עמודים (עמודי הקובץ = פאנלים בסדר קריאה) ומחזיר את שלבי
   הפתיחה: מה רואים כשהעלון סגור, אחרי פתיחה ראשונה, ובפתיחה מלאה.

   מוסכמה: `panels` תמיד בסדר *ויזואלי מימין לשמאל* (עברית RTL) —
   panels[0] הוא הפאנל הימני ביותר על המסך.

   • קיפולי גליל/אקורדיון: סדר הקריאה = סדר ימין→שמאל, ולכן panels = 1,2,3…
   • חוברת כרוכה: בכפולה פתוחה העמוד האי-זוגי יושב מימין (חוק-הברזל של
     חוברות עברית), ולכן הכפולה היא [3,2] ולא [2,3].

   זו סימולציית *קריאה* — לא אימפוזיציה של גיליון דפוס. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FoldView = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function _n(v){ v = parseInt(v, 10); return isFinite(v) && v > 0 ? v : 0; }

  /* מצבי-תצוגה אפשריים למספר העמודים שנתון. תמיד מוחזרים כולם, עם
     available/why — כדי שהממשק יוכל להציג מה לא מתאים ולמה. */
  function modes(pageCount){
    var n = _n(pageCount);
    var even = n >= 2 && n % 2 === 0;
    return [
      { id: 'flat', label: 'עמודים ברצף', desc: 'כל העמודים אחד אחרי השני, בלי קיפול',
        available: n >= 1, why: n >= 1 ? '' : 'אין עמודים' },
      { id: 'booklet', label: n === 4 ? 'עלון 4 עמודים (קיפול אחד)' : 'חוברת (כפולות קריאה)',
        desc: 'עטיפה, כפולות פנימיות, גב — עמוד אי-זוגי מימין',
        available: even && n >= 4, why: (even && n >= 4) ? '' : 'צריך מספר עמודים זוגי, 4 ומעלה' },
      { id: 'roll', label: 'קיפול מכתב (גליל)', desc: '3 פאנלים בכל צד, הפאנל הפנימי מתגלגל פנימה',
        available: n === 6, why: n === 6 ? '' : 'קיפול מכתב = 6 פאנלים בדיוק' },
      { id: 'zigzag', label: 'קיפול זיגזג (אקורדיון)', desc: 'צד קדמי פתוח, ואז הצד האחורי',
        available: even && n >= 4, why: (even && n >= 4) ? '' : 'צריך מספר עמודים זוגי, 4 ומעלה' }
    ];
  }

  function isAvailable(mode, pageCount){
    var m = modes(pageCount).filter(function (x){ return x.id === mode; })[0];
    return !!(m && m.available);
  }

  /* מצב ברירת-המחדל הטוב ביותר למספר העמודים */
  function defaultMode(pageCount){
    var n = _n(pageCount);
    if (n === 6) return 'roll';
    if (n >= 4 && n % 2 === 0) return 'booklet';
    return 'flat';
  }

  function _booklet(n){
    var steps = [{ label: 'עטיפה קדמית', panels: [1], face: 'outside' }];
    for (var p = 2; p + 1 <= n - 1; p += 2)
      steps.push({ label: 'כפולה ' + p + '–' + (p + 1), panels: [p + 1, p], face: 'inside' });
    steps.push({ label: 'עטיפה אחורית', panels: [n], face: 'outside' });
    return steps;
  }

  function _roll6(){
    return [
      { label: 'סגור — עטיפה', panels: [1], face: 'outside' },
      { label: 'פתיחה ראשונה', panels: [2, 3], face: 'inside' },
      { label: 'פתיחה מלאה', panels: [4, 5, 6], face: 'inside' }
    ];
  }

  function _zigzag(n){
    var half = n / 2, front = [], back = [], i;
    for (i = 1; i <= half; i++) front.push(i);
    for (i = half + 1; i <= n; i++) back.push(i);
    return [
      { label: 'סגור — עטיפה', panels: [1], face: 'outside' },
      { label: 'צד קדמי פתוח', panels: front, face: 'outside' },
      { label: 'צד אחורי', panels: back, face: 'inside' }
    ];
  }

  function _flat(n){
    var out = [];
    for (var i = 1; i <= n; i++) out.push({ label: 'עמוד ' + i, panels: [i], face: i % 2 ? 'outside' : 'inside' });
    return out;
  }

  /* שלבי הפתיחה. מחזיר {ok, mode, steps, note}. */
  function steps(opt){
    opt = opt || {};
    var n = _n(opt.pageCount), mode = opt.mode || defaultMode(n);
    if (!n) return { ok: false, why: 'אין עמודים', steps: [] };
    if (!isAvailable(mode, n)){
      var m = modes(n).filter(function (x){ return x.id === mode; })[0];
      return { ok: false, why: (m && m.why) || 'תצוגה לא מתאימה למספר העמודים', steps: [] };
    }
    var s = mode === 'booklet' ? _booklet(n)
          : mode === 'roll'    ? _roll6()
          : mode === 'zigzag'  ? _zigzag(n)
          : _flat(n);
    return { ok: true, mode: mode, steps: s, note: note(mode) };
  }

  function note(mode){
    if (mode === 'roll') return 'בקיפול מכתב הפאנל שמתגלגל פנימה מוקטן בפועל ב-1–2 מ״מ כדי שלא ייתקע בקיפול.';
    if (mode === 'booklet') return 'חוברת עברית: העמוד האי-זוגי תמיד מימין בכפולה פתוחה.';
    if (mode === 'zigzag') return 'באקורדיון כל הפאנלים ברוחב שווה; הצד האחורי נקרא אחרי שהופכים את העלון.';
    return '';
  }

  /* כל העמודים מופיעים בדיוק פעם אחת בכל התצוגות — בדיקת שפיות לממשק */
  function coversAllPages(res, pageCount){
    if (!res || !res.ok) return false;
    var seen = {}, n = _n(pageCount), k;
    res.steps.forEach(function (s){ s.panels.forEach(function (p){ seen[p] = (seen[p] || 0) + 1; }); });
    for (k = 1; k <= n; k++) if (!seen[k]) return false;
    return true;
  }

  /* פריסת רוחב לפאנלים בשלב — יחסי, סכום 1. */
  function panelWidths(step){
    var k = (step && step.panels || []).length;
    if (!k) return [];
    var out = [];
    for (var i = 0; i < k; i++) out.push(1 / k);
    return out;
  }

  return { modes: modes, isAvailable: isAvailable, defaultMode: defaultMode,
           steps: steps, note: note, coversAllPages: coversAllPages, panelWidths: panelWidths };
});
