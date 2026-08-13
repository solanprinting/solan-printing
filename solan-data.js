/* ═══════════════════════════════════════════════════════════════════════════
   solan-data.js — שכבת הגישה ל-Firebase.

   ⚠️ הוצא מ-krtis-avoda.html (בלוק <script> #3, שורות 1625–1787)
   ב**העברה מכנית בלבד**: אותן קוד, אותם שמות, אותה התנהגות.
   לא נוסף API, לא שונו נתיבים, לא נוסף orgId, ולא נוקה דבר.
   הניקוי וה-API יגיעו ב-commit נפרד ובאישור נפרד.

   ⚠️ הקובץ נטען בתגית <script src> חוסמת — בלי async, בלי defer
   ובלי type="module" — ולפני הבלוק הגדול. 279 מקומות-קריאה במסך
   מסתמכים על מה שמוגדר כאן, וטעינה לא-חוסמת היתה מפילה את כולם בבת-אחת.

   ⚠️ `_FBURL` ו-`_FB_APIKEY` נשארו `const` ברמת-על, בלי alias על window:
   הצהרת top-level בסקריפט קלאסי נכנסת למרחב הלקסיקלי הגלובלי
   המשותף, ולכן הבלוקים שאחרי רואים אותה כמו קודם. הוספת alias
   היתה שם שני לאותו ערך — וזה כבר לא העברה מכנית.
   ═══════════════════════════════════════════════════════════════════════════ */
// ── Firebase REST API (ללא SDK) ──────────────────────────────
const _FBURL = 'https://solan-printing-default-rtdb.europe-west1.firebasedatabase.app';

// ══════ מנגנון סביבה מרכזי — production / development / test ══════════════════════
// מטרה: פתיחה מקומית (פיתוח) לא יכולה לכתוב בטעות ל-Firebase החי. production מזוהה
// אך ורק מהדומיין הרשמי; כל דבר אחר = development. test = מאולץ ע"י harness הבדיקות.
// ⚠️ בפרודקשן השומר תמיד מאשר → אפס שינוי בהתנהגות; החסימה חלה רק ב-dev/test.
window._solanEnv = (function(){
  try {
    if (typeof window._SOLAN_ENV_FORCE === 'string') return window._SOLAN_ENV_FORCE;   // override לבדיקות
    var h = (typeof location !== 'undefined' && location.hostname || '').toLowerCase();
    return (h === 'solanprinting.github.io') ? 'production' : 'development';            // production = הדומיין הרשמי בלבד
  } catch(e){ return 'development'; }                                                    // ספק? שמרני = לא-פרודקשן
})();
window._solanEnvNow  = function(){ return (typeof window._SOLAN_ENV_FORCE === 'string') ? window._SOLAN_ENV_FORCE : window._solanEnv; };
window._solanIsProd  = function(){ return window._solanEnvNow() === 'production'; };
// כתיבה ל-Firebase החי מותרת רק ב-production. ב-development נדרש אישור מפורש של המפתח.
window._solanWritesAllowed = function(){
  var e = window._solanEnvNow();
  if (e === 'production')  return true;
  if (e === 'development') return window._SOLAN_ALLOW_DEV_WRITES === true;   // מפתח מאשר ידנית לצורך ניסוי
  return false;                                                             // test — לעולם לא
};
// שומר כתיבה מרכזי — מוחזר false ⇒ הקורא רואה כשל אמיתי (בלי להעמיד פנים שנשמר בענן)
window._fbWriteGuard = function(op){
  if (window._solanWritesAllowed()) return true;
  try { console.warn('⛔ [SOLAN ' + window._solanEnvNow().toUpperCase() + '] כתיבה ל-Firebase נחסמה (הגנת סביבה): ' + op +
    '\n   לאישור זמני בפיתוח בלבד: window._SOLAN_ALLOW_DEV_WRITES = true'); } catch(e){}
  try { window._solanDevBanner && window._solanDevBanner(); } catch(e){}
  return false;
};
// באנר-פיתוח קבוע (מופיע רק כשלא בפרודקשן) — כדי שהמפתח תמיד יידע שהוא לא על החי
window._solanDevBanner = function(){
  if (window._solanIsProd()) return;
  if (document.getElementById('solan-dev-banner')) return;
  try {
    var b = document.createElement('div'); b.id = 'solan-dev-banner';
    b.textContent = '🛠️ סביבת ' + window._solanEnvNow().toUpperCase() + ' — כתיבה ל-Firebase חסומה (הגנה מפני דריסת ייצור)';
    b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483000;background:#b45309;color:#fff;font:700 12px Heebo,Arial;padding:5px 12px;text-align:center;direction:rtl;box-shadow:0 -2px 8px rgba(0,0,0,.3);pointer-events:none';
    (document.body || document.documentElement).appendChild(b);
  } catch(e){}
};
try { if (typeof document !== 'undefined') { if (document.readyState !== 'loading') window._solanDevBanner(); else document.addEventListener('DOMContentLoaded', window._solanDevBanner); } } catch(e){}

