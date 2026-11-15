// The build stamps this version; only public offline artwork is cached.
const RELEASE = '__COP_COIN_RELEASE__';
const BASE = new URL(self.registration.scope);
const CACHE_PREFIX = `cop-coin-offline:${BASE.href}:`;
const CACHE = CACHE_PREFIX + RELEASE;
const OFFLINE = new URL('offline.html', BASE).href;
const OFFLINE_ASSETS = new Set([
  OFFLINE,
  ...['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']
    .map(file => new URL(`assets/brand/app-icons/${file}`, BASE).href),
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...OFFLINE_ASSETS].map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const appNavigation = request.mode === 'navigate'
    && (url.pathname === BASE.pathname || url.pathname === `${BASE.pathname}index.html`);
  if (appNavigation) {
    // Always fetch the current release. Never store account pages or old app code.
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(OFFLINE) || new Response('You are offline. Reconnect and try again.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }));
  } else if (OFFLINE_ASSETS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return await cache.match(request) || Response.error();
      }
    })());
  }
  // Wallet data, game providers, API calls, scripts and styles use the network unchanged.
});
