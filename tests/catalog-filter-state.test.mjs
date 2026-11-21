import assert from 'node:assert/strict';
import test from 'node:test';
import { changeCatalogGameType, resetCatalogFilters } from '../public/catalog-filter-state.js';
import { getCatalogPage } from '../public/catalog-page-model.js';
import { GAME_FAMILIES, getGamesForCategory } from '../public/collections.js';

test('a type filter narrows Megaways instead of leaving the collection', () => {
  const route = Object.freeze({ type: 'category', categoryId: 'megaways', sort: 'az' });
  const next = changeCatalogGameType(route, 'table');
  assert.deepEqual(next, { ...route, gameTypeId: 'table' });
  assert.equal(getCatalogPage(next).title, 'Megaways');
  assert.equal(getCatalogPage(next).games.length, 0, 'an incompatible type honestly returns no matching games');
  const restored = changeCatalogGameType(next, 'all');
  assert.deepEqual(restored, route);
  assert.deepEqual(new Set(getCatalogPage(restored).games.map(game => game.id)),
    new Set(getGamesForCategory('megaways').map(game => game.id)));
});

test('Top Picks keeps its collection and valid featured ordering when filtering Slots', () => {
  const route = Object.freeze({ type: 'category', categoryId: 'popular', query: 'gold', sort: 'featured' });
  const next = changeCatalogGameType(route, 'slots');
  assert.deepEqual(next, { ...route, gameTypeId: 'slots' });
  const page = getCatalogPage(next);
  const slotIds = new Set(getGamesForCategory('slots').map(game => game.id));
  const expected = getCatalogPage(route).games.filter(game => slotIds.has(game.id));
  assert.equal(page.sort, 'featured');
  assert.equal(page.categoryId, 'popular');
  assert.ok(expected.length > 0);
  assert.deepEqual(page.games, expected);
});

test('All clears only the type, retaining collection, legacy metadata, provider, query and sorting', () => {
  const route = Object.freeze({ type: 'category', categoryId: 'megaways', gameTypeId: 'slots', themeId: 'fruit',
    query: 'gold', providerId: 'red-tiger', sort: 'za' });
  const { gameTypeId, ...expected } = route;
  for (const choice of ['all', '', undefined]) {
    const next = changeCatalogGameType(route, choice);
    assert.deepEqual(next, expected);
    assert.deepEqual(getCatalogPage(next).games, getCatalogPage(expected).games);
  }
  assert.equal(route.gameTypeId, 'slots', 'the original route is not mutated');
});

test('global search retains an incompatible provider and query instead of widening the results', () => {
  const route = Object.freeze({ type: 'search', providerId: 'taparoo', query: 'starburst', sort: 'relevance' });
  const next = changeCatalogGameType(route, 'table');
  assert.deepEqual(next, { ...route, gameTypeId: 'table' });
  assert.equal(getCatalogPage(next).games.length, 0);
  const all = changeCatalogGameType(next, 'all');
  assert.deepEqual(all, route);
  assert.ok(getCatalogPage(all).games.length > 0);
  assert.ok(getCatalogPage(all).games.every(game => game.providerId === 'taparoo'));
});

test('fixed type choices remain selectable within an incompatible named collection', () => {
  const route = Object.freeze({ type: 'category', categoryId: 'megaways', providerId: 'taparoo' });
  for (const family of GAME_FAMILIES) {
    const next = changeCatalogGameType(route, family.id);
    assert.deepEqual(next, { ...route, gameTypeId: family.id });
    assert.deepEqual(getCatalogPage(next).gameTypeFacets.map(type => type.id), GAME_FAMILIES.map(type => type.id));
    assert.equal(getCatalogPage(next).games.length, 0);
  }
});

test('favorites and recents keep personal scope, ordering and other filters through type changes', () => {
  const slot = getGamesForCategory('slots').find(game => game.providerId === 'netent');
  const tap = getGamesForCategory('fruit').find(game => game.providerId === 'taparoo');
  assert.ok(tap, 'fixture is a fruit game from Taparoo');
  const favoriteIds = Object.freeze([slot.id, tap.id]);
  const history = Object.freeze(favoriteIds.map(gameId => Object.freeze({ type: 'game', gameId })));
  const state = { favoriteIds, history };
  for (const [type, sort] of [['favorites', 'saved'], ['recent-games', 'recent']]) {
    const route = Object.freeze({ type, categoryId: 'fruit', providerId: 'taparoo', sort });
    const next = changeCatalogGameType(route, 'slots', state);
    assert.deepEqual(next, { ...route, gameTypeId: 'slots' });
    assert.equal(getCatalogPage(next, state).games.length, 0);
    const all = changeCatalogGameType(next, 'all', state);
    assert.deepEqual(all, route);
    assert.deepEqual(getCatalogPage(all, state).games.map(game => game.id), [tap.id]);

    const unfiltered = { type, sort };
    const slots = changeCatalogGameType(unfiltered, 'slots', state);
    assert.deepEqual(getCatalogPage(slots, state).games.map(game => game.id), [slot.id]);
    assert.deepEqual(getCatalogPage(changeCatalogGameType(slots, 'all', state), state).games.map(game => game.id), [tap.id, slot.id]);
  }
});

