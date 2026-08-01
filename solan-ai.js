/* ══════════════════════════════════════════════════════════════════════════
   solan-ai.js — שכבת ה-AI: תעבורה, נפילה-לאחור וחיווי-בריאות (חילוץ 6B).

   ⚠️ הוצא מ-krtis-avoda.html ב**העברה מכנית בלבד**: אותו קוד, אותם שמות,
   אותה התנהגות. לא שונו מודלים, prompts, timeouts, polling, טיפול-שגיאות
   או סדר הנפילה מקומי → ענן → relay.

   ⚠️ נטען **אחרי** solan-data.js (‎_FBURL · _fbAuthToken · _fbWriteGuard ·
   _fbPutRaw/_fbGetRaw/_fbDelRaw) ו**אחרי** solan-toast.js (showToast).
   תגית src קלאסית וחוסמת, בלי async/defer/module.

   ⚠️ מה ש**לא** עבר, ובכוונה: חמש שורות האתחול של פרוקסי-הענן —
   window._CLOUD_PROXY_URL והקריאה ל-_fbGetRaw('aiConfig/cloudProxyUrl').
   הן נשארו במיקומן המקורי ב-HTML כדי שקריאת-הרשת בזמן-הטעינה תתרחש
   בדיוק בנקודה שבה התרחשה תמיד, ולא תוקדם לראש הדף. הקורא היחיד של
   _CLOUD_PROXY_URL הוא _cloudProxyFetch, בזמן בקשה — ולכן אין תלות.

   ⚠️ תלויות מאוחרות (מוצהרות בבלוק הגדול, נקראות רק בזמן ריצה):
   currentUser · hasPermission · _kioskOn · _beginCriticalOperation ·
   _endCriticalOperation. כולן עטופות בבדיקת typeof/window.
   ══════════════════════════════════════════════════════════════════════════ */
// קריאה לפרוקסי המקומי — עמידה בפני Local Network Access של כרום:
// אתר HTTPS ציבורי שפונה ל-127.0.0.1 חייב לסמן targetAddressSpace, אחרת כרום
// עלול לחסום בשקט ("Failed to fetch"). מנסים loopback → local → רגיל.
function _proxyFetch(bodyJson){
  var url = 'http://127.0.0.1:8766/v1/messages';
  var variants = [ { targetAddressSpace: 'loopback' }, { targetAddressSpace: 'local' }, {} ];
  function attempt(i){
    if (i >= variants.length) return Promise.reject(new TypeError('Failed to fetch (כל הנסיונות נכשלו)'));
    var opts = Object.assign({ method:'POST', headers:{ 'content-type':'application/json' }, body: bodyJson }, variants[i]);
    var p;
    try { p = fetch(url, opts); }
    catch(e){ return attempt(i + 1); }               // ערך enum לא מוכר בדפדפן ישן → נסה וריאנט הבא
    return p.catch(function(err){
      try { console.warn('[solan] proxy fetch variant', i, 'failed:', err && (err.name + ': ' + err.message)); } catch(_){}
      return attempt(i + 1);                          // חסימת רשת/LNA → נסה וריאנט הבא
    });
  }
  return attempt(0);
}
// נתיב ענן: כותב את הבקשה ל-aiRelay ב-Firebase, הפרוקסי המקומי קולט/מנתח/מחזיר תשובה.
// עוקף לחלוטין את חסימת הדפדפן מול localhost.
function _aiRelay(payload){
  var id = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
  return _fbPutRaw('aiRelay/' + id, { ts: Date.now(), status:'pending', req: payload }).then(function(ok){
    if (!ok) throw new Error('שמירת הבקשה לענן נכשלה — בדוק חיבור אינטרנט');
    try { showToast('☁️ מנתח דרך הענן — כמה שניות...', 5000); } catch(e){}
    return new Promise(function(resolve, reject){
      var tries = 0, max = 60;   // 60 × 1.5s = 90 שניות
      var iv = setInterval(function(){
        tries++;
        _fbGetRaw('aiRelay/' + id + '/result').then(function(res){
          if (res != null){
            clearInterval(iv); _fbDelRaw('aiRelay/' + id);
            if (res && res.error) reject(new Error('API ' + res.error));
            else resolve(res);
          } else if (tries >= max){
            clearInterval(iv); _fbDelRaw('aiRelay/' + id);
            reject(new Error('Failed to fetch — שרת הניתוח לא הגיב דרך הענן (ודא ש-start.bat פועל)'));
          }
        });
      }, 1500);
    });
  });
}

