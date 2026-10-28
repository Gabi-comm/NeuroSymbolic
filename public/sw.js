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
