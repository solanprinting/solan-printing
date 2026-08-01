/* ═══════════════════════════════════════════════════════════════════════════
   solan-sync.js — מנגנון הסנכרון וההתמדה (חילוץ 2).

   ⚠️ הוצא מ-krtis-avoda.html ב**העברה מכנית בלבד**: אותו קוד,
   אותם שמות, אותה התנהגות. לא נוקה, לא שונו שמות, לא תוקנה
   לוגיקה ולא שונו זמני ה-setTimeout.

   ⚠️ נטען **אחרי** solan-data.js — הוא צורך ממנו את _fbGet · _fbPut ·
   _fbSnapshot · _fbBumpRev. תגית src קלאסית וחוסמת, בלי async/defer/module.

   ⚠️ _COLL_REF ו-_MAP_REF מחזיקים closures על גלובלים (cards · orders ·
   quotes · …) שמוצהרים ב-let **אחרי** הקובץ הזה, בבלוק הגדול.
   שני הסקריפטים חולקים מרחב לקסיקלי גלובלי אחד, ולכן קריאה **מאוחרת**
   תקינה לגמרי. אבל קריאה לפונקציית-דחיפה **בזמן הטעינה**, לפני שהבלוק
   הגדול הוצהר, תזרוק ReferenceError (TDZ). נבדק: אין קריאה כזו היום,
   וכל הקריאות מגיעות מ-persist() · מטיימרים · ומפעולות משתמש.

   ⚠️ persist() — נקודת-הכניסה של המסך — נשארה ב-krtis-avoda.html.
   ═══════════════════════════════════════════════════════════════════════════ */
/* ⚠️ tombstones — הועברו לכאן מ-krtis-avoda.html (חילוץ 3), כדי שהקובץ
   הזה לא יישען על הגדרה שיושבת ב-HTML ונטענת **אחריו**. זה מסיר
   את התלות המאוחרת ב-deletedIds וב-_filterDeleted בלבד; תלויות
   מאוחרות אחרות (cards · orders · updateBadge · _logActivity) נשארו.
   ⚠️ איחוד ה-tombstones מ-Firebase (_fbPollAll) **לא עבר** — הוא נשאר ב-HTML. */
// מזהים שנמחקו לצמיתות — מסונכרן ל-Firebase כדי שמחיקה לא "תחזור" ע"י מכשיר/טאב אחר
let deletedIds = JSON.parse(localStorage.getItem('solanDeletedIds') || '{}');
function _markDeleted(coll, id){
  if (!deletedIds[coll]) deletedIds[coll] = [];
  if (deletedIds[coll].indexOf(id) === -1) deletedIds[coll].push(id);
}
function _filterDeleted(coll, arr){
  var del = deletedIds[coll];
  if (!del || !del.length || !Array.isArray(arr)) return arr;
  return arr.filter(function(x){ return x && del.indexOf(x.id) === -1; });
}

