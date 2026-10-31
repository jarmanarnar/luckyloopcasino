import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRoute, initRouter, parseRoute } from '../public/routes.js';

function browser(hash = '', state = null, storage = new Map()) {
  const listeners = new Map(), frames = new Map();
  let frameId = 0, index = 0;
  const entries = [{ url: new URL(`https://example.com/luckyloopcasino/${hash}`), state }];
  const emit = name => { for (const fn of listeners.get(name) || []) fn(); };
  const scope = {
    scrollX: 0, scrollY: 0,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    location: { get href() { return entries[index].url.href; }, get hash() { return entries[index].url.hash; } },
    history: {
      get state() { return entries[index].state; },
      replaceState(state, _title, url) { entries[index] = { state, url: new URL(url, entries[index].url) }; },
      pushState(state, _title, url) {
        const target = new URL(url, entries[index].url);
        entries.splice(index + 1); entries.push({ state, url: target }); index++;
      },
      back() { move(-1); },
    },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollTo({ left, top }) { scope.scrollX = left; scope.scrollY = top; emit('scroll'); },
  };
  function move(direction) {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    index = target; emit('popstate'); emit('hashchange');
  }
  return { scope, move, entries, emit,
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    scroll(y) { scope.scrollY = y; emit('scroll'); },
    manualHash(hash) {
      const url = new URL(hash, scope.location.href);
      entries.splice(index + 1); entries.push({ url, state: null }); index++;
      emit('hashchange');
    },
  };
}

test('reload restores the last page position after rendering without changing the route', () => {
  const first = browser('#/popular');
  initRouter({ window: first.scope });
  first.scroll(420);
  first.emit('pagehide');
  const refreshed = browser(first.scope.location.hash, first.scope.history.state);
  const router = initRouter({ window: refreshed.scope });
  assert.equal(refreshed.scope.scrollY, 0, 'restoration waits until the page has rendered');
  router.restoreInitialScroll();
  assert.equal(refreshed.scope.scrollY, 420);
  assert.deepEqual(router.getRoute(), { type: 'category', categoryId: 'popular' });
  assert.equal(refreshed.entries.length, 1, 'reload must not add a navigation');
  router.navigate({ type: 'home' }); refreshed.flush();
  assert.equal(refreshed.scope.scrollY, 0, 'normal page navigation still starts at the top');
});

test('initial game routes do not restore shell scrolling over the game viewport', () => {
  const page = browser('#game=SanQuentin', { loopRoute: { id: 1, index: 0, scroll: { x: 0, y: 420 } } });
  initRouter({ window: page.scope }).restoreInitialScroll();
  assert.equal(page.scope.scrollY, 0);
});

test('reload uses the last active scroll even when history was snapshotted before pagehide', () => {
  const storage = new Map();
  const first = browser('#/popular', null, storage);
  initRouter({ window: first.scope });
  first.scroll(420);
  const refreshed = browser(first.scope.location.hash, first.scope.history.state, storage);
  initRouter({ window: refreshed.scope }).restoreInitialScroll();
  assert.equal(refreshed.scope.scrollY, 420);
  const otherEntry = browser('#/popular', { loopRoute: { id: 9, index: 1, scroll: { x: 0, y: 0 } } }, storage);
  initRouter({ window: otherEntry.scope }).restoreInitialScroll();
  assert.equal(otherEntry.scope.scrollY, 0, 'tab cache must not leak to a different history entry at the same URL');
});

test('blocked session storage falls back to history without breaking scroll or navigation', () => {
  const storage = { get() { throw new Error('Blocked'); }, set() { throw new Error('Blocked'); } };
  const page = browser('#/popular', { loopRoute: { id: 1, index: 0, scroll: { x: 0, y: 120 } } }, storage);
  const router = initRouter({ window: page.scope });
  router.restoreInitialScroll();
  assert.equal(page.scope.scrollY, 120);
  router.navigate({ type: 'home' }); page.flush();
  assert.equal(page.scope.scrollY, 0);
});

