import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../public/catalog.js';
import { CATEGORIES, FILTER_CATEGORIES, SLOT_THEMES, getGameReleaseDate, getGamesForCategory } from '../public/collections.js';
import { getProviderDetails } from '../public/provider-details.js';
import { getCatalogPage, LOBBY_CATEGORIES, PAGE_SIZE, pageSlice } from '../public/catalog-page-model.js';

const ids = page => page.games.map(game => game.id);

test('Favorites uses only saved, available games with its own search, provider filter and ordering', () => {
  const favoriteIds = ['nunchucksr96f100', 'SanQuentin', 'ouija00000000000', 'removed-game', 'SanQuentin'];
  const before = [...favoriteIds];
  const page = getCatalogPage({ type: 'favorites' }, { favoriteIds });
  assert.equal(page.title, 'Favorite Games');
  assert.equal(page.activeMenu, 'favorites');
  assert.equal(page.type, 'favorites');
  assert.equal(page.sort, 'saved');
  assert.deepEqual(page.allowedSorts, ['saved', 'az', 'za', 'newest']);
  assert.equal(page.savedCount, 3);
  assert.deepEqual(ids(page), ['ouija00000000000', 'SanQuentin', 'nunchucksr96f100']);
  assert.deepEqual(ids(getCatalogPage({ type: 'favorites', query: '  OuIjA ', providerId: 'red-tiger' }, { favoriteIds })), ['ouija00000000000']);
  const ascending = getCatalogPage({ type: 'favorites', sort: 'az' }, { favoriteIds });
  const descending = getCatalogPage({ type: 'favorites', sort: 'za' }, { favoriteIds });
  assert.deepEqual(ids(descending), ids(ascending).toReversed());
  assert.deepEqual(favoriteIds, before, 'rendering never reorders saved member state');
  assert.equal(getCatalogPage({ type: 'favorites', sort: 'featured' }, { favoriteIds }).sort, 'saved');
});

test('Favorites distinguishes an empty collection from a search with no matches and updates from current state', () => {
  const empty = getCatalogPage({ type: 'favorites' });
  assert.equal(empty.savedCount, 0);
  assert.deepEqual(empty.games, []);
  const favoriteIds = ['nunchucksr96f100'];
  const filtered = getCatalogPage({ type: 'favorites', query: 'not-saved' }, { favoriteIds });
  assert.equal(filtered.savedCount, 1);
  assert.deepEqual(filtered.games, []);
  assert.deepEqual(ids(getCatalogPage({ type: 'favorites' }, { favoriteIds })), favoriteIds);
  assert.deepEqual(getCatalogPage({ type: 'favorites' }, { favoriteIds: [] }).games, []);
});

test('home keeps discovery shelves before the five game types used by navigation', () => {
  assert.deepEqual(getCatalogPage({ type: 'home' }), {
    type: 'home', title: 'Lobby', activeMenu: 'lobby',
  });
  assert.deepEqual(LOBBY_CATEGORIES, ['popular', 'new-releases', ...CATEGORIES.map(category => category.id)]);
  assert.deepEqual(FILTER_CATEGORIES.map(category => category.id), LOBBY_CATEGORIES.slice(2));
  assert.equal(new Set(LOBBY_CATEGORIES).size, LOBBY_CATEGORIES.length);
  for (const categoryId of ['nolimit-city', 'hacksaw-gaming', 'instant-games', 'instant-win', 'crash', 'video-poker', 'wild-west', 'egypt', 'megaways']) {
    assert.equal(LOBBY_CATEGORIES.includes(categoryId), false, categoryId);
  }
  for (const category of CATEGORIES) {
    const page = getCatalogPage({ type: 'category', categoryId: category.id });
    assert.equal(page.type, 'category', category.id);
    assert.equal(page.title, category.title);
    assert.equal(page.activeMenu, category.id);
    assert.deepEqual(new Set(ids(page)), new Set(getGamesForCategory(category.id).map(game => game.id)));
  }
});

test('instant and crash games remain accessible through providers and search with selected games in Picks', () => {
  const quickGames = [...getGamesForCategory('instant-win'), ...getGamesForCategory('crash')];
  assert.equal(quickGames.length, 15);
  for (const type of ['provider', 'search']) {
    const visible = new Set(ids(getCatalogPage({ type, providerId: 'hacksaw-gaming' })));
    for (const game of quickGames) assert.ok(visible.has(game.id), `${game.title} remains accessible through ${type}`);
  }
  const picks = getGamesForCategory('popular').slice(0, 24).map(game => game.id);
  for (const id of ['hacksaw-1294', 'hacksaw-1321', 'hacksaw-2491']) assert.ok(picks.includes(id), id);
});

