/**
 * viewport.js — Coctus AI responsive shell engine.
 *
 * This is the FIRST script the page loads, and it is fully self-contained:
 * it queries the DOM directly instead of depending on app.js's shared
 * `els` object, so the mobile/desktop shell — sidebar drawer, real
 * viewport height, keyboard-safe composer — is wired up and correct even
 * if app.js (or any CDN script it depends on) loads slowly, throws, or
 * never runs at all. CSS already defaults to a safe, correct layout with
 * zero JS (see the mobile block in css/style.css); this file is what
 * makes the drawer *interactive* on top of that safe default.
 *
 * EVERY feature block below is independently try/catched. Earlier versions
 * of this file had one uncaught exception anywhere (e.g. an environment
 * where a given API behaves unexpectedly) silently kill the ENTIRE script —
 * including the sidebar wiring, which had nothing to do with whatever
 * actually failed. That's an unacceptable failure mode for the one file
 * that's supposed to be the safety net; each piece here now stands on its
 * own, and the sidebar (the most important piece) is wired first.
 */
(function () {
  'use strict';

  // ---- mobile/desktop detection, with a fallback if matchMedia itself is
  // ever unavailable or throws (some embedded/legacy WebViews) ----
  var MOBILE_BREAKPOINT = 720;
  var mq = null;
  try { mq = window.matchMedia('(max-width: ' + MOBILE_BREAKPOINT + 'px)'); } catch (e) { mq = null; }
  function isMobile() {
    try {
      if (mq) return mq.matches;
    } catch (e) { /* fall through to width check */ }
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  // ================= 1. sidebar drawer (most important — wired first) =================
  var api = { isMobile: isMobile };
  window.CoctusViewport = api;

  function wireSidebar() {
    var app = document.getElementById('app');
    var backdrop = document.getElementById('backdrop');
    var toggleBtn = document.getElementById('toggleSidebar');
    var closeBtn = document.getElementById('closeSidebar');
    if (!app) return; // nothing to wire yet — caller retries on DOMContentLoaded

    function updateBackdrop() {
      if (!backdrop) return;
      backdrop.classList.toggle('hidden', !(isMobile() && app.classList.contains('sidebar-open')));
    }
    function openDrawer() { if (isMobile()) { app.classList.add('sidebar-open'); updateBackdrop(); } }
    function closeDrawer() { app.classList.remove('sidebar-open'); updateBackdrop(); }
    function toggleDrawer() {
      if (isMobile()) app.classList.toggle('sidebar-open');
      else app.classList.toggle('sidebar-collapsed'); // desktop manual collapse, unrelated state
      updateBackdrop();
    }

    api.openDrawer = openDrawer;
    api.closeDrawer = closeDrawer;
    api.toggleDrawer = toggleDrawer;

    if (toggleBtn) toggleBtn.addEventListener('click', toggleDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    // Crossing the mobile/desktop breakpoint (rotating a tablet, resizing a
    // window) always resets to a clean state instead of getting stuck
    // mid-transition.
    var lastMobile = isMobile();
    window.addEventListener('resize', function () {
      try {
        var nowMobile = isMobile();
        if (nowMobile !== lastMobile) {
          app.classList.remove('sidebar-open');
          app.classList.remove('sidebar-collapsed');
          updateBackdrop();
          lastMobile = nowMobile;
        }
      } catch (e) { /* never let a resize handler throw */ }
    });
    updateBackdrop();
  }

  function initSidebar() {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          try { wireSidebar(); } catch (e) { console.error('[Coctus] sidebar wiring failed', e); }
        });
      } else {
        wireSidebar();
      }
    } catch (e) { console.error('[Coctus] sidebar init failed', e); }
  }
  initSidebar();

  // ================= 2. real viewport height =================
  // Keyboard-aware `--app-height`. Independent of everything else — if this
  // fails, CSS's own `100vh`/`100dvh` declarations still apply.
  (function initHeightEngine() {
    try {
      var root = document.documentElement;
      function applyHeight() {
        try {
          var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
          root.style.setProperty('--app-height', h + 'px');
        } catch (e) { /* CSS falls back to 100vh/100dvh */ }
      }
      var raf = null;
      function scheduleHeight() {
        try {
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(applyHeight);
        } catch (e) { applyHeight(); }
      }
      applyHeight();
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleHeight);
        window.visualViewport.addEventListener('scroll', scheduleHeight);
      }
      window.addEventListener('resize', scheduleHeight);
      window.addEventListener('orientationchange', function () { setTimeout(applyHeight, 120); });
    } catch (e) { console.error('[Coctus] height engine failed', e); }
  })();

  // ================= 3. keep focused fields above the keyboard =================
  try {
    document.addEventListener('focusin', function (e) {
      try {
        var t = e.target;
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
          setTimeout(function () { t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
        }
      } catch (err) { /* never block focus over a scroll failure */ }
    });
  } catch (e) { console.error('[Coctus] keyboard-safe focus failed', e); }

  // ================= 4. surface runtime errors visibly =================
  try {
    function toast(message) {
      try {
        var stack = document.getElementById('toastStack');
        if (!stack) { console.error('[Coctus]', message); return; }
        var el = document.createElement('div');
        el.className = 'toast error';
        el.textContent = message;
        stack.appendChild(el);
        setTimeout(function () { el.remove(); }, 10000);
      } catch (e) { /* if even the toast fails, at least it's in the console */ }
    }
    window.addEventListener('error', function (e) {
      toast('Something failed to load or crashed: ' + (e.message || 'script error') + '. Try reloading.');
    });
    window.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason && (e.reason.message || String(e.reason));
      toast('Something went wrong: ' + (reason || 'unhandled error') + '. Try reloading.');
    });
  } catch (e) { console.error('[Coctus] error-toast wiring failed', e); }

  // ================= 5. auto-apply service worker updates =================
  // Currently inert — app.js actively UNREGISTERS any service worker while
  // this app is under active development (see sw.js's header comment for
  // why). Left in place, harmless, for whenever PWA caching is re-enabled:
  // the moment a new SW takes control, reload once automatically so a fix
  // always lands on the very next load instead of needing an extra manual
  // refresh nobody would know to do.
  try {
    if ('serviceWorker' in navigator) {
      var reloadedForUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      });
    }
  } catch (e) { console.error('[Coctus] service worker update listener failed', e); }
})();