test('fixed provider pages retain their provider and named collection even when empty', () => {
  const route = Object.freeze({ type: 'provider', providerId: 'taparoo', categoryId: 'fruit', themeId: 'fruit', sort: 'az' });
  const next = changeCatalogGameType(route, 'table');
  assert.deepEqual(next, { ...route, gameTypeId: 'table' });
  assert.equal(getCatalogPage(next).games.length, 0);
  const all = changeCatalogGameType(next, 'all');
  assert.deepEqual(all, route);
  const fruitIds = new Set(getGamesForCategory('fruit').map(game => game.id));
  assert.ok(getCatalogPage(all).games.length > 0);
  assert.ok(getCatalogPage(all).games.every(game => game.providerId === 'taparoo' && fruitIds.has(game.id)));
});

test('legacy themes remain effective after selecting a non-slot type', () => {
  for (const route of [
    { type: 'search', themeId: 'fruit', gameTypeId: 'slots', providerId: 'netent' },
    { type: 'category', themeId: 'fruit', categoryId: 'slots', providerId: 'netent' },
  ]) {
    const next = changeCatalogGameType(Object.freeze(route), 'table');
    assert.deepEqual(next, { type: route.type, categoryId: 'fruit', themeId: 'fruit', gameTypeId: 'table', providerId: 'netent' });
    assert.equal(getCatalogPage(next).categoryId, 'fruit');
    assert.equal(getCatalogPage(next).games.length, 0);
    assert.equal(changeCatalogGameType(next, 'all').categoryId, 'fruit');
  }
});

test('family-only destinations can change family or return to global search', () => {
  for (const route of [
    { type: 'category', gameTypeId: 'slots', providerId: 'netent', query: 'blackjack', sort: 'za' },
    { type: 'category', categoryId: 'slots', providerId: 'netent', query: 'blackjack', sort: 'za' },
  ]) {
    const next = changeCatalogGameType(Object.freeze(route), 'table');
    assert.deepEqual(next, { type: 'category', gameTypeId: 'table', providerId: 'netent', query: 'blackjack', sort: 'za' });
    assert.ok(getCatalogPage(next).games.length > 0);
    assert.deepEqual(changeCatalogGameType(next, 'all'), { type: 'search', providerId: 'netent', query: 'blackjack', sort: 'za' });
  }
});

test('only sorting invalid for the resulting model is removed', () => {
  const next = changeCatalogGameType({ type: 'search', query: '', sort: 'relevance' }, 'slots');
  assert.deepEqual(next, { type: 'search', gameTypeId: 'slots', query: '' });
  assert.deepEqual(changeCatalogGameType({ type: 'search', sort: 'featured', providerId: 'netent' }, 'table'),
    { type: 'search', providerId: 'netent', gameTypeId: 'table' });
  assert.equal(changeCatalogGameType({ type: 'category', categoryId: 'popular', sort: 'featured' }, 'table').sort, 'featured');
});

test('unsupported type values leave the incoming route untouched', () => {
  const route = Object.freeze({ type: 'category', categoryId: 'megaways', query: 'gold', sort: 'az' });
  const unchanged = changeCatalogGameType(route, 'not-a-game-type');
  assert.deepEqual(unchanged, route);
  assert.notEqual(unchanged, route);
});

test('clearing filters restores the named collection from an empty result', () => {
  const route = Object.freeze({ type: 'category', categoryId: 'megaways', gameTypeId: 'table',
    providerId: 'taparoo', query: 'no matches', sort: 'za' });
  assert.equal(getCatalogPage(route).games.length, 0);
  const next = resetCatalogFilters(route);
  assert.deepEqual(next, { type: 'category', categoryId: 'megaways' });
  assert.deepEqual(new Set(getCatalogPage(next).games.map(game => game.id)),
    new Set(getGamesForCategory('megaways').map(game => game.id)));
  assert.equal(route.query, 'no matches');
});

