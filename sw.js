/* Service Worker for physics.sheua.com 3D Science Virtual Lab */
const CACHE_NAME = 'sheua-lab-v20261127b';
const PRECACHE_URLS = [
  '/',
  '/uk/',
  '/assets/styles.css?v=20261127b',
  '/assets/app.js?v=20261127b',
  '/favicon.svg',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/about.html',
  '/privacy.html',
  '/terms.html'
];

const BYPASS_HOSTS = [
  'googlesyndication.com',
  'googleads.g.doubleclick.net',
  'doubleclick.net',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'fundingchoicesmessages.google.com',
  'adtrafficquality.google'
];

const CDN_CACHEABLE_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('sheua-lab-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // Never intercept ad network, consent, or analytics traffic
  if (BYPASS_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    return;
  }

  // Cache-first for immutable CDN libraries (Three.js 0.169.0, KaTeX 0.16.11, Google Fonts)
  if (CDN_CACHEABLE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && (fresh.ok || fresh.type === 'opaque')) {
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Only handle same-origin requests beyond CDN allowlist
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname === '/ads.txt') return;

  const isHtmlNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHtmlNav) {
    // Network-first for HTML pages with offline fallback to cached page or app shell
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cleanUrl = new URL(url.origin + url.pathname);
            cache.put(cleanUrl.toString(), fresh.clone());
          }
          return fresh;
        } catch (err) {
          const exact = await cache.match(url.origin + url.pathname) || await cache.match(req, { ignoreSearch: true });
          if (exact) return exact;
          const isUk = url.pathname.startsWith('/uk/');
          const shell = await cache.match(isUk ? '/uk/' : '/') || await cache.match('/');
          return shell || Response.error();
        }
      })
    );
    return;
  }

  // Stale-while-revalidate for local static assets (JS, CSS, SVG, PNG, manifest)
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req) || await cache.match(req, { ignoreSearch: false });
      const networkPromise = fetch(req)
        .then(fresh => {
          if (fresh && fresh.ok) {
            cache.put(req, fresh.clone());
          }
          return fresh;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(networkPromise);
        return cached;
      }
      const fresh = await networkPromise;
      return fresh || (await cache.match(req, { ignoreSearch: true })) || Response.error();
    })
  );
});
