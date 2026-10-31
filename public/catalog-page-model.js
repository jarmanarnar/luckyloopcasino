import { GAMES, PROVIDERS } from './catalog.js';
import { CATEGORIES, LEGACY_CATEGORIES, getGamesForCategory, getGameReleaseDate } from './collections.js';

export const PAGE_SIZE = 35;
export const LOBBY_CATEGORIES = ['popular', 'slots', 'new-releases'];
const categories = new Map([...LEGACY_CATEGORIES, ...CATEGORIES].map(category => [category.id, category]));
const gamesById = new Map(GAMES.map(game => [game.id, game]));
const byName = (a, b) => a.title.localeCompare(b.title);
const matches = (value, query) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase());

export function getFavoriteGames(favoriteIds = []) {
  return [...new Set(favoriteIds)].reverse().map(id => gamesById.get(id)).filter(Boolean);
}

export function getCatalogPage(route, { favoriteIds = [] } = {}) {
  const query = String(route.query || '').trim();
  if (route.type === 'home') return { type: 'home', title: 'Lobby', activeMenu: 'lobby' };
  if (route.type === 'providers') return { type: 'providers', title: 'Game Providers', activeMenu: 'providers', query,
    providers: PROVIDERS.filter(provider => matches(provider.name, query)) };
  const category = categories.get(route.categoryId);
  const provider = PROVIDERS.find(item => item.id === route.providerId);
  if (!['category', 'provider', 'search', 'favorites'].includes(route.type)
    || (route.type === 'category' && !category)
    || (route.type === 'provider' && !provider)) {
    return { type: 'not-found', title: 'Page not found', activeMenu: '' };
  }
  const collection = route.type === 'favorites' ? getFavoriteGames(favoriteIds)
    : route.type === 'category' ? getGamesForCategory(category.id)
    : route.type === 'search' && category ? getGamesForCategory(category.id) : GAMES;
  const games = collection.filter(game => (!route.providerId || game.providerId === route.providerId)
    && (!query || matches(`${game.title} ${game.providerName}`, query)));
  const defaultSort = route.type === 'favorites' ? 'saved'
    : route.type === 'category' && category.id === 'popular' ? 'featured'
    : route.type === 'category' && category.id === 'new-releases' ? 'newest' : 'az';
  const allowedSorts = [...(route.type === 'favorites' ? ['saved'] : []), 'az', 'za', ...(route.type === 'category' && category.id === 'popular' ? ['featured'] : []),
    ...(route.type === 'category' && category.id === 'new-releases' ? ['newest'] : [])];
  const sort = allowedSorts.includes(route.sort) ? route.sort : defaultSort;
  if (sort === 'az') games.sort(byName);
  if (sort === 'za') games.sort((a, b) => byName(b, a));
  if (sort === 'newest') games.sort((a, b) => getGameReleaseDate(b).localeCompare(getGameReleaseDate(a)) || byName(a, b));
  return { type: route.type, title: route.type === 'favorites' ? 'Favorites'
    : route.type === 'category' ? category.title : route.type === 'provider' ? provider.name : 'Search games',
    activeMenu: route.type === 'favorites' ? 'favorites' : route.type === 'provider' ? 'providers' : route.type === 'search' ? 'search' : category.id,
    games, provider, query, sort, allowedSorts, ...(route.type === 'favorites' ? { savedCount: collection.length } : {}) };
}

export function pageSlice(items, limit = PAGE_SIZE) {
  const visible = items.slice(0, limit);
  return { visible, total: items.length, hasMore: visible.length < items.length };
}
