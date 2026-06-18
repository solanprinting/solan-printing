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
    data: { url: data.url || './' },
    tag: data.tag || undefined
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// קליק על ההתראה — פותח/מביא לקדמה טאב קיים של האפליקציה במקום לפתוח טאב כפול
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientsArr) {
      for (var i = 0; i < clientsArr.length; i++) {
        var c = clientsArr[i];
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
