import { PROVIDERS } from './catalog.js';
import { GAME_FAMILIES, getGamesForCategory } from './collections.js';
import { createShelfIcon } from './shelf-icons.js';
import { PROVIDER_LOGOS } from './provider-assets.js';
import { getProviderDetails } from './provider-details.js';
import { PAGE_SIZE, LOBBY_COLLECTIONS, getCatalogPage, pageSlice } from './catalog-page-model.js';
import { createGameArt } from './game-artwork-view.js';
import { enhanceCatalogSelect } from './catalog-select.js';
import { changeCatalogGameType, resetCatalogFilters } from './catalog-filter-state.js';

let controller;
const SHELF_GAME_LIMIT = 24;
const sortLabels = { relevance: 'Best match', featured: 'Featured', az: 'Name: A–Z', za: 'Name: Z–A', newest: 'Newest first', saved: 'Recently saved', recent: 'Recently played' };

export function getCatalogSearchPlaceholder(model) {
  if (model.type === 'providers') return 'Search providers';
  if (model.type === 'favorites') return 'Search favorites';
  if (model.type === 'recent-games') return 'Search recent games';
  if (model.type === 'provider') return `Search ${model.provider.name} games`;
  if (model.categoryId || model.gameTypeId) return `Search in ${model.title}`;
  if (model.provider) return `Search ${model.provider.name} games`;
  return 'Search all games';
}

export function getCatalogEmptyState(model) {
  const personal = ['favorites', 'recent-games'].includes(model.type);
  const noSaved = model.type === 'favorites' && model.savedCount === 0 && !model.query;
  const noRecent = model.type === 'recent-games' && model.recentCount === 0 && !model.query;
  const directory = model.type === 'providers';
  const scoped = personal || model.type === 'provider' || Boolean(model.categoryId || model.gameTypeId || model.provider);
  const searchAll = !directory && scoped && Boolean(model.query);
  const title = noSaved ? 'Your favorites start here' : noRecent ? 'No recent games yet'
    : model.type === 'favorites' ? 'No matching favorites'
    : model.type === 'recent-games' ? 'No matching recent games'
    : directory ? 'No matching providers' : 'No matching games';
  const description = noSaved ? 'Save games with the heart to keep them all in one place.'
    : noRecent ? 'Games you open while signed in will appear here.'
    : directory ? 'Try another name or clear your search.'
    : scoped ? `No games match your filters in ${model.title}. Try another search or remove a filter.`
    : 'Try another name or remove a filter to see more games.';
  const actions = searchAll ? [{ action: 'search-all', label: 'Search all games' }, { action: 'clear', label: 'Clear filters' }]
    : noSaved || noRecent ? [{ action: 'browse', label: 'Explore games' }]
    : [{ action: 'clear', label: 'Clear filters' }];
  return { title, description, actions };
}

