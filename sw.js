// Service Worker — סולן הדפסות
// אחראי בלעדית על קליטת הודעות Push והצגתן, גם כשהאתר/אפליקציה סגורים.
// אסור להוסיף כאן לוגיקת caching של האפליקציה עצמה (אין offline mode מתוכנן) —
// המטרה היחידה כרגע היא Web Push.

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {
    data = { title: 'סולן הדפסות', body: event.data ? event.data.text() : '' };
  }
  var title = data.title || '🖨️ סולן הדפסות';
  var options = {
    body: data.body || 'נוצר כרטיס עבודה חדש',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    dir: 'rtl',
    lang: 'he',
    data: { url: data.url || './', cardId: data.cardId || null },
    tag: data.tag || undefined,
    // ציפצוף/רטט בקבלת התראה (כמו בוואטסאפ) — הדפדפן מפעיל את צליל ההתראה
    // הסטנדרטי של המכשיר; silent:false מבטיח שזה לא יושתק, וה-vibrate נותן
    // רטט גם אם המכשיר ב"שקט". renotify מבטיח שגם אם מגיעה התראה נוספת
    // עם אותו tag היא תצפצף/תרטוט מחדש ולא תוחלף בשקט.
    silent: false,
    vibrate: [250, 100, 250],
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// קליק על ההתראה — פותח/מביא לקדמה טאב קיים של האפליקציה, ופותח בו
// (או באפליקציה החדשה שתיפתח) את הכרטיס הספציפי שעליו הגיעה ההתראה.
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var ndata = event.notification.data || {};
  var url = ndata.url || './';
  var cardId = ndata.cardId || null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientsArr) {
      for (var i = 0; i < clientsArr.length; i++) {
        var c = clientsArr[i];
        if ('focus' in c) {
          c.focus();
          // האפליקציה כבר פתוחה — שולחים לה הודעה לפתוח את הכרטיס בלי לרענן
          if (cardId && 'postMessage' in c) c.postMessage({ type: 'openCard', cardId: cardId });
          return;
        }
      }
      if (self.clients.openWindow) {
        var openUrl = cardId ? (url + (url.indexOf('?') > -1 ? '&' : '?') + 'openCard=' + cardId) : url;
        return self.clients.openWindow(openUrl);
      }
    })
  );
});
