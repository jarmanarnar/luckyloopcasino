import assert from 'node:assert/strict';
import test from 'node:test';
import { getCatalogPage } from '../public/catalog-page-model.js';
import { getCatalogSearchPlaceholder, getCatalogEmptyState } from '../public/catalog-view.js';

test('search fields identify whether they search all games or a constrained collection', () => {
  for (const [route, expected] of [
    [{ type: 'search' }, 'Search all games'],
    [{ type: 'search', query: 'fruit' }, 'Search all games'],
    [{ type: 'favorites', gameTypeId: 'slots' }, 'Search favorites'],
    [{ type: 'recent-games', categoryId: 'fruit' }, 'Search recent games'],
    [{ type: 'providers' }, 'Search providers'],
    [{ type: 'provider', providerId: 'netent', categoryId: 'fruit' }, 'Search NetEnt games'],
    [{ type: 'search', providerId: 'netent' }, 'Search NetEnt games'],
  ]) assert.equal(getCatalogSearchPlaceholder(getCatalogPage(route)), expected);
});

test('empty scoped text searches offer a global search even before any personal games exist', () => {
  for (const route of [
    { type: 'favorites' }, { type: 'recent-games' },
    { type: 'category', categoryId: 'fruit' },
    { type: 'provider', providerId: 'taparoo' },
    { type: 'search', providerId: 'taparoo' },
  ]) {
    const model = getCatalogPage({ ...route, query: 'blackjack' });
    assert.equal(model.games.length, 0);
    assert.deepEqual(getCatalogEmptyState(model).actions.map(item => item.action), ['search-all', 'clear']);
    if (['favorites', 'recent-games'].includes(route.type)) {
      assert.match(getCatalogEmptyState(model).title, /^No matching /);
    }
  }
});

test('empty ordinary searches and provider-directory searches do not offer a redundant global search', () => {
  for (const type of ['search', 'providers']) {
    assert.deepEqual(getCatalogEmptyState(getCatalogPage({ type, query: 'not-a-real-game' })).actions.map(item => item.action), ['clear']);
  }
  for (const type of ['favorites', 'recent-games']) {
    assert.deepEqual(getCatalogEmptyState(getCatalogPage({ type })).actions.map(item => item.action), ['browse']);
  }
});

test('the same type or category has the same search scope label regardless of entry path', () => {
  for (const [selection, expected] of [
    [{ gameTypeId: 'slots' }, 'Search in Slots'],
    [{ gameTypeId: 'arcade' }, 'Search in Casual Games'],
    [{ categoryId: 'fruit' }, 'Search in Fruit Games'],
    [{ categoryId: 'fruit', gameTypeId: 'tap' }, 'Search in Fruit Games'],
  ]) {
    for (const type of ['search', 'category']) {
      assert.equal(getCatalogSearchPlaceholder(getCatalogPage({ type, ...selection })), expected);
    }
  }
});
