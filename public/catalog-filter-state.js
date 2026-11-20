import { GAME_FAMILIES, SLOT_THEMES } from './collections.js';
import { getCatalogPage } from './catalog-page-model.js';

const gameTypeIds = new Set(GAME_FAMILIES.map(family => family.id));
const legacyThemeIds = new Set(SLOT_THEMES.map(theme => theme.id));

function copyCollectionScope(route) {
  const next = { ...route };
  // Older callers used categoryId for game families. Separate that field from
  // named collections before changing or clearing the selected family.
  if (gameTypeIds.has(next.categoryId)) delete next.categoryId;
  // Keep a legacy theme effective even when filtering for a non-slot type.
  if (!next.categoryId && legacyThemeIds.has(next.themeId)) next.categoryId = next.themeId;
  return next;
}

// A dropdown narrows its current destination; it does not silently remove a
// named collection, provider or personal-library constraint to find results.
export function changeCatalogGameType(route, gameTypeId, { favoriteIds = [], history = [] } = {}) {
  const selectedType = gameTypeId === 'all' ? '' : gameTypeId || '';
  if (selectedType && !gameTypeIds.has(selectedType)) return { ...route };

  const next = copyCollectionScope(route);
  delete next.gameTypeId;
  if (selectedType) next.gameTypeId = selectedType;
  if (next.type === 'category' && !next.categoryId && !selectedType) next.type = 'search';

  const page = getCatalogPage(next, { favoriteIds, history });
  if (next.sort && !page.allowedSorts?.includes(next.sort)) delete next.sort;
  return next;
}

export function resetCatalogFilters(route) {
  const next = copyCollectionScope(route);
  delete next.query;
  delete next.gameTypeId;
  delete next.sort;
  if (next.type !== 'provider') delete next.providerId;
  if (next.type === 'category' && !next.categoryId) next.type = 'search';
  return next;
}
