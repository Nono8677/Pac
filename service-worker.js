const CACHE_NAME = 'pachecoin-v10';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => {
        return Promise.all(keys.map((k) => { if (k !== CACHE_NAME) return caches.delete(k); }));
    }));
});
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request).catch(() => caches.match(e.request))));