// ── האסימון מגיע מהשומר (B+3) ─────────────────────────────────────────
// כאן ישבה ההזדהות האנונימית של מסך-העבודה. עכשיו auth-guard.js הוא המקור
// היחיד: כשיש משתמש מחובר מוחזר האסימון **שלו** (וכל קריאה קיימת נושאת
// מעכשיו זהות אמיתית), ורק במצב-תצפית בלי משתמש נופלים לאנונימי — במקום
// אחד בקוד, כדי שמחיקתו ב-B+4 תהיה שורה אחת ולא ציד בשישה קבצים.
//
// ⚠️ בלי נפילה-לאחור מקומית: אם השומר לא נטען זו תקלת-פריסה, והיא חייבת
// להישמע. שתי מערכות-אסימון במקביל = שני משתמשים שונים לאותו אדם.
// ⚠️ החתימה נשמרה (Promise<string|null>) — 17 מקומות-קריאה לא נגעו.
// ⚠️ ה-PIN הישן עדיין כאן, ובכוונה: הוא כבר **אינו** גבול-האבטחה אלא בחירת
//    זהות בתוך האפליקציה. הסרתו וקשירת solanUsers לחשבון-המייל הן B+3.2.
const _FB_APIKEY = 'AIzaSyAFp99furP4L5hqTI-horBHmGZC9s13dGg';
window._fbAuthToken = function(){
  if (!window.SolanGuard) return Promise.reject(new Error('auth-guard.js לא נטען — אין מקור לאסימון'));
  return window.SolanGuard.token(false);
};
// חימום מוקדם. ⚠️ עם catch: באכיפה בלי משתמש הדחייה מכוונת והדף ממילא בדרך
// למסך-ההתחברות — דחייה לא-מטופלת רק הייתה מרעישה בקונסולה.
try { window._fbAuthToken().catch(function(){}); } catch(e){}

// ── App Check (reCAPTCHA v3) — מוודא שרק האפליקציה האמיתית ניגשת ל-Firebase ──
// מצרף header "X-Firebase-AppCheck" לכל בקשה. עד שנאכוף בקונסולה זה במצב ניטור בלבד:
// אם ה-SDK/רשת נכשלים — הטוקן פשוט לא מצורף, ושום דבר לא נחסם. site key ריק = כבוי לגמרי.
const _APPCHECK_SITEKEY = '6LeYDVMtAAAAAAsc-qvVPz9QvLhIlDBfcYCl-pXI';
window._appCheckReady = null;
window._appCheckInit = function(){
  if (!_APPCHECK_SITEKEY) return Promise.resolve(null);
  if (window._appCheckReady) return window._appCheckReady;
  window._appCheckReady = new Promise(function(resolve){
    function load(src){ return new Promise(function(res, rej){
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }); }
    var base = 'https://www.gstatic.com/firebasejs/10.12.5/';
    load(base + 'firebase-app-compat.js')
      .then(function(){ return load(base + 'firebase-app-check-compat.js'); })
      .then(function(){
        try {
          if (!firebase.apps.length) firebase.initializeApp({
            apiKey: _FB_APIKEY,
            authDomain: 'solan-printing.firebaseapp.com',
            projectId: 'solan-printing',
            databaseURL: _FBURL,
            appId: '1:1094826649317:web:bd5f5efdc1f8e3ab67160c'
          });
          var ac = firebase.appCheck();
          ac.activate(new firebase.appCheck.ReCaptchaV3Provider(_APPCHECK_SITEKEY), true);
          resolve(ac);
        } catch(e){ resolve(null); }
      })
      .catch(function(){ resolve(null); });
  });
  return window._appCheckReady;
};
window._appCheckToken = function(){
  if (!_APPCHECK_SITEKEY) return Promise.resolve(null);
  return window._appCheckInit().then(function(ac){
    if (!ac) return null;
    // לא נתקעים: אם reCAPTCHA איטי/נכשל — מחזיר null אחרי 8ש' (במצב ניטור זה לא חוסם כלום)
    return Promise.race([
      ac.getToken(false).then(function(r){ return (r && r.token) || null; }).catch(function(){ return null; }),
      new Promise(function(res){ setTimeout(function(){ res(null); }, 8000); })
    ]);
  }).catch(function(){ return null; });
};
try { window._appCheckToken(); } catch(e){}   // חימום — טוען SDK ומייצר טוקן ראשון מוקדם

