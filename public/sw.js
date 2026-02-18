// Lunar Cycles — Service Worker
// Strategy: cache-first for assets, network-first for the page itself.
// This lets the app load offline after first visit.

const CACHE_NAME = 'lunar-cycles-v1';

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cache core assets ───────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: serve from cache, fall back to network ─────────────
self.addEventListener('fetch', event => {
  // Don't intercept non-GET or cross-origin requests (e.g. Google Fonts, Nominatim)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Return cached version immediately, but also refresh in background
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      return cached || networkFetch;
    })
  );
});