test('Search is the complete searchable catalog distinct from the Lobby overview', () => {
  const page = getCatalogPage({ type: 'search', query: '' });
  assert.equal(page.type, 'search');
  assert.equal(page.title, 'Games');
  assert.equal(page.activeMenu, 'search');
  assert.equal(page.games.length, GAMES.length);
  assert.equal(pageSlice(page.games).visible.length, PAGE_SIZE);
  assert.equal(pageSlice(page.games).hasMore, true);
  const filtered = getCatalogPage({ type: 'search', categoryId: 'all', providerId: 'taparoo', query: 'blood' });
  assert.deepEqual(ids(filtered), ['bloodsuckerstapa']);
});

test('COP COIN Picks preserves its editorial order before optional sorting', () => {
  const page = getCatalogPage({ type: 'category', categoryId: 'popular' });
  assert.equal(page.type, 'category');
  assert.equal(page.title, 'COP COIN Picks');
  assert.equal(page.activeMenu, 'popular');
  assert.equal(page.sort, 'featured');
  assert.notEqual(page.games[0].id, getGamesForCategory('new-releases')[0].id, 'editorial and chronological shelves have distinct openings');
  assert.equal(page.games.length, 40);
  assert.equal(pageSlice(page.games).hasMore, true);
  assert.equal(pageSlice(page.games, 70).visible.length, 40);
  assert.equal(pageSlice(page.games, 70).hasMore, false);
  const additions = new Set(['hacksaw-1294', 'hacksaw-1321', 'hacksaw-2491']);
  assert.deepEqual(ids(page).filter(id => !additions.has(id)).slice(0, 5), [
    'SanQuentin', 'niptuck000000000', 'gonzosqumegaways',
    'bonanzatacardsv1', 'gopnik0000000000',
  ]);
});

test('category provider and text filters intersect without spilling into the full catalog', () => {
  const page = getCatalogPage({
    type: 'category', categoryId: 'popular', providerId: 'red-tiger', query: '  OuIjA  ',
  });
  assert.deepEqual(ids(page), ['ouija00000000000']);
  assert.equal(page.query, 'OuIjA');
  assert.equal(page.title, 'COP COIN Picks');
  assert.equal(page.activeMenu, 'popular');

  const slots = getCatalogPage({ type: 'category', categoryId: 'slots', providerId: 'taparoo' });
  assert.deepEqual(slots.games, [], 'Tap-A-Roo games must not leak into Slots');
  assert.equal(slots.title, 'Slots');
});

test('new browse groups intersect provider and text filters on category and search pages', () => {
  const cases = [
    { categoryId: 'table', providerId: 'netent', query: 'jacks', expected: ['jacksmultihandn1'] },
    { categoryId: 'table', providerId: 'hacksaw-gaming', query: 'baccarat', expected: ['hacksaw-1446'] },
    { categoryId: 'scratch-tap', providerId: 'taparoo', query: 'blood', expected: ['bloodsuckerstapa'] },
    { categoryId: 'fruit', providerId: 'taparoo', query: 'fruit', expected: [] },
    { categoryId: 'tap', providerId: 'taparoo', query: 'fruit', expected: ['mysteryfruittapa'] },
    { categoryId: 'megaways', providerId: 'red-tiger', query: 'gonzo', expected: ['gonzosqumegaways'] },
    { categoryId: 'wild-west', providerId: 'hacksaw-gaming', query: 'duel', expected: ['hacksaw-1620'] },
  ];
  for (const { expected, ...filters } of cases) {
    for (const type of ['category', 'search']) {
      const page = getCatalogPage({ type, ...filters });
      assert.deepEqual(ids(page), expected, `${type}: ${filters.categoryId}`);
    }
  }
});

test('slot themes intersect the Slots family and preserve provider, search and sorting filters', () => {
  const slotIds = new Set(getGamesForCategory('slots').map(game => game.id));
  for (const theme of SLOT_THEMES) {
    const expected = getGamesForCategory(theme.id).filter(game => slotIds.has(game.id)).map(game => game.id);
    for (const type of ['category', 'search']) {
      const page = getCatalogPage({ type, categoryId: 'slots', themeId: theme.id });
      assert.deepEqual(new Set(ids(page)), new Set(expected), `${type}: ${theme.id}`);
      assert.equal(page.themeId, theme.id);
      assert.equal(page.activeMenu, type === 'category' ? 'slots' : 'search');
      assert.deepEqual(ids(getCatalogPage({ type, categoryId: theme.id })), ids(page), 'legacy theme opens the same Slots filter');
    }
  }
  const filters = { type: 'category', categoryId: 'slots', themeId: 'fruit', providerId: 'netent', query: 'shop' };
  const ascending = getCatalogPage({ ...filters, sort: 'az' });
  const descending = getCatalogPage({ ...filters, sort: 'za' });
  assert.ok(ascending.games.length > 1);
  assert.ok(ascending.games.every(game => game.providerId === 'netent' && /shop/i.test(game.title)));
  assert.deepEqual(ids(descending), ids(ascending).toReversed());
  assert.equal(getCatalogPage({ type: 'category', categoryId: 'slots' }).games.length, 993, 'clearing the theme restores all slots');
});