// ========== STORAGE ==========
// ═══════════════════════════════════════════════════════════════════
// מיזוג כרטיסים חסין-דריסה — הלב של הסנכרון היציב
// ───────────────────────────────────────────────────────────────────
// כל כרטיס נושא חותמת _upd (זמן השינוי האחרון). בסנכרון (דחיפה ומשיכה)
// ממזגים לפי id: לכל כרטיס נשמרת הגרסה עם ה-_upd החדש ביותר. כרטיס שקיים
// רק בשרת נשמר; כרטיס שקיים רק מקומית נשמר רק אם נוצר/שונה לאחרונה (חדש
// שטרם נדחף) — אחרת הוא נחשב "נמחק במקום אחר" ולא מוחזר. מחיקות לצמיתות
// עוברות דרך tombstones (deletedIds) שתמיד מסננים. כך מכשיר עם נתונים
// ישנים לא יכול לדרוס: הוא לא יחזיר מחוקים ולא יהפוך "הושלם" ל"פעיל".
function _cardUpd(c){ return (c && (c._upd || c.id)) || 0; }
// השוואת-תוכן חסינת-סדר-מפתחות (עומק): Firebase מחזיר מפתחות ממויינים אלפביתית,
// בעוד כרטיס מקומי שמור בסדר-הכנסה. JSON.stringify תמים "מזהה שינוי" מדומה בין שתי
// הגרסאות (אותו תוכן, סדר שונה) → מטביע _upd=עכשיו שוב ושוב → כרטיסים ישנים "חוזרים"
// כמעודכנים היום ומציפים תצוגות. מיון עמוק פותר: תוכן זהה ⇒ מחרוזת זהה.
function _stableStr(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_stableStr).join(',') + ']';
  var ks = Object.keys(v).sort();
  return '{' + ks.map(function(k){ return JSON.stringify(k) + ':' + _stableStr(v[k]); }).join(',') + '}';
}
function _cardKeyJson(c){ var o={}; for (var k in c) if (k !== '_upd') o[k]=c[k]; return _stableStr(o); }
function _seedCardSnap(){
  window._cardJsonSnap = {};
  (cards||[]).forEach(function(c){ if (c && c.id != null) window._cardJsonSnap[String(c.id)] = _cardKeyJson(c); });
}
// מסמן _upd=עכשיו לכל כרטיס שתוכנו השתנה מאז ההצמדה האחרונה (זיהוי אוטומטי
// של כל שינוי, בלי צורך לגעת בכל מקום שמשנה כרטיס). קריאה ראשונה רק זורעת.
function _stampChangedCards(){
  if (!window._cardJsonSnap) { _seedCardSnap(); return; }
  var now = Date.now();
  (cards||[]).forEach(function(c){
    if (!c || c.id == null) return;
    var k = String(c.id), j = _cardKeyJson(c);
    if (window._cardJsonSnap[k] !== j) { c._upd = now; window._cardJsonSnap[k] = j; }
  });
}
// ── השלמה היא סופית ──────────────────────────────────────────────────────
// באג שחזר שוב ושוב: עבודות שהושלמו לפני ימים "חזרו" לקטגוריית גימורים. הסיבה היא
// שסטטוס יכול להיסוב אחורה בלי שאף אחד נגע בו — עותק ישן ממכשיר אחר (שעדיין ראה
// 'finishing') נגע בכרטיס מסיבה אחרת, קיבל _upd=עכשיו, וניצח במיזוג. לכן: כרטיס
// שהושלם (finishedAt/printedAt + status='done') מנצח גרסה שאינה-הושלמה, גם אם
// חותמת-הזמן שלה חדשה יותר — אלא אם הצד השני נפתח-מחדש במפורש (reopenedAt מאוחר
// מההשלמה), שזו פעולת-אדם מכוונת (ביטול "הודפס", גרירה בפס-הזרימה).
function _cardTs(v){ var t = v ? Date.parse(v) : 0; return isNaN(t) ? 0 : t; }
function _cardDoneAt(c){ return c ? Math.max(_cardTs(c.finishedAt), _cardTs(c.printedAt)) : 0; }
function _cardFinalized(c){ return !!(c && c.status === 'done' && _cardDoneAt(c) > 0); }
// מי מנצח בין שתי גרסאות של אותו כרטיס. מחזיר את הגרסה הנבחרת.
function _pickCardVersion(a, b){
  var fa = _cardFinalized(a), fb = _cardFinalized(b);
  if (fa !== fb){
    var fin = fa ? a : b, other = fa ? b : a;
    // פתיחה-מחדש מכוונת אחרי ההשלמה — מנצחת; אחרת ההשלמה עומדת בעינה.
    if (_cardTs(other.reopenedAt) > _cardDoneAt(fin)) return other;
    return fin;
  }
  return _cardUpd(a) > _cardUpd(b) ? a : b;   // תיקו → b (התנהגות המיזוג המקורית: השרת)
}
function _mergeCardArrays(server, local){
  var KEEP_LOCAL_MS = 12 * 3600 * 1000, now = Date.now(), byId = {};
  (server||[]).forEach(function(c){ if (c && c.id != null) byId[String(c.id)] = c; });
  (local||[]).forEach(function(c){
    if (!c || c.id == null) return;
    var k = String(c.id);
    if (byId[k]) { byId[k] = _pickCardVersion(c, byId[k]); }                  // החדש מנצח · השלמה סופית
    else if (_cardUpd(c) > now - KEEP_LOCAL_MS) byId[k] = c;                   // מקומי חדש בלבד
  });
  return _filterDeleted('cards', Object.keys(byId).map(function(k){ return byId[k]; }));
}
// ── מגן-מחיקה-המונית (2026-07-30) ─────────────────────────────────────────
// התקרית: כל הכרטיסים הפעילים נמחקו. השורש: _doPushCardsMerged קרא את השרת,
// הקריאה נכשלה (רשת/הרשאה) → _fbGet החזיר null → הקוד המיר את זה ל-[] ומיזג
// מולו. המיזוג שומר כרטיס מקומי-בלבד רק אם עודכן ב-12 השעות האחרונות ("חדש
// אמיתי") — אז מול "שרת ריק" שרדו רק 3 כרטיסים טריים, וה-PUT מחק את כל השאר.
// שני קווי הגנה:
//   1) null מהשרת = לא-ידוע (כשל או צומת ריק) — לעולם לא ממזגים מולו. מדלגים
//      על הדחיפה; היא תקרה בסבב הבא כשהקריאה תצליח. (מחיקות ממילא מסונכרנות
//      דרך deletedIds, אז דילוג לא מפיץ שום דבר שגוי.)
//   2) גם כשהקריאה הצליחה: אם התוצאה הממוזגת מפילה יותר מ-30% מכרטיסי-השרת
//      שאינם מסומנים כמחוקים — לא דוחפים. שינוי לגיטימי בהיקף כזה עובר תמיד
//      דרך tombstones, אז המגן לא חוסם אותו.
function _cardsWipeGuard(server, merged, tomb){
  var t = {}; (tomb||[]).forEach(function(id){ t[String(id)] = 1; });
  var inM = {}; (merged||[]).forEach(function(c){ if (c && c.id != null) inM[String(c.id)] = 1; });
  var dropped = (server||[]).filter(function(c){ return c && c.id != null && !inM[String(c.id)] && !t[String(c.id)]; });
  var n = (server||[]).length;
  if (n >= 10 && dropped.length > Math.max(4, Math.floor(n * 0.3))) return false;
  return true;
}
// דחיפת כרטיסים ממוזגת (מתוזמנת/מקובצת) — מביאה שרת, ממזגת, ודוחפת.
var _cardsPushTimer = null;
function _pushCardsMerged(){
  if (window._isMachineView || !window._fbGet || !window._fbPut) return;
  if (_cardsPushTimer) return;
  _cardsPushTimer = setTimeout(function(){ _cardsPushTimer = null; _doPushCardsMerged(); }, 350);
}
function _doPushCardsMerged(){
  _stampChangedCards();
  window._fbPendingPuts = window._fbPendingPuts || {};
  window._fbPendingPuts.cards = (window._fbPendingPuts.cards || 0) + 1;
  window._fbGet('cards').then(function(sv){
    // null = כשל-קריאה או צומת-ריק, אי אפשר להבחין — לא ממזגים מול "כלום" (זה מה
    // שמחק את כל הכרטיסים ב-2026-07-30). מדלגים; הדחיפה תקרה בסבב הבא.
    if (sv === null) { console.warn('[cards] קריאת-שרת נכשלה/ריקה — הדחיפה נדחתה'); return false; }
    var server = Array.isArray(sv) ? sv : (typeof sv === 'object' ? Object.values(sv) : []);
    var merged = _mergeCardArrays(server, cards);
    // מגן-מחיקה-המונית: הפלת כרטיסי-שרת רבים בלי tombstones = תקלה, לא עריכה
    if (!_cardsWipeGuard(server, merged, (deletedIds && deletedIds.cards) || [])) {
      console.error('[cards] המיזוג היה מוחק ' + server.length + '→' + merged.length + ' כרטיסים בלי tombstones — הדחיפה נחסמה');
      try { _logActivity('🛑', 'דחיפת-כרטיסים נחסמה (מגן-מחיקה): ' + server.length + '→' + merged.length, null); } catch(e){}
      return false;   // לא דוחפים ולא מאמצים — הסבב הרגיל של ה-poll יתיישר מול השרת
    }
    cards = merged;
    localStorage.setItem('solanCards', JSON.stringify(cards));
    _seedCardSnap();
    window._fbSnapshot.cards = JSON.stringify(cards);
    return window._fbPut('cards', cards);
  }).then(function(){
    window._fbPendingPuts.cards = Math.max(0, (window._fbPendingPuts.cards||1) - 1);
    if (typeof updateBadge === 'function') updateBadge();
    var vs = document.getElementById('view-saved');
    if (vs && vs.style.display !== 'none' && typeof renderCards === 'function') renderCards();
  }).catch(function(){ window._fbPendingPuts.cards = Math.max(0, (window._fbPendingPuts.cards||1) - 1); });
}

