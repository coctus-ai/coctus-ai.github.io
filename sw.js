/**
 * sw.js — caches the app shell (HTML/CSS/JS/icons) so Coctus AI opens
 * instantly and its UI still loads with no connection, letting you browse
 * past sessions (stored in localStorage, not here) even offline. Actual AI
 * calls still need a live connection — that part can't be cached.
 */
const CACHE_NAME = 'coctus-shell-v11';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/agent.js',
  './js/models.js',
  './js/memory.js',
  './js/tools.js',
  './js/workspace.js',
  './js/files.js',
  './js/documents.js',
  './js/validate.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch((err) => console.warn('Coctus SW: shell cache failed (offline install?)', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Same-origin app-shell files: cache-first, refresh cache in the background.
// Everything else (Puter API calls, CDN libs, live tool fetches): network-only,
// pass straight through — these must never be served stale.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
