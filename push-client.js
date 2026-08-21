/* ═══════════════════════════════════════════════════════════════════════════
   push-client.js — הרשמת-הדפדפן להקפצות גם כשאף חלון אינו פתוח
   (בקשת-בעלים 21/08/2026). צד-שרת: functions/push.js.

   ⚠️ ‏Service Worker **בלי fetch-handler בכלל** (push-sw.js): עובד-שירות
   שמטמין דפים היה עוקף את שומר-הגרסה ומחזיר מסכים ישנים לנצח. הקובץ
   מטפל בדחיפות בלבד.

   ⚠️ ההרשמה דורשת הרשאת-Notification שכבר ניתנה — הקוראים (כפתור 🔔)
   מבקשים אותה במחוות-משתמש ואז קוראים ל-enable.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var PUBLIC_KEY = 'BJIClc95Zq5mYr4mzX9sZACMk_nEG_kggzLh0QrmVouoKsntdwVyfpIOjPqq2nEqpROM8LJ7qMMzprB50yWI9ig';
  var FN = 'https://europe-west1-solan-printing.cloudfunctions.net/pushSubscribe';

  function b64ToBytes(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function supported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  /* getToken: async ‏ID-Token של הצד הקורא (לקוח: PortalContext.authToken;
     צוות: _fbAuthToken). ‏url: מה ייפתח בלחיצה על ההקפצה. */
  async function enable(getToken, url) {
    if (!supported()) return { ok: false, why: 'הדפדפן אינו תומך בהקפצות-רקע' };
    if (Notification.permission !== 'granted') return { ok: false, why: 'אין הרשאת-התראות' };
    var reg;
    try { reg = await navigator.serviceWorker.register('push-sw.js'); }
    catch (e) { console.error('רישום עובד-ההקפצות נכשל', e); return { ok: false, why: 'רישום עובד-ההקפצות נכשל' }; }
    var sub;
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true,
        applicationServerKey: b64ToBytes(PUBLIC_KEY) });
    } catch (e) {
      console.error('יצירת מנוי-הדחיפה נכשלה', e);
      return { ok: false, why: 'הדפדפן סירב למנוי-דחיפה' };
    }
    var t = null;
    try { t = await getToken(); } catch (e) { console.error('אסימון-זהות להרשמה לא הושג', e); }
    if (!t) return { ok: false, why: 'אין זהות מאומתת — נסו לרענן' };
    var r;
    try {
      r = await fetch(FN, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: JSON.stringify({ data: { sub: sub.toJSON(), url: String(url || location.href) } }) });
    } catch (e) { return { ok: false, why: 'אין חיבור לשרת-ההרשמה' }; }
    /* ⚠️ ‏r.ok נבדק — 401/403 הם תגובה תקינה, לא חריגה */
    if (!r.ok) {
      var j = await r.json().catch(function(){ return {}; });
      console.error('שמירת מנוי-הדחיפה נדחתה', r.status, j);
      return { ok: false, why: 'השרת דחה את ההרשמה (' + r.status + ')' };
    }
    return { ok: true };
  }

  root.SolanPush = { supported: supported, enable: enable, PUBLIC_KEY: PUBLIC_KEY };
})(typeof self !== 'undefined' ? self : this);
