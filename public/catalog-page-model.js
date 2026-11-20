import { GAMES, PROVIDERS } from './catalog.js';
import { CATEGORIES, GAME_FAMILIES, LEGACY_CATEGORIES, LOBBY_SECTIONS, getGamesForCategory, getGameReleaseDate } from './collections.js';
import { createCatalogSearch } from './catalog-search.js';

export const PAGE_SIZE = 35;
// Lobby navigation and shelves share the same discovery and game-type sections.
export const LOBBY_COLLECTIONS = LOBBY_SECTIONS;
export const LOBBY_CATEGORIES = LOBBY_COLLECTIONS.map(category => category.id);
const families = new Map(GAME_FAMILIES.map(family => [family.id, family]));
const categories = new Map([...LEGACY_CATEGORIES.filter(category => !families.has(category.id)), ...CATEGORIES].map(category => [category.id, category]));
const familyByGame = new Map(GAME_FAMILIES.flatMap(family => getGamesForCategory(family.id).map(game => [game.id, family.id])));
const categoryMemberships = new Map([...categories].map(([id]) => [id, new Set(getGamesForCategory(id).map(game => game.id))]));
const gamesById = new Map(GAMES.map(game => [game.id, game]));
const byName = (a, b) => a.title.localeCompare(b.title);

export function getFavoriteGames(favoriteIds = []) {
  return [...new Set(favoriteIds)].reverse().map(id => gamesById.get(id)).filter(Boolean);
}

export function getRecentGames(history = []) {
  const played = history.filter(entry => entry?.type === 'game').map(entry => entry.gameId).reverse();
  return [...new Set(played)].map(id => gamesById.get(id)).filter(Boolean);
}

export function getCatalogPage(route, { favoriteIds = [], history = [] } = {}) {
  if (route.type === 'home') return { type: 'home', title: 'Lobby', activeMenu: 'lobby' };
  // Compatibility for earlier callers: a family formerly occupied categoryId,
  // and a theme is now an ordinary collection rather than a separate facet.
  const requestedCategory = route.categoryId === 'all' ? '' : route.categoryId || '';
  const gameTypeId = (route.gameTypeId === 'all' ? '' : route.gameTypeId) || (families.has(requestedCategory) ? requestedCategory : '');
  const categoryId = families.has(requestedCategory) ? '' : requestedCategory;
  const legacyCategory = !categoryId && (!gameTypeId || gameTypeId === 'slots') && categories.has(route.themeId) ? route.themeId : '';
  const query = String(route.query || '').trim();
  const search = createCatalogSearch(query);
  if (route.type === 'providers') return { type: 'providers', title: 'Game Providers', activeMenu: 'providers', query,
    providers: PROVIDERS.filter(provider => search.score({ title: provider.name }) !== null) };
  const family = families.get(gameTypeId);
  const category = categories.get(categoryId || legacyCategory);
  const provider = PROVIDERS.find(item => item.id === route.providerId);
  if (!['category', 'provider', 'search', 'favorites', 'recent-games'].includes(route.type)
    || (gameTypeId && !family) || ((categoryId || legacyCategory) && !category)
    || (route.type === 'category' && !category && !family)
    || (route.type === 'provider' && !provider)) {
    return { type: 'not-found', title: 'Page not found', activeMenu: '' };
  }
  const collection = route.type === 'favorites' ? getFavoriteGames(favoriteIds)
    : route.type === 'recent-games' ? getRecentGames(history)
    : route.type === 'provider' ? GAMES.filter(game => game.providerId === provider.id) : GAMES;
  const personal = ['favorites', 'recent-games'].includes(route.type);
  const orderedCollection = !personal && category ? getGamesForCategory(category.id) : collection;
  const categoryGames = category ? categoryMemberships.get(category.id) : null;
  const scores = new Map();
  const matchingIds = new Set();
  const familyCounts = new Map();
  const providerCounts = new Map();
  const count = (counts, id) => counts.set(id, (counts.get(id) || 0) + 1);
  // Available filters describe the browse scope, independently of typed text.
  // Provider alternatives also omit the current provider selection.
  for (const game of collection) {
    const gameFamily = familyByGame.get(game.id);
    const matchesFamily = !family || gameFamily === family.id;
    const matchesCategory = !categoryGames || categoryGames.has(game.id);
    const matchesProvider = !route.providerId || game.providerId === route.providerId;
    if (matchesCategory && matchesProvider && gameFamily) count(familyCounts, gameFamily);
    if (matchesFamily && matchesCategory) count(providerCounts, game.providerId);
    if (!matchesFamily || !matchesCategory || !matchesProvider) continue;
    const score = search.score(game);
    if (score === null) continue;
    scores.set(game.id, score);
    matchingIds.add(game.id);
  }
  const gameTypeFacets = GAME_FAMILIES
    .map(({ id, title }) => ({ id, title, count: familyCounts.get(id) || 0 }));
  const providerFacets = PROVIDERS.filter(item => providerCounts.has(item.id) || item.id === route.providerId)
    .map(({ id, name }) => ({ id, name, count: providerCounts.get(id) || 0 }));
  const games = orderedCollection.filter(game => matchingIds.has(game.id));
  const defaultSort = search.active ? 'relevance' : route.type === 'favorites' ? 'saved'
    : route.type === 'recent-games' ? 'recent'
    : category?.id === 'popular' ? 'featured'
    : category?.id === 'new-releases' ? 'newest' : 'az';
  const hasReleaseDates = category?.id === 'new-releases' ||
    orderedCollection.some(game => (!route.providerId || game.providerId === route.providerId) && getGameReleaseDate(game));
  const allowedSorts = [...(search.active ? ['relevance'] : []), ...(route.type === 'favorites' ? ['saved'] : route.type === 'recent-games' ? ['recent'] : []), 'az', 'za', ...(hasReleaseDates ? ['newest'] : []), ...(category?.id === 'popular' ? ['featured'] : [])];
  const sort = allowedSorts.includes(route.sort) ? route.sort : defaultSort;
  if (sort === 'relevance') games.sort((a, b) => scores.get(a.id) - scores.get(b.id));
  if (sort === 'az') games.sort(byName);
  if (sort === 'za') games.sort((a, b) => byName(b, a));
  if (sort === 'newest') games.sort((a, b) => getGameReleaseDate(b).localeCompare(getGameReleaseDate(a)) || byName(a, b));
  if (sort === 'featured') {
    const order = new Map(getGamesForCategory('popular').map((game, index) => [game.id, index]));
    games.sort((a, b) => order.get(a.id) - order.get(b.id));
  }
  return { type: route.type, title: route.type === 'favorites' ? 'Favorite Games'
    : route.type === 'recent-games' ? 'Recent Games'
    : route.type === 'provider' ? provider.name : category?.title || family?.title || provider?.name || 'Games',
    activeMenu: personal ? route.type : route.type === 'provider' ? 'providers' : category?.id || family?.id || (provider ? 'providers' : 'search'),
    games, provider, gameTypeFacets, providerFacets, query, sort, allowedSorts, gameTypeId: family?.id || '', categoryId: category?.id || '',
    ...(route.type === 'favorites' ? { savedCount: collection.length } : route.type === 'recent-games' ? { recentCount: collection.length } : {}) };
}

export function pageSlice(items, limit = PAGE_SIZE) {
  const visible = items.slice(0, limit);
  return { visible, total: items.length, hasMore: visible.length < items.length };
}
