/* Cache offline limitata alla shell dell'app. Le quote online non vengono inventate né cacheate da domini esterni. */
const RELEASE = 'sb-outline-v13-20261026';
const CACHE_NAME = `sistema-scommesse-builder-shell-${RELEASE}`;
const CACHE_PREFIX = 'sistema-scommesse-builder-shell-';
const VERSION_QUERY = `?v=${RELEASE}`;
const CORE_ASSETS = [
  './',
  './index.html',
  `./style.css${VERSION_QUERY}`,
  `./app.js${VERSION_QUERY}`,
  `./manifest.webmanifest${VERSION_QUERY}`,
  `./js/parser.js${VERSION_QUERY}`,
  `./js/generator.js${VERSION_QUERY}`,
  `./js/filters.js${VERSION_QUERY}`,
  `./js/calculator.js${VERSION_QUERY}`,
  `./js/config.js${VERSION_QUERY}`,
  `./js/exporter.js${VERSION_QUERY}`,
  `./js/backup.js${VERSION_QUERY}`,
  `./js/selection.js${VERSION_QUERY}`,
  `./js/quote-sheet.js${VERSION_QUERY}`,
  `./js/probability.js${VERSION_QUERY}`,
  `./js/stake.js${VERSION_QUERY}`,
  './data/serie-a-teams.json',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  `./favicon-32.png${VERSION_QUERY}`,
  `./icon-192.png${VERSION_QUERY}`,
  `./icon-512.png${VERSION_QUERY}`,
  `./icon-maskable-512.png${VERSION_QUERY}`,
  `./apple-touch-icon.png${VERSION_QUERY}`
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS.map(path => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = new URL(fallbackUrl, self.registration.scope).href;
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const fallback = await cache.match(new URL(fallbackUrl, self.registration.scope).href);
    if (fallback) return fallback;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  // Il catalogo squadra può essere richiesto con un parametro anti-cache variabile: salva e riusa la chiave canonica.
  if (url.pathname.endsWith('/data/serie-a-teams.json')) {
    event.respondWith(networkFirst(request, './data/serie-a-teams.json'));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const unversioned = new URL(request.url);
      unversioned.search = '';
      const fallback = await cache.match(unversioned.href);
      if (fallback) return fallback;
      throw error;
    }
  })());
});
