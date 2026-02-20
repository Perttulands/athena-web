const STATIC_CACHE = 'athena-static-v4';
const API_CACHE = 'athena-api-v1';
const OFFLINE_URL = '/offline.html';
const API_CACHE_MAX_ENTRIES = 50;
const FETCH_TIMEOUT_MS = 10000;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/app.css',
  '/css/reset.css',
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  '/css/pages.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/api.js',
  '/js/animations.js',
  '/js/components.js',
  '/js/gestures.js',
  '/js/markdown.js',
  '/js/pages/oracle.js',
  '/js/pages/beads.js',
  '/js/pages/agents.js',
  '/js/pages/portal.js',
  '/js/pages/scrolls.js',
  '/js/pages/artifacts.js',
  '/js/pages/inbox.js',
  '/js/pages/chronicle.js',
  '/js/pages/health.js',
  '/js/pages/tapestry.js',
  '/js/sse.js',
  '/assets/owl.svg',
  '/assets/icon-192.svg',
  '/assets/icon-512.svg'
];

// API paths eligible for offline caching (read-only data endpoints)
const CACHEABLE_API_PATHS = [
  '/api/status',
  '/api/beads',
  '/api/tapestry',
  '/api/timeline',
  '/api/health-dashboard',
  '/api/runs'
];

function isApiCacheable(pathname) {
  return CACHEABLE_API_PATHS.some((p) => pathname === p || pathname.startsWith(p + '?'));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const KEEP = new Set([STATIC_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => !KEEP.has(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

/**
 * Trim API cache to max entries (FIFO by insertion order).
 */
async function trimApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  if (keys.length > API_CACHE_MAX_ENTRIES) {
    const excess = keys.slice(0, keys.length - API_CACHE_MAX_ENTRIES);
    await Promise.all(excess.map((key) => cache.delete(key)));
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const accepts = request.headers.get('accept') || '';
  const isNavigation = request.mode === 'navigate' || accepts.includes('text/html');

  if (request.method !== 'GET') {
    return;
  }

  // API routes: network-first with stale fallback for cacheable endpoints
  if (url.pathname.startsWith('/api/')) {
    if (isApiCacheable(url.pathname)) {
      event.respondWith(
        fetch(request, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
          .then((response) => {
            if (response.ok) {
              const cloned = response.clone();
              caches.open(API_CACHE).then((cache) => {
                cache.put(request, cloned);
                trimApiCache();
              });
            }
            return response;
          })
          .catch(() =>
            caches.open(API_CACHE).then((cache) => cache.match(request))
              .then((cached) => {
                if (cached) return cached;
                return new Response(JSON.stringify({ error: 'Offline' }), {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                });
              })
          )
      );
    } else {
      // Non-cacheable API: network-only with offline fallback
      event.respondWith(
        fetch(request, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
          .catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }))
      );
    }
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => {
          if (isNavigation) {
            return caches.match(OFFLINE_URL);
          }

          return Response.error();
        });
    })
  );
});
