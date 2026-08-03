/* ═══════════════════════════════════════════════════════════════════════════
   solan-persist.js — נקודת-הכניסה להתמדה (חילוץ 5).

   ⚠️ הוצא מ-krtis-avoda.html ב**העברה מילולית**, בייט-מול-בייט:
   אותה חתימה, אותו סדר כתיבות localStorage, אותם תנאים ואותם ערכים.
   אין wrapper · IIFE · module · exports · alias · ואין window.persist.

   ⚠️ הקובץ **מגדיר בלבד** — אין בו קריאה ל-persist() ברמת-העל.

   ⚠️ 27 מתוך 28 הגלובלים שהפונקציה נוגעת בהם (cards · orders · inventory · …)
   מוצהרים ב-let **בבלוק הגדול שנטען אחרי הקובץ הזה**, וכן שתי
   פונקציות ה-UI updateBadge ו-updateFBStatus. שני הסקריפטים חולקים מרחב
   לקסיקלי גלובלי אחד, ולכן קריאה **מאוחרת** תקינה לגמרי — אבל קריאה
   ל-persist() לפני שהבלוק הגדול הוצהר תזרוק ReferenceError (TDZ).
   נבדק משלושה כיוונים: אפס קריאות ברמת-העל · אפס קריאות מטיימר/אירוע-טעינה ·
   וארבעת הקבצים שנטענים לפניו אינם קוראים לה.
   ═══════════════════════════════════════════════════════════════════════════ */
