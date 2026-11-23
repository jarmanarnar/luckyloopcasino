import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../public/catalog.js';
import { CATEGORIES, GAME_FAMILIES, LOBBY_SECTIONS, getGameReleaseDate, getGamesForCategory } from '../public/collections.js';
import { getProviderDetails } from '../public/provider-details.js';
import { getCatalogPage, LOBBY_CATEGORIES, PAGE_SIZE, pageSlice } from '../public/catalog-page-model.js';
import { parseRoute } from '../public/routes.js';

const ids = page => page.games.map(game => game.id);

test('Favorites uses only saved, available games with its own search, provider filter and ordering', () => {
  const favoriteIds = ['nunchucksr96f100', 'SanQuentin', 'ouija00000000000', 'removed-game', 'hacksaw-1446', 'SanQuentin'];
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

test('home shelves use only fixed game types with visible games, preserving scoped links', () => {
  assert.deepEqual(LOBBY_CATEGORIES, LOBBY_SECTIONS.map(section => section.id));
  assert.deepEqual(LOBBY_CATEGORIES, ['slots', 'table', 'scratchcards', 'tap', 'arcade']);
  for (const hash of ['#/scratchcards', '#/search?type=scratchcards']) {
    const scratch = getCatalogPage(parseRoute(hash));
    assert.equal(scratch.title, 'Scratchcards');
    assert.equal(scratch.gameTypeId, 'scratchcards');
    assert.deepEqual(new Set(ids(scratch)), new Set([
      'bgaming-scratch-dice', 'bgaming-3-kings-scratch', 'bgaming-capymania-green',
      'bgaming-capymania-orange', 'bgaming-capymania-yellow', 'bgaming-ice-scratch',
      'bgaming-ice-scratch-gold', 'bgaming-ice-scratch-silver', 'bgaming-luck-magic-scratch',
      'bgaming-scratch-alpaca', 'bgaming-scratch-alpaca-gold', 'bgaming-scratch-alpaca-silver',
    ]), 'a format link must not broaden to unrelated games');
    assert.equal(scratch.gameTypeFacets.some(type => type.id === 'scratchcards'), true);
  }
  assert.equal(new Set(LOBBY_CATEGORIES).size, LOBBY_CATEGORIES.length);
  for (const categoryId of ['nolimit-city', 'hacksaw-gaming', 'instant-games', 'instant-win', 'crash', 'video-poker', 'fruit', 'megaways']) {
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

test('instant and crash games remain accessible through providers and search', () => {
  const quickGames = [...getGamesForCategory('instant-win'), ...getGamesForCategory('crash')];
  assert.equal(quickGames.length, 45);
  for (const type of ['provider', 'search']) {
    for (const providerId of ['bgaming']) {
      const visible = new Set(ids(getCatalogPage({ type, providerId })));
      for (const game of quickGames.filter(game => game.providerId === providerId)) {
        assert.ok(visible.has(game.id), `${game.title} remains accessible through ${type}`);
      }
    }
  }
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
  const gamzix = getCatalogPage({ type: 'search', providerId: 'gamzix', query: 'solar strike' });
  assert.deepEqual(ids(gamzix), ['gamzix-solar-strike-hold-the-spin']);
  for (const [providerId, query, count] of [['avatarux', 'AvatarUX', 31], ['3-oaks', '3 Oaks', 106]]) {
    const studioSearch = getCatalogPage({ type: 'search', query });
    assert.equal(studioSearch.games.length, count, query);
    assert.ok(studioSearch.games.every(game => game.providerId === providerId), query);
    assert.deepEqual(new Set(ids(studioSearch)), new Set(ids(getCatalogPage({ type: 'provider', providerId }))));
  }
  const avatarux = getCatalogPage({ type: 'search', providerId: 'avatarux', query: 'volcanic loot' });
  assert.deepEqual(ids(avatarux), ['avatarux-volcanic-loot']);
});

test('category provider and text filters intersect without spilling into the full catalog', () => {
  const page = getCatalogPage({
    type: 'category', categoryId: 'megaways', providerId: 'red-tiger', query: '  GoNzO  ',
  });
  assert.deepEqual(ids(page), ['gonzosqumegaways']);
  assert.equal(page.query, 'GoNzO');
  assert.equal(page.title, 'Megaways');
  assert.equal(page.activeMenu, 'megaways');

  const slots = getCatalogPage({ type: 'category', categoryId: 'slots', providerId: 'taparoo' });
  assert.deepEqual(slots.games, [], 'Tap-A-Roo games must not leak into Slots');
  assert.equal(slots.title, 'Slots');
});

test('new browse groups intersect provider and text filters on category and search pages', () => {
  const cases = [
    { categoryId: 'table', providerId: 'netent', query: 'jacks', expected: ['jacksmultihandn1'] },
    { categoryId: 'table', providerId: 'hacksaw-gaming', query: 'baccarat', expected: [] },
    { categoryId: 'scratch-tap', providerId: 'taparoo', query: 'blood', expected: ['bloodsuckerstapa'] },
    { categoryId: 'fruit', providerId: 'taparoo', query: 'fruit', expected: ['mysteryfruittapa'] },
    { categoryId: 'tap', providerId: 'taparoo', query: 'fruit', expected: ['mysteryfruittapa'] },
    { categoryId: 'megaways', providerId: 'red-tiger', query: 'gonzo', expected: ['gonzosqumegaways'] },
    { categoryId: 'wild-west', providerId: 'hacksaw-gaming', query: 'duel', expected: [] },
  ];
  for (const { expected, ...filters } of cases) {
    for (const type of ['category', 'search']) {
      const page = getCatalogPage({ type, ...filters });
      assert.deepEqual(ids(page), expected, `${type}: ${filters.categoryId}`);
    }
  }
});

test('collections compose with a game family and preserve provider, search and sorting filters', () => {
  const slotIds = new Set(getGamesForCategory('slots').map(game => game.id));
  for (const category of CATEGORIES) {
    const expected = getGamesForCategory(category.id).filter(game => slotIds.has(game.id)).map(game => game.id);
    for (const type of ['category', 'search']) {
      const page = getCatalogPage({ type, gameTypeId: 'slots', categoryId: category.id });
      assert.deepEqual(new Set(ids(page)), new Set(expected), `${type}: ${category.id}`);
      assert.equal(page.gameTypeId, 'slots');
      assert.equal(page.categoryId, category.id);
      assert.equal('themeId' in page, false);
      assert.equal(page.activeMenu, category.id);
      assert.deepEqual(new Set(ids(getCatalogPage({ type, categoryId: category.id }))), new Set(category.games.map(game => game.id)), 'a collection alone does not imply a game type');
    }
  }
  const filters = { type: 'category', gameTypeId: 'slots', categoryId: 'fruit', providerId: 'netent', query: 'shop' };
  const ascending = getCatalogPage({ ...filters, sort: 'az' });
  const descending = getCatalogPage({ ...filters, sort: 'za' });
  assert.ok(ascending.games.length > 1);
  assert.ok(ascending.games.every(game => game.providerId === 'netent' && /shop/i.test(game.title)));
  assert.deepEqual(ids(descending), ids(ascending).toReversed());
  assert.equal(getCatalogPage({ type: 'category', categoryId: 'slots' }).games.length, 1211, 'clearing the theme restores all visible slots');
});

test('family and collection can be selected or cleared independently without an all-game fallback', () => {
  const fruit = getCatalogPage({ type: 'search', categoryId: 'fruit' });
  const fruitSlots = getCatalogPage({ type: 'search', gameTypeId: 'slots', categoryId: 'fruit' });
  const fruitTap = getCatalogPage({ type: 'search', gameTypeId: 'tap', categoryId: 'fruit' });
  assert.equal(fruit.games.length, 26);
  assert.equal(fruitSlots.games.length, 25);
  assert.deepEqual(ids(fruitTap), ['mysteryfruittapa']);
  assert.deepEqual(ids(getCatalogPage({ type: 'search', gameTypeId: 'table', categoryId: 'fruit' })), []);
  assert.equal(getCatalogPage({ type: 'search', gameTypeId: 'slots' }).games.length, 1211);
  assert.equal(getCatalogPage({ type: 'search' }).games.length, GAMES.length);
  for (const filters of [{ gameTypeId: 'missing' }, { categoryId: 'missing' }]) {
    for (const type of ['search', 'favorites', 'recent-games']) assert.equal(getCatalogPage({ type, ...filters }).type, 'not-found');
  }
  assert.deepEqual(ids(getCatalogPage({ type: 'search', categoryId: 'slots', themeId: 'fruit' })), ids(fruitSlots), 'old direct callers normalize to separate facets');
  for (const family of GAME_FAMILIES) {
    const page = getCatalogPage({ type: 'category', gameTypeId: family.id });
    assert.equal(page.title, family.title);
    assert.equal(page.gameTypeId, family.id);
    assert.equal(page.categoryId, '');
    assert.deepEqual(new Set(ids(page)), new Set(getGamesForCategory(family.id).map(game => game.id)));
  }
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
});

test('search is its own page and can find names across studios or restrict a category', () => {
  const page = getCatalogPage({ type: 'search', query: '  DRAGON  ', providerId: 'taparoo' });
  assert.equal(page.type, 'search');
  assert.equal(page.title, 'Taparoo');
  assert.equal(page.activeMenu, 'providers');
  assert.deepEqual(ids(page), ['dragonslucktapar']);

  const categorySearch = getCatalogPage({ type: 'search', categoryId: 'fruit', query: 'blackjack' });
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

  const fruit = getCatalogPage({ type: 'category', categoryId: 'fruit' });
  assert.equal(fruit.provider, undefined);
  assert.equal(fruit.query, '');
  assert.equal(fruit.sort, 'az');
  assert.deepEqual(fruit.games, fruit.games.toSorted((a, b) => a.title.localeCompare(b.title)));
});

test('unsupported ranking choices fall back to real available ordering', () => {
  const provider = getCatalogPage({ type: 'provider', providerId: 'netent', sort: 'unsupported' });
  assert.equal(provider.sort, 'az');
  assert.deepEqual(provider.allowedSorts, ['az', 'za', 'newest']);
  const fruit = getCatalogPage({ type: 'category', categoryId: 'fruit', sort: 'featured' });
  assert.equal(fruit.sort, 'az');
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
  assert.equal(first.total, 233);
  assert.equal(second.total, 233);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, true);
  assert.deepEqual(second.visible.slice(0, 35), first.visible);
  assert.equal(new Set(second.visible.map(game => game.id)).size, 70);
  assert.deepEqual(pageSlice(page.games, 250), { visible: page.games, total: 233, hasMore: false });
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

test('Recent Games uses actual play history, latest first, without duplicates', () => {
  const history = [
    { type: 'game', gameId: 'SanQuentin' },
    { type: 'game', gameId: 'ouija00000000000' },
    { type: 'reward', gameId: 'nunchucksr96f100' },
    { type: 'game', gameId: 'removed-game' },
    { type: 'game', gameId: 'hacksaw-1446' },
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

test('a query defaults to relevance, an explicit sort wins, and clearing restores collection ordering', () => {
  const page = getCatalogPage({ type: 'search', query: 'STARBUŔST' });
  assert.equal(page.sort, 'relevance');
  assert.equal(page.allowedSorts[0], 'relevance');
  assert.equal(page.games[0].id, 'starburst', 'the exact title ranks ahead of longer names');
  assert.equal(ids(getCatalogPage({ type: 'search', query: 'nunchcuks' }))[0], 'nunchucksr96f100');
  const alphabetical = getCatalogPage({ type: 'search', query: 'starburst', sort: 'az' });
  assert.equal(alphabetical.sort, 'az');
  assert.deepEqual(alphabetical.games, alphabetical.games.toSorted((a, b) => a.title.localeCompare(b.title)));
  for (const [type, sort, categoryId] of [['search', 'az'], ['favorites', 'saved'], ['recent-games', 'recent'], ['category', 'az', 'fruit']]) {
    const cleared = getCatalogPage({ type, categoryId, query: '', sort: 'relevance' });
    assert.equal(cleared.sort, sort);
    assert.equal(cleared.allowedSorts.includes('relevance'), false);
  }
});

test('home always keeps its shelf identity and never becomes an inline results page', () => {
  for (const filters of [{}, { categoryId: 'all', query: '  ' },
    { categoryId: 'slots', themeId: 'fruit', query: 'shop', providerId: 'netent', sort: 'za' },
    { query: 'nunchucks' }, { providerId: 'taparoo' }, { categoryId: 'tap' }, { sort: 'newest' }]) {
    assert.deepEqual(getCatalogPage({ type: 'home', ...filters }), {
      type: 'home', title: 'Lobby', activeMenu: 'lobby',
    });
  }
});

test('an incompatible selected provider remains available with zero matches in another game family', () => {
  const impossible = getCatalogPage({ type: 'search', gameTypeId: 'tap', providerId: 'nolimit-city' });
  assert.deepEqual(impossible.games, []);
  assert.deepEqual(impossible.providerFacets.find(facet => facet.id === 'nolimit-city'), {
    id: 'nolimit-city', name: 'Nolimit City', count: 0,
  });
  assert.ok(impossible.providerFacets.filter(facet => facet.id !== 'nolimit-city').every(facet => facet.count > 0));
});

test('family and collection filters stay within saved, recent and provider scopes', () => {
  const slotIds = new Set(getGamesForCategory('slots').map(game => game.id));
  const fruitSlot = getGamesForCategory('fruit').find(game => slotIds.has(game.id));
  const tapGame = getGamesForCategory('tap')[0];
  const favoriteIds = [fruitSlot.id, tapGame.id];
  const state = { favoriteIds, history: favoriteIds.map(gameId => ({ type: 'game', gameId })) };
  for (const type of ['favorites', 'recent-games']) {
    const page = getCatalogPage({ type, gameTypeId: 'slots', categoryId: 'fruit' }, state);
    assert.deepEqual(ids(page), [fruitSlot.id]);
    assert.equal(page[type === 'favorites' ? 'savedCount' : 'recentCount'], 2);
    assert.equal(page.providerFacets.reduce((total, facet) => total + facet.count, 0), 1);
    assert.deepEqual(ids(getCatalogPage({ type, gameTypeId: 'tap' }, state)), [tapGame.id]);
    assert.deepEqual(ids(getCatalogPage({ type, gameTypeId: 'slots', query: 'not-a-saved-game' }, state)), []);
    assert.deepEqual(ids(getCatalogPage({ type, gameTypeId: 'slots' })), []);
    assert.deepEqual(ids(getCatalogPage({ type, categoryId: 'fruit' }, state)), [fruitSlot.id]);
  }
  const provider = getCatalogPage({ type: 'provider', providerId: fruitSlot.providerId, gameTypeId: 'slots', categoryId: 'fruit' });
  assert.ok(provider.games.length > 0);
  assert.ok(provider.games.every(game => game.providerId === fruitSlot.providerId && slotIds.has(game.id)
    && getGamesForCategory('fruit').some(fruit => fruit.id === game.id)));
});

test('headings and selected navigation describe the same selection regardless of entry route', () => {
  for (const [direct, search, title, activeMenu] of [
    ['#/slots', '#/search?type=slots', 'Slots', 'slots'],
    ['#/fruit', '#/search?category=fruit', 'Fruit Games', 'fruit'],
    ['#/fruit?type=slots', '#/search?type=slots&category=fruit', 'Fruit Games', 'fruit'],
    ['#/megaways', '#/search?category=megaways', 'Megaways', 'megaways'],
  ]) {
    const first = getCatalogPage(parseRoute(direct));
    const second = getCatalogPage(parseRoute(search));
    assert.equal(first.title, title);
    assert.equal(second.title, title);
    assert.equal(first.activeMenu, activeMenu);
    assert.equal(second.activeMenu, activeMenu);
    assert.deepEqual(ids(first), ids(second));
    for (const field of ['gameTypeFacets', 'providerFacets']) assert.deepEqual(first[field], second[field]);
  }
  const providerFilter = getCatalogPage({ type: 'search', providerId: 'netent' });
  assert.equal(providerFilter.title, 'NetEnt');
  assert.equal(providerFilter.activeMenu, 'providers');
  const fixedProvider = getCatalogPage({ type: 'provider', providerId: 'netent', gameTypeId: 'slots', categoryId: 'fruit' });
  assert.equal(fixedProvider.title, 'NetEnt');
  assert.equal(fixedProvider.activeMenu, 'providers');
});

test('visible game types remain available in restricted and empty browse scopes', () => {
  const familyIds = GAME_FAMILIES.map(family => family.id);
  for (const route of [
    { type: 'search' },
    { type: 'search', gameTypeId: 'slots', categoryId: 'megaways' },
    { type: 'search', gameTypeId: 'table', categoryId: 'fruit' },
    { type: 'search', gameTypeId: 'arcade', query: 'san quentin' },
    { type: 'provider', providerId: 'taparoo' },
    { type: 'favorites' },
    { type: 'recent-games' },
  ]) {
    const page = getCatalogPage(route);
    assert.deepEqual(page.gameTypeFacets.map(family => family.id), familyIds, JSON.stringify(route));
    assert.equal('categoryFacets' in page, false, 'category routes remain supported without a category dropdown');
  }
  const arcade = getCatalogPage({ type: 'search', gameTypeId: 'arcade' });
  assert.deepEqual(arcade.providerFacets, [
    { id: 'bgaming', name: 'BGaming', count: 45 },
  ]);
});

test('provider alternatives ignore their own selection and search text but respect browse scope', () => {
  const route = { type: 'search', gameTypeId: 'slots', categoryId: 'fruit', providerId: 'netent' };
  const page = getCatalogPage(route);
  assert.ok(page.providerFacets.length > 1);
  const allProviders = getCatalogPage({ ...route, providerId: '' });
  assert.deepEqual(page.providerFacets, allProviders.providerFacets);
  const expected = new Map();
  for (const game of allProviders.games) expected.set(game.providerId, (expected.get(game.providerId) || 0) + 1);
  assert.deepEqual(new Map(page.providerFacets.map(({ id, count }) => [id, count])), expected);
  assert.ok(page.providerFacets.every(facet => facet.name && facet.count > 0));
  assert.deepEqual(ids(page), allProviders.games.filter(game => game.providerId === route.providerId).map(game => game.id));
  for (const option of page.providerFacets) {
    assert.equal(option.count, getCatalogPage({ ...route, providerId: option.id }).games.length, option.id);
  }
  const query = getCatalogPage({ ...route, query: 'fruit shop' });
  assert.ok(query.games.length > 0 && query.games.length < page.games.length);
  for (const text of ['fruit shop', 'san quentin', 'no-such-catalog-game']) {
    const searched = getCatalogPage({ ...route, query: text });
    assert.deepEqual(searched.gameTypeFacets, page.gameTypeFacets, text);
    assert.deepEqual(searched.providerFacets, page.providerFacets, text);
  }
  const categoryCleared = getCatalogPage({ ...route, categoryId: '' });
  assert.ok(categoryCleared.providerFacets.reduce((sum, provider) => sum + provider.count, 0)
    > page.providerFacets.reduce((sum, provider) => sum + provider.count, 0));
});

test('zero-result queries preserve browse choices and legacy category scope', () => {
  const page = getCatalogPage({ type: 'search', gameTypeId: 'arcade', categoryId: 'fruit', providerId: 'red-tiger', query: 'no-such-catalog-game' });
  assert.deepEqual(page.games, []);
  assert.deepEqual(page.gameTypeFacets.map(family => family.id), GAME_FAMILIES.map(family => family.id));
  assert.deepEqual(page.providerFacets, [{ id: 'red-tiger', name: 'Red Tiger', count: 0 }]);
  assert.equal(page.categoryId, 'fruit');
  const legacy = getCatalogPage({ type: 'search', categoryId: 'blackjack', query: 'no-such-catalog-game' });
  const browseLegacy = getCatalogPage({ type: 'search', categoryId: 'blackjack' });
  assert.deepEqual(legacy.games, []);
  assert.equal(legacy.categoryId, 'blackjack');
  assert.equal(legacy.title, 'Blackjack');
  assert.deepEqual(legacy.gameTypeFacets, browseLegacy.gameTypeFacets);
  assert.deepEqual(legacy.providerFacets, browseLegacy.providerFacets);
  assert.ok(legacy.providerFacets.length > 0);
});

test('stable choices preserve saved, recent and fixed-provider data boundaries', () => {
  const fruitSlot = getGamesForCategory('fruit').find(game => game.providerId === 'netent');
  const tapGame = GAMES.find(game => game.id === 'mysteryfruittapa');
  const tableGame = getGamesForCategory('table').find(game => game.providerId === 'netent');
  const favoriteIds = [fruitSlot.id, tapGame.id, tableGame.id];
  const state = { favoriteIds, history: favoriteIds.map(gameId => ({ type: 'game', gameId })) };
  for (const type of ['favorites', 'recent-games']) {
    const page = getCatalogPage({ type, categoryId: 'fruit' }, state);
    assert.equal(page.title, type === 'favorites' ? 'Favorite Games' : 'Recent Games');
    assert.equal(page.activeMenu, type);
    assert.deepEqual(page.gameTypeFacets.filter(family => family.count > 0), [
      { id: 'slots', title: 'Slots', count: 1 }, { id: 'tap', title: 'Tap Games', count: 1 },
    ]);
    assert.deepEqual(page.gameTypeFacets.map(family => family.id), GAME_FAMILIES.map(family => family.id));
    assert.equal(page.providerFacets.reduce((sum, item) => sum + item.count, 0), 2);
    const searched = getCatalogPage({ type, categoryId: 'fruit', query: 'no-such-catalog-game' }, state);
    assert.deepEqual(searched.games, []);
    assert.deepEqual(searched.gameTypeFacets, page.gameTypeFacets);
    assert.deepEqual(searched.providerFacets, page.providerFacets);
    const empty = getCatalogPage({ type });
    assert.deepEqual(empty.providerFacets, []);
    assert.deepEqual(empty.gameTypeFacets.map(family => family.id), GAME_FAMILIES.map(family => family.id));
    assert.ok(empty.gameTypeFacets.every(family => family.count === 0));
  }
  const fixedProvider = getCatalogPage({ type: 'provider', providerId: 'taparoo' });
  assert.deepEqual(fixedProvider.gameTypeFacets.filter(family => family.count > 0), [{ id: 'tap', title: 'Tap Games', count: 8 }]);
  assert.deepEqual(fixedProvider.providerFacets, [{ id: 'taparoo', name: 'Taparoo', count: 8 }]);
  assert.ok(getCatalogPage({ type: 'search', providerId: 'taparoo' }).providerFacets.length > 1,
    'a removable provider filter differs from a fixed provider page scope');
  const impossible = getCatalogPage({ type: 'provider', providerId: 'taparoo', gameTypeId: 'table' });
  assert.deepEqual(impossible.games, []);
  assert.deepEqual(impossible.gameTypeFacets, fixedProvider.gameTypeFacets);
  assert.deepEqual(impossible.providerFacets, [{ id: 'taparoo', name: 'Taparoo', count: 0 }]);
});