export function getShelfScrollTarget(track, direction, position = track.scrollLeft) {
  const first = track.firstElementChild;
  const second = first?.nextElementSibling;
  if (!second || !track.clientWidth) return 0;
  const card = first.getBoundingClientRect();
  const stride = second.getBoundingClientRect().left - card.left;
  if (stride <= 0) return 0;
  const gap = stride - card.width;
  // Keep the last visible card as the first card of the next row.
  const visible = Math.max(1, Math.ceil((track.clientWidth + gap - 1) / stride));
  const step = Math.max(1, visible - 1);
  const index = Math.round(position / stride) + (direction === 'next' ? step : -step);
  return Math.max(0, Math.min(index * stride, track.scrollWidth - track.clientWidth));
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function arrowIcon(next = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm15 4-8 8 8 8 1.4-1.4L9.8 12l6.6-6.6L15 4Z');
  if (next) path.setAttribute('transform', 'translate(24 0) scale(-1 1)');
  svg.append(path);
  return svg;
}
function gameCard(game, shelfId) {
  const card = node('li', 'game-card');
  const button = node('button', 'game-launch');
  button.type = 'button';
  button.id = `game-${shelfId}-${game.id}`;
  button.dataset.game = game.id;
  button.dataset.provider = game.providerId;
  button.setAttribute('aria-label', `View ${game.title} by ${game.providerName}`);
  const art = createGameArt(game);
  button.append(art, node('span', 'game-provider-badge', game.providerName));
  card.append(button);
  return card;
}
function providerCard(provider) {
  const card = node('li', 'provider-card');
  const button = node('button', 'provider-launch');
  button.type = 'button';
  button.dataset.openProvider = provider.id;
  button.setAttribute('aria-label', `View ${provider.name} games`);
  const logo = node('img', 'provider-logo');
  Object.assign(logo, { src: PROVIDER_LOGOS[provider.id].src, alt: provider.name, width: 140, height: 48,
    loading: 'lazy', decoding: 'async' });
  button.append(logo);
  card.append(button);
  return card;
}

export function initCatalogView({ router, member } = {}) {
  if (controller) return controller;
  const root = document.querySelector('#lobby-view');
  const shelves = document.querySelector('#catalog-shelves');
  const categories = document.querySelector('#catalog-categories');
  const more = document.querySelector('#catalog-more');
  const empty = document.querySelector('#catalog-empty');
  const header = document.querySelector('#catalog-page-header');
  const title = document.querySelector('#catalog-page-title');
  const controls = document.querySelector('#catalog-page-controls');
  const input = document.querySelector('#catalog-page-search-input');
  const lobbySearchLink = document.querySelector('#lobby-search-link');
  const browser = document.querySelector('#catalog-browser');
  const searchClear = document.querySelector('#catalog-search-clear');
  const filterToggle = document.querySelector('#catalog-filters-toggle');
  const filterCount = document.querySelector('#catalog-filters-count');
  const filterPanel = document.querySelector('#catalog-filter-panel');
  const providerSelect = document.querySelector('#catalog-page-provider');
  const gameTypeSelect = document.querySelector('#catalog-page-game-type');
  const sortSelect = document.querySelector('#catalog-page-sort');
  const pagination = document.querySelector('#catalog-pagination');
  const details = document.querySelector('#catalog-provider-details');
  const hero = document.querySelector('#hero-carousel');
  const toolbar = document.querySelector('.catalog-toolbar');
  if (!router || ![root, shelves, categories, more, empty, header, title, controls, input,
    providerSelect, gameTypeSelect, sortSelect, pagination, details, browser, searchClear, filterToggle, lobbySearchLink,
    filterCount, filterPanel, hero, toolbar].every(Boolean)) return;
  const limits = new Map(), tracks = new Set(), scrollTargets = new WeakMap();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let compactFilters = false;
  let renderedKey = '', renderedRoute, inputTimer = 0, detailsId = '', filtersOpen = false, composing = false;
  function syncFilterPanel() {
    compactFilters = getComputedStyle(controls).getPropertyValue('--catalog-filters-compact').trim() === '1';
    const expanded = !compactFilters || filtersOpen;
    if (!expanded && filterPanel.contains(document.activeElement)) filterToggle.focus({ preventScroll: true });
    if (!compactFilters && document.activeElement === filterToggle) input.focus({ preventScroll: true });
    filterPanel.dataset.expanded = String(expanded);
    filterPanel.inert = !expanded;
    filterPanel.setAttribute('aria-hidden', String(!expanded));
    filterToggle.setAttribute('aria-expanded', String(expanded));
    if (!expanded) filterMenus.forEach(menu => menu.close());
    // Keep floating promotions below the controls instead of narrowing the search row.
    const controlsBottom = controls.getBoundingClientRect().bottom + window.scrollY;
    document.body.style.setProperty('--catalog-promotions-top', `${Math.ceil(controlsBottom + 12)}px`);
  }
  const viewKey = route => JSON.stringify(route);
  const collectionKey = (type, state = member?.getState()) => JSON.stringify(type === 'favorites' ? state?.favorites || [] : state?.history || []);
  const collectionKeys = new Map(['favorites', 'recent-games'].map(type => [type, collectionKey(type)]));
  const option = (value, text) => Object.assign(node('option', '', text), { value });
  providerSelect.replaceChildren(option('', 'All providers'), ...PROVIDERS.map(p => option(p.id, p.name)));
  gameTypeSelect.replaceChildren(option('', 'All game types'), ...GAME_FAMILIES.map(type => option(type.id, type.title)));
  const filterMenus = [gameTypeSelect, providerSelect, sortSelect].map(select =>
    enhanceCatalogSelect(select));
  for (const category of LOBBY_COLLECTIONS) {
    const button = node('button', 'catalog-category');
    button.type = 'button';
    button.dataset.category = category.id;
    button.append(createShelfIcon(category.id));
    button.append(node('span', '', category.title));
    categories.append(button);
  }
  function updateFilterBadge(route, model) {
    const { favorites: favoriteIds, history } = member?.getState() || {};
    const defaults = getCatalogPage(resetCatalogFilters(route, { preserveQuery: true }), { favoriteIds, history });
    const additionalCount = Number(Boolean(route.providerId && route.type !== 'provider'))
      + Number(Boolean(model.gameTypeId))
      + Number(Boolean(route.sort && route.sort === model.sort && model.sort !== defaults.sort));
    filterCount.textContent = String(additionalCount);
    filterCount.hidden = !additionalCount;
    filterToggle.setAttribute('aria-label', additionalCount ? `Filters, ${additionalCount} active` : 'Filters');
  }
  function updateArrows(track) {
    const section = track.closest('.game-shelf');
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    const position = scrollTargets.get(track) ?? track.scrollLeft;
    section.querySelector('[data-scroll="previous"]').disabled = position <= 1;
    section.querySelector('[data-scroll="next"]').disabled = position >= max - 1;
  }
  function rail(id, label, items, providers = false) {
    const section = node('section', 'game-shelf');
    section.dataset.shelf = id;
    section.setAttribute('aria-labelledby', `shelf-title-${id}`);
    const head = node('div', 'game-shelf__header');
    const heading = node('h2', 'game-shelf__title');
    heading.id = `shelf-title-${id}`;
    const titleLink = node('button', 'game-shelf__title-link');
    const all = node('button', 'shelf-see-all', 'All');
    for (const button of [titleLink, all]) {
      button.type = 'button';
      if (providers) button.dataset.openProviders = '';
      else if (id === 'favorites') button.dataset.openFavorites = '';
      else button.dataset.openCategory = id;
    }
    all.setAttribute('aria-label', `See all ${providers ? 'game providers' : `${label} games`}`);
    titleLink.append(createShelfIcon(id), node('span', 'game-shelf__label', label));
    heading.append(titleLink);
    const actions = node('div', 'game-shelf__actions');
    const navigation = node('div', 'game-shelf__navigation');
    const track = node('ul', providers ? 'provider-track' : 'game-track');
    track.id = `${providers ? 'provider' : 'game'}-track-${id}`;
    track.setAttribute('aria-label', providers ? 'Game providers' : `${label} games`);
    track.dir = 'ltr';
    track.tabIndex = 0;
    for (const direction of ['previous', 'next']) {
      const button = node('button', 'icon-button game-shelf__arrow');
      button.type = 'button';
      button.dataset.scroll = direction;
      button.setAttribute('aria-label', `${direction === 'next' ? 'Next' : 'Previous'} ${label}`);
      button.setAttribute('aria-controls', track.id);
      button.append(arrowIcon(direction === 'next'));
      navigation.append(button);
    }
    actions.append(all, navigation);
    head.append(heading, actions);
    track.append(...items.slice(0, providers ? items.length : SHELF_GAME_LIMIT)
      .map(item => providers ? providerCard(item) : gameCard(item, id)));
    const endCard = node('li', `${providers ? 'provider-card' : 'game-card'} shelf-view-all-card`);
    const viewAll = node('button', 'shelf-view-all');
    viewAll.type = 'button';
    Object.assign(viewAll.dataset, all.dataset);
    viewAll.setAttribute('aria-label', `View all ${items.length} ${providers ? 'game providers' : `${label} games`}`);
    viewAll.append(node('span', 'shelf-view-all__title', 'View All'),
      node('span', 'shelf-view-all__count', `${items.length} ${providers ? 'providers' : items.length === 1 ? 'game' : 'games'}`));
    endCard.append(viewAll);
    track.append(endCard);
    track.addEventListener('scroll', () => updateArrows(track), { passive: true });
    const releaseTarget = () => { scrollTargets.delete(track); updateArrows(track); };
    track.addEventListener('scrollend', releaseTarget);
    for (const event of ['pointerdown', 'wheel', 'keydown']) {
      track.addEventListener(event, releaseTarget, { passive: true });
    }
    tracks.add(track);
    section.append(head, track);
    return section;
  }
  function providerDetails(provider) {
    details.hidden = !provider;
    if (!provider) { detailsId = ''; return; }
    if (detailsId === provider.id) return;
    detailsId = provider.id;
    const info = getProviderDetails(provider.id);
    const content = node('div');
    content.id = 'provider-details-more';
    content.hidden = true;
    info.description.forEach(text => content.append(node('p', '', text)));
    const facts = node('dl', 'provider-facts');
    for (const [label, value] of [['Available games', String(info.gameCount)], ['Game types', info.formats.map(f => f.title).join(', ')]]) {
      const fact = node('div');
      fact.append(node('dt', '', label), node('dd', '', value));
      facts.append(fact);
    }
    content.append(facts);
    const toggle = node('button', 'text-control', 'Show more');
    toggle.id = 'provider-details-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', content.id);
    toggle.addEventListener('click', () => {
      content.hidden = !content.hidden;
      toggle.textContent = content.hidden ? 'Show more' : 'Show less';
      toggle.setAttribute('aria-expanded', String(!content.hidden));
    });
    details.replaceChildren(node('h2', '', `${info.name} games`), node('p', '', info.summary), content, toggle);
  }
  function render(route, meta = {}) {
    window.clearTimeout(inputTimer);
    filterMenus.forEach(menu => menu.close());
    if (route.type === 'game') {
      categories.dataset.activeMenu = '';
      return;
    }
    if (['store', 'feature', 'game-details'].includes(route.type)) {
      root.hidden = true;
      hero.hidden = true;
      document.body.dataset.page = route.type;
      categories.dataset.activeMenu = route.type === 'store' ? 'store'
        : route.type === 'game-details' ? '' : route.pageId;
      return;
    }
    const home = route.type === 'home';
    const { favorites: favoriteIds, history } = member?.getState() || {};
    const model = getCatalogPage(route, { favoriteIds, history });
    const overview = home;
    const filterModel = model;
    const directory = model.type === 'providers';
    if (collectionKeys.has(model.type)) collectionKeys.set(model.type, collectionKey(model.type));
    document.body.dataset.page = home ? 'home' : model.type;
    root.hidden = false;
    hero.hidden = !home;
    browser.hidden = model.type === 'not-found';
    browser.classList.toggle('catalog-browser--lobby', home);
    browser.classList.toggle('catalog-browser--results', !overview);
    toolbar.hidden = !home;
    header.hidden = home;
    controls.hidden = home;
    lobbySearchLink.hidden = !home;
    title.textContent = model.title;
    document.title = home ? 'COP COIN' : `${model.title} · COP COIN`;
    categories.dataset.activeMenu = home ? 'lobby' : model.activeMenu;
    categories.setAttribute('aria-label', 'Browse game categories');
    if (input.value !== (route.query || '')) input.value = route.query || '';
    input.placeholder = getCatalogSearchPlaceholder(model);
    input.setAttribute('aria-label', input.placeholder);
    searchClear.hidden = !input.value;
    filterPanel.hidden = filterToggle.hidden = home || directory;
    providerSelect.closest('.catalog-page-filter').hidden = directory || model.type === 'provider';
    gameTypeSelect.closest('.catalog-page-filter').hidden = directory;
    sortSelect.closest('.catalog-page-filter').hidden = directory;
    providerSelect.replaceChildren(option('', 'All providers'), ...(filterModel.providerFacets || []).map(provider => option(provider.id, provider.name)));
    providerSelect.disabled = !filterModel.providerFacets?.length;
    providerSelect.value = route.providerId || '';
    gameTypeSelect.replaceChildren(option('', 'All game types'), ...(filterModel.gameTypeFacets || []).map(type => option(type.id, type.title)));
    gameTypeSelect.disabled = !filterModel.gameTypeFacets?.length;
    gameTypeSelect.value = filterModel.gameTypeId || '';
    sortSelect.replaceChildren(...(filterModel.allowedSorts || []).map(id => option(id, sortLabels[id])));
    sortSelect.value = filterModel.sort || '';
    filterMenus.forEach(menu => menu.refresh());
    syncFilterPanel();
    updateFilterBadge(route, filterModel);
    providerDetails(model.type === 'provider' ? model.provider : null);
    renderedRoute = route;
    const key = viewKey(route);
    const contentKey = JSON.stringify([key, collectionKeys.get(model.type)]);
    if (contentKey === renderedKey) return;
    renderedKey = contentKey;
    tracks.clear();
    empty.className = 'catalog-empty';
    empty.replaceChildren();
    empty.hidden = true;
    more.hidden = true;
    pagination.hidden = overview || model.type === 'not-found';
    if (overview) {
      shelves.replaceChildren(
        ...LOBBY_COLLECTIONS.map(({ id, title }) => rail(id, title, getGamesForCategory(id))),
        rail('providers', 'Game Providers', PROVIDERS, true));
    } else if (model.type === 'not-found') {
      shelves.replaceChildren();
      empty.textContent = 'This page is unavailable. Return to the casino to browse games.';
      empty.hidden = false;
    } else {
      const providers = model.type === 'providers';
      const items = providers ? model.providers : model.games;
      const slice = pageSlice(items, limits.get(key) || PAGE_SIZE);
      const section = node('section', 'game-shelf catalog-result-shelf');
      section.setAttribute('aria-labelledby', 'catalog-page-title');
      const track = node('ul', `${providers ? 'provider-track' : 'game-track'} is-grid`);
      track.setAttribute('aria-label', providers ? 'Game providers' : model.title);
      track.dir = 'ltr';
      track.append(...slice.visible.map(item => providers ? providerCard(item) : gameCard(item, 'results')));
      section.append(track);
      shelves.replaceChildren(section);
      empty.hidden = items.length !== 0;
      if (!items.length) {
        const state = getCatalogEmptyState(model);
        empty.className = 'catalog-empty catalog-empty--favorites';
        const actions = node('div', 'catalog-empty__actions');
        for (const { action, label } of state.actions) {
          const button = node('button', 'text-control', label);
          button.type = 'button';
          button.dataset.catalogEmptyAction = action;
          actions.append(button);
        }
        empty.append(node('h2', '', state.title), node('p', '', state.description), actions);
      }
      pagination.hidden = !slice.hasMore;
      more.hidden = !slice.hasMore;
    }
    tracks.forEach(updateArrows);
    if (meta.focus !== false && !meta.pop && meta.source !== 'initial') {
      title.focus({ preventScroll: true });
    }
  }
  const openHome = () => router.navigate({ type: 'home' });
  const openCategory = id => router.navigate(GAME_FAMILIES.some(type => type.id === id)
    ? { type: 'category', gameTypeId: id } : { type: 'category', categoryId: id });
  const openRecentGames = () => router.navigate({ type: 'recent-games' });
  const openFavorites = () => router.navigate({ type: 'favorites' });
  const openProviders = () => router.navigate({ type: 'providers' });
  const openProvider = id => router.navigate({ type: 'provider', providerId: id });
  const openStore = () => router.navigate({ type: 'store' });
  const openSearch = () => {
    window.clearTimeout(inputTimer);
    input.value = '';
    searchClear.hidden = true;
    router.navigate({ type: 'search', query: '' });
    // Opening the catalog is navigation, not a request to start typing.
    // Also focus its heading when reopening the same route from the menu.
    title.focus({ preventScroll: true });
  };
  const searchGames = query => router.navigate({ type: 'search', query: String(query).trim() });
  lobbySearchLink.addEventListener('click', openSearch);
  categories.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    if (router.getRoute().type === 'home') openCategory(button.dataset.category);
  });
  shelves.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-open-providers]')) return openProviders();
    if (event.target.closest('[data-open-favorites]')) return openFavorites();
    const category = event.target.closest('[data-open-category]');
    if (category) return openCategory(category.dataset.openCategory);
    const provider = event.target.closest('[data-open-provider]');
    if (provider) return openProvider(provider.dataset.openProvider);
    const arrow = event.target.closest('[data-scroll]');
    if (arrow) {
      const track = arrow.closest('.game-shelf').querySelector('.game-track, .provider-track');
      const left = getShelfScrollTarget(track, arrow.dataset.scroll, scrollTargets.get(track) ?? track.scrollLeft);
      scrollTargets.set(track, left);
      updateArrows(track);
      track.scrollTo({ left,
        behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  });
  empty.addEventListener('click', event => {
    const action = event.target.closest('[data-catalog-empty-action]');
    if (!action) return;
    if (action.dataset.catalogEmptyAction === 'browse') openSearch();
    else if (action.dataset.catalogEmptyAction === 'search-all') searchGames(input.value);
    else resetFilters();
  });
  more.addEventListener('click', () => {
    const key = viewKey(renderedRoute);
    limits.set(key, (limits.get(key) || PAGE_SIZE) + PAGE_SIZE);
    renderedKey = '';
    render(renderedRoute, { focus: false });
    if (!more.hidden) more.focus({ preventScroll: true });
  });
  function updateFilters(changes, { replace = false } = {}) {
    const route = router.getRoute();
    if (!['category', 'provider', 'providers', 'search', 'favorites', 'recent-games'].includes(route.type)) return;
    window.clearTimeout(inputTimer);
    navigateFilters({ ...route, query: input.value, ...changes }, { replace, preserveScroll: true, focus: false });
  }
  function navigateFilters(next, options) {
    if (next.type === 'category' && !next.gameTypeId && !next.categoryId) next.type = 'search';
    // Removing a query or changing collection can retire its ordering choice.
    if (next.sort) {
      const { favorites: favoriteIds, history } = member?.getState() || {};
      if (!getCatalogPage(next, { favoriteIds, history }).allowedSorts?.includes(next.sort)) delete next.sort;
    }
    router.navigate(next, options);
  }
  function resetFilters() {
    window.clearTimeout(inputTimer);
    input.value = '';
    searchClear.hidden = true;
    const route = router.getRoute();
    router.navigate(resetCatalogFilters(route), { preserveScroll: true, focus: false });
    input.focus({ preventScroll: true });
  }
  function queueSearch() {
    window.clearTimeout(inputTimer);
    searchClear.hidden = !input.value;
    if (!composing) inputTimer = window.setTimeout(() => updateFilters({ query: input.value }, { replace: true }), 180);
  }
  input.addEventListener('input', queueSearch);
  input.addEventListener('blur', () => {
    // Commit before a filter opens so a pending search cannot close its menu.
    if (!composing && input.value !== (router.getRoute().query || '')) {
      updateFilters({ query: input.value }, { replace: true });
    }
  });
  input.addEventListener('compositionstart', () => { composing = true; window.clearTimeout(inputTimer); });
  input.addEventListener('compositionend', () => { composing = false; queueSearch(); });
  searchClear.addEventListener('click', () => {
    input.value = '';
    searchClear.hidden = true;
    updateFilters({ query: '' });
    input.focus({ preventScroll: true });
  });
  document.querySelector('#catalog-page-search-form').addEventListener('submit', event => {
    event.preventDefault();
    window.clearTimeout(inputTimer);
    updateFilters({ query: input.value });
  });
  providerSelect.addEventListener('change', () => updateFilters({ providerId: providerSelect.value }));
  gameTypeSelect.addEventListener('change', () => {
    window.clearTimeout(inputTimer);
    const { favorites: favoriteIds, history } = member?.getState() || {};
    const next = changeCatalogGameType({ ...router.getRoute(), query: input.value }, gameTypeSelect.value, { favoriteIds, history });
    navigateFilters(next, { preserveScroll: true, focus: false });
  });
  sortSelect.addEventListener('change', () => updateFilters({ sort: sortSelect.value }));
  filterToggle.addEventListener('click', () => { filtersOpen = !filtersOpen; syncFilterPanel(); });
  new ResizeObserver(syncFilterPanel).observe(browser);
  filterPanel.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !compactFilters || !filtersOpen || event.defaultPrevented) return;
    event.preventDefault();
    filtersOpen = false;
    syncFilterPanel();
    filterToggle.focus({ preventScroll: true });
  });
  new ResizeObserver(() => tracks.forEach(track => {
    scrollTargets.delete(track);
    updateArrows(track);
  })).observe(shelves);
  member?.subscribe(() => {
    const route = router.getRoute();
    if (!collectionKeys.has(route.type)) return;
    const key = collectionKey(route.type);
    if (key === collectionKeys.get(route.type)) return;
    collectionKeys.set(route.type, key);
    renderedKey = '';
    render(route, { focus: false });
  });
  router.subscribe(render);
  render(router.getRoute(), { source: 'initial', focus: false });
  controller = { openHome, openRecentGames, openCategory, openFavorites, openProviders, openProvider, openStore, openSearch, searchGames };
  return controller;
}
