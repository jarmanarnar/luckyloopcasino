import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createAppServer } from '../server.mjs';

let server, origin;
before(async () => {
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test('canonical page serves LuckyLoop branding and local styles', async () => {
  const response = await fetch(`${origin}/luckyloop-casino/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>LuckyLoop Casino<\/title>/);
  assert.match(html, /href="styles.css"/);
  assert.match(html, /href="wallet.css"/);
  assert.match(html, /src="app.js"/);
  assert.doesNotMatch(html, /<style>/);
});

test('root and old entry links redirect to the branded path with query intact', async () => {
  for (const entry of ['/', '/atomic-design/', '/atomic-design/index.html', '/luckyloop-casino']) {
    const response = await fetch(`${origin}${entry}?review=1`, { redirect: 'manual' });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), '/luckyloop-casino/?review=1');
  }
});

test('legacy asset links point at the same current app', async () => {
  const response = await fetch(`${origin}/atomic-design/app.js`, { redirect: 'manual' });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/luckyloop-casino/app.js');
});

test('scripts, styles and genuine provider SVGs are served with correct types', async () => {
  for (const [file, type] of [['app.js', 'text/javascript'], ['styles.css', 'text/css'],
    ['assets/providers/netent.svg', 'image/svg+xml']]) {
    const response = await fetch(`${origin}/luckyloop-casino/${file}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await fetch(`${origin}/luckyloop-casino/app.js`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('private files, archives and the rejected mobile preview are not served', async () => {
  for (const route of ['/package.json', '/.git/config', '/crown/', '/artifacts/',
    '/luckyloop-casino/preview/', '/luckyloop-casino/..%2fpackage.json',
    '/luckyloop-casino/%2e%2e%5cpackage.json']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 404, route);
  }
});

test('unsupported mutations are rejected', async () => {
  const response = await fetch(`${origin}/luckyloop-casino/`, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