function persist() {
  /* ⚠️ ‏_pruneQueueDone **הוסר מכאן** (03/08/2026). הוא רץ בכל שמירה, שינה
     את המערך, וכך גרם ל-persist לדחוף את machineQueue כמעט תמיד — ובכל
     דחיפה כזו נדרס סימון-סיום שנכתב ע"י ה-Function. הוכח דטרמיניסטית
     ב-queue-overwrite-tests.js.
     ניקוי הוא מעכשיו פעולה מפורשת (queuePurge) עם סיבה ו-Audit. */
  // Always write to localStorage (works offline too)
  localStorage.setItem('solanHistory',             JSON.stringify(historyDB));
  localStorage.setItem('solanPrintLog',            JSON.stringify(printLog));
  localStorage.setItem('solanInventory',           JSON.stringify(inventory));
  localStorage.setItem('solanDocumentPrices',      JSON.stringify(documentPrices));
  localStorage.setItem('solanInventoryHistory',    JSON.stringify(inventoryHistory));
  localStorage.setItem('solanInventoryPress',      JSON.stringify(inventoryPress));
  localStorage.setItem('solanInventoryDeductions', JSON.stringify(inventoryDeductions));
  localStorage.setItem('solanInvoiceLogs',         JSON.stringify(invoiceLogs));
  localStorage.setItem('solanDeliveryNotes',       JSON.stringify(deliveryNotes));
  localStorage.setItem('solanQuotes',              JSON.stringify(quotes));
  localStorage.setItem('solanDeletedIds',          JSON.stringify(deletedIds));
  localStorage.setItem('solanQuotePricing',        JSON.stringify(quotePricing));
  localStorage.setItem('solanCustomers',           JSON.stringify(customers));
  localStorage.setItem('solanOrders',            JSON.stringify(orders));
  localStorage.setItem('solanCards',               JSON.stringify(cards));
  localStorage.setItem('solanNewspapers',          JSON.stringify(newspapers));
  localStorage.setItem('solanFlyers',             JSON.stringify(flyers));
  localStorage.setItem('solanPrintFiles',          JSON.stringify(printFiles));
  localStorage.setItem('solanWeeklyJobs',          JSON.stringify(weeklyJobs));
  localStorage.setItem('solanFutureJobs',          JSON.stringify(futureJobs));
  localStorage.setItem('solanRecurringJobs',       JSON.stringify(recurringJobs));
  localStorage.setItem('solanMachineQueue',        JSON.stringify(machineQueue));
  localStorage.setItem('solanProductMemory',       JSON.stringify(productMemory));
  localStorage.setItem('solanSheetSizes',          JSON.stringify(sheetSizeMemory));
  localStorage.setItem('solanCustomerStock',       JSON.stringify(customerStock));
  localStorage.setItem('solanManagerTasks',        JSON.stringify(managerTasks));
  localStorage.setItem('solanUsers',               JSON.stringify(solanUsers));
  if (apiKey) localStorage.setItem('solanApiKey', apiKey);
  updateBadge();
  // סמן שבוצע כתיבה מקומית עכשיו — כדי שה-poll מה-Firebase לא ידרוס אותה
  // ברגע שהיא עדיין לא הגיעה לשרת (למשל מחיקת כרטיס שמוחזרת ע"י נתון ישן)
  window._lastLocalWriteAt = Date.now();
  // Sync to Firebase via REST API — לא במסך הדפסים: אין לו סנכרון מלא/baseline,
  // ודחיפה משם תדרוס אוספים ניהוליים (כרטיסים, הזמנות...) עם נתון מקומי ישן.
  // מסך הדפסים דוחף את מה שמותר לו ישירות (machineQueue, printingState, cards ממוזג).
  /* ⚠️ תפקיד המשרד אינו דוחף כלום ל-Firebase. persist() דוחף 20 אוספים
     במכה אחת — מלאי, מחירון, משתמשים — ו-office אינו רשאי לאף אחד מהם;
     הדחיפות היו נחסמות אחת-אחת ב-_officeMayWrite ומייצרות רעש בלי סיבה.
     הכרטיסים שלו נשמרים ב-officeCreateCard/officeUpdateCard, ו-localStorage
     למעלה נכתב כרגיל כדי שהמסך ימשיך לעבוד. */
  var _isOfficeView = !!(window.OfficeCards && window.OfficeCards.isOffice(window._officeClaims));
  if (_fbConnected && !window._isMachineView && !_isOfficeView) {
    // כרטיסים נדחפים בנפרד דרך מיזוג חסין-דריסה (לא במערך הכללי שנדרס)
    _pushCardsMerged();
    // הזמנות/הצעות/יומן-שבועי/קבצי-הדפסה — גם הם דרך מיזוג לפי מזהה (לא דריסת מערך)
    _MERGED_COLLS.forEach(function(cl){
      var ref = _COLL_REF[cl];
      var cur = JSON.stringify(_filterDeleted(cl, ref.get()));
      if (window._fbSnapshot[cl] !== cur) _pushArrMerged(cl);
    });
    var _paths = {
      inventory: inventory,   // newspapers עבר למיזוג-לפי-מזהה (_MERGED_COLLS) — לא נדחף כמערך שלם
      inventoryPress: inventoryPress, inventoryDeductions: inventoryDeductions,
      inventoryHistory: inventoryHistory, invoiceLogs: invoiceLogs,
      customers: customers,
      recurringJobs: recurringJobs, quotePricing: quotePricing, documentPrices: documentPrices, deletedIds: deletedIds,
      /* ⚠️ ‏machineQueue **אינו כאן יותר**: הוא נכתב אך ורק דרך
         queueWrite/queueMarkDone/queuePurge, שממזגות בשרת לפי qid
         ושומרות את שדות-הסיום. דחיפת המערך מכאן היא הבאג עצמו. */
      productMemory: productMemory,
      managerTasks: managerTasks, sheetSizeMemory: sheetSizeMemory
    };
    // מלאי-לקוחות — דחיפה ממוזגת לפי-לקוח (לא PUT של המפה כולה)
    if (window._fbSnapshot.customerStock !== JSON.stringify(customerStock)) _pushMapMerged('customerStock');
    window._fbPendingPuts = window._fbPendingPuts || {};
    Object.keys(_paths).forEach(function(p) {
      var _json = JSON.stringify(_paths[p]);
      // אם ה-collection הזה לא השתנה אצלנו מאז הסנכרון האחרון מהשרת — לא דוחפים אותו.
      // זה מונע ממסך/לשונית "תקוע" (שלא נגע ב-collection הזה) לדרוס בטעות מחיקה
      // שבוצעה במקום אחר רק בגלל ש-persist() נקרא על שינוי בקולקציה אחרת.
      if (window._fbSnapshot && window._fbSnapshot[p] === _json) return;
      // הגנת מלאי: אם לטאב הזה אין עדיין baseline מהשרת עבור האוסף (למשל מסך הדפסים,
      // שמריץ persist דרך טיימרים כמו _purgeCustomerCards אך לא סנכרן מלאי) — אל תדחוף
      // אותו, כדי לא לדרוס מלאי/הורדות תקינים בנתון מקומי ישן/ריק.
      // גם אוספים שממוזגים-בקריאה לפי updatedAt (מלאי-לקוחות, זיכרונות, משימות-מנהל):
      // בלי baseline מהשרת דחיפה שלהם = דריסת המפה כולה בנתון מקומי ישן. זה מה שמחק
      // עדכוני מלאי-לקוחות שנעשו במכשיר אחר (הטלפון) — 2026-07-30.
      if (window._fbSnapshot[p] === undefined &&
          (p==='inventory'||p==='inventoryDeductions'||p==='inventoryHistory'||p==='invoiceLogs'||p==='inventoryPress'
           ||p==='customerStock'||p==='productMemory'||p==='sheetSizeMemory'||p==='managerTasks')) return;
      // הגנת מחירון: אל תדחוף quotePricing עד שידוע שהוא אמין (נמשך מהשרת או נשמר ידנית),
      // כדי שטאב עם ברירת-מחדל ריקה לא ידרוס את המחירון התקין בשרת.
      if (p === 'quotePricing' && !window._quotePricingLoaded) return;
      window._fbSnapshot[p] = _json;
      // מסמנים "כתיבה בתהליך" כדי שה-poll (כל 15 שניות) לא ימשוך בטעות נתון ישן
      // מהשרת בזמן שהכתיבה הזו עדיין באוויר, וידרוס איתו את העדכון המקומי שלנו
      // (זה מה שגרם לתעודות משלוח/הורדות מלאי "להתאפס" בחזרה אחרי כמה שניות).
      window._fbPendingPuts[p] = (window._fbPendingPuts[p] || 0) + 1;
      window._fbPut(p, _paths[p]).then(function() {
        window._fbPendingPuts[p] = Math.max(0, (window._fbPendingPuts[p] || 1) - 1);
      });
    });
    updateFBStatus(true);
  }
}