test('themes do not leak into non-slot categories or constrain results when invalid', () => {
  for (const route of [
    { type: 'category', categoryId: 'table' },
    { type: 'category', categoryId: 'tap' },
    { type: 'search' },
    { type: 'provider', providerId: 'taparoo' },
  ]) {
    assert.deepEqual(ids(getCatalogPage({ ...route, themeId: 'fruit' })), ids(getCatalogPage(route)));
  }
  const slots = { type: 'category', categoryId: 'slots' };
  assert.deepEqual(ids(getCatalogPage({ ...slots, themeId: 'unknown' })), ids(getCatalogPage(slots)));
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
  assert.equal(page.title, 'Games');
  assert.equal(page.activeMenu, 'search');
  assert.deepEqual(ids(page), ['dragonslucktapar']);

  const categorySearch = getCatalogPage({ type: 'search', categoryId: 'popular', query: 'dragon' });
  assert.deepEqual(ids(categorySearch), []);
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
  assert.equal(popular.games[0].id, 'SanQuentin');
});

test('unsupported ranking choices fall back to real available ordering', () => {
  const provider = getCatalogPage({ type: 'provider', providerId: 'netent', sort: 'unsupported' });
  assert.equal(provider.sort, 'az');
  assert.deepEqual(provider.allowedSorts, ['az', 'za', 'newest']);
  const popular = getCatalogPage({ type: 'category', categoryId: 'popular', sort: 'invalid' });
  assert.equal(popular.sort, 'featured');
});

test('newest ordering uses verified release days across providers, searches and formats', () => {
  for (const route of [
    { type: 'provider', providerId: 'netent' },
    { type: 'search' },
    { type: 'category', categoryId: 'table' },
    { type: 'category', categoryId: 'tap' },
  ]) {
    const page = getCatalogPage({ ...route, sort: 'newest' });
    assert.equal(page.sort, 'newest');
    assert.ok(page.games.length > 0);
    for (let i = 1; i < page.games.length; i++) {
      assert.ok(getGameReleaseDate(page.games[i - 1]) >= getGameReleaseDate(page.games[i]));
    }
  }
});

test('Show more grows the same result set from 35 to 70 without duplicating or reordering games', () => {
  assert.equal(PAGE_SIZE, 35);
  const page = getCatalogPage({ type: 'provider', providerId: 'netent' });
  const first = pageSlice(page.games);
  const second = pageSlice(page.games, 70);
  assert.equal(first.visible.length, 35);
  assert.equal(second.visible.length, 70);
  assert.equal(first.total, 236);
  assert.equal(second.total, 236);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, true);
  assert.deepEqual(second.visible.slice(0, 35), first.visible);
  assert.equal(new Set(second.visible.map(game => game.id)).size, 70);
  assert.deepEqual(pageSlice(page.games, 250), { visible: page.games, total: 236, hasMore: false });
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
    { type: 'category', categoryId: 'all' },
    { type: 'category', categoryId: 'missing' },
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
  assert.equal(page.games.length, 100);
  assert.equal(pageSlice(page.games, 70).visible.length, 70);
  assert.equal(pageSlice(page.games, 70).hasMore, true);
  assert.equal(pageSlice(page.games, 105).visible.length, 100);
  assert.equal(pageSlice(page.games, 105).hasMore, false);
  const dates = page.games.map(getGameReleaseDate);
  assert.ok(dates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.ok(page.games.every(game => GAMES.includes(game)));
  assert.equal(page.games.some(game => game.id === 'gonzosqumegaways'), false,
    'older games outside the latest 100 must not enter New Releases');
});

test('Recent Games uses actual play history, latest first, without duplicates', () => {
  const history = [
    { type: 'game', gameId: 'SanQuentin' },
    { type: 'game', gameId: 'ouija00000000000' },
    { type: 'reward', gameId: 'nunchucksr96f100' },
    { type: 'game', gameId: 'removed-game' },
    { type: 'game', gameId: 'SanQuentin' },
  ];
  const page = getCatalogPage({ type: 'recent-games' }, { history });
  assert.equal(page.title, 'Recent Games');
  assert.equal(page.activeMenu, 'recent-games');
  assert.equal(page.sort, 'recent');
  assert.deepEqual(ids(page), ['SanQuentin', 'ouija00000000000']);
  const filtered = getCatalogPage({ type: 'recent-games', query: 'Ouija' }, { history });
  assert.deepEqual(ids(filtered), ['ouija00000000000']);
  assert.equal(filtered.recentCount, 2);
  assert.deepEqual(ids(getCatalogPage({ type: 'recent-games' })), []);
});
