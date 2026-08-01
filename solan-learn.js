/* ══════════════════════════════════════════════════════════════════════════
   solan-learn.js — מנוע הלמידה: פרופיל לקוח מהיסטוריית הכרטיסים · חילוץ 8.

   ⚠️ הוצא מ-krtis-avoda.html ב**העברה מכנית בלבד**: אותו קוד, אותם שמות,
   אותן חתימות, אותו סדר שורות. לא סודר, לא שוכתב ולא תוקנה לוגיקה.

   ⚠️ נטען **אחרי** solan-toast.js — showToast מגיעה משם וזמינה בוודאות.
   תגית src קלאסית וחוסמת, בלי async/defer/module.

   ⚠️ תלויות מאוחרות — מוצהרות בבלוק הגדול ונטענות **אחרי** הקובץ הזה,
   אבל נקראות רק בזמן ריצה:
   cards · escHtml · calcRuns · _isGraphicCard.

   ⚠️ fmtDate **אינה** תלות חיצונית: היא מוצהרת מקומית בתוך
   openLearnInsights כ-var fmtDate = function(t){…}. אין לתעד אותה
   כתלות ואין להסתמך על גלובל בשם הזה.

   ⚠️ הקובץ אינו מבצע דבר בזמן טעינה: אין רשת, אין Firebase, אין
   localStorage ואין טיימר. ה-setTimeout היחיד שקשור למנוע יושב
   **מחוץ** לקובץ — ב-onblur של שדה f-name ב-HTML, שמפעיל את
   _learnPrefillCheck אחרי 290ms. כאן יש רק תשע הגדרות פונקציה.

   ⚠️ קוראים חיצוניים: onclick="openLearnInsights()" על לשונית admin-only ·
   ה-onblur הנ"ל · ו-_aicLearnedContext שבודק typeof _learnProfiles.
   ══════════════════════════════════════════════════════════════════════════ */