function _cloudProxyFetch(payload){
  var base = String(window._CLOUD_PROXY_URL || '').replace(/\/+$/, '');
  if (!base) return Promise.reject(new Error('CLOUD_NET no-url'));
  return window._fbAuthToken().then(function(t){
    return fetch(base + '/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + (t||'') },
      body: JSON.stringify(payload)
    }).then(function(r){
      if (!r.ok) return r.json().catch(function(){ return {}; }).then(function(e){ var er=new Error('CLOUD_HTTP ' + r.status + ': ' + JSON.stringify(e)); er._http=r.status; throw er; });
      return r.json();
    });
  }, function(){ throw new Error('CLOUD_NET auth'); })
   .catch(function(err){ if (err && err._http) throw err; var e2=new Error('CLOUD_NET ' + ((err&&err.message)||'')); throw e2; });
}
// ענן קודם (עובד גם כשהמחשב כבוי), ואם אין ענן/נכשל רשתית — relay (דורש מחשב פעיל).
// שגיאת-API אמיתית מהענן (400/429 מ-Claude) מוצגת; בעיית-worker (401/403/404/5xx) → relay.
function _aiCloudOrRelay(payload, _route){
  return _cloudProxyFetch(payload).then(function(v){ _route.r = 'cloud'; return v; })
    .catch(function(err){
      var st = err && err._http;
      if (st && st !== 401 && st !== 403 && st !== 404 && st < 500) throw err;   // שגיאת-API אמיתית → הצג
      return _aiRelay(payload).then(function(v){ _route.r = 'cloud'; return v; });
    });
}
// נקודת כניסה אחידה לכל בקשות ה-AI: מנסה ישיר לפרוקסי, ואם הדפדפן חוסם — דרך הענן.
window._proxyDirectOk = null;   // null=לא נבדק, true=ישיר עובד, false=דרך הענן
function _aiRequest(payload){
  // S2-3: בקשת AI פעילה חוסמת רענון. מונה יחיד לכל הבקשה (כולל fallback הפנימי) —
  // ה-fallback ל-relay אינו מתחיל operation חדש; מקביליות נתמכת ע"י המונה.
  if (window._beginCriticalOperation) window._beginCriticalOperation('ai-request');
  // S2-5: חיווי פעילות (תצפית בלבד — לא משנה timeout/fallback/סדר). מסלול ידוע רק בהצלחה.
  var _route = { r: null };
  if (window._aiStartRequestStatus) window._aiStartRequestStatus(window._proxyDirectOk === false ? 'cloud' : (window._proxyDirectOk === true ? 'local' : null));
  var p;
  if (window._proxyDirectOk === false) p = _aiCloudOrRelay(payload, _route);   // כבר ידוע שהישיר חסום בסשן הזה → ענן/relay
  else p = _proxyFetch(JSON.stringify(payload)).then(function(r){
    if (!r.ok) return r.json().then(function(e){ throw new Error('API ' + r.status + ': ' + JSON.stringify(e)); });
    window._proxyDirectOk = true; _route.r = 'local';
    return r.json();
  }).catch(function(err){
    var msg = (err && err.message) || '';
    if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1) {
      window._proxyDirectOk = false;
      if (window._aiSetServiceState) window._aiSetServiceState({ requestRoute:'cloud' });   // "מעבד דרך הענן" (עדיין לא success)
      return _aiCloudOrRelay(payload, _route);           // חסימת רשת מקומית → ענן (ואם אין — relay), אותה operation
    }
    throw err;                       // שגיאת API אמיתית → הצג אותה
  });
  if (!window._endCriticalOperation) return p;   // סביבה בלי מנגנון (בדיקות ישנות)
  return Promise.resolve(p).then(function(v){
    window._endCriticalOperation('ai-request');                                 // decrement קודם — כדי ש-activeCount יהיה מדויק
    if (window._aiEndRequestStatus) window._aiEndRequestStatus(true, _route.r);
    return v;
  }, function(e){
    window._endCriticalOperation('ai-request');
    if (window._aiEndRequestStatus) window._aiEndRequestStatus(false, null);
    throw e;
  });
}

