const STATIC_CACHE = 'athena-static-v2';
const OFFLINE_URL = '/offline.html';
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
  '/js/pages/scrolls.js',
  '/js/pages/artifacts.js',
  '/js/pages/inbox.js',
  '/js/pages/chronicle.js',
  '/js/sse.js',
  '/assets/owl.svg',
  '/assets/icon-192.svg',
  '/assets/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const accepts = request.headers.get('accept') || '';
  const isNavigation = request.mode === 'navigate' || accepts.includes('text/html');

  if (request.method !== 'GET') {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
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
