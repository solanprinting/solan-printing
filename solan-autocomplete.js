/* ══════════════════════════════════════════════════════════════════════════
   solan-autocomplete.js — השלמה-אוטומטית לשדות הטופס · חילוץ 9.

   ⚠️ הוצא מ-krtis-avoda.html ב**העברה מכנית בלבד**: אותו קוד, אותם שמות,
   אותן חתימות, אותו HTML שנבנה, אותו escaping, אותו setTimeout.

   ⚠️ אין תלות בשום שכבה מוקדמת — הקובץ אינו צורך את solan-data,
   solan-sync, solan-toast או כל קובץ-שכבה אחר. מיקומו בסדר הטעינה
   נקבע רק כדי שיהיה לפני הבלוק הגדול.

   ⚠️ תלויות מאוחרות — מוצהרות בבלוק הגדול ונטענות **אחרי** הקובץ הזה:
   AC_SEEDS · historyDB · newspapers · customers · calcRuns · syncSizeBtns.
   כולן נקראות **רק בזמן אירועי משתמש** (oninput/onfocus/onblur/onclick),
   כלומר אחרי שהבלוק הגדול כבר הוצהר — ולכן אין TDZ.

   ⚠️ הקובץ אינו מבצע שום פעולה בזמן טעינה: אין רשת, אין Firebase,
   אין אחסון, ואין ולו var/let/const אחד ברמת-העל — רק חמש הגדרות.
   ה-setTimeout היחיד יושב **בתוך** acDelay ורץ רק כשהמשתמש יוצא משדה.

   ⚠️ חמש הפונקציות חייבות להישאר **גלובליות**: ה-HTML קורא להן ממאפייני
   אירוע inline (oninput="acInput(...)" · onclick="acPickEl(this)" ועוד).
   אין לעטוף ב-IIFE/module ואין להסב לשמות מקומיים — כל עטיפה תשבור
   את כל שדות ההשלמה בטופס.
   ══════════════════════════════════════════════════════════════════════════ */
// ========== AUTOCOMPLETE ==========
function acSugg(fieldId, q) {
  const seeds  = AC_SEEDS[fieldId] || [];
  const hist   = historyDB[fieldId] || [];
  const fromNP = newspapers.map(n => {
    if (fieldId==='f-name')  return n.name;
    if (fieldId==='f-type')  return n.type;
    if (fieldId==='f-paper') return n.paper;
    return null;
  }).filter(Boolean);
  const fromCust = (fieldId === 'ord-customer')
    ? (typeof customers !== 'undefined' ? customers.map(c => c.name).filter(Boolean) : [])
    : [];
  const all = [...new Set([...hist, ...fromNP, ...fromCust, ...seeds])].filter(Boolean);
  if (!q || q.length===0) return all.slice(0,8);
  const lq = q.toLowerCase();
  return all.filter(s => s.toLowerCase().includes(lq)).slice(0,8);
}

function acInput(inputEl, listId, sugs) {
  const list = document.getElementById(listId);
  if (!sugs || !sugs.length) { list.classList.remove('open'); return; }
  const q = inputEl.value.trim();
  list.innerHTML = sugs.map(s => {
    let hi = s;
    if (q) {
      try { hi = s.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark>$1</mark>'); } catch(e){}
    }
    const safeVal = s.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
    return `<div class="ac-item" data-val="${safeVal}" data-field="${inputEl.id}" data-list="${listId}"
      onmousedown="event.preventDefault()" onclick="acPickEl(this)">${hi}</div>`;
  }).join('');
  list.classList.add('open');
}

function acPickEl(el) {
  const val     = el.dataset.val;
  const fieldId = el.dataset.field;
  const listId  = el.dataset.list;
  const input = document.getElementById(fieldId);
  if (input) { input.value = val; input.dispatchEvent(new Event('input')); }
  const list = document.getElementById(listId);
  if (list) list.classList.remove('open');
  if (fieldId==='f-size') { syncSizeBtns(val); calcRuns(); }
  if (fieldId==='f-copies'||fieldId==='f-pages'||fieldId==='f-type') calcRuns();
}

function acPick(fieldId, listId, val) {
  const el = document.getElementById(fieldId);
  if (el) el.value = val;
  const list = document.getElementById(listId);
  if (list) list.classList.remove('open');
  if (fieldId==='f-size') { syncSizeBtns(val); calcRuns(); }
  if (fieldId==='f-copies'||fieldId==='f-pages'||fieldId==='f-type') calcRuns();
}

function acDelay(listId) {
  setTimeout(() => {
    const el = document.getElementById(listId);
    if (el) el.classList.remove('open');
  }, 200);
}
