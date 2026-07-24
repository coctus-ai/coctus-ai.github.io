/**
 * sw.js — PARKED, NOT CURRENTLY REGISTERED.
 *
 * js/app.js's registerServiceWorker() actively UNREGISTERS any service
 * worker + purges caches instead of registering this file. Reason: two
 * rounds of real, confirmed bugs in this project came from a phone/browser
 * serving a stale mix of cached-old and freshly-deployed files after an
 * update — a service worker is actively hostile to a fast-moving,
 * still-under-active-development static app, since every deploy risks
 * being served from a half-updated cache on top of whatever was cached
 * before. Once the app is stable and changes are infrequent, re-enable by
 * restoring the register() call and bumping CACHE_NAME — but keep the
 * network-first navigation strategy below, and keep testing every update
 * in an incognito/private window first (guaranteed zero prior cache) to
 * confirm before trusting a regular browsing profile.
 *
 * ---
 *
 * Caches the app shell (HTML/CSS/JS/icons) so Coctus AI still opens and its
 * UI still loads with no connection, letting you browse past sessions
 * (stored in localStorage, not here) even offline. Actual AI calls still
 * need a live connection — that part can't be cached.
 *
 * v16 — STRATEGY CHANGE, read this before touching the fetch handler again:
 * v15 and earlier used cache-first-with-background-refresh for every shell
 * file, including index.html itself. That is what caused a real, confirmed
 * bug: after fixing a UI bug in index.html/css/js and shipping new files,
 * a phone that had already installed the SW kept being served the OLD
 * index.html (cache-first == "use the cached copy THIS load, fetch a fresh
 * one for next time"), while other shell files had already background-
 * refreshed to the NEW versions — a half-old/half-new mismatch (new CSS
 * expecting a JS-added class the old cached app.js never set) that looked
 * like a totally broken page.
 *
 * Fix: HTML navigations are now network-first (always try fresh, fall back
 * to cache only if offline) so the shell itself is never stale. Static
 * assets (css/js/icons) stay cache-first for instant loads, since they're
 * versioned together with the HTML and a cache-name bump (below) forces a
 * clean, atomic replacement of all of them at once whenever this file
 * changes. ALWAYS bump CACHE_NAME when you ship a change to any shell file
 * — that's what makes the update atomic instead of a slow background trickle.
 */
const CACHE_NAME = 'coctus-shell-v17';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/viewport.js',
  './js/app.js',
  './js/agent.js',
  './js/models.js',
  './js/memory.js',
  './js/tools.js',
  './js/workspace.js',
  './js/files.js',
  './js/knowledge.js',
  './js/targets.js',
  './js/scan-parser.js',
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  // Navigations (loading/reloading the page itself) — ALWAYS prefer the
  // network so the shell can never be stuck on an old index.html. Cache is
  // only a fallback for genuinely offline use.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Static shell assets: cache-first for speed, background-refreshed for
  // next time. Safe here because a CACHE_NAME bump (see header comment)
  // always replaces the whole set atomically together with index.html.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