// ══════ מנוע למידה — פרופיל לקוח מהיסטוריית הכרטיסים + הצעות פרואקטיביות ══════
// מקבץ כרטיסים לפי שם-לקוח מנורמל (מסיר מספר-גיליון בסוף), ומחשב דפוסים: נייר/גודל/כמות/סוג
// טיפוסיים, קצב הזמנה, והזמנה שמאחרת. ככל שמצטברת היסטוריה — ההצעות מדויקות יותר.
function _learnNorm(name){
  return String(name||'').toLowerCase().replace(/[#]/g,' ')
    .replace(/[\d]+\s*$/,'')                 // הסר מספר-גיליון בסוף (עיתון "שיחת העיר 1296" → "שיחת העיר")
    .replace(/\s+/g,' ').trim();
}
function _learnDate(c){ var t=Number(c&&c.id); if(t>1e12) return t; try{ if(c&&c.orderDate){ var d=new Date(c.orderDate); if(!isNaN(d)) return d.getTime(); } }catch(e){} return 0; }
function _learnMode(arr){ var m={},best='',bn=0; arr.forEach(function(v){ v=(v||'').trim(); if(!v) return; m[v]=(m[v]||0)+1; if(m[v]>bn){bn=m[v];best=v;} }); return best; }
function _learnMedian(nums){ nums=nums.filter(function(n){return n>0;}).sort(function(a,b){return a-b;}); if(!nums.length) return 0; var m=Math.floor(nums.length/2); return nums.length%2?nums[m]:Math.round((nums[m-1]+nums[m])/2); }
function _learnProfiles(){
  var groups={};
  (cards||[]).forEach(function(c){
    if(!c || c.status==='trash') return;
    if(typeof _isGraphicCard==='function' && _isGraphicCard(c)) return;   // עבודות "גרפיק" — לא בהיסטוריה/למידה
    var key=_learnNorm(c.customer||c.name); if(!key || key.length<2) return;
    (groups[key]=groups[key]||{key:key,label:String(c.customer||c.name||'').replace(/[\d#]+\s*$/,'').trim(),orders:[]}).orders.push({
      date:_learnDate(c), size:c.size||'', paper:c.paper||'', type:c.type||'', color:c.color||'', copies:parseInt(c.copies)||0 });
  });
  var out={};
  Object.keys(groups).forEach(function(k){
    var g=groups[k], o=g.orders.filter(function(x){return x.date>0;}).sort(function(a,b){return a.date-b.date;}), all=g.orders, cadence=0;
    if(o.length>=3){ var gaps=[]; for(var i=1;i<o.length;i++){ var d=(o[i].date-o[i-1].date)/86400000; if(d>0&&d<400) gaps.push(d); } cadence=_learnMedian(gaps); }
    var last=o.length?o[o.length-1].date:0;
    out[k]={ key:k, label:g.label, count:all.length,
      topPaper:_learnMode(all.map(function(x){return x.paper;})), topSize:_learnMode(all.map(function(x){return x.size;})),
      topType:_learnMode(all.map(function(x){return x.type;})), topColor:_learnMode(all.map(function(x){return x.color;})),
      typicalCopies:_learnMedian(all.map(function(x){return x.copies;})), lastDate:last, cadenceDays:cadence,
      overdueDays:(cadence>0&&last>0)?Math.round((Date.now()-last)/86400000 - cadence):null };
  });
  return out;
}
function _learnFind(name){
  var key=_learnNorm(name); if(!key||key.length<2) return null;
  var p=_learnProfiles(); if(p[key]) return p[key];
  var best=null; Object.keys(p).forEach(function(k){ if((k.indexOf(key)===0||key.indexOf(k)===0)&&(!best||k.length>best.key.length)) best=p[k]; });
  return best;
}
// מילוי חכם: כשמקלידים שם-לקוח שכבר הזמין בעבר — הצעה למלא נייר/גודל/כמות/סוג לפי ההיסטוריה
function _learnPrefillCheck(){
  var el=document.getElementById('f-name'); if(!el) return;
  var old=document.getElementById('learn-prefill'); if(old) old.remove();
  var prof=_learnFind(el.value); if(!prof || prof.count<1) return;
  var size=((document.getElementById('f-size')||{}).value||''), paper=((document.getElementById('f-paper')||{}).value||'');
  if(size && paper) return;                 // כבר מלא — לא מציעים
  var bits=[]; if(prof.topPaper)bits.push(prof.topPaper); if(prof.topSize)bits.push(prof.topSize); if(prof.typicalCopies)bits.push(prof.typicalCopies+' עותקים'); if(prof.topType)bits.push(prof.topType);
  if(!bits.length) return;
  window._learnLastProf=prof;
  var d=document.createElement('div'); d.id='learn-prefill';
  d.style.cssText='margin-top:6px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:9px;padding:8px 11px;font-size:.8rem;color:#5b21b6;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
  d.innerHTML='<span>💡 <b>'+escHtml(prof.label)+'</b> בד"כ: '+escHtml(bits.join(' · '))+' <span style="color:#9ca3af">('+prof.count+' עבודות)</span></span>'+
    '<button type="button" onclick="_learnApplyPrefill()" style="margin-inline-start:auto;background:#7c3aed;color:#fff;border:none;border-radius:7px;padding:5px 12px;font-weight:700;cursor:pointer;font-family:Heebo;font-size:.78rem">מלא לפי היסטוריה</button>';
  var field=el.closest('.field'); if(field) field.appendChild(d);
}
function _learnApplyPrefill(){
  var p=window._learnLastProf; if(!p) return;
  var set=function(id,v){ var e=document.getElementById(id); if(e && !e.value && v){ e.value=v; try{e.dispatchEvent(new Event('input'));}catch(_){} } };
  set('f-paper',p.topPaper); set('f-size',p.topSize); set('f-type',p.topType);
  if(p.typicalCopies) set('f-copies',String(p.typicalCopies));
  if(p.topColor){ var r=document.querySelector('input[name="color"][value="'+p.topColor+'"]'); if(r) r.checked=true; }
  try{ calcRuns(); }catch(e){}
  var w=document.getElementById('learn-prefill'); if(w) w.innerHTML='<span style="color:#16a34a;font-weight:800">✓ מולא לפי ההיסטוריה — אפשר לערוך כרגיל</span>';
  showToast('💡 מולא לפי '+p.count+' עבודות קודמות של '+p.label);
}
// פאנל תובנות — הזמנות חוזרות שמאחרות + פרופילים שנלמדו
function openLearnInsights(){
  var p=_learnProfiles();
  var arr=Object.keys(p).map(function(k){return p[k];});
  var due=arr.filter(function(x){return x.overdueDays!=null && x.overdueDays>2;}).sort(function(a,b){return b.overdueDays-a.overdueDays;});
  var top=arr.slice().sort(function(a,b){return b.count-a.count;}).filter(function(x){return x.count>=1;}).slice(0,40);
  var fmtDate=function(t){ return t? new Date(t).toLocaleDateString('he-IL'):'—'; };
  var dueHtml = due.length ? due.map(function(x){
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid #fee2e2;font-size:.85rem">'+
      '<div><b>'+escHtml(x.label)+'</b><div style="font-size:.72rem;color:#6b7280">מזמין כל ~'+x.cadenceDays+' ימים · הזמנה אחרונה '+fmtDate(x.lastDate)+'</div></div>'+
      '<span style="background:#fee2e2;color:#b91c1c;border-radius:8px;padding:4px 10px;font-weight:800;white-space:nowrap">מאחר '+x.overdueDays+' ימים</span></div>';
  }).join('') : '<div style="padding:14px;color:#9ca3af;font-size:.84rem;text-align:center">אין הזמנות חוזרות שמאחרות. (המערכת מזהה קצב אחרי ≥3 הזמנות מאותו לקוח.)</div>';
  var rows = top.length ? top.map(function(x){
    return '<tr style="border-top:1px solid #eef2f7"><td style="padding:6px 8px;font-weight:700">'+escHtml(x.label)+'</td>'+
      '<td style="padding:6px 8px;text-align:center">'+x.count+'</td>'+
      '<td style="padding:6px 8px">'+escHtml(x.topPaper||'—')+'</td>'+
      '<td style="padding:6px 8px">'+escHtml(x.topSize||'—')+'</td>'+
      '<td style="padding:6px 8px;text-align:center">'+(x.typicalCopies||'—')+'</td>'+
      '<td style="padding:6px 8px;text-align:center;color:'+(x.cadenceDays?'#0f766e':'#cbd5e1')+'">'+(x.cadenceDays?('~'+x.cadenceDays+'י'):'—')+'</td></tr>';
  }).join('') : '<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af">אין עדיין מספיק היסטוריה. ככל שתיצור כרטיסים — כאן ייבנו פרופילים.</td></tr>';
  var m=document.createElement('div'); m.className='modal-overlay open'; m.style.zIndex=290;
  m.innerHTML='<div class="modal-box" style="max-width:720px;width:96vw;max-height:88vh;display:flex;flex-direction:column">'+
    '<div class="modal-header"><span>🧠 תובנות — למידה מההיסטוריה</span><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">✕</button></div>'+
    '<div style="padding:14px 18px;overflow:auto">'+
      '<div style="font-weight:800;color:#b91c1c;font-size:.9rem;margin-bottom:2px">🔔 הזמנות חוזרות שכדאי לבדוק ('+due.length+')</div>'+
      '<div style="border:1px solid #fecaca;border-radius:9px;overflow:hidden;margin-bottom:16px">'+dueHtml+'</div>'+
      '<div style="font-weight:800;color:#0f766e;font-size:.9rem;margin-bottom:6px">📊 פרופילים שנלמדו ('+arr.length+' לקוחות)</div>'+
      '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">'+
        '<tr style="background:#f8fafc;font-weight:800;color:#374151"><td style="padding:6px 8px">לקוח</td><td style="padding:6px 8px;text-align:center">עבודות</td><td style="padding:6px 8px">נייר טיפוסי</td><td style="padding:6px 8px">גודל</td><td style="padding:6px 8px;text-align:center">כמות</td><td style="padding:6px 8px;text-align:center">קצב</td></tr>'+
        rows+'</table></div>'+
      '<div style="font-size:.72rem;color:#9ca3af;margin-top:12px">💡 הלמידה מתבססת על הכרטיסים שנוצרו. ככל שתיצור יותר — ההצעות מדויקות יותר. "מלא לפי היסטוריה" מופיע אוטומטית בכרטיס חדש כשמקלידים שם לקוח מוכר.</div>'+
    '</div></div>';
  document.body.appendChild(m);
}
