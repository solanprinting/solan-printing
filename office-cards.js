/* ═══════════════════════════════════════════════════════════════════════════
   office-cards.js — צד-הלקוח של תפקיד המשרד.

   שלושה דברים, ולא יותר:
     1. האם המשתמש הנוכחי הוא office (לפי ה-claims, ותו לא).
     2. אילו אוספים מותר בכלל לנסות למשוך — רשימת-היתר, לא רשימת-איסור.
     3. לאן הולכת שמירת-כרטיס: פונקציה שרתית ל-office, המסלול הקיים לכל
        השאר.

   ⚠️ זו **נוחות ולא גבול-אבטחה.** הגבול הוא חוקי ה-RTDB ושכבת ה-Functions.
   הקובץ הזה קיים כדי שמשתמש office לא יראה מסך מלא ב-403 ולא ילחץ על
   כפתור שייכשל — ולא כדי למנוע ממנו משהו. מי שיעקוף אותו בקונסולה יגיע
   בדיוק לאותם חוקים.

   ⚠️ למה לא לנסות ולתפוס 403: קריאה חסומה מחזירה שגיאה, ושגיאה בתוך
   ‎_fbPollAll‎ נבלעת ב-try — כלומר בדיוק תבנית הכשל-השקט. מדלגים **מראש**.

   ⚠️ הכרעה לפי claims בלבד. אף פרמטר בכתובת אינו משתתף — פרמטר הוא דבר
   שהמשתמש כותב, ו"מצב מנהל לפי ?role=admin" הוא שער שנפתח בהקלדה.

   הרצת הבדיקות: node office-cards-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var ROLE = 'office';

  /* ── רשימת-ההיתר של האוספים ─────────────────────────────────────────────
     ⚠️ נגזרה ממה שהמסך המותר ל-office באמת צריך: טופס-הכרטיס ותצוגת
     היומן השבועי. **לא** ממה ש-_fbPollAll מושך היום — המסך אחד לכל
     התפקידים, ולכן הרשימה שלו היא רשימת-הצרכים של המנהל.

       cards           — הרשימה עצמה
       customers       — השלמה-אוטומטית של שם-לקוח בכרטיס משולב
       newspapers ·
       flyers ·
       weeklyJobs ·
       weekMarks       — ארבעת מקורות היומן השבועי (renderWeek)
       productMemory ·
       sheetSizeMemory — הצעות בזמן בניית כרטיס
       deletedIds      — מצבות; בלעדיהן כרטיס שנמחק "קם לתחייה" במסך
       _rev            — שער-הגרסה של הפולינג עצמו

     ⚠️ מה שאינו כאן בכוונה: orders · customerStock · piSheets · printFiles ·
     machineQueue · deptOrder · activityLog. הם נמשכים היום מפני שהמסך
     משותף, לא מפני שהתפקיד זקוק להם. הוספה כאן דורשת גם חוק ב-RTDB. */
  var OFFICE_COLLECTIONS = [
    '_rev', 'cards', 'customers', 'newspapers', 'flyers', 'weeklyJobs',
    'weekMarks', 'productMemory', 'sheetSizeMemory', 'deletedIds',
  ];

  /* ⚠️ office אינו כותב ל-RTDB **בכלל** — גם לא לאוספים שהוא קורא.
     רשימה ריקה ולא "רשימה מצומצמת": כל כתיבה ישירה מהדפדפן היא PUT של
     מערך שלם, וזו הרשאה למחוק. ראה functions/office.js. */
  var OFFICE_WRITABLE = [];

  function isOffice(claims) {
    var c = claims || {};
    /* ⚠️ staffId הוא תנאי ולא קישוט — בלעדיו kindOf מסווג pending
       והחשבון חסום ממילא. אותה בדיקה בדיוק כמו ב-auth-client.js. */
    return c.accountType === 'staff' && c.role === ROLE && !!c.staffId;
  }

  /* האם לנסות למשוך אוסף. ⚠️ מי שאינו office מקבל true תמיד — התפקיד
     הזה אינו משנה דבר עבור admin/worker, וזה נבדק במפורש. */
  function mayLoad(claims, collection) {
    if (!isOffice(claims)) return true;
    return OFFICE_COLLECTIONS.indexOf(String(collection)) >= 0;
  }

  function mayWriteDirect(claims, collection) {
    if (!isOffice(claims)) return true;
    return OFFICE_WRITABLE.indexOf(String(collection)) >= 0;
  }

  /* ── מדיניות ה-UI ────────────────────────────────────────────────────────
     ⚠️ שם-יכולת אחד לכל מקום. ‎auth-guard.js‎ כבר מצהיר
     ‎office: { produce, edit, internalData:false }‎ — כאן זה מתורגם
     לפעולות שהמסך באמת מציע, כדי ששתי הרשימות לא יסטו.

     ⚠️ ‏deleteCard **אינו** כאן במקרה: אין פונקציה שרתית למחיקה, ולכן
     אין גם כפתור. כפתור שקיים ונכשל גרוע מכפתור שאינו קיים. */
  var UI_DENIED = [
    'delete',        // מחיקת כרטיס — אין מסלול, לא ב-UI ולא בשרת
    'prices',        // מחירון, הצעות-מחיר, תמחור AI
    'quotes',
    'inventory',     // מלאי, תעודות-משלוח, חשבוניות
    'users',         // ניהול עובדים ו-PIN-ים
    'settings',
    'reports',       // דוחות ניהול
    'managerTasks',
  ];

  /* ── לשוניות המסך ────────────────────────────────────────────────────────
     ⚠️ רשימת-היתר בת שלוש, ולא "הכול חוץ מ-". אותו שיקול בדיוק שקבע את
     OFFICE_PAGES ב-auth-client.js: רשימת-איסור מחייבת לזכור כל לשונית
     עתידית, רשימת-היתר נכשלת לכיוון הבטוח.
       new   — טופס בניית הכרטיס
       saved — רשימת הכרטיסים
       week  — היומן השבועי
     ⚠️ ‏dashboard אינו כאן: הוא קורא הזמנות, תור-מכונות ויומן-פעילות —
     שלושה אוספים שהתפקיד אינו רשאי להם, ולכן היה נטען ריק. */
  var OFFICE_TABS = ['new', 'saved', 'week'];
  var OFFICE_TAB_HOME = 'saved';

  function mayTab(claims, tab) {
    if (!isOffice(claims)) return true;
    return OFFICE_TABS.indexOf(String(tab)) >= 0;
  }

  function mayDo(claims, action) {
    if (!isOffice(claims)) return true;
    return UI_DENIED.indexOf(String(action)) < 0;
  }

  /* ── ניתוב שמירת-הכרטיס ─────────────────────────────────────────────────
     ⚠️ ההחלטה טהורה בכוונה — היא נבדקת ב-Node, והקריאה לרשת יושבת
     בעטיפה דקה למטה. */
  function saveRouteFor(claims, isEdit) {
    if (!isOffice(claims)) return { via: 'direct', fn: null };
    return { via: 'function', fn: isEdit ? 'officeUpdateCard' : 'officeCreateCard' };
  }

  /* ── ניקוי המטען לפני השליחה ────────────────────────────────────────────
     ⚠️ **אינו** שכפול של השער השרתי אלא צמצום תעבורה: השרת דוחה כל שדה
     שאינו ברשימתו שלו, וזו הרשימה שקובעת. כאן רק מסירים שדות שהמסך
     ממילא לא אמור לשלוח, כדי ששמירה תקינה לא תיפול על office_unknown_field
     בגלל שדה-תצוגה פנימי. השרת נשאר מקור-האמת — אם נוסיף שדה כאן ולא
     שם, השמירה תיכשל בקול, וזה הכיוון הבטוח. */
  var CLIENT_STRIP = [
    'id', '_newId', 'createdAt', 'createdBy', 'lastUpdatedBy', '_upd',
    'printedAt', 'printCount', 'hasProof', 'proofName', 'proofType', 'runProofs',
    'approvedBy', 'approvedAt', 'approvalReqBy', 'papyrusReminder',
  ];

  function payloadFor(card) {
    var out = {};
    Object.keys(card || {}).forEach(function (k) {
      if (CLIENT_STRIP.indexOf(k) >= 0) return;
      var v = card[k];
      if (v === null || v === undefined) return;       // השרת דוחה null; לא שולחים
      out[k] = v;
    });
    return out;
  }

  root.OfficeCards = {
    ROLE: ROLE,
    OFFICE_COLLECTIONS: OFFICE_COLLECTIONS,
    OFFICE_WRITABLE: OFFICE_WRITABLE,
    UI_DENIED: UI_DENIED,
    OFFICE_TABS: OFFICE_TABS,
    OFFICE_TAB_HOME: OFFICE_TAB_HOME,
    mayTab: mayTab,
    CLIENT_STRIP: CLIENT_STRIP,
    isOffice: isOffice,
    mayLoad: mayLoad,
    mayWriteDirect: mayWriteDirect,
    mayDo: mayDo,
    saveRouteFor: saveRouteFor,
    payloadFor: payloadFor,
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));

/* ── העטיפה שנוגעת ברשת ─────────────────────────────────────────────────────
   ⚠️ מחוץ ל-IIFE הטהור ורק בדפדפן: הבדיקות ב-Node טוענות את הקובץ ואינן
   אמורות לגעת ב-fetch או ב-SolanAuth. */
if (typeof window !== 'undefined') {
  window.OfficeCards.FN = 'https://europe-west1-solan-printing.cloudfunctions.net/';

  /* ⚠️ שגיאה **אינה** נבלעת ואינה מוצגת כהצלחה. שמירה שנכשלה ומוצגת
     כ-"✅ נשמר" היא בדיוק תבנית הכשל-השקט שחזרה כאן שלוש פעמים. */
  window.OfficeCards.callSave = async function (fn, body) {
    if (!window.SolanAuth || !window.SolanAuth.idToken) throw new Error('אין חיבור מאומת');
    var t = await window.SolanAuth.idToken(false);
    var r = await fetch(window.OfficeCards.FN + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
      body: JSON.stringify({ data: body }),
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error((j.error && j.error.message) || 'השמירה נכשלה');
    return j.result;
  };
}
