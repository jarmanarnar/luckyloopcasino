import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCatalogSearch, normalizeSearchText } from '../public/catalog-search.js';

test('search ignores case, accents, repeated spaces, punctuation and trademark marks', () => {
  assert.equal(normalizeSearchText('  ÉGYPT:   Gonzo’s—Quest™! '), 'egypt gonzos quest');
  const game = { title: 'Gonzo’s Quest™', providerName: 'Nolimit City' };
  for (const query of ['GONZOS QUEST', "Gonzo's   Quest", 'gónzos-quest', 'gonzosquest']) {
    assert.equal(createCatalogSearch(query).score(game), 0, query);
  }
  assert.equal(createCatalogSearch(' — ').active, false);
  assert.equal(createCatalogSearch('').score(game), 0);
});

test('ranking prefers exact titles, prefixes and phrases before reordered words, studios and typos', () => {
  const matches = [
    { id: 'typo', title: 'San Quentim' },
    { id: 'studio', title: 'Another Game', providerName: 'San Quentin' },
    { id: 'words', title: 'Quentin Returns to San' },
    { id: 'partial', title: 'Return to San Quentin' },
    { id: 'prefix', title: 'San Quentin 2' },
    { id: 'exact', title: 'San Quentin™' },
  ];
  const search = createCatalogSearch('san quentin');
  assert.deepEqual(matches.toSorted((a, b) => search.score(a) - search.score(b)).map(game => game.id),
    ['exact', 'prefix', 'partial', 'words', 'studio', 'typo']);
  assert.equal(search.score({ title: 'Unrelated' }), null);
});

test('typo matching allows one bounded word edit but not short or multiple misspelled terms', () => {
  const game = { title: 'Lucky Dragon' };
  for (const query of ['lucky drgaon', 'lucky drago', 'lucky draggon', 'lucky drakon']) {
    assert.notEqual(createCatalogSearch(query).score(game), null, query);
  }
  for (const query of ['lukcy drgaon', 'lucky draggonn', 'luk dragnn']) {
    assert.equal(createCatalogSearch(query).score(game), null, query);
  }
  assert.equal(createCatalogSearch('cat').score({ title: 'Cut' }), null);
  assert.equal(createCatalogSearch('sun').score({ title: 'San Quentin' }), null);
});

test('studio searches support normalization and mixed title/studio terms', () => {
  const game = { title: 'San Quentin', providerName: 'Nolimit City' };
  for (const query of ['NÓLIMIT-CITY', 'nolimitcity', 'quentin nolimit', 'city san']) {
    assert.notEqual(createCatalogSearch(query).score(game), null, query);
  }
  assert.equal(createCatalogSearch('quentin netent').score(game), null);
});