// ══════ בדיקת בריאות שירות AI — תשתית בלבד (ספרינט 2 · S2-4) ═════════
// קובעת אם ה-proxy המקומי חי (GET /health) או שה-relay בענן פעיל לאחרונה
// (heartbeat טרי). ⚠️ אינה קוראת ל-Claude ואינה צורכת API. אינה משנה את
// _aiRequest/_proxyDirectOk/fallback/timeout. אין polling/UI כאן — זה S2-5.
// מגבלה: heartbeat מוכיח ש-proxy.py רץ וכתב לאחרונה, לא ש-Claude זמין כרגע
// ולא הגנה קריפטוגרפית (חוקי Firebase = auth!=null; אבטחה אמיתית = משימה עתידית).
window._AI_HEALTH_TIMEOUT_MS   = 2500;    // timeout ל-health בלבד (לא לבקשת Claude!)
window._AI_HEARTBEAT_FRESH_MS  = 180000;  // heartbeat נחשב עדכני אם גילו < 3 דק'
window._aiServiceState = { status:'unknown', checkedAt:0, local:null, relay:null, error:null };
window._aiHealthInFlight = null;
window._aiCheckServiceHealth = function(){
  if (window._aiHealthInFlight) return window._aiHealthInFlight;   // מקביליות → אותו Promise
  // merge (ולא החלפת-אובייקט) כדי לשמר שדות S2-5 (requestActive/slow/lastSuccessAt); render מרוכז
  var _apply = function(patch){ try { Object.assign(window._aiServiceState, patch); } catch(e){} try { window._aiRenderServiceStatus && window._aiRenderServiceStatus(); } catch(e){} };
  _apply({ status:'checking' });
  var p = (async function(){
    // (1) ניסיון מקומי — GET /health עם timeout קצר
    try {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var to = setTimeout(function(){ try { ctrl && ctrl.abort(); } catch(e){} }, window._AI_HEALTH_TIMEOUT_MS);
      var r = await fetch('http://127.0.0.1:8766/health', { method:'GET', signal: ctrl ? ctrl.signal : undefined });
      clearTimeout(to);
      if (r && r.ok){
        var hh = await r.json();
        if (hh && hh.ready === true){
          _apply({ status:'local', checkedAt:Date.now(),
            local:{ relayWorker: !!hh.relayWorker, providerConfigured: !!hh.providerConfigured }, relay:null, error:null });
          return window._aiServiceState;
        }
      }
    } catch(e){ /* local לא זמין / timeout — ננסה ענן ואז heartbeat */ }
    // (2) פרוקסי ענן — GET /health. עובד 24/7 גם כשהמחשב כבוי, לכן נבדק לפני ה-relay.
    try {
      var base = String(window._CLOUD_PROXY_URL || '').replace(/\/+$/, '');
      if (base){
        var cc = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var cto = setTimeout(function(){ try { cc && cc.abort(); } catch(e){} }, window._AI_HEALTH_TIMEOUT_MS);
        var cr = await fetch(base + '/health', { method:'GET', signal: cc ? cc.signal : undefined });
        clearTimeout(cto);
        if (cr && cr.ok){
          var ch = await cr.json();
          if (ch && ch.ready === true){
            _apply({ status:'cloud', checkedAt:Date.now(),
              local:null, relay:{ cloud:true, providerConfigured: !!ch.providerConfigured }, error:null });
            return window._aiServiceState;
          }
        }
      }
    } catch(e){ /* ענן לא זמין — ננסה heartbeat של ה-relay */ }
    // (3) fallback: heartbeat של ה-relay — קריאה בלבד (בלי _rev/merge/persist/כתיבה)
    try {
      var hb = window._fbGetRaw ? await window._fbGetRaw('aiServiceHeartbeat/proxy') : null;
      var fresh = !!(hb && hb.relayWorker === true && typeof hb.timestamp === 'number'
                     && (Date.now() - hb.timestamp) < window._AI_HEARTBEAT_FRESH_MS);
      _apply({ status: fresh ? 'cloud' : 'unavailable', checkedAt:Date.now(),
        local:null, relay: hb ? { relayWorker: !!hb.relayWorker, ageMs: (typeof hb.timestamp==='number') ? (Date.now()-hb.timestamp) : null } : null, error:null });
    } catch(e){
      // כשל קריאת Firebase — לא שובר את האפליקציה, רק מסמן unavailable
      _apply({ status:'unavailable', checkedAt:Date.now(), local:null, relay:null, error:'heartbeat-read-failed' });
    }
    return window._aiServiceState;
  })();
  window._aiHealthInFlight = p;
  var _clr = function(){ window._aiHealthInFlight = null; };
  p.then(_clr, _clr);   // אחרי סיום — אפשר בדיקה חדשה
  return p;
};

