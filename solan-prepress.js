/* ══════════════════════════════════════════════════════════════════════════
   solan-prepress.js — מנוע ההחלטות Prepress (בטא, לבעלים בלבד) · חילוץ 7.

   ⚠️ הוצא מ-krtis-avoda.html ב**העברה מכנית בלבד**: אותו קוד, אותם שמות,
   אותה התנהגות. לא סודר, לא שוכתב ולא תוקנה לוגיקה.

   ⚠️ נטען **אחרי** solan-toast.js (showToast). תגית src קלאסית וחוסמת,
   בלי async/defer/module.

   ⚠️ תלויות מאוחרות — מוצהרות בבלוק הגדול ונטענות **אחרי** הקובץ הזה,
   אבל נקראות רק בזמן ריצה מתוך openProEngine ומטה:
   currentUser · escHtml · buildRuns · pi_open · pi_newManual · pi_manualSetSheet ·
   quotePricing (ב-openProEngine וב-_proAnalyze) · machineSpeeds (ב-_proAnalyze).
   הקורא היחיד מבחוץ הוא onclick="openProEngine()" על לשונית admin-only.

   ⚠️ הקובץ אינו מבצע דבר בזמן טעינה: אין רשת, אין Firebase, אין טיימרים
   ואין localStorage — רק var _PROIN ועשר הגדרות.
   ══════════════════════════════════════════════════════════════════════════ */