/* ── שער-התפקיד ───────────────────────────────────────────────────────────
   ⚠️ נקודה אחת ולא 279: כל קריאה וכתיבה במסך עוברות ב-_fbGet/_fbPut, ולכן
   רשימת-ההיתר של תפקיד המשרד נאכפת כאן. פיזור הבדיקה בין הקוראים היה
   מבטיח שהקורא ה-280 יישכח.

   ⚠️ **דילוג ולא try/catch**: קריאה לצומת חסום מחזירה 403, ו-403 בתוך
   ‎_fbPollAll‎ נבלע ב-try — כלומר בדיוק תבנית הכשל-השקט שחזרה כאן שלוש
   פעמים. מדלגים מראש, ומחזירים null כמו "אין נתון" — מצב שכל הקוראים
   כבר יודעים לטפל בו.

   ⚠️ זו **נוחות ולא גבול-אבטחה.** הגבול הוא חוקי ה-RTDB. מי שיעקוף את
   השורות האלה בקונסולה יקבל 403 מהשרת.

   ⚠️ הצומת הוא המקטע הראשון בנתיב: 'weekMarks/ג' שייך ל-weekMarks. */
window._officeClaims = window._officeClaims || null;      // נקבע ע"י auth-guard/המסך
window._officeMayLoad = function (path) {
  var OC = window.OfficeCards;
  if (!OC || !OC.isOffice(window._officeClaims)) return true;
  return OC.mayLoad(window._officeClaims, String(path || '').split('/')[0]);
};
/* ── צמתים שפתוחים למנהל בלבד ────────────────────────────────────────────
   ⚠️ **מראה של סעיף 5 ב-build-transition-rules.js**, ולא רשימה עצמאית.
   סנטינל ב-staff-link-tests משווה את השתיים — רשימה שתיסחף תחזיר בדיוק
   את הבאג שהיא נולדה למנוע.

   ⚠️ למה זה קיים: ‏persist() דוחף ~20 אוספים בכל שמירה. עובד שאינו מנהל
   נדחה משלושה מהם ב-401 **בצדק**, אבל ‏solan-persist גוזר את חיווי-החיבור
   מ-‏Promise.all של כל הדחיפות — ולכן כל שמירה הסתיימה ב"🔴 מנותק" בזמן
   שהחיבור תקין לחלוטין. נמדד אצל קדם-דפוס 12/08/2026 (‏documentPrices ·
   quotes · deliveryNotes, כולם 401). דחיית-הרשאה אינה ניתוק.

   ⚠️ **נכשל פתוח כשהתפקיד אינו ידוע** (הרצה מקומית, מסך בלי שומר):
   ‏claims=null מתנהג בדיוק כמו קודם. השרת הוא שאוכף; זה חוסך בקשה
   שידוע מראש שתידחה, ולא מחליף את החוקים. */
window._ADMIN_ONLY_COLLS = ['quotes', 'quotePricing', 'documentPrices',
  'inventory', 'inventoryDeductions', 'inventoryHistory', 'inventoryPress',
  'invoiceLogs', 'deliveryNotes', 'managerTasks', 'solanUsers', 'backupMeta',
  'accountingEmail', 'config'];

window._roleOf = function () {
  var c = window._officeClaims;
  return (c && c.accountType === 'staff' && c.role) ? String(c.role) : null;
};
/* עובד-מזוהה-שאינו-מנהל אינו נוגע בגוש-המנהל. */
window._adminOnlyBlocked = function (path) {
  var role = window._roleOf();
  if (!role || role === 'admin') return false;          // לא ידוע / מנהל — כמו קודם
  return window._ADMIN_ONLY_COLLS.indexOf(String(path || '').split('/')[0]) >= 0;
};

window._officeMayWrite = function (path) {
  if (window._adminOnlyBlocked(path)) return false;
  var OC = window.OfficeCards;
  if (!OC || !OC.isOffice(window._officeClaims)) return true;
  return OC.mayWriteDirect(window._officeClaims, String(path || '').split('/')[0]);
};