test('category, provider and search links retain their page and filters after refresh', () => {
  const routes = [
    { type: 'home' },
    { type: 'search', query: '' },
    { type: 'favorites' },
    { type: 'favorites', query: 'Dragon & luck', providerId: 'netent', sort: 'saved' },
    { type: 'store' },
    { type: 'category', categoryId: 'popular', providerId: 'netent', query: 'Dragon & luck', sort: 'az' },
    { type: 'category', categoryId: 'new-releases' },
    { type: 'providers', query: 'Tiger' },
    { type: 'provider', providerId: 'red-tiger', categoryId: 'slots', query: 'gold', sort: 'za' },
    { type: 'search', query: 'מזל & +', providerId: 'netent', categoryId: 'slots', sort: 'featured' },
    { type: 'game', gameId: 'SanQuentin', from: '#/popular?provider=netent' },
  ];
  for (const route of routes) {
    const link = formatRoute(route);
    assert.deepEqual(parseRoute(link), route);
    assert.deepEqual(initRouter({ window: browser(link).scope }).getRoute(), route);
  }
  assert.deepEqual(parseRoute('#game=niptuck000000000'), { type: 'game', gameId: 'niptuck000000000' });
  for (const hash of ['#', '#/', '#/unrecognised', '#/providers/%E0%A4%A', '#/providers/../../x']) {
    assert.deepEqual(parseRoute(hash), { type: 'home' });
  }
});

test('removed All Games addresses resolve to Search and preserve their filters on refresh', () => {
  assert.deepEqual(parseRoute('#/'), { type: 'home' });
  assert.equal(formatRoute({ type: 'home' }), '#/');
  assert.equal(formatRoute({ type: 'category', categoryId: 'all' }), '#/search');
  assert.equal(formatRoute({ type: 'search', query: '', categoryId: 'all' }), '#/search');
  const search = { type: 'search', query: 'coin', providerId: 'netent', sort: 'za' };
  for (const alias of ['all-games', 'all']) {
    assert.deepEqual(parseRoute(`#/${alias}`), { type: 'search', query: '' });
    const hash = `#/${alias}?provider=netent&q=coin&sort=za`;
    assert.deepEqual(parseRoute(hash), search);
    const page = browser(hash);
    assert.deepEqual(initRouter({ window: page.scope }).getRoute(), search);
    assert.equal(page.scope.location.hash, formatRoute(search));
    assert.equal(page.entries.length, 1, 'legacy links are replaced without adding a history entry');
  }
});

test('legacy All Games hash navigation canonicalizes in place and details return to Search', () => {
  const page = browser('#/popular');
  const router = initRouter({ window: page.scope });
  const seen = [];
  router.subscribe(route => seen.push(route));
  page.manualHash('#/all-games?q=gold&provider=netent'); page.flush();
  const search = { type: 'search', query: 'gold', providerId: 'netent' };
  assert.deepEqual(router.getRoute(), search);
  assert.equal(page.scope.location.hash, '#/search?q=gold&provider=netent');
  assert.equal(page.entries.length, 2);
  page.emit('popstate'); page.emit('hashchange');
  assert.equal(seen.length, 1, 'normalization does not duplicate the native route events');
  page.move(-1); page.flush();
  assert.deepEqual(router.getRoute(), { type: 'category', categoryId: 'popular' });
  const details = parseRoute(`#/games/niptuck000000000?${new URLSearchParams({ from: '#/all-games?q=nip' })}`);
  assert.equal(details.from, '#/search?q=nip');
});

