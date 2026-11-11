// OASYS service worker. Deliberately small: pages, Supabase calls and the
// analysis API always go to the network (stale reports or auth would be worse
// than no cache). It only shows public/offline.html when a page can't load.
const CACHE = 'oasys-shell-v1';
const OFFLINE = ['/offline.html', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// New-report alerts for admins (app/api/push/new-report). The payload is
// { title, body, url, tag }; tapping the notification opens `url`, reusing an
// OASYS tab when one is already open.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'OASYS', {
      body: data.body || 'A new report was submitted.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '/admin/reports' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin/reports', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
      if (!tab) return self.clients.openWindow(url);
      // navigate() rejects on a tab this worker does not control; open a new one then.
      return tab
        .focus()
        .then((t) => (t || tab).navigate(url))
        .catch(() => self.clients.openWindow(url));
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { pathname } = new URL(event.request.url);
  // The offline page's own icon, so it still shows with no connection.
  if (OFFLINE.includes(pathname)) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
    return;
  }
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