// ══════ מנוע Prepress (בטא) — שכבת החלטות בסגנון Apogee Impose · מזינה לאימפוזיציה הקיימת · לבעלים בלבד ══════
// לא עורך — מנוע החלטות: לכל שלב המלצה + הסבר, המשתמש מאשר, ואז ההחלטות מוזנות למערכת האימפוזיציה הקיימת.
var _PROIN = 'width:100%;padding:8px 9px;border:1px solid #d1d5db;border-radius:8px;font-family:Heebo;font-size:.9rem;box-sizing:border-box';
function _proField(lbl, inner){ return '<div><label style="font-size:.74rem;font-weight:700;color:#374151;display:block;margin-bottom:3px">' + lbl + '</label>' + inner + '</div>'; }
function _proNum(id){ var e=document.getElementById(id); return e?(parseFloat(e.value)||0):0; }
function _proVal(id){ var e=document.getElementById(id); return e?String(e.value||'').trim():''; }
function _proD(title, decision, why){ return { title:title, decision:decision, why:why }; }
function openProEngine(){
  if (!(currentUser && currentUser.isAdmin)) { showToast('🔒 מנוע ה-Prepress זמין לבעלים בלבד'); return; }
  var m = document.getElementById('proEngineModal');
  if (!m) { m = document.createElement('div'); m.id='proEngineModal'; m.className='modal-overlay'; document.body.appendChild(m); }
  m.style.zIndex='295'; m.classList.add('open');
  var paperOpts = ((quotePricing&&quotePricing.papers)||[]).map(function(p){ return '<option value="'+escHtml(p.name)+'">'+escHtml(p.name)+'</option>'; }).join('');
  m.innerHTML = '<div class="modal-box" style="max-width:940px;width:96vw;max-height:92vh;display:flex;flex-direction:column">'+
    '<div class="modal-header"><span>🏭 מנוע Prepress — מנוע החלטות (בטא)</span><button class="modal-close" onclick="this.closest(\'.modal-overlay\').classList.remove(\'open\')">✕</button></div>'+
    '<div id="pro-body" style="padding:16px 20px;overflow:auto">'+
      '<div style="font-size:.82rem;color:#6b7280;margin-bottom:12px">הזן מפרט → המנוע מחליט ומסביר (מכונה · גיליון · קונטרסים · קיפול · לוחות · נייר · gang · setup · לחיצה) → אתה מאשר → והוא פותח את האימפוזיציה הקיימת עם ההחלטות.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">'+
        _proField('גודל מוצר','<select id="pro-size" style="'+_PROIN+'"><option value="a5">A5 / 16.5×24</option><option value="a4">A4</option><option value="a3">A3</option></select>')+
        _proField('מס\' עמודים','<input id="pro-pages" type="number" min="1" value="16" style="'+_PROIN+'">')+
        _proField('כמות','<input id="pro-qty" type="number" min="1" value="5000" style="'+_PROIN+'">')+
        _proField('צבעים','<select id="pro-colors" style="'+_PROIN+'"><option value="4">4 (CMYK)</option><option value="8">8 (פרפקטור)</option><option value="1">1</option><option value="2">2</option></select>')+
        _proField('הדפסה','<select id="pro-sides" style="'+_PROIN+'"><option value="perfecting">דו-צדדי (פרפקטור)</option><option value="single">צד אחד</option></select>')+
        _proField('נייר','<select id="pro-paper" style="'+_PROIN+'"><option value="">— בחר —</option>'+paperOpts+'</select>')+
        _proField('כריכה','<select id="pro-bind" style="'+_PROIN+'"><option value="saddle">כריכת סיכות (תפר אוכף)</option><option value="none">ללא</option></select>')+
      '</div>'+
      '<button onclick="_proAnalyze()" style="margin-top:14px;padding:11px 26px;border:none;border-radius:10px;background:#0f766e;color:#fff;font-weight:900;cursor:pointer;font-family:Heebo;font-size:.95rem">⚙️ נתח והחלט</button>'+
      '<div id="pro-results" style="margin-top:16px"></div>'+
    '</div></div>';
}
function _proAnalyze(){
  var size=_proVal('pro-size'), pages=_proNum('pro-pages')||16, qty=_proNum('pro-qty')||1,
      colors=parseInt(_proVal('pro-colors'))||4, sides=_proVal('pro-sides'), paperName=_proVal('pro-paper');
  var pr=quotePricing||{}, paper=((pr.papers||[]).find(function(p){return p.name===paperName;}))||null, perf=(sides==='perfecting');
  var sheet=(size==='a5')?{name:'70×100',w:70,h:100,per:32,trim:'16.5×24'}:(size==='a3')?{name:'70×100',w:70,h:100,per:8,trim:'A3'}:{name:'64×90',w:64,h:90,per:16,trim:'A4'};
  var machine=(colors>=8||perf)?{name:'היידלברג 8 צבעים (פרפקטור)',spd:machineSpeeds['מכונה 8 צבעים']||8500}:{name:'רולנד 4 צבעים',spd:machineSpeeds['מכונה 4 צבעים']||7000};
  var runs=(typeof buildRuns==='function')?buildRuns(pages,qty,sheet.per):[]; var nSig=runs.length||Math.ceil(pages/sheet.per);
  var foldsPer=sheet.per===32?4:(sheet.per===16?3:(sheet.per===8?2:1));
  var platesPerSig=colors*(perf?1:2), totalPlates=platesPerSig*nSig, plateCost=totalPlates*(pr.platePrice||0);
  // גיליונות לכל קונטרס: קונטרס חלקי (למשל 16 עמ' על גיליון 32) מודפס N-up → פחות גיליונות.
  var waste=(pr.wastePerRun||0), totalSheets=0, runBreak=[];
  if (runs.length){
    runs.forEach(function(r){
      var rp=r.pages||sheet.per, up=Math.max(1, Math.round(sheet.per/rp));
      var s=Math.ceil(qty/up)+waste; totalSheets+=s;
      runBreak.push(rp+' עמ\''+(up>1?(' ('+up+'-up)'):'')+' = '+Math.ceil(qty/up).toLocaleString()+'+'+waste+' פחת');
    });
  } else { totalSheets=nSig*(qty+waste); }
  var tonnage=paper?(totalSheets*(paper.sheetW*paper.sheetH/10000)*(paper.gram||0)/1000000):0, paperCost=paper?tonnage*(paper.tonPrice||0):0;
  var prod=(size==='a5')?{w:165,h:240}:(size==='a3')?{w:297,h:420}:{w:210,h:297};
  var sw=sheet.w*10, sh=sheet.h*10, nUp=Math.max(1, Math.floor(sw/prod.w)*Math.floor(sh/prod.h), Math.floor(sw/prod.h)*Math.floor(sh/prod.w));
  var setups=nSig, makeMin=setups*25, pressHours=machine.spd?(totalSheets/machine.spd):0;
  var D=[];
  D.push(_proD('🖨️ בחירת מכונה',machine.name, colors+' צבעים'+(perf?' + דו-צדדי (פרפקטור)':' + צד אחד')+'. '+(colors>=8||perf?'8 צבעים מדפיס שני צדדים במעבר אחד — חוסך מעבר שני והתאמה.':'4 צבעים צד אחד — רולנד יעילה וזולה יותר.')));
  D.push(_proD('📄 בחירת גיליון',sheet.name+' · '+sheet.per+' עמ\' לגיליון','מוצר '+sheet.trim+' יושב '+sheet.per+' עמ\' על גיליון '+sheet.name+' — ניצול מיטבי של שטח הגיליון.'));
  D.push(_proD('📚 תכנון קונטרסים',nSig+' קונטרסים',pages+' עמ\' ÷ '+sheet.per+' לגיליון = '+nSig+'.'+(runs.length?(' טווחים: '+runs.map(function(r){return r.pageRange;}).join(' · ')):'')));
  D.push(_proD('📐 תכנון קיפול',foldsPer+' קיפולים לכל קונטרס','גיליון של '+sheet.per+' עמ\' מתקפל ב-'+foldsPer+' קיפולים לחוברת בסדר קריאה.'));
  D.push(_proD('🟦 אופטימיזציית לוחות',totalPlates+' לוחות'+(plateCost?' · ₪'+Math.round(plateCost):''),platesPerSig+' לוחות לקונטרס ('+colors+' צבעים'+(perf?' × 1':' × 2 צדדים')+') × '+nSig+' קונטרסים.'+(perf?' פרפקטור חוסך חצי מהלוחות.':'')));
  D.push(_proD('🧻 אופטימיזציית נייר',Math.round(totalSheets).toLocaleString()+' גיליונות'+(tonnage?' · '+tonnage.toFixed(2)+' טון · ₪'+Math.round(paperCost):''),(runBreak.length?('לכל קונטרס: '+runBreak.join(' · ')+'.'):(nSig+' קונטרסים × ('+qty.toLocaleString()+'+'+waste+').'))+(paper?' נייר '+paper.gram+' גר, גיליון '+paper.sheetW+'×'+paper.sheetH+' → '+tonnage.toFixed(2)+' טון × ₪'+(paper.tonPrice||0)+'/טון.':' (בחר נייר לחישוב טונאז\').')));
  if(nUp>1) D.push(_proD('🔲 אופטימיזציית Gang',nUp+'-up אפשרי','המוצר ('+prod.w+'×'+prod.h+' מ"מ) נכנס '+nUp+' פעמים בגיליון '+sheet.name+'. לעבודה שטוחה (לא חוברת) — שקול gang לחיסכון בנייר ולחיצות.'));
  D.push(_proD('⚙️ אופטימיזציית Setup',setups+' הכנות · ~'+(Math.round(makeMin/6)/10)+' שע\'','~25 דק\' התאמה לכל קונטרס.'+(nSig>1?' שקול לתזמן את הקונטרסים ברצף על אותה מכונה כדי לחסוך התאמות.':'')));
  D.push(_proD('🏭 אופטימיזציית לחיצה',pressHours?pressHours.toFixed(1)+' שע\' דפוס':'—',Math.round(totalSheets).toLocaleString()+' גיליונות ÷ '+machine.spd.toLocaleString()+' גיליון/שעה = '+pressHours.toFixed(1)+' שעות ריצה נטו (ללא הכנות).'));
  window._proDecisions=D;
  window._proCtx={ sheetWmm:sheet.w*10, sheetHmm:sheet.h*10, sheetName:sheet.name, machine:machine.name };
  var html=D.map(function(d,i){ return _proCard(d,i); }).join('');
  html+='<div style="margin-top:14px;padding:13px 15px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:11px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
    '<div style="font-weight:800;color:#0f766e;font-size:.9rem">אשר את ההחלטות והמשך לאימפוזיציה</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '<button onclick="_proPlanPdf()" style="padding:9px 16px;border:1px solid #0f766e;border-radius:8px;background:#fff;color:#0f766e;font-weight:800;cursor:pointer;font-family:Heebo">📋 תוכנית הפקה (PDF)</button>'+
      '<button onclick="_proToImposition()" style="padding:9px 18px;border:none;border-radius:8px;background:#0f766e;color:#fff;font-weight:800;cursor:pointer;font-family:Heebo">📐 המשך לאימפוזיציה ▸</button>'+
    '</div></div>';
  document.getElementById('pro-results').innerHTML=html;
}
function _proCard(d,i){
  return '<div style="border:1px solid #e5e7eb;border-radius:11px;padding:12px 14px;margin-bottom:9px;background:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'+
    '<div style="flex:1"><div style="font-weight:800;color:#111827;font-size:.9rem">'+d.title+'</div>'+
      '<div style="color:#0f766e;font-weight:900;font-size:1.02rem;margin:2px 0">'+escHtml(d.decision)+'</div>'+
      '<div style="font-size:.82rem;color:#6b7280;line-height:1.5">💡 '+escHtml(d.why)+'</div></div>'+
    '<label style="flex:none;display:flex;align-items:center;gap:5px;font-size:.8rem;font-weight:700;color:#16a34a;cursor:pointer"><input type="checkbox" class="pro-appr" checked style="width:17px;height:17px">מאשר</label>'+
  '</div>';
}
function _proToImposition(){
  var ctx=window._proCtx; if(!ctx){ showToast('נתח קודם'); return; }
  var m=document.getElementById('proEngineModal'); if(m) m.classList.remove('open');
  if(typeof pi_open==='function') pi_open();
  setTimeout(function(){
    try { if(typeof pi_newManual==='function') pi_newManual(); } catch(e){}
    setTimeout(function(){ try { if(typeof pi_manualSetSheet==='function') pi_manualSetSheet(ctx.sheetWmm, ctx.sheetHmm); } catch(e){} showToast('📐 אימפוזיציה נפתחה · גיליון '+ctx.sheetName+' · '+ctx.machine+' — הוסף קבצים'); }, 350);
  }, 220);
}
function _proPlanPdf(){
  var D=window._proDecisions||[]; if(!D.length){ showToast('אין החלטות'); return; }
  var appr=document.querySelectorAll('#pro-results .pro-appr');
  var w=window.open('','_blank'); if(!w){ showToast('⚠️ אפשר חלונות קופצים'); return; }
  var rows=D.map(function(d,i){ var ok=appr[i]&&appr[i].checked; return '<li style="margin-bottom:9px"><b>'+d.title+':</b> '+(ok?'':'<span style="color:#b91c1c">(לא אושר) </span>')+d.decision+'<br><span style="color:#666;font-size:.9em">'+d.why+'</span></li>'; }).join('');
  var html='<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>תוכנית הפקה — סולן הדפסות</title>'+
    '<style>body{font-family:Arial,sans-serif;direction:rtl;padding:40px;line-height:1.7;color:#222}h1{color:#2d3561;border-bottom:3px solid #2d3561;padding-bottom:10px}li{margin-bottom:8px}</style></head><body>'+
    '<h1>🏭 תוכנית הפקה — סולן הדפסות</h1><div style="color:#777;font-size:.85rem;margin-bottom:14px">נוצר '+new Date().toLocaleString('he-IL')+'</div><ol>'+rows+'</ol>'+
    '<scr'+'ipt>setTimeout(function(){window.print();},350);</scr'+'ipt></body></html>';
  w.document.write(html); w.document.close();
}