test('game details have their own refresh-safe address and retain a valid shell origin', () => {
  const origins = ['#/', '#/popular?provider=netent', '#/providers/netent?q=gold&sort=az',
    '#/search?q=nip+%26+tuck&category=slots', '#/favorites?q=gold&provider=netent&sort=az', '#/store', '#/history'];
  for (const from of origins) {
    const details = { type: 'game-details', gameId: 'niptuck000000000', from };
    const hash = formatRoute(details);
    assert.equal(hash, `#/games/niptuck000000000?${new URLSearchParams({ from })}`);
    assert.deepEqual(parseRoute(hash), details);
    assert.deepEqual(initRouter({ window: browser(hash).scope }).getRoute(), details);
  }
  assert.equal(formatRoute({ type: 'game-details', gameId: 'SanQuentin' }), '#/games/SanQuentin');
  assert.deepEqual(parseRoute('#/games/%53anQuentin'), { type: 'game-details', gameId: 'SanQuentin' });
  assert.deepEqual(parseRoute('#/games/SanQuentin?q=ignored&provider=netent'), { type: 'game-details', gameId: 'SanQuentin' });
});

test('game details reject invalid IDs and discard recursive or unknown origins', () => {
  for (const hash of ['#/games', '#/games/', '#/games/../../x', '#/games/%E0%A4%A',
    '#/games/%ZZ', '#/games/a%2Fb', '#/games/a%3Fb', '#/games/%20', '#/games/_invalid']) {
    assert.deepEqual(parseRoute(hash), { type: 'home' }, hash);
  }
  for (const gameId of ['', null, '../x', 'a/b', 'bad id', '?game=valid']) {
    assert.equal(formatRoute({ type: 'game-details', gameId }), '#/');
  }
  const details = { type: 'game-details', gameId: 'SanQuentin' };
  for (const from of ['#game=niptuck000000000', '#/games/niptuck000000000',
    '#/%67ames/niptuck000000000?from=%23%2Fpopular', '#/not-a-page',
    '#/providers/%E0%A4%A', 'https://example.com/#/popular', '/popular', '#/popular/extra']) {
    assert.equal(formatRoute({ ...details, from }), '#/games/SanQuentin', from);
    assert.deepEqual(parseRoute(`#/games/SanQuentin?${new URLSearchParams({ from })}`), details, from);
  }
});

test('active game URLs remain compatible and may return to their pre-game details page', () => {
  const details = { type: 'game-details', gameId: 'niptuck000000000', from: '#/search?q=nip' };
  const game = { type: 'game', gameId: details.gameId, from: formatRoute(details) };
  assert.deepEqual(parseRoute(formatRoute(game)), game);
  assert.deepEqual(parseRoute(parseRoute(formatRoute(game)).from), details);
  assert.deepEqual(parseRoute('#game=SanQuentin&from=%23%2Fpopular'),
    { type: 'game', gameId: 'SanQuentin', from: '#/popular' });
  assert.equal(formatRoute({ type: 'game', gameId: 'SanQuentin' }), '#game=SanQuentin');
  const page = browser(formatRoute(game));
  const router = initRouter({ window: page.scope });
  router.back(parseRoute(router.getRoute().from)); page.flush();
  assert.deepEqual(router.getRoute(), details);
});

test('Store has an independent refresh-safe address and returns through browser history', () => {
  const page = browser('#/providers/netent');
  const router = initRouter({ window: page.scope });
  const calls = [];
  router.subscribe(route => calls.push(`render:${route.type}`));
  router.subscribe(route => calls.push(`cleanup:${route.type}`), { priority: -100 });
  router.navigate({ type: 'store' }); page.flush();
  assert.equal(page.scope.location.hash, '#/store');
  assert.deepEqual(router.getRoute(), { type: 'store' });
  assert.deepEqual(calls, ['cleanup:store', 'render:store']);
  assert.deepEqual(initRouter({ window: browser('#/store').scope }).getRoute(), { type: 'store' });
  assert.deepEqual(parseRoute('#/store?q=gold&provider=netent'), { type: 'store' }, 'catalog filters do not leak into Store');
  router.back(); page.flush();
  assert.deepEqual(router.getRoute(), { type: 'provider', providerId: 'netent' });
  const fresh = initRouter({ window: browser('#/store').scope });
  fresh.back();
  assert.deepEqual(fresh.getRoute(), { type: 'home' });
});