test('clearing filters preserves fixed providers and personal scope', () => {
  for (const type of ['provider', 'favorites', 'recent-games']) {
    const route = Object.freeze({ type, providerId: 'taparoo', categoryId: 'fruit', gameTypeId: 'table',
      query: 'no matches', sort: 'za' });
    assert.deepEqual(resetCatalogFilters(route), { type, categoryId: 'fruit', ...(type === 'provider' ? { providerId: 'taparoo' } : {}) });
  }
  const fixed = resetCatalogFilters({ type: 'provider', providerId: 'taparoo', gameTypeId: 'table' });
  assert.ok(getCatalogPage(fixed).games.length > 0);
  assert.ok(getCatalogPage(fixed).games.every(game => game.providerId === 'taparoo'));
});

test('clearing a family-only destination returns to Games while retaining legacy named themes', () => {
  for (const familyField of [{ gameTypeId: 'slots' }, { categoryId: 'slots' }]) {
    assert.deepEqual(resetCatalogFilters({ type: 'category', ...familyField, query: 'gold', providerId: 'netent', sort: 'za' }),
      { type: 'search' });
    assert.deepEqual(resetCatalogFilters({ type: 'category', ...familyField, themeId: 'fruit', query: 'gold' }),
      { type: 'category', categoryId: 'fruit', themeId: 'fruit' });
  }
});

test('clearing global and provider-directory filters keeps their destinations', () => {
  assert.deepEqual(resetCatalogFilters(Object.freeze({ type: 'search', providerId: 'netent', gameTypeId: 'slots', query: 'gold', sort: 'za' })),
    { type: 'search' });
  assert.deepEqual(resetCatalogFilters(Object.freeze({ type: 'providers', query: 'netent' })), { type: 'providers' });
});

test('panel reset keeps the query while clearing global filters and family-only destinations', () => {
  for (const scope of [
    { type: 'search', gameTypeId: 'table' },
    { type: 'category', gameTypeId: 'table' },
    { type: 'category', categoryId: 'table' },
  ]) {
    const route = Object.freeze({ ...scope, query: 'starburst', providerId: 'netent', sort: 'za' });
    const next = resetCatalogFilters(route, { preserveQuery: true });
    assert.deepEqual(next, { type: 'search', query: 'starburst' });
    assert.ok(getCatalogPage(next).games.length > 0);
    assert.equal(route.providerId, 'netent', 'the original route is not mutated');
    assert.equal(route.sort, 'za');
  }
});

test('panel reset preserves query and collection, fixed-provider, or personal scope together', () => {
  const game = getGamesForCategory('fruit').find(item => item.providerId === 'taparoo');
  assert.ok(game);
  const state = { favoriteIds: [game.id], history: [{ type: 'game', gameId: game.id }] };
  for (const type of ['category', 'provider', 'favorites', 'recent-games']) {
    const route = Object.freeze({ type, categoryId: 'fruit', providerId: 'taparoo', gameTypeId: 'table',
      query: game.title, sort: 'za' });
    assert.equal(getCatalogPage(route, state).games.length, 0);
    const next = resetCatalogFilters(route, { preserveQuery: true });
    assert.deepEqual(next, { type, categoryId: 'fruit', query: game.title,
      ...(type === 'provider' ? { providerId: 'taparoo' } : {}) });
    const page = getCatalogPage(next, state);
    assert.ok(page.games.some(item => item.id === game.id));
    assert.equal(page.categoryId, 'fruit');
    if (type === 'provider') assert.ok(page.games.every(item => item.providerId === 'taparoo'));
    if (type === 'favorites' || type === 'recent-games') assert.deepEqual(page.games.map(item => item.id), [game.id]);
  }
});

test('query-preserving reset retains legacy named themes and exact input without changing default reset', () => {
  const route = Object.freeze({ type: 'category', categoryId: 'slots', themeId: 'fruit',
    gameTypeId: 'slots', query: '  gold  ', providerId: 'netent', sort: 'za' });
  const scope = { type: 'category', categoryId: 'fruit', themeId: 'fruit' };
  assert.deepEqual(resetCatalogFilters(route, { preserveQuery: true }), { ...scope, query: '  gold  ' });
  assert.deepEqual(resetCatalogFilters(route), scope);
  assert.deepEqual(resetCatalogFilters(route, {}), scope);
  assert.deepEqual(resetCatalogFilters(route, { preserveQuery: false }), scope);
  assert.deepEqual(resetCatalogFilters({ type: 'search', query: '' }, { preserveQuery: true }), { type: 'search', query: '' });
  assert.deepEqual(resetCatalogFilters({ type: 'search' }, { preserveQuery: true }), { type: 'search' });
});