// ═══ מיזוג כללי לפי מזהה — הרחבת מנגנון הכרטיסים לאוספים הפעילים ═══
// פותר את משפחת הבאגים "מערך שלם דורס מערך שלם": שני מכשירים שעורכים בו-זמנית,
// או טאב ישן שדוחף נתון ישן. כל פריט נושא חותמת _upd; מיזוג שומר את החדש יותר.
// מחיקות מוגנות ב-tombstones (deletedIds) — כמו בכרטיסים.
// עיתונים/עלונים נוספו למיזוג-לפי-מזהה (2026-07-30): הם היו מסונכרנים כמערך-שלם, ולכן
// מכשיר עם רשימה ישנה דרס את כל הרשימה — כולל חותמות cardCreatedAt שמייצרות את הסימון
// הירוק ביומן השבועי. זו הסיבה שהסימונים "נמחקו" שוב ושוב. ראה _stampWeekDone.
var _MERGED_COLLS = ['orders','quotes','weeklyJobs','printFiles','deliveryNotes','futureJobs','newspapers','flyers'];
var _COLL_REF = {
  orders:        { get:function(){return orders;},        set:function(v){orders=v;},        ls:'solanOrders' },
  quotes:        { get:function(){return quotes;},        set:function(v){quotes=v;},        ls:'solanQuotes' },
  weeklyJobs:    { get:function(){return weeklyJobs;},    set:function(v){weeklyJobs=v;},    ls:'solanWeeklyJobs' },
  printFiles:    { get:function(){return printFiles;},    set:function(v){printFiles=v;},    ls:'solanPrintFiles' },
  deliveryNotes: { get:function(){return deliveryNotes;}, set:function(v){deliveryNotes=v;}, ls:'solanDeliveryNotes' },
  futureJobs:    { get:function(){return futureJobs;},    set:function(v){futureJobs=v;},    ls:'solanFutureJobs' },
  newspapers:    { get:function(){return newspapers;},    set:function(v){newspapers=v;},    ls:'solanNewspapers' },
  flyers:        { get:function(){return flyers;},        set:function(v){flyers=v;},        ls:'solanFlyers' }
};
window._arrSnap = window._arrSnap || {};
var _arrPushTimers = {};
function _unmarkDeleted(coll, id){
  if (deletedIds[coll]) {
    deletedIds[coll] = deletedIds[coll].filter(function(x){ return x !== id; });
    localStorage.setItem('solanDeletedIds', JSON.stringify(deletedIds));
    if (window._fbPut) window._fbPut('deletedIds', deletedIds);   // דחיפה מיידית — לפני שה-union ממכשיר אחר יחזיר
  }
}
function _itemKeyJson(it){ var c = Object.assign({}, it); delete c._upd; delete c._pend; return _stableStr(c); }   // חסין-סדר-מפתחות (ראה _cardKeyJson) — מונע _upd מדומה גם באוספים אלה
function _seedArrSnap(coll, arr){
  var m = {};
  (arr||[]).forEach(function(it){ if (it && it.id != null) m[String(it.id)] = _itemKeyJson(it); });
  window._arrSnap[coll] = m;
}
/* מטביע _upd=עכשיו על פריטים שתוכנם השתנה מאז הסנכרון האחרון (או שהם חדשים),
   ומסמן אותם _pend=1 = "טרם אושר בשרת". הסימון נשמר ב-localStorage יחד עם
   הפריט, ולכן שורד רענון/סגירת-דפדפן — וזה מה שמונע מפריט שהדחיפה שלו נכשלה
   להיעלם למחרת (ראה _mergeArrById). מנוקה רק אחרי PUT מוצלח. */
