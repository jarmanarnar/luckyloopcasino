import { GAMES, PROVIDERS } from './catalog.js';
import { CATEGORIES, LEGACY_CATEGORIES, getGamesForCategory, getGameReleaseDate } from './collections.js';

export const PAGE_SIZE = 35;
export const LOBBY_CATEGORIES = ['popular', 'slots', 'new-releases'];
const categories = new Map([...LEGACY_CATEGORIES, ...CATEGORIES].map(category => [category.id, category]));
const byName = (a, b) => a.title.localeCompare(b.title);
const matches = (value, query) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase());

export function getCatalogPage(route) {
  const query = String(route.query || '').trim();
  if (route.type === 'home') return { type: 'home', title: 'Casino', activeMenu: 'all' };
  if (route.type === 'providers') return { type: 'providers', title: 'Game Providers', activeMenu: 'providers', query,
    providers: PROVIDERS.filter(provider => matches(provider.name, query)) };
  const category = categories.get(route.categoryId);
  const provider = PROVIDERS.find(item => item.id === route.providerId);
  if (!['category', 'provider', 'search'].includes(route.type)
    || (route.type === 'category' && (!category || category.id === 'all'))
    || (route.type === 'provider' && !provider)) {
    return { type: 'not-found', title: 'Page not found', activeMenu: '' };
  }
  const collection = route.type === 'category' ? getGamesForCategory(category.id)
    : route.type === 'search' && category && category.id !== 'all' ? getGamesForCategory(category.id) : GAMES;
  const games = collection.filter(game => (!route.providerId || game.providerId === route.providerId)
    && (!query || matches(`${game.title} ${game.providerName}`, query)));
  const defaultSort = route.type === 'category' && category.id === 'popular' ? 'featured'
    : route.type === 'category' && category.id === 'new-releases' ? 'newest' : 'az';
  const allowedSorts = ['az', 'za', ...(route.type === 'category' && category.id === 'popular' ? ['featured'] : []),
    ...(route.type === 'category' && category.id === 'new-releases' ? ['newest'] : [])];
  const sort = allowedSorts.includes(route.sort) ? route.sort : defaultSort;
  if (sort === 'az') games.sort(byName);
  if (sort === 'za') games.sort((a, b) => byName(b, a));
  if (sort === 'newest') games.sort((a, b) => getGameReleaseDate(b).localeCompare(getGameReleaseDate(a)) || byName(a, b));
  return { type: route.type, title: route.type === 'category' ? category.title : route.type === 'provider' ? provider.name : 'Search games',
    activeMenu: route.type === 'provider' ? 'providers' : route.type === 'search' ? 'search' : category.id,
    games, provider, query, sort, allowedSorts };
}

export function pageSlice(items, limit = PAGE_SIZE) {
  const visible = items.slice(0, limit);
  return { visible, total: items.length, hasMore: visible.length < items.length };
}