// ══════ חיווי מצב שירות AI — ספרינט 2 · S2-5 ════════════════════════
// מרחיב את _aiServiceState לפעילות-בקשה, מציג חיווי ידידותי למשתמשים
// מורשים בלבד (בתוך חלונות ה-AI), וממפה שגיאות להודעות קצרות. אינו משנה
// timeout/fallback/proxy.py; health לא נספר כ-ai-request.
(function(){
  // הרחבת המצב שנוצר ב-S2-4 (בלי לפזר משתנים)
  try { Object.assign(window._aiServiceState, { requestActive:false, requestRoute:null, slow:false, lastSuccessAt:0 }); } catch(e){}
  window._AI_SLOW_MS = 13000;            // "התגובה מתארכת" אחרי ~13ש' (חיווי בלבד — לא abort/fallback)
  window._AI_SUCCESS_FLASH_MS = 4000;    // כמה זמן להציג "שירות ה-AI פועל" אחרי הצלחה

  window._aiIsAdmin  = function(){ try { return !!(typeof currentUser!=='undefined' && currentUser && currentUser.isAdmin); } catch(e){ return false; } };
  window._aiHasAccess = function(){       // מי רואה חיווי: מנהל או בעל-גישת-הצעות (משתמשי AI). לא בקיוסק/עובד-ייצור.
    try {
      if (window._kioskOn && window._kioskOn()) return false;
      if (typeof currentUser==='undefined' || !currentUser) return false;
      if (currentUser.isAdmin) return true;
      return (typeof hasPermission==='function') ? hasPermission('quotes.view') : false;
    } catch(e){ return false; }
  };
  window._aiActiveCount = function(){
    try { return (window._criticalOperations && window._criticalOperations.get) ? (window._criticalOperations.get('ai-request')||0) : (window._aiServiceState.requestActive?1:0); } catch(e){ return 0; }
  };
  // נקודת-מצב מרכזית: כל שינוי עובר כאן ומפעיל render
  window._aiSetServiceState = function(patch){
    try { Object.assign(window._aiServiceState, patch||{}); } catch(e){}
    try { window._aiRenderServiceStatus(); } catch(e){}
    return window._aiServiceState;
  };
  // טקסט הסטטוס לפי המצב (פעילות-בקשה גוברת על מצב-health)
  window._aiStatusInfo = function(){
    var s = window._aiServiceState;
    if (s.requestActive){
      if (s.slow) return { text:'התגובה מתארכת, אך הבקשה עדיין פעילה.', tip:'', recheck:false, tone:'busy' };
      if (s.requestRoute === 'cloud') return { text:'מעבד דרך שירות הענן…', tip:'', recheck:false, tone:'busy' };
      if (s.requestRoute === 'local') return { text:'מעבד דרך השירות המקומי…', tip:'', recheck:false, tone:'busy' };
      return { text:'ה-AI מעבד את הבקשה…', tip:'', recheck:false, tone:'busy' };
    }
    if (s.lastSuccessAt && (Date.now() - s.lastSuccessAt) < window._AI_SUCCESS_FLASH_MS)
      return { text:'שירות ה-AI פועל', tip:'', recheck:false, tone:'ok' };
    switch (s.status){
      case 'checking':    return { text:'בודק את שירות ה-AI…', tip:'', recheck:false, tone:'busy' };
      case 'local':       return { text:'AI מחובר מקומית', tip:'השירות המקומי במחשב פעיל.', recheck:false, tone:'ok' };
      case 'cloud':       return { text:'שירות הענן נראה זמין', tip:'התקבל heartbeat עדכני משירות ה-relay. הדבר אינו מבטיח ש-Claude עצמו זמין.', recheck:false, tone:'ok' };
      case 'unavailable': return { text:'שירות ה-AI אינו זמין כרגע', tip:'ודא ש-start.bat פועל ונסה שוב.', recheck:true, tone:'bad' };
      default:            return { text:'מצב שירות ה-AI טרם נבדק', tip:'', recheck:false, tone:'idle' };
    }
  };
  window._aiRenderServiceStatus = function(){
    var targets = ['ai-svc-quote','ai-svc-chat'].map(function(id){ return document.getElementById(id); }).filter(Boolean);
    if (!targets.length) return;
    if (!window._aiHasAccess()){ targets.forEach(function(t){ t.innerHTML=''; t.style.display='none'; }); return; }   // לא-מורשה → אין חיווי
    var info = window._aiStatusInfo();
    var color = { ok:'#059669', bad:'#dc2626', busy:'#7c3aed', idle:'#6b7280' }[info.tone] || '#6b7280';
    var tip = (info.tip||'').replace(/"/g,'&quot;');
    var html = '<span title="'+tip+'" style="color:'+color+';font-weight:700">'+info.text+'</span>';
    if (info.recheck) html += ' <button type="button" onclick="window._aiRecheckHealth&&window._aiRecheckHealth()"'+(window._aiHealthInFlight?' disabled':'')+' style="margin-inline-start:6px;font-size:.72rem;padding:2px 9px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">בדוק שוב</button>';
    if (info.recheck && window._aiIsAdmin()) html += '<div style="font-size:.68rem;color:#9ca3af;margin-top:3px">אם start.bat כבר פתוח, סגור והפעל אותו מחדש כדי לטעון את גרסת השירות החדשה.</div>';
    targets.forEach(function(t){ t.style.display=''; t.innerHTML = html; });
  };
  // מיפוי שגיאות → הודעות משתמש קצרות (בלי response/stack/payload/prompt/מפתחות)
  window._aiFriendlyError = function(err){
    var m = (err && err.message) || String(err||'');
    try { if (window._aiIsAdmin()) console.warn('[AI] ' + m.slice(0,160)); } catch(e){}   // למנהל: טכני מצומצם ב-console
    if (/שמירת הבקשה לענן נכשלה/.test(m)) return 'לא ניתן להעביר את הבקשה לשירות הענן.';
    if (/start\.bat|לא הגיב דרך הענן|Failed to fetch|NetworkError/i.test(m)) return 'שירות ה-AI אינו זמין כרגע. ודא ש-start.bat פועל או נסה שוב מאוחר יותר.';
    if (/timeout|לא הגיב בזמן|timed out/i.test(m)) return 'שירות ה-AI לא החזיר תשובה בזמן. אפשר לנסות שוב.';
    if (/API\s*\d|api error|overloaded|rate|\b4\d\d\b|\b5\d\d\b/i.test(m)) return 'שירות ה-AI החזיר שגיאה. נסה שוב בעוד מספר דקות.';
    return 'לא ניתן להשלים את הבקשה כרגע.';
  };
  // מחזור-חיים של בקשה — מונע ע"י המונה _criticalOperations['ai-request'] (תומך מקביליות)
  window._aiStartRequestStatus = function(route){
    window._aiSetServiceState({ requestActive:true, slow:false, requestRoute: route || null });
    if (!window._aiSlowTimer){
      window._aiSlowTimer = setTimeout(function(){ window._aiSlowTimer=null; if (window._aiActiveCount()>0) window._aiSetServiceState({ slow:true }); }, window._AI_SLOW_MS);
    }
  };
  window._aiEndRequestStatus = function(okFlag, route){
    if (okFlag && route) window._aiSetServiceState({ status:route, requestRoute:route, lastSuccessAt:Date.now() });
    else if (okFlag)     window._aiSetServiceState({ lastSuccessAt:Date.now() });
    if (window._aiActiveCount() <= 0){                 // כל הבקשות הסתיימו (אחרי decrement של המונה)
      if (window._aiSlowTimer){ clearTimeout(window._aiSlowTimer); window._aiSlowTimer=null; }
      window._aiSetServiceState({ requestActive:false, slow:false, requestRoute:null });
      if (!okFlag){ try { window._aiCheckServiceHealth && window._aiCheckServiceHealth().then(function(){ window._aiRenderServiceStatus(); }, function(){ window._aiRenderServiceStatus(); }); } catch(e){} }
    }
  };
  window._aiRecheckHealth = function(){
    if (window._aiHealthInFlight) return;              // כבר בבדיקה
    var pr = window._aiCheckServiceHealth();           // מסמן inFlight + status=checking
    window._aiSetServiceState({});                     // render מיידי (הכפתור ננעל)
    pr.then(function(){ window._aiRenderServiceStatus(); }, function(){ window._aiRenderServiceStatus(); });
  };
  // ── polling רק בזמן שחלון AI פתוח (timer יחיד; לא גלובלי; לא בזמן בקשה פעילה) ──
  window._aiAnyWindowOpen = function(){
    try {
      var q = document.getElementById('aiQuoteModal'); if (q && q.style && q.style.display && q.style.display !== 'none') return true;
      var c = document.getElementById('ai-chat-panel'); if (c && c.classList && c.classList.contains('open')) return true;
    } catch(e){}
    return false;
  };
  window._aiStartHealthPolling = function(){
    if (!window._aiHasAccess()) return;                // לא-מורשה → בלי health כלל
    window._aiCheckServiceHealth().then(function(){ window._aiRenderServiceStatus(); }, function(){ window._aiRenderServiceStatus(); });
    if (window._aiHealthPollTimer) return;             // timer יחיד
    window._aiHealthPollTimer = setInterval(function(){
      if (!window._aiAnyWindowOpen()){ window._aiStopHealthPolling(); return; }   // חלון נסגר → בטל
      if (window._aiServiceState.requestActive || window._aiHealthInFlight) return;
      window._aiCheckServiceHealth().then(function(){ window._aiRenderServiceStatus(); }, function(){ window._aiRenderServiceStatus(); });
    }, 60000);
  };
  window._aiStopHealthPolling = function(){
    if (window._aiAnyWindowOpen()) return;             // חלון AI אחר עדיין פתוח → אל תבטל
    if (window._aiHealthPollTimer){ clearInterval(window._aiHealthPollTimer); window._aiHealthPollTimer=null; }
  };
})();
// ══════ סוף חיווי מצב שירות AI ══════