function _stampChangedArr(coll, arr){
  var snap = window._arrSnap[coll]; var now = Date.now();
  (arr||[]).forEach(function(it){
    if (!it || it.id == null) return;
    var j = _itemKeyJson(it);
    if (!snap || snap[String(it.id)] !== j) { it._upd = now; it._pend = 1; }
  });
}
/* מיזוג: בסיס=שרת; לכל מזהה נשמרת הגרסה עם _upd גבוה יותר.
   פריט מקומי-בלבד: נשמר אם *מעולם לא סונכרן* (אינו בתמונת-המצב _arrSnap → נוצר
   כאן ועדיין לא הגיע לשרת), או אם עודכן ב-12 השעות האחרונות.
   ⚠️ הקריטריון "מעולם לא סונכרן" נוסף ב-2026-07-30: קודם ההחלטה הסתמכה רק על
   _upd, ולכן עיתון חדש שהדחיפה שלו נכשלה נחשב "פריט ישן שנמחק במקום אחר" —
   ונעלם. מחיקה אמיתית ממילא מטופלת ע"י tombstones (_filterDeleted), ולכן
   העדפת-השמירה כאן בטוחה: השמטה = אובדן נתונים, שמירה = אפשר למחוק שוב. */
function _mergeArrById(server, local, coll){
  var FRESH = 12*3600*1000, now = Date.now();
  var out = [], seen = {}, localById = {};
  (local||[]).forEach(function(it){ if (it && it.id != null) localById[String(it.id)] = it; });
  (server||[]).forEach(function(s){
    if (!s) return;
    if (s.id == null) { out.push(s); return; }
    var id = String(s.id); seen[id] = 1;
    var l = localById[id];
    out.push(l && (l._upd||0) > (s._upd||0) ? l : s);
  });
  (local||[]).forEach(function(l){
    if (!l) return;
    if (l.id == null) {   // פריט ללא מזהה — שמור אם אין זהה בשרת
      var j = _itemKeyJson(l);
      if (!(server||[]).some(function(s){ return s && _itemKeyJson(s) === j; })) out.push(l);
      return;
    }
    if (seen[String(l.id)]) return;
    if (l._pend) { out.push(l); return; }                  // טרם אושר בשרת — לא משמיטים בשום מצב
    if ((l._upd||0) > now - FRESH) out.push(l);
  });
  return out;
}
function _pushArrMerged(coll){
  if (window._isMachineView || !window._fbGet || !window._fbPut) return;
  if (_arrPushTimers[coll]) return;
  _arrPushTimers[coll] = setTimeout(function(){ _arrPushTimers[coll] = null; _doPushArrMerged(coll); }, 350);
}
function _doPushArrMerged(coll){
  var ref = _COLL_REF[coll]; if (!ref) return;
  window._fbPendingPuts = window._fbPendingPuts || {};
  window._fbPendingPuts[coll] = (window._fbPendingPuts[coll]||0) + 1;
  window._fbGet(coll).then(function(sv){
    // אותו מגן כמו בכרטיסים: null = כשל-קריאה/צומת-ריק — לא ממזגים מול "כלום",
    // כי המיזוג משמיט פריטים מקומיים ישנים ("נמחקו במקום אחר") וה-PUT ימחק אותם.
    if (sv === null) { console.warn('[' + coll + '] קריאת-שרת נכשלה/ריקה — הדחיפה נדחתה'); return false; }
    var server = Array.isArray(sv) ? sv : (typeof sv === 'object' ? Object.values(sv) : []);
    var local = ref.get();
    _stampChangedArr(coll, local);
    var merged = _filterDeleted(coll, _mergeArrById(_filterDeleted(coll, server), local, coll));
    ref.set(merged);
    localStorage.setItem(ref.ls, JSON.stringify(merged));
    /* ⚠️ באג שתוקן (2026-07-30) — "עיתון שמוסיפים ונעלם שוב ושוב":
       כאן סומן "מסונכרן" (_seedArrSnap + _fbSnapshot) *לפני* שה-PUT הצליח. אם
       הדחיפה נכשלה (רשת/הרשאה/שומר-סביבה), המצב המקומי טען שהעיתון החדש כבר
       בשרת — ולכן בסבב הבא _stampChangedArr לא הטביע עליו _upd, המיזוג ראה
       פריט מקומי-בלבד ולא-טרי, והשמיט אותו. עם העיתון נעלמה גם חותמת
       cardCreatedAt — וזו הסיבה שגם הסימון הירוק ביומן השבועי "ירד".
       מעכשיו מסמנים כמסונכרן רק אחרי אישור מהשרת. */
    return Promise.resolve(window._fbPut(coll, merged)).then(function(okPut){
      if (okPut === false){ console.warn('[' + coll + '] הדחיפה נכשלה — לא מסמנים כמסונכרן'); return false; }
      merged.forEach(function(it){ if (it) delete it._pend; });   // אושר בשרת — אין יותר "ממתין"
      ref.set(merged);
      localStorage.setItem(ref.ls, JSON.stringify(merged));
      _seedArrSnap(coll, merged);
      window._fbSnapshot[coll] = JSON.stringify(merged);
      return true;
    });
  }).then(function(){ window._fbPendingPuts[coll] = Math.max(0, (window._fbPendingPuts[coll]||1) - 1); })
    .catch(function(){ window._fbPendingPuts[coll] = Math.max(0, (window._fbPendingPuts[coll]||1) - 1); });
}

