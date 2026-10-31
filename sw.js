/* Cache offline limitata alla shell dell'app. Le quote online non vengono inventate né cacheate da domini esterni. */
const RELEASE = 'sb-v26-20261031';
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
  `./js/coverage.js${VERSION_QUERY}`,
  `./js/cover-bet.js${VERSION_QUERY}`,
  './data/serie-a-teams.json',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  `./favicon-32.png${VERSION_QUERY}`,
  `./icon-192.png${VERSION_QUERY}`,
  `./icon-512.png${VERSION_QUERY}`,
  `./icon-maskable-512.png${VERSION_QUERY}`,
  `./apple-touch-icon.png${VERSION_QUERY}`,
  `./app-icon-192.png${VERSION_QUERY}`,
  `./app-icon-512.png${VERSION_QUERY}`,
  `./app-icon-maskable-512.png${VERSION_QUERY}`,
  `./app-apple-touch-icon.png${VERSION_QUERY}`
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

// Rete prima, ma senza far aspettare: con segnale debole la copia in cache viene servita dopo NETWORK_TIMEOUT_MS
// mentre la richiesta continua in background e aggiorna la cache per la visita successiva.
// "no-cache" obbliga a rivalidare col server: senza, la cache HTTP del browser (GitHub Pages usa max-age=600)
// poteva servire un index.html vecchio fino a 10 minuti anche con la rete disponibile.
const NETWORK_TIMEOUT_MS = 3500;
async function networkFirst(event, fallbackUrl) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new URL(fallbackUrl, self.registration.scope).href;
  const network = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async response => {
    if (response && response.ok) await cache.put(cacheKey, response.clone());
    return response;
  });
  const settled = network.catch(() => null);   // evita errori non gestiti se la rete cade dopo il timeout
  event.waitUntil(settled);                    // lascia finire l'aggiornamento della cache in background
  const cached = await cache.match(cacheKey);
  if (!cached) return network;
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  const response = await Promise.race([settled, timeout]);
  return response && response.ok ? response : cached;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, './index.html'));
    return;
  }

  // Il catalogo squadra può essere richiesto con un parametro anti-cache variabile: salva e riusa la chiave canonica.
  if (url.pathname.endsWith('/data/serie-a-teams.json')) {
    event.respondWith(networkFirst(event, './data/serie-a-teams.json'));
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