test('routed navigation synchronously cleans the game before a destination renders and deduplicates native events', () => {
  const page = browser('#/popular');
  const router = initRouter({ window: page.scope });
  const calls = [];
  router.subscribe(route => calls.push(`render:${route.type}`));
  router.subscribe(route => calls.push(`cleanup:${route.type}`), { priority: -100 });
  router.navigate({ type: 'game', gameId: 'niptuck000000000', from: '#/popular' });
  assert.deepEqual(calls, ['cleanup:game', 'render:game']);
  router.navigate({ type: 'providers' });
  assert.deepEqual(calls.slice(-2), ['cleanup:providers', 'render:providers']);
  assert.equal(page.scope.location.hash, '#/providers');
  router.navigate({ type: 'providers' });
  assert.equal(calls.length, 4, 'choosing the same destination does not reset the page');
  page.move(-1);
  assert.deepEqual(calls.slice(-2), ['cleanup:game', 'render:game']);
  assert.equal(calls.length, 6, 'popstate plus hashchange emits only once');
});

test('Back and Forward restore independent page scroll while search typing replaces only its own history entry', () => {
  const page = browser('#/');
  const router = initRouter({ window: page.scope });
  page.scroll(680);
  router.navigate({ type: 'category', categoryId: 'slots' }); page.flush();
  assert.equal(page.scope.scrollY, 0);
  page.scroll(420);
  router.navigate({ type: 'search', query: '' }); page.flush();
  router.navigate({ type: 'search', query: 'gold' }, { replace: true, preserveScroll: true }); page.flush();
  router.navigate({ type: 'search', query: 'gold coins' }, { replace: true, preserveScroll: true }); page.flush();
  assert.equal(page.entries.length, 3, 'keystrokes must not fill browser history');
  router.back(); page.flush();
  assert.deepEqual(router.getRoute(), { type: 'category', categoryId: 'slots' });
  assert.equal(page.scope.scrollY, 420);
  router.back(); page.flush();
  assert.deepEqual(router.getRoute(), { type: 'home' });
  assert.equal(page.scope.scrollY, 680);
  page.move(1); page.flush();
  assert.equal(page.scope.scrollY, 420);
  page.move(1); page.flush();
  assert.equal(router.getRoute().query, 'gold coins');
});

test('manual hash links are routable and direct game links have an explicit Back fallback', () => {
  const page = browser('#game=niptuck000000000&from=%23%2Fslots');
  const router = initRouter({ window: page.scope });
  router.back(parseRoute(router.getRoute().from)); page.flush();
  assert.deepEqual(router.getRoute(), { type: 'category', categoryId: 'slots' });
  page.manualHash('#/providers/red-tiger'); page.flush();
  assert.deepEqual(router.getRoute(), { type: 'provider', providerId: 'red-tiger' });
  const seen = [];
  const unsubscribe = router.subscribe(route => seen.push(route.type));
  router.navigate({ type: 'home' });
  unsubscribe();
  router.navigate({ type: 'providers' });
  assert.deepEqual(seen, ['home']);
});

test('distinct history entries with identical search URLs still restore their own scroll', () => {
  const page = browser('#/search?q=gold');
  const router = initRouter({ window: page.scope });
  page.scroll(320);
  router.navigate({ type: 'search', query: 'silver' }); page.flush();
  router.navigate({ type: 'search', query: 'gold' }, { replace: true }); page.flush();
  page.scroll(100);
  const seen = [];
  router.subscribe(route => seen.push(route.query));
  router.back(); page.flush();
  assert.equal(page.scope.scrollY, 320);
  assert.deepEqual(seen, ['gold'], 'deduplicate event pairs, not separate history entries');
});
