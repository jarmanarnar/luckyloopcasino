import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRoute, initRouter, parseRoute } from '../public/routes.js';

function browser(hash = '') {
  const listeners = new Map(), frames = new Map();
  let frameId = 0, index = 0;
  const entries = [{ url: new URL(`https://example.com/luckyloopcasino/${hash}`), state: null }];
  const emit = name => { for (const fn of listeners.get(name) || []) fn(); };
  const scope = {
    scrollX: 0, scrollY: 0,
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

test('category, provider and search links retain their page and filters after refresh', () => {
  const routes = [
    { type: 'home' },
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
