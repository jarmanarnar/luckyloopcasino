import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../public/catalog.js';
import { getGameReleaseDate } from '../public/collections.js';
import { getProviderDetails } from '../public/provider-details.js';
import { getCatalogPage, LOBBY_CATEGORIES, PAGE_SIZE, pageSlice } from '../public/catalog-page-model.js';

const ids = page => page.games.map(game => game.id);

test('home remains a lobby with Popular, Slots and New Releases in the requested order', () => {
  assert.deepEqual(getCatalogPage({ type: 'home' }), {
    type: 'home', title: 'Casino', activeMenu: 'all',
  });
  assert.deepEqual(LOBBY_CATEGORIES, ['popular', 'slots', 'new-releases']);
});

test('Popular has its own identity and preserves editorial order before optional sorting', () => {
  const page = getCatalogPage({ type: 'category', categoryId: 'popular' });
  assert.equal(page.type, 'category');
  assert.equal(page.title, 'Popular');
  assert.equal(page.activeMenu, 'popular');
  assert.equal(page.sort, 'featured');
  assert.deepEqual(ids(page).slice(0, 5), [
    'nunchucksr96f100', 'dragonsluck00000', 'SanQuentin',
    'monopolymneyv196', 'niptuck000000000',
  ]);
});

test('category provider and text filters intersect without spilling into the full catalog', () => {
  const page = getCatalogPage({
    type: 'category', categoryId: 'popular', providerId: 'red-tiger', query: '  LuCk  ',
  });
  assert.deepEqual(ids(page), ['dragonsluck00000']);
  assert.equal(page.query, 'LuCk');
  assert.equal(page.title, 'Popular');
  assert.equal(page.activeMenu, 'popular');

  const slots = getCatalogPage({ type: 'category', categoryId: 'slots', providerId: 'taparoo' });
  assert.deepEqual(slots.games, [], 'Tap-A-Roo games must not leak into Slots');
  assert.equal(slots.title, 'Slots');
});

test('provider directory search and individual provider pages have separate identities', () => {
  const directory = getCatalogPage({ type: 'providers', query: '  TiGeR ' });
  assert.equal(directory.title, 'Game Providers');
  assert.equal(directory.activeMenu, 'providers');
  assert.deepEqual(directory.providers.map(provider => provider.id), ['red-tiger']);
  assert.equal(directory.games, undefined);

  const page = getCatalogPage({ type: 'provider', providerId: 'taparoo' });
  assert.equal(page.title, 'Taparoo');
  assert.equal(page.activeMenu, 'providers');
  assert.equal(page.games.length, 8);
  assert.ok(page.games.every(game => game.providerId === 'taparoo'));
  assert.equal(getProviderDetails('taparoo').gameCount, page.games.length);
  assert.deepEqual(getProviderDetails('taparoo').formats, [{ id: 'tap', title: 'Tap Games', count: 8 }]);
});

test('search is its own page and can find names across studios or restrict a category', () => {
  const page = getCatalogPage({ type: 'search', query: '  DRAGON  ', providerId: 'taparoo' });
  assert.equal(page.type, 'search');
  assert.equal(page.title, 'Search games');
  assert.equal(page.activeMenu, 'search');
  assert.deepEqual(ids(page), ['dragonslucktapar']);

  const categorySearch = getCatalogPage({ type: 'search', categoryId: 'popular', query: 'dragon' });
  assert.deepEqual(ids(categorySearch), ['dragonsluck00000']);
  const providerNameSearch = getCatalogPage({ type: 'search', query: 'sneaky slots' });
  assert.equal(providerNameSearch.games.length, 3);
  assert.ok(providerNameSearch.games.every(game => game.providerId === 'sneaky-slots'));
});

test('A–Z and Z–A change only order, leave source data intact, and do not carry state between pages', () => {
  const original = GAMES.map(game => game.id);
  const ascending = getCatalogPage({ type: 'provider', providerId: 'taparoo', sort: 'az' });
  const descending = getCatalogPage({ type: 'provider', providerId: 'taparoo', sort: 'za' });
  assert.deepEqual(ids(descending), ids(ascending).toReversed());
  assert.equal(ascending.games[0].title, 'Blood Suckers Tap-A-Roo');
  assert.equal(descending.games[0].title, 'Starburst Tap-A-Roo');
  assert.deepEqual(GAMES.map(game => game.id), original);

  const popular = getCatalogPage({ type: 'category', categoryId: 'popular' });
  assert.equal(popular.provider, undefined);
  assert.equal(popular.query, '');
  assert.equal(popular.sort, 'featured');
  assert.equal(popular.games[0].id, 'nunchucksr96f100');
});

test('unsupported ranking choices fall back to real available ordering', () => {
  const provider = getCatalogPage({ type: 'provider', providerId: 'netent', sort: 'newest' });
  assert.equal(provider.sort, 'az', 'undated provider catalogs cannot claim newest ordering');
  assert.deepEqual(provider.allowedSorts, ['az', 'za']);
  const popular = getCatalogPage({ type: 'category', categoryId: 'popular', sort: 'invalid' });
  assert.equal(popular.sort, 'featured');
});

test('Show more grows the same result set from 35 to 70 without duplicating or reordering games', () => {
  assert.equal(PAGE_SIZE, 35);
  const page = getCatalogPage({ type: 'provider', providerId: 'netent' });
  const first = pageSlice(page.games);
  const second = pageSlice(page.games, 70);
  assert.equal(first.visible.length, 35);
  assert.equal(second.visible.length, 70);
  assert.equal(first.total, 209);
  assert.equal(second.total, 209);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, true);
  assert.deepEqual(second.visible.slice(0, 35), first.visible);
  assert.equal(new Set(second.visible.map(game => game.id)).size, 70);
  assert.deepEqual(pageSlice(page.games, 210), { visible: page.games, total: 209, hasMore: false });
});

test('short or empty result sets never offer another page', () => {
  const directory = getCatalogPage({ type: 'providers' });
  assert.equal(pageSlice(directory.providers).hasMore, false);
  assert.deepEqual(pageSlice([]), { visible: [], total: 0, hasMore: false });
  assert.deepEqual(getCatalogPage({ type: 'search', query: 'a-title-that-does-not-exist' }).games, []);
  assert.deepEqual(getCatalogPage({ type: 'providers', query: 'studio-that-does-not-exist' }).providers, []);
});

test('unknown destinations are explicit missing pages rather than the lobby or an unrelated collection', () => {
  for (const route of [
    { type: 'category', categoryId: 'missing' },
    { type: 'category', categoryId: 'all' },
    { type: 'provider', providerId: 'missing' },
    { type: 'not-found' },
  ]) {
    assert.deepEqual(getCatalogPage(route), { type: 'not-found', title: 'Page not found', activeMenu: '' });
  }
});

test('New Releases contains actual catalog entries with release dates and defaults to newest first', () => {
  const page = getCatalogPage({ type: 'category', categoryId: 'new-releases' });
  assert.equal(page.title, 'New Releases');
  assert.equal(page.sort, 'newest');
  assert.deepEqual(ids(page).slice(0, 3), ['nunchucksr96f100', 'monopolymneyv196', 'ouija00000000000']);
  assert.ok(page.games.length > 0);
  const dates = page.games.map(getGameReleaseDate);
  assert.ok(dates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.ok(page.games.every(game => GAMES.includes(game)));
  assert.equal(page.games.some(game => game.id === 'niptuck000000000'), false,
    'an undated editorial favorite must not become a new release');
});
