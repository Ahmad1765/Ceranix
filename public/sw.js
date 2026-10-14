// Grabsty service worker — web push only (no offline caching).
// Payload comes from supabase/functions/send-push/webPush.ts:
//   { title, body, url, tag, data }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    (async () => {
      // Someone looking at the app already sees the message (and the Activity
      // tab dot); a system banner on top of that is noise.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((c) => c.focused && c.visibilityState === 'visible')) return;

      await self.registration.showNotification(payload.title || 'Grabsty', {
        body: payload.body || '',
        icon: '/notification-icon.png',
        badge: '/notification-icon.png',
        tag: payload.tag || 'grabsty',
        renotify: true,
        data: { url: typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await existing.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
