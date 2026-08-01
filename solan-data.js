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

window._fbGet = async path => {
  try {
    var t = await window._fbAuthToken();
    var ac = await window._appCheckToken();
    const r = await fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), ac ? { headers: { 'X-Firebase-AppCheck': ac } } : undefined);
    return r.ok ? r.json() : null;
  } catch(e) { return null; }
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
  if (!coll || coll === '_rev' || coll === 'customerProofs') return; // customerProofs נקרא תמיד (נכתב גם מדפי הלקוח)
  var doPut = function(t){
    window._appCheckToken().then(function(ac){
      var h = {'Content-Type':'application/json'}; if (ac) h['X-Firebase-AppCheck'] = ac;
      fetch(_FBURL + '/_rev/' + coll + '.json' + (t ? '?auth=' + t : ''), {
        method:'PUT', headers: h, body: String(Date.now())
      }).catch(function(){});
    });
  };
  if (tok) doPut(tok); else if (window._fbAuthToken) window._fbAuthToken().then(doPut); else doPut(null);
};
window._fbPut = async (path, data) => {
  if (!window._fbWriteGuard('PUT ' + path)) return false;             // הגנת סביבה — כשל אמיתי, בלי להעמיד פנים שנשמר
  try {
    var t = await window._fbAuthToken();
    var ac = await window._appCheckToken();
    var _h = {'Content-Type':'application/json'}; if (ac) _h['X-Firebase-AppCheck'] = ac;
    await fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), {
      method: 'PUT',
      headers: _h,
      body: JSON.stringify(data)
    });
    try { if (String(path).indexOf('_rev') !== 0) window._fbBumpRev(String(path).split('/')[0], t); } catch(e){}
    return true;
  } catch(e) { return false; }
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
  return window._fbAuthToken().then(function(t){
    return fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)
    }).then(function(r){ return r.ok; });
  }).catch(function(){ return false; });
}
function _fbGetRaw(path){
  return window._fbAuthToken().then(function(t){
    return fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : '')).then(function(r){ return r.ok ? r.json() : null; });
  }).catch(function(){ return null; });
}
// PATCH ממוקד — מעדכן שדות בודדים בצומת בלי לדרוס את השאר (למשל shopSeenAt על ריצה)
function _fbPatchRaw(path, obj){
  if (!window._fbWriteGuard('PATCH-RAW ' + path)) return Promise.resolve(false);   // הגנת סביבה
  return window._fbAuthToken().then(function(t){
    return fetch(_FBURL + '/' + path + '.json' + (t ? '?auth=' + t : ''), {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj)
    }).then(function(r){ return r.ok; });
  }).catch(function(){ return false; });
}
function _fbDelRaw(path){
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
