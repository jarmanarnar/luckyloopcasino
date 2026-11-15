import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { registerPwa } from '../public/pwa.js';
import { createAppServer } from '../server.mjs';

const root = new URL('../public/', import.meta.url);
const workerSource = await readFile(new URL('sw.js', root), 'utf8');
const base = 'https://example.test/luckyloopcasino/';

test('Install metadata works under the local and deployed subpath, with actual correctly sized PNGs', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'COP COIN');
  for (const address of ['http://127.0.0.1:4323/luckyloopcasino/', base]) {
    for (const field of ['id', 'scope', 'start_url']) assert.equal(new URL(manifest[field], address).href, address);
  }
  const icons = [...manifest.icons, { src: 'assets/brand/app-icons/apple-touch-icon.png', sizes: '180x180' }];
  for (const icon of icons) {
    const png = await readFile(new URL(icon.src, root));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test('The local server exposes the manifest, worker, offline page and icons with browser-safe MIME types', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [file, type] of [['manifest.webmanifest', 'application/manifest+json'], ['sw.js', 'text/javascript'],
      ['offline.html', 'text/html'], ['assets/brand/app-icons/apple-touch-icon.png', 'image/png']]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/luckyloopcasino/${file}`);
      assert.equal(response.status, 200, file);
      assert.ok(response.headers.get('content-type').startsWith(type), file);
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('Registration is scoped, bypasses stale worker caches and fails without blocking the app', async () => {
  assert.equal(await registerPwa({ isSecureContext: false }), null);
  assert.equal(await registerPwa({ isSecureContext: true, navigator: {} }), null);
  const calls = [];
  const registration = {};
  const win = { isSecureContext: true, navigator: { serviceWorker: { async register(...args) { calls.push(args); return registration; } } } };
  assert.equal(await registerPwa(win), registration);
  assert.equal(calls[0][0], new URL('sw.js', root).href);
  assert.equal(calls[0][1].scope, root.href);
  assert.equal(calls[0][1].updateViaCache, 'none');
  win.navigator.serviceWorker.register = async () => { throw new Error('Unavailable'); };
  assert.equal(await registerPwa(win), null);
});

function worker() {
  const listeners = new Map(), stores = new Map(), requests = [];
  let offline = false, skipped = false, claimed = false;
  const key = request => typeof request === 'string' ? request : request.url;
  const network = async request => {
    requests.push(key(request));
    if (offline) throw new Error('Offline');
    return new Response(`network: ${key(request)}`);
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(items) { for (const item of items) store.set(key(item), await network(item)); },
        async match(item) { return store.get(key(item))?.clone(); },
        async put(item, response) { store.set(key(item), response.clone()); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  vm.runInNewContext(workerSource, {
    URL, Request, Response, caches, fetch: network,
    self: {
      registration: { scope: base },
      addEventListener(type, listener) { listeners.set(type, listener); },
      async skipWaiting() { skipped = true; },
      clients: { async claim() { claimed = true; } },
    },
  });
  return {
    stores, requests, caches,
    setOffline(value) { offline = value; },
    get skipped() { return skipped; }, get claimed() { return claimed; },
    async lifecycle(type) { let pending; listeners.get(type)({ waitUntil(work) { pending = work; } }); await pending; },
    request(path = '', { mode = 'navigate', method = 'GET' } = {}) {
      let response;
      listeners.get('fetch')({ request: { url: new URL(path, base).href, mode, method }, respondWith(work) { response = work; } });
      return response;
    },
  };
}

test('The worker caches only offline artwork and serves fresh navigation until the network is unavailable', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.equal(sw.skipped, true);
  const assets = [...[...sw.stores.values()][0].keys()];
  assert.equal(assets.length, 5);
  assert.ok(assets.every(url => url === base + 'offline.html' || url.startsWith(base + 'assets/brand/app-icons/')));
  const online = await sw.request('?modal=products');
  assert.equal(await online.text(), `network: ${base}?modal=products`);
  assert.deepEqual([...sw.stores.values()][0].size, 5, 'No app HTML or account state was cached');
  sw.setOffline(true);
  const fallback = await sw.request();
  assert.equal(await fallback.text(), `network: ${base}offline.html`);
  const icon = await sw.request('assets/brand/app-icons/icon-192.png', { mode: 'no-cors' });
  assert.equal(await icon.text(), `network: ${base}assets/brand/app-icons/icon-192.png`);
});

test('The worker does not intercept account APIs, game providers, scripts, styles or mutations', async () => {
  const sw = worker();
  for (const path of ['wallet.js', 'styles.css', 'api/balance', 'hacksaw-demo.html', '../other-app/', 'https://provider.test/game']) {
    assert.equal(sw.request(path, { mode: path.endsWith('.html') ? 'navigate' : 'cors' }), undefined, path);
  }
  assert.equal(sw.request('', { method: 'POST' }), undefined);
  assert.equal(sw.requests.length, 0);
});

test('Activation removes obsolete scoped offline caches without touching other apps', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  const current = [...sw.stores.keys()][0];
  const old = `cop-coin-offline:${base}:old`;
  await sw.caches.open(old);
  await sw.caches.open('unrelated-cache');
  await sw.caches.open('cop-coin-offline:https://example.test/other-app/:old');
  await sw.lifecycle('activate');
  assert.equal(sw.stores.has(old), false);
  assert.equal(sw.stores.has(current), true);
  assert.equal(sw.stores.size, 3);
  assert.equal(sw.claimed, true);
});

test('A failed install never activates an incomplete offline cache', async () => {
  const sw = worker();
  sw.setOffline(true);
  await assert.rejects(sw.lifecycle('install'), /Offline/);
  assert.equal(sw.skipped, false);
});
