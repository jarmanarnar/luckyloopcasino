import { PROVIDERS } from './catalog.js';
import { CATEGORIES, getGamesForCategory } from './collections.js';
import { createShelfIcon } from './shelf-icons.js';
import { PROVIDER_LOGOS } from './provider-assets.js';

let initialized = false;
const batchSize = 48;
const shelfSize = 12;
const categoryById = new Map(CATEGORIES.map(category => [category.id, category]));
const alphabetic = (a, b) => a.title.localeCompare(b.title);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function textArtwork(game) {
  const art = element('span', 'game-launch__art');
  art.append(element('span', '', game.title));
  return art;
}

function shelfTitleButton(title, iconId, categoryId) {
  const button = element('button', 'game-shelf__title-link');
  button.type = 'button';
  button.setAttribute('aria-controls', 'catalog-shelves');
  if (categoryId) button.dataset.openCategory = categoryId;
  else button.dataset.openProviders = '';
  button.append(createShelfIcon(iconId), element('span', 'game-shelf__label', title));
  return button;
}

function cardFor(game, shelfId) {
  const card = element('li', 'game-card');
  const button = element('button', 'game-launch');
  button.id = `game-${shelfId}-${game.id}`;
  button.type = 'button';
  button.dataset.game = game.id;
  button.dataset.provider = game.providerId;
  button.setAttribute('aria-label', `Play ${game.title} demo by ${game.providerName}`);
  button.title = `${game.title} · ${game.providerName}`;

  button.append(textArtwork(game));

  const badge = element('span', 'game-provider-badge');
  badge.textContent = game.providerName;
  button.append(badge);
  card.append(button);
  return card;
}

function arrowButton(direction, title, trackId, noun = 'games') {
  const button = element('button', 'icon-button game-shelf__arrow');
  button.type = 'button';
  button.dataset.scroll = direction;
  button.setAttribute('aria-label', `${direction === 'previous' ? 'Previous' : 'Next'} ${title}${noun ? ` ${noun}` : ''}`);
  button.setAttribute('aria-controls', trackId);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', direction === 'previous' ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6');
  svg.append(path);
  button.append(svg);
  return button;
}