window._fbGet = async path => {
  if (!window._officeMayLoad(path)) return null;      // לא בתחום התפקיד — לא מנסים
  try {
    var t = await window._fbAuthToken();
    var ac = await window._appCheckToken();
    const r = await fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), ac ? { headers: { 'X-Firebase-AppCheck': ac } } : undefined);
    return r.ok ? r.json() : null;
  } catch(e) { return null; }
};
/* ⚠️ _fbGet מחזירה null גם על צומת ריק-ותקין וגם על כשל HTTP או חריגה,
   ואי-אפשר להבחין ביניהם. זה בסדר לרוב הקוראים — הם ממילא ממזגים —
   אבל קורא שצריך לדעת "נכשל או פשוט ריק" יקבל אזהרת-שווא על צומת שעדיין
   לא נוצר. הסמנטיקה הישנה **לא משתנה**; זה עוזר נוסף לצדה.

   מחזיר { ok, value, status }: ok=false רק על כשל אמיתי. */
window._fbGetChecked = async path => {
  if (!window._officeMayLoad(path)) return { ok: true, value: null, status: 0 };   // שער-התפקיד
  try {
    var t = await window._fbAuthToken();
    var ac = await window._appCheckToken();
    const r = await fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''),
                          ac ? { headers: { 'X-Firebase-AppCheck': ac } } : undefined);
    if (!r.ok) return { ok: false, value: null, status: r.status };
    return { ok: true, value: await r.json(), status: r.status };
  } catch (e) { return { ok: false, value: null, status: 0 }; }
};

// ── "שער גרסה" לצמצום תעבורת הורדה (Downloads) ───────────────────────
// כל כתיבה מעדכנת חותמת-זמן זעירה תחת _rev/<collection>. ה-poll מושך רק את
// _rev (כמה מאות בייטים) ומוריד collection שלם רק אם החותמת שלו השתנתה —
// חוסך ~90% מהתעבורה כשכלום לא משתנה.
window._lastRev   = window._lastRev   || {};   // ה-rev שאומץ לאחרונה לכל collection
window._revSynced = window._revSynced || {};   // collection שכבר נמשך לפחות פעם אחת בסשן
window._pollRev   = window._pollRev   || {};   // snapshot של _rev בסבב ה-poll הנוכחי
window._fbBumpRev = function(coll, tok){
  if (!window._fbWriteGuard('BUMP-REV ' + coll)) return;               // הגנת סביבה — לא כותבים ל-Firebase החי בפיתוח
  if (!window._officeMayWrite(coll)) return;                           // שער-התפקיד — ראה _officeMayWrite
  if (!coll || coll === '_rev' || coll === 'customerProofs') return; // customerProofs נקרא תמיד (נכתב גם מדפי הלקוח)
  var doPut = function(t){
    window._appCheckToken().then(function(ac){
      var h = {'Content-Type':'application/json'}; if (ac) h['X-Firebase-AppCheck'] = ac;
      /* ⚠️ 07/08/2026 — הכשל כאן היה בלוע פעמיים (בלי r.ok, ועם catch ריק).
         חותמת-גרסה שלא זזה = הכתיבה עברה אך מכשירים אחרים לא ימשכו אותה,
         כלומר "שמרתי ובמסך-הדפוס זה לא מופיע". לא מציגים למשתמש — הכתיבה
         עצמה כן הצליחה — אבל חייב להיות עקבה ב-console. */
      fetch(_FBURL + '/_rev/' + coll + '.json' + (t ? '?auth=' + t : ''), {
        method:'PUT', headers: h, body: String(Date.now())
      }).then(function(r){
        if (!r.ok) console.error('_fbBumpRev נכשל:', coll, r.status, r.statusText);
      }).catch(function(e){ console.error('_fbBumpRev נכשל:', coll, e); });
    });
  };
  if (tok) doPut(tok); else if (window._fbAuthToken) window._fbAuthToken().then(doPut); else doPut(null);
};
window._fbPut = async (path, data) => {
  if (!window._fbWriteGuard('PUT ' + path)) return false;             // הגנת סביבה — כשל אמיתי, בלי להעמיד פנים שנשמר
  /* ⚠️ תפקיד המשרד אינו כותב ל-RTDB בכלל — גם לא לצמתים שהוא קורא.
     הצומת cards נכתב כמערך שלם, ולכן הרשאת-כתיבה עליו היא גם הרשאה
     למחוק את כולו. מסלול-הכתיבה שלו הוא officeCreateCard/officeUpdateCard.
     ⚠️ מחזיר false ולא "מצליח בשקט" — כשל שנראה כהצלחה הוא הבאג. */
  if (!window._officeMayWrite(path)) return false;
  try {
    var t = await window._fbAuthToken();
    var ac = await window._appCheckToken();
    var _h = {'Content-Type':'application/json'}; if (ac) _h['X-Firebase-AppCheck'] = ac;
    /* ⚠️ 07/08/2026 — התגובה נבדקת. עד לתאריך הזה היא לא נקשרה למשתנה כלל,
       ולכן 400/401/403/413/500 כולם חזרו כ-true. ‏Firebase מחזיר דחיית-הרשאה
       כתגובת-HTTP תקינה ולא כחריגה, ולכן try/catch לבדו אינו תופס אותה —
       והפונקציה סתרה את ההערה שמעליה. ארבעה מגני "if (ok === false)" בקוד
       הקורא (ניקוי-צנרת, ארכוב-אוטומטי, מיזוג-כרטיסים) היו קוד-מת בגללה. */
    var r = await fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), {
      method: 'PUT',
      headers: _h,
      body: JSON.stringify(data)
    });
    if (!r.ok) { console.error('_fbPut נכשל:', path, r.status, r.statusText); return false; }
    try { if (String(path).indexOf('_rev') !== 0) window._fbBumpRev(String(path).split('/')[0], t); } catch(e){}
    return true;
  } catch(e) { console.error('_fbPut נכשל:', path, e); return false; }
};
/* ⚠️ הועברו לכאן מ-krtis-avoda.html (חילוץ 6A) — העברה מכנית בלבד.
   אלה פונקציות גישה ל-Firebase, ולכן מקומן כאן ולא בשכבת ה-AI:
   _fbPatchRaw נקראת גם מ-_uaAck (שמירת shopSeenAt תחת customerProofs),
   ואישור "ראיתי" של פרופר-לקוח אינו אמור להיות תלוי בקובץ AI.
   ההערה המקורית שמורה מטה כלשונה. */