// ═══ מיזוג מפה לפי מפתח (updatedAt) — כמו _pushArrMerged, לאוספים שהם אובייקט ═══
// מלאי-לקוחות נדחף עד כה כמפה שלמה (PUT): מכשיר עם נתון ישן דרס עדכון שנעשה במכשיר
// אחר (הטלפון) — ואז "המלאי לא מתעדכן במחשב". עכשיו: מביאים שרת, מאמצים כל רשומה
// שעדכנית ממנו, ורק אז דוחפים — כך ששני מכשירים לא מוחקים זה את זה. (2026-07-30)
var _mapPushTimers = {};
function _pushMapMerged(coll){
  if (window._isMachineView || !window._fbGet || !window._fbPut) return;
  if (_mapPushTimers[coll]) return;
  _mapPushTimers[coll] = setTimeout(function(){ _mapPushTimers[coll] = null; _doPushMapMerged(coll); }, 350);
}
var _MAP_REF = {
  customerStock: { get:function(){ return customerStock; }, set:function(v){ customerStock = v; }, ls:'solanCustomerStock' }
};
function _mergeMapByUpdatedAt(server, local){
  var out = {};
  Object.keys(server||{}).forEach(function(k){ out[k] = server[k]; });
  Object.keys(local||{}).forEach(function(k){
    var l = local[k], s = out[k];
    if (!s || (l && (l.updatedAt||0) >= (s.updatedAt||0))) out[k] = l;
  });
  return out;
}
function _doPushMapMerged(coll){
  var ref = _MAP_REF[coll]; if (!ref) return;
  window._fbPendingPuts = window._fbPendingPuts || {};
  window._fbPendingPuts[coll] = (window._fbPendingPuts[coll]||0) + 1;
  window._fbGet(coll).then(function(sv){
    // null = כשל-קריאה/צומת-ריק — מיזוג מול {} היה דוחף מקומי-בלבד ומוחק רשומות שרת
    if (sv === null) { console.warn('[' + coll + '] קריאת-שרת נכשלה/ריקה — הדחיפה נדחתה'); return false; }
    var server = (typeof sv === 'object') ? sv : {};
    var merged = _mergeMapByUpdatedAt(server, ref.get());
    ref.set(merged);
    try { localStorage.setItem(ref.ls, JSON.stringify(merged)); } catch(e){}
    window._fbSnapshot[coll] = JSON.stringify(merged);
    return window._fbPut(coll, merged);
  }).then(function(){ window._fbPendingPuts[coll] = Math.max(0, (window._fbPendingPuts[coll]||1) - 1); })
    .catch(function(){ window._fbPendingPuts[coll] = Math.max(0, (window._fbPendingPuts[coll]||1) - 1); });
}
