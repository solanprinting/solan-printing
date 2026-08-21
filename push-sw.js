/* ═══════════════════════════════════════════════════════════════════════════
   push-sw.js — עובד-השירות של ההקפצות (21/08/2026).

   ⚠️⚠️ **אין כאן fetch-handler, ואסור שיהיה.** עובד-שירות שמטמין דפים
   היה עוקף את שומר-הגרסה (version.txt) ומגיש מסכים ישנים לנצח — בדיוק
   מסוג התקלות שהכי קשה לאבחן מרחוק. הקובץ הזה מטפל אך ורק בדחיפות.
   סנטינל: push-plan-tests.js נכשל אם מופיע כאן fetch-listener.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  var title = d.title || 'סולן הדפסות';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    tag: d.tag || 'solan-push',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    dir: 'rtl',
    lang: 'he',
    renotify: true,
    data: { url: d.url || '' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    /* חלון קיים של האתר — מקבל פוקוס; אחרת נפתח היעד שנשמר בהרשמה */
    for (var i = 0; i < list.length; i++) {
      if (list[i].url && list[i].url.indexOf('solan') >= 0 && 'focus' in list[i]) return list[i].focus();
    }
    if (url && self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
