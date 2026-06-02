/**
 * GPU Monitor Service Worker
 *
 * Caches static assets for offline access and instant loading.
 * API requests always go through to the server.
 */

const CACHE_NAME = 'gpu-monitor-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve from cache for static, network for API
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // API requests always go to network
  if (request.url.includes('/api/')) {
    return;
  }

  // Static assets: cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            // Update cache with fresh version
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(request, responseClone));
            }
            return response;
          })
          .catch(() => cached); // Fallback to cache if network fails

        return cached || fetchPromise;
      })
  );
});