export function initCatalogView() {
  if (initialized) return;
  const shelves = document.querySelector('#catalog-shelves');
  const categories = document.querySelector('#catalog-categories');
  const more = document.querySelector('#catalog-more');
  const empty = document.querySelector('#catalog-empty');
  if (![shelves, categories, more, empty].every(Boolean)) return;
  initialized = true;

  let selectedCategory = 'all';
  let selectedProvider = '';
  let showProviders = false;
  let grid = false;
  let limit = batchSize;
  const tracks = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const menuItems = [CATEGORIES[0], { id: 'providers', title: 'Providers' }, ...CATEGORIES.slice(1)];
  for (const category of menuItems) {
    const button = element('button', 'catalog-category');
    button.append(createShelfIcon(category.id), element('span', '', category.title));
    button.type = 'button';
    button.dataset.category = category.id;
    button.setAttribute('aria-pressed', String(category.id === selectedCategory));
    button.setAttribute('aria-controls', 'catalog-shelves');
    categories.append(button);
  }

  function updateArrows(track) {
    const section = track.closest('.game-shelf');
    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    const previous = section.querySelector('[data-scroll="previous"]');
    const next = section.querySelector('[data-scroll="next"]');
    if (previous) previous.disabled = track.scrollLeft <= 1;
    if (next) next.disabled = track.scrollLeft >= maximum - 1;
  }

  function providerShelf({ isGrid = false } = {}) {
    const section = element('section', 'game-shelf provider-shelf');
    section.dataset.shelf = 'providers';
    section.setAttribute('aria-labelledby', 'shelf-title-providers');
    const header = element('div', 'game-shelf__header');
    const heading = element('h2', 'game-shelf__title');
    heading.id = 'shelf-title-providers';
    if (isGrid) {
      heading.append(createShelfIcon('providers'), element('span', 'game-shelf__label', 'Game Providers'));
    } else {
      heading.append(shelfTitleButton('Game Providers', 'providers'));
    }
    header.append(heading);
    if (!isGrid) {
      const actions = element('div', 'game-shelf__actions');
      const all = element('button', 'shelf-see-all', 'All');
      all.type = 'button';
      all.dataset.openProviders = '';
      all.setAttribute('aria-label', 'See all game providers');
      const navigation = element('div', 'game-shelf__navigation');
      navigation.append(arrowButton('previous', 'game providers', 'provider-track', ''),
        arrowButton('next', 'game providers', 'provider-track', ''));
      actions.append(all, navigation);
      header.append(actions);
    }
    section.append(header);
    const track = element('ul', `provider-track${isGrid ? ' is-grid' : ''}`);
    track.id = 'provider-track';
    track.setAttribute('aria-label', 'Game providers');
    track.tabIndex = 0;
    track.dir = 'ltr';
    for (const studio of PROVIDERS) {
      const card = element('li', 'provider-card');
      const button = element('button', 'provider-launch');
      button.type = 'button';
      button.dataset.openProvider = studio.id;
      button.setAttribute('aria-label', `View ${studio.name} games`);
      button.title = studio.name;
      const logo = element('img', 'provider-logo');
      logo.src = PROVIDER_LOGOS[studio.id].src;
      logo.alt = studio.name;
      logo.width = 140;
      logo.height = 48;
      logo.loading = 'lazy';
      logo.decoding = 'async';
      button.append(logo);
      card.append(button);
      track.append(card);
    }
    if (!isGrid) {
      tracks.add(track);
      track.addEventListener('scroll', () => updateArrows(track), { passive: true });
    }
    section.append(track);
    return section;
  }

  function shelf({ id, title, games, categoryId, iconId = categoryId || 'providers', isGrid = false }) {
    const section = element('section', 'game-shelf');
    section.dataset.shelf = id;
    const headingId = `shelf-title-${id}`;
    const trackId = `game-track-${id}`;
    section.setAttribute('aria-labelledby', headingId);
    const header = element('div', 'game-shelf__header');
    const heading = element('div', 'game-shelf__heading');
    const titleNode = element('h2', 'game-shelf__title');
    titleNode.id = headingId;
    if (isGrid) {
      titleNode.append(createShelfIcon(iconId), element('span', 'game-shelf__label', title));
    } else {
      titleNode.append(shelfTitleButton(title, iconId, categoryId));
    }
    heading.append(titleNode);
    header.append(heading);
    if (!isGrid) {
      const actions = element('div', 'game-shelf__actions');
      const seeAll = element('button', 'shelf-see-all', 'All');
      seeAll.type = 'button';
      seeAll.setAttribute('aria-label', `See all ${title} games`);
      if (categoryId) seeAll.dataset.openCategory = categoryId;
      actions.append(seeAll);
      const navigation = element('div', 'game-shelf__navigation');
      navigation.append(arrowButton('previous', title, trackId), arrowButton('next', title, trackId));
      actions.append(navigation);
      header.append(actions);
    }
    section.append(header);
    const track = element('ul', `game-track${isGrid ? ' is-grid' : ''}`);
    track.id = trackId;
    track.setAttribute('aria-label', `${title} games`);
    track.tabIndex = 0;
    track.dir = 'ltr';
    const visibleGames = isGrid ? games.slice(0, limit)
      : categoryId === 'picks' ? games : games.slice(0, shelfSize);
    visibleGames.forEach(game => track.append(cardFor(game, id)));
    if (!isGrid) {
      tracks.add(track);
      track.addEventListener('scroll', () => updateArrows(track), { passive: true });
    }
    section.append(track);
    return section;
  }

  function render({ focusResults = false } = {}) {
    tracks.clear();
    const categoryGames = getGamesForCategory(selectedCategory);
    const filtered = categoryGames.filter(game => !selectedProvider || game.providerId === selectedProvider);
    const home = !grid && !showProviders && selectedCategory === 'all' && !selectedProvider;
    const fragment = document.createDocumentFragment();
    empty.hidden = showProviders || filtered.length !== 0;
    more.hidden = true;
    const studio = PROVIDERS.find(item => item.id === selectedProvider);
    if (showProviders) {
      fragment.append(providerShelf({ isGrid: true }));
    } else if (home) {
      fragment.append(providerShelf());
      for (const id of ['picks', 'slots', 'tap', 'table', 'video-poker', 'spooky', 'megaways', 'jackpot', 'fruit', 'adventure']) {
        const category = categoryById.get(id);
        const games = getGamesForCategory(id);
        if (games.length) fragment.append(shelf({ id: `category-${id}`, title: category.title,
          games, categoryId: id }));
      }
    } else {
      const category = categoryById.get(selectedCategory);
      const title = [selectedCategory !== 'all' ? category.title : '', studio?.name]
        .filter(Boolean).join(' · ') || 'All Games';
      const ordered = selectedCategory === 'picks' ? filtered : [...filtered].sort(alphabetic);
      fragment.append(shelf({ id: 'results', title, games: ordered,
        iconId: selectedCategory !== 'all' ? selectedCategory : 'providers', isGrid: true }));
      more.hidden = limit >= filtered.length;
      more.textContent = `Show ${Math.min(batchSize, Math.max(0, filtered.length - limit))} more`;
    }
    shelves.replaceChildren(fragment);
    const activeMenu = showProviders || (selectedProvider && selectedCategory === 'all')
      ? 'providers' : selectedCategory;
    for (const button of categories.querySelectorAll('[data-category]')) {
      button.setAttribute('aria-pressed', String(button.dataset.category === activeMenu));
    }
    for (const track of tracks) updateArrows(track);
    if (focusResults) {
      shelves.scrollIntoView({ block: 'start', behavior: 'instant' });
      const results = shelves.querySelector('.game-shelf');
      results.tabIndex = -1;
      results.focus({ preventScroll: true });
    }
  }

  function openProviders({ focusResults = false } = {}) {
    selectedCategory = 'all';
    selectedProvider = '';
    showProviders = true;
    grid = false;
    limit = batchSize;
    render({ focusResults });
  }

  function resetCatalog() {
    if (selectedCategory === 'all' && !selectedProvider && !grid && !showProviders) return;
    selectedCategory = 'all';
    selectedProvider = '';
    showProviders = false;
    grid = false;
    limit = batchSize;
    render();
  }

  categories.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    if (button.dataset.category === 'all') return resetCatalog();
    if (button.dataset.category === 'providers') return openProviders();
    selectedCategory = button.dataset.category;
    showProviders = false;
    grid = true;
    limit = batchSize;
    render();
  });
  shelves.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-open-providers]')) {
      openProviders({ focusResults: true });
      return;
    }
    const category = event.target.closest('[data-open-category]');
    const studio = event.target.closest('[data-open-provider]');
    if (category || studio) {
      selectedCategory = category?.dataset.openCategory || 'all';
      selectedProvider = studio?.dataset.openProvider || '';
      showProviders = false;
      grid = true;
      limit = batchSize;
      render({ focusResults: true });
      return;
    }
    const arrow = event.target.closest('[data-scroll]');
    if (arrow) {
      const track = arrow.closest('.game-shelf').querySelector('.game-track, .provider-track');
      const cardWidth = track.firstElementChild?.getBoundingClientRect().width || 0;
      track.scrollBy({ left: (arrow.dataset.scroll === 'next' ? 1 : -1)
        * Math.max(1, track.clientWidth - cardWidth), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  });
  more.addEventListener('click', () => { limit += batchSize; render(); });
  window.addEventListener('resize', () => tracks.forEach(updateArrows), { passive: true });
  render();
}
