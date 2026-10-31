import { PROVIDERS } from './catalog.js';
import { CATEGORIES, getGamesForCategory } from './collections.js';
import { createShelfIcon } from './shelf-icons.js';
import { PROVIDER_LOGOS } from './provider-assets.js';
import { getProviderDetails } from './provider-details.js';
import { PAGE_SIZE, LOBBY_CATEGORIES, getCatalogPage, getFavoriteGames, pageSlice } from './catalog-page-model.js';

let controller;
const sortLabels = { featured: 'Featured', az: 'Name: A–Z', za: 'Name: Z–A', newest: 'Newest first', saved: 'Recently saved' };
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
  const art = node('span', 'game-launch__art');
  art.append(node('span', '', game.title));
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
  const providerSelect = document.querySelector('#catalog-page-provider');
  const categorySelect = document.querySelector('#catalog-page-category');
  const sortSelect = document.querySelector('#catalog-page-sort');
  const pagination = document.querySelector('#catalog-pagination');
  const count = document.querySelector('#catalog-page-count');
  const details = document.querySelector('#catalog-provider-details');
  const hero = document.querySelector('#hero-carousel');
  const toolbar = document.querySelector('.catalog-toolbar');
  if (!router || ![root, shelves, categories, more, empty, header, title, controls, input,
    providerSelect, categorySelect, sortSelect, pagination, count, details].every(Boolean)) return;
  const limits = new Map(), tracks = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let renderedKey = '', renderedRoute, inputTimer = 0, detailsId = '';
  let favoriteKey = JSON.stringify(member?.getState().favorites || []);
  const option = (value, text) => Object.assign(node('option', '', text), { value });
  providerSelect.replaceChildren(option('', 'All providers'), ...PROVIDERS.map(p => option(p.id, p.name)));
  categorySelect.replaceChildren(option('all', 'All Games'), ...CATEGORIES.map(c => option(c.id, c.title)));
  for (const category of CATEGORIES) {
    const button = node('button', 'catalog-category');
    button.type = 'button';
    button.dataset.category = category.id;
    button.setAttribute('aria-pressed', 'false');
    button.append(createShelfIcon(category.id), node('span', '', category.title));
    categories.append(button);
  }
  function updateArrows(track) {
    const section = track.closest('.game-shelf');
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    section.querySelector('[data-scroll="previous"]').disabled = track.scrollLeft <= 1;
    section.querySelector('[data-scroll="next"]').disabled = track.scrollLeft >= max - 1;
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
    track.append(...items.slice(0, providers ? items.length : 12).map(item => providers ? providerCard(item) : gameCard(item, id)));
    track.addEventListener('scroll', () => updateArrows(track), { passive: true });
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
    if (route.type === 'game') return;
    if (['store', 'feature', 'game-details'].includes(route.type)) {
      root.hidden = true;
      hero.hidden = true;
      document.body.dataset.page = route.type;
      categories.dataset.activeMenu = route.type === 'store' ? 'store'
        : route.type === 'game-details' ? '' : route.pageId;
      for (const button of categories.querySelectorAll('[data-category]')) button.setAttribute('aria-pressed', 'false');
      return;
    }
    const favoriteIds = member?.getState().favorites || [];
    const model = getCatalogPage(route, { favoriteIds });
    const home = model.type === 'home', favorites = model.type === 'favorites';
    document.body.dataset.page = model.type;
    root.hidden = false;
    hero.hidden = toolbar.hidden = !home;
    header.hidden = home;
    controls.hidden = home || model.type === 'not-found';
    title.textContent = model.title;
    document.title = home ? 'LuckyLoop Casino' : `${model.title} · LuckyLoop Casino`;
    categories.dataset.activeMenu = model.activeMenu;
    for (const button of categories.querySelectorAll('[data-category]')) {
      button.setAttribute('aria-pressed', String(button.dataset.category === model.activeMenu));
    }
    if (input.value !== (route.query || '')) input.value = route.query || '';
    input.placeholder = model.type === 'providers' ? 'Search providers' : 'Search games';
    input.setAttribute('aria-label', input.placeholder);
    providerSelect.closest('.catalog-page-filter').hidden = !['category', 'search', 'favorites'].includes(model.type);
    categorySelect.closest('.catalog-page-filter').hidden = model.type !== 'search';
    sortSelect.closest('.catalog-page-filter').hidden = model.type === 'providers';
    providerSelect.value = route.providerId || '';
    categorySelect.value = route.categoryId || 'all';
    sortSelect.replaceChildren(...(model.allowedSorts || []).map(id => option(id, sortLabels[id])));
    sortSelect.value = model.sort || '';
    providerDetails(model.type === 'provider' ? model.provider : null);
    renderedRoute = route;
    const key = JSON.stringify(route);
    if (key === renderedKey) return;
    renderedKey = key;
    tracks.clear();
    empty.className = 'catalog-empty';
    empty.replaceChildren();
    empty.hidden = true;
    more.hidden = true;
    pagination.hidden = home || model.type === 'not-found';
    if (home) {
      const favorites = getFavoriteGames(favoriteIds);
      shelves.replaceChildren(...(favorites.length ? [rail('favorites', 'Favorites', favorites)] : []),
        ...LOBBY_CATEGORIES.map(id => rail(id, CATEGORIES.find(c => c.id === id).title, getGamesForCategory(id))),
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
      track.setAttribute('aria-label', providers ? 'Game providers' : `${model.title} games`);
      track.dir = 'ltr';
      track.append(...slice.visible.map(item => providers ? providerCard(item) : gameCard(item, 'results')));
      section.append(track);
      shelves.replaceChildren(section);
      empty.hidden = items.length !== 0;
      if (favorites && !items.length) {
        const noSavedGames = model.savedCount === 0;
        empty.className = 'catalog-empty catalog-empty--favorites';
        const browse = node('button', 'text-control', noSavedGames ? 'Explore games' : 'Clear filters');
        browse.type = 'button';
        browse.dataset.favoritesEmptyAction = noSavedGames ? 'browse' : 'clear';
        empty.append(node('h2', '', noSavedGames ? 'Your favorites start here' : 'No matching favorites'),
          node('p', '', noSavedGames ? 'Save games with the heart to keep them all in one place.' : 'Try a different search or provider.'), browse);
      } else empty.textContent = providers ? 'No providers found. Try another name.' : 'No games found. Try another search or filter.';
      const noun = providers ? 'providers' : slice.total === 1 ? 'game' : 'games';
      count.textContent = slice.hasMore ? `Showing ${slice.visible.length} of ${slice.total} ${noun}` : `${slice.total} ${noun}`;
      pagination.hidden = items.length === 0;
      more.hidden = !slice.hasMore;
    }
    tracks.forEach(updateArrows);
    if (meta.focus !== false && !meta.pop && meta.source !== 'initial') {
      (route.type === 'search' ? input : title).focus({ preventScroll: true });
    }
  }
  const openHome = () => router.navigate({ type: 'home' });
  const openCategory = id => router.navigate({ type: 'category', categoryId: id });
  const openFavorites = () => router.navigate({ type: 'favorites' });
  const openProviders = () => router.navigate({ type: 'providers' });
  const openProvider = id => router.navigate({ type: 'provider', providerId: id });
  const openStore = () => router.navigate({ type: 'store' });
  const openSearch = () => { router.navigate({ type: 'search', query: '' }); input.focus({ preventScroll: true }); };
  const searchGames = query => router.navigate({ type: 'search', query: String(query).trim() });
  categories.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (button) openCategory(button.dataset.category);
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
      const cardWidth = track.firstElementChild?.getBoundingClientRect().width || 0;
      track.scrollBy({ left: (arrow.dataset.scroll === 'next' ? 1 : -1) * Math.max(1, track.clientWidth - cardWidth),
        behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  });
  document.querySelector('#catalog-page-back').addEventListener('click', openHome);
  empty.addEventListener('click', event => {
    const action = event.target.closest('[data-favorites-empty-action]');
    if (!action) return;
    if (action.dataset.favoritesEmptyAction === 'browse') openSearch();
    else router.navigate({ type: 'favorites' }, { replace: true });
  });
  more.addEventListener('click', () => {
    const key = JSON.stringify(renderedRoute);
    limits.set(key, (limits.get(key) || PAGE_SIZE) + PAGE_SIZE);
    renderedKey = '';
    render(renderedRoute, { focus: false });
    if (!more.hidden) more.focus({ preventScroll: true });
  });
  function updateFilters(changes) {
    const route = router.getRoute();
    if (!['category', 'provider', 'providers', 'search', 'favorites'].includes(route.type)) return;
    router.navigate({ ...route, ...changes }, { replace: true, preserveScroll: true, focus: false });
  }
  input.addEventListener('input', () => {
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => updateFilters({ query: input.value }), 120);
  });
  document.querySelector('#catalog-page-search-form').addEventListener('submit', event => {
    event.preventDefault();
    window.clearTimeout(inputTimer);
    updateFilters({ query: input.value });
  });
  providerSelect.addEventListener('change', () => updateFilters({ providerId: providerSelect.value }));
  categorySelect.addEventListener('change', () => updateFilters({ categoryId: categorySelect.value }));
  sortSelect.addEventListener('change', () => updateFilters({ sort: sortSelect.value }));
  new ResizeObserver(() => tracks.forEach(updateArrows)).observe(shelves);
  member?.subscribe(() => {
    const key = JSON.stringify(member.getState().favorites);
    if (key === favoriteKey) return;
    favoriteKey = key;
    renderedKey = '';
    if (!['home', 'favorites'].includes(router.getRoute().type)) return;
    render(router.getRoute(), { focus: false });
  });
  router.subscribe(render);
  render(router.getRoute(), { source: 'initial', focus: false });
  controller = { openHome, openCategory, openFavorites, openProviders, openProvider, openStore, openSearch, searchGames };
  return controller;
}