// ── עוזרי Firebase גולמיים לנתיב הענן (בלי מנגנון ה-rev) ──────────────
// ⚠️ _fbPutRaw / _fbGetRaw / _fbDelRaw — כתיבה/קריאה "גולמית" שעוקפת בכוונה את שער-הגרסה (_rev).
//    קיימות אך ורק ל-aiRelay (בקשות AI שלא צריכות פולינג ולא צריכות ש-collection יימשך מחדש).
//    ❌ אין להשתמש בהן לאוספים רגילים (cards/orders/...) — כתיבה בלי _rev = מכשירים אחרים לא ימשכו את השינוי.
function _fbPutRaw(path, data){
  if (!window._fbWriteGuard('PUT-RAW ' + path)) return Promise.resolve(false);   // הגנת סביבה
  if (!window._officeMayWrite(path)) return Promise.resolve(false);              // שער-התפקיד
  return window._fbAuthToken().then(function(t){
    return fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(function(r){ return r.ok; });
  }).catch(function(){ return false; });
}
function _fbGetRaw(path){
  if (!window._officeMayLoad(path)) return Promise.resolve(null);                  // שער-התפקיד
  return window._fbAuthToken().then(function(t){
    return fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : '')).then(function(r){ return r.ok ? r.json() : null; });
  }).catch(function(){ return null; });
}
// PATCH ממוקד — מעדכן שדות בודדים בצומת בלי לדרוס את השאר (למשל shopSeenAt על ריצה)
function _fbPatchRaw(path, obj){
  if (!window._officeMayWrite(path)) return Promise.resolve(false);              // שער-התפקיד
  if (!window._fbWriteGuard('PATCH-RAW ' + path)) return Promise.resolve(false);   // הגנת סביבה
  return window._fbAuthToken().then(function(t){
    return fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj)
    }).then(function(r){ return r.ok; });
  }).catch(function(){ return false; });
}
function _fbDelRaw(path){
  if (!window._officeMayWrite(path)) return Promise.resolve(false);              // שער-התפקיד
  if (!window._fbWriteGuard('DEL-RAW ' + path)) return Promise.resolve();   // הגנת סביבה
  return window._fbAuthToken().then(function(t){
    return fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), { method:'DELETE' }).catch(function(){});
  }).catch(function(){});
}
window._fbInit = () => true;
// תמונת-מצב אחרונה ידועה של כל collection כפי שהתקבלה מהשרת (poll) או נשלחה אליו (push).
// משמש כדי שלא נדרוס את השרת עם נתון מקומי "תקוע" (לדוגמה: כרטיס שנפתח בלשונית B
// ולא נגעו בו, אבל לשונית A מחקה פריט ממנו בינתיים) — דוחפים collection לשרת רק אם
// הוא השתנה אצלנו באמת מאז הסנכרון האחרון, לא בכל persist().
window._fbSnapshot = {};
