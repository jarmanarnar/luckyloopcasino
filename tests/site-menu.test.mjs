import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { GAME_FAMILIES, getGamesForCategory } from '../public/collections.js';
import { createMemberState } from '../public/member-state.js';
import { getFavoriteGames } from '../public/catalog-page-model.js';

const source = (await readFile(new URL('../public/site-menu.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initSiteMenu', 'function initSiteMenu');

function menuPage({ desktop = false, routeFromGame = false, storage = new Map(), favorites = [],
  reduced = false, siteReduced = false, sidebarDuration = '240ms', guest = false, animations = false, hidden = false, hover = true } = {}) {
  const calls = [], closeEvents = [], observers = [], windowEvents = {}, providerCalls = [], lobbyActions = [], helpCalls = [];
  const menuAnimations = [];
  const timers = new Map();
  let timerId = 0;
  const document = { body: { dataset: { view: 'lobby' } }, activeElement: null, hidden };
  let memberState = createMemberState({ favorites });
  const memberListeners = [];
  class Node {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.tabIndex = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'A'].includes(this.tagName) ? 0 : -1;
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.textContent = '';
      this.visible = true;
      this.open = false;
      this.hidden = false;
      this.inert = false;
      this.style = {};
      this.focusVisible = false;
    }
    get parentElement() { return this.parent || null; }
    get nextSibling() {
      return this.parent?.children[this.parent.children.indexOf(this) + 1] || null;
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    appendChild(child) {
      child.parent?.removeChild(child);
      child.parent = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parent = null;
      return child;
    }
    insertBefore(child, before) {
      if (child === before) return child;
      if (!before) return this.appendChild(child);
      child.parent?.removeChild(child);
      const index = this.children.indexOf(before);
      assert.ok(index >= 0, 'insertBefore reference belongs to this parent');
      child.parent = this;
      this.children.splice(index, 0, child);
      return child;
    }
    replaceChildren(...children) {
      for (const child of [...this.children]) this.removeChild(child);
      this.append(...children);
    }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, details = {}) {
      const event = {
        type, target: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...details,
      };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
    click() {
      const event = this.emit('click');
      for (let parent = this.parent; parent; parent = parent.parent) parent.emit('click', event);
    }
    closest(selector) {
      const property = {
        '[data-menu-category]': 'menuCategory',
        '[data-menu-feature]': 'menuFeature',
        '[data-menu-disclosure]': 'menuDisclosure',
        '[data-tooltip]': 'tooltip',
      }[selector];
      if (!property) throw new Error(`Unexpected selector ${selector}`);
      return this.dataset[property] ? this : this.parent?.closest(selector) || null;
    }
    contains(node) { for (let next = node; next; next = next.parent) if (next === this) return true; return false; }
    matches(selector) { assert.equal(selector, ':focus-visible'); return this.focusVisible; }
    querySelectorAll(selector) {
      assert.equal(selector, 'button, a[href], input, select, textarea, summary, [tabindex]');
      const descendants = this.children.flatMap(child => [child, ...child.descendants()]);
      return descendants.filter(child => ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(child.tagName)
        || (child.tagName === 'A' && (child.href || child.getAttribute('href')))
        || child.attributes.has('tabindex'));
    }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    focus() { if (this.getClientRects().length && !this.disabled && !this.hasInertAncestor()) document.activeElement = this; }
    hasInertAncestor() { for (let next = this; next; next = next.parent) if (next.inert) return true; return false; }
    getClientRects() {
      for (let next = this; next; next = next.parent) {
        if (!next.visible || next.hidden || (next.tagName === 'DIALOG' && !next.open)) return [];
      }
      return [{}];
    }
    getBoundingClientRect() { return this.bounds || { left: 0, right: 320, top: 0, bottom: 700, width: 320, height: 700 }; }
    show() { this.open = true; calls.push('menu:open'); }
    showModal() { throw new Error('Mobile Menu must not create a modal above the persistent bottom navigation'); }
    close() { this.open = false; calls.push('menu:close'); closeEvents.push(() => this.emit('close')); }
  }
  if (animations) Node.prototype.animate = function (keyframes, options) {
    let resolve, reject, settled = false;
    const listeners = new Map();
    const animation = {
      target: this, keyframes, options, playState: 'running', cancelled: false,
      finished: new Promise((done, failed) => { resolve = done; reject = failed; }),
      addEventListener(type, callback) { const list = listeners.get(type) || []; list.push(callback); listeners.set(type, list); },
      finish() {
        if (settled) return;
        settled = true;
        this.playState = 'finished';
        resolve(this);
        this.onfinish?.();
        for (const callback of listeners.get('finish') || []) callback();
      },
      cancel() {
        this.cancelled = true;
        this.playState = 'idle';
        if (settled) return;
        settled = true;
        reject(new Error('Animation cancelled'));
        this.oncancel?.();
        for (const callback of listeners.get('cancel') || []) callback();
      },
    };
    menuAnimations.push(animation);
    return animation;
  };
  document.body = new Node();
  document.body.dataset.view = 'lobby';
  document.body.dataset.auth = guest ? 'guest' : 'member';
  if (siteReduced) document.body.dataset.reduceMotion = 'true';
  const ids = ['menu-toggle', 'site-menu', 'menu-navigation', 'menu-buy', 'menu-redeem',
    'catalog-categories', 'coin-wallet', 'site-logo', 'other-dialog',
    'site-sidebar', 'sidebar-header', 'sidebar-content', 'menu-content', 'menu-shortcuts',
    'menu-mobile-header', 'menu-search', 'menu-tooltip', 'site-search', 'site-search-input',
    'bottom-menu', 'mobile-nav', 'mobile-nav-menu', 'mobile-nav-lobby', 'mobile-nav-store', 'mobile-nav-redeem',
    'lobby-view', 'game-view', 'store-view', 'feature-view', 'game-details-view'];
  const nodes = Object.fromEntries(ids.map(id => {
    const tagName = id === 'site-menu' || id === 'other-dialog' || id === 'site-search' ? 'dialog'
      : id === 'menu-toggle' || id === 'menu-buy' || id === 'menu-redeem' || id === 'menu-search'
        || id === 'bottom-menu' || id.startsWith('mobile-nav-') ? 'button'
        : id === 'site-logo' ? 'a' : id === 'site-search-input' ? 'input' : 'div';
    const node = new Node(tagName);
    node.id = id;
    return [id, node];
  }));
  nodes['menu-tooltip'].hidden = true;
  nodes['mobile-nav-menu'].visible = false;
  nodes['menu-tooltip'].bounds = { left: 0, right: 120, top: 0, bottom: 32, width: 120, height: 32 };
  const headerParent = new Node();
  headerParent.append(nodes['menu-toggle'], nodes['site-logo']);
  const headerShell = guest ? new Node() : headerParent;
  const headerActions = guest ? new Node() : null;
  if (guest) {
    headerActions.append(new Node('button'), new Node('button'));
    headerShell.append(headerParent, headerActions);
    nodes['menu-shortcuts'].visible = false;
    nodes['mobile-nav'].visible = false;
  }
  nodes['site-menu'].append(nodes['menu-mobile-header'], nodes['menu-content']);
  nodes['menu-mobile-header'].append(nodes['menu-shortcuts']);
  nodes['menu-shortcuts'].append(nodes['menu-buy'], nodes['menu-redeem']);
  nodes['menu-content'].append(nodes['menu-search'], nodes['menu-navigation']);
  nodes['site-sidebar'].append(nodes['sidebar-header'], nodes['sidebar-content']);
  nodes['mobile-nav'].append(...['lobby', 'store', 'redeem', 'menu'].map(action => nodes[`mobile-nav-${action}`]));
  document.body.append(headerShell, nodes['site-sidebar'], nodes['lobby-view'], nodes['game-view'], nodes['store-view'],
    nodes['feature-view'], nodes['game-details-view'], nodes['mobile-nav'], nodes['site-menu']);
  const documentEvents = new Node();
  document.addEventListener = documentEvents.addEventListener.bind(documentEvents);
  const breakpoint = new Node();
  breakpoint.matches = desktop;
  const motion = new Node();
  motion.matches = reduced;
  const hoverPointer = new Node();
  hoverPointer.matches = hover;
  nodes['coin-wallet'].dataset.currency = 'GC';
  nodes['catalog-categories'].dataset.activeMenu = 'lobby';
  const categoryButtons = new Map(GAME_FAMILIES.map(category => category.id).map(id => {
    const button = new Node();
    button.dataset.category = id;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      calls.push(`category:${id}`);
      nodes['catalog-categories'].dataset.activeMenu = id;
      for (const [candidate, node] of categoryButtons) node.setAttribute('aria-pressed', String(candidate === id));
    });
    return [id, button];
  }));
  nodes['catalog-categories'].querySelector = selector => {
    if (selector === '[data-category][aria-pressed="true"]') {
      return [...categoryButtons.values()].find(node => node.getAttribute('aria-pressed') === 'true') || null;
    }
    return categoryButtons.get(selector.match(/^\[data-category="([^"]+)"\]$/)?.[1]) || null;
  };
  document.querySelector = selector => {
    if (selector === 'dialog[open]') return ['site-menu', 'other-dialog', 'site-search'].map(id => nodes[id]).find(node => node.open) || null;
    return nodes[selector.slice(1)] || null;
  };
  document.createElement = tag => new Node(tag);
  const pageHeading = new Node();
  function routeCategory(id) {
    assert.equal(nodes['site-menu'].open, false);
    calls.push(`category:${id}`);
    nodes['catalog-categories'].dataset.activeMenu = id;
    document.body.dataset.view = 'lobby';
    document.body.dataset.page = 'category';
    for (const [candidate, node] of categoryButtons) node.setAttribute('aria-pressed', String(candidate === id));
    pageHeading.focus();
  }
  const catalog = {
    member: {
      getState: () => memberState,
      subscribe(listener) { memberListeners.push(listener); },
    },
    openHowToPlay(options) {
      assert.equal(nodes['site-menu'].open, false);
      assert.equal(nodes['lobby-view'].inert, false, 'restore the page before opening another dialog');
      calls.push('help:open');
      helpCalls.push(options);
    },
    openHome() {
      assert.equal(nodes['site-menu'].open, false);
      calls.push('home:open');
      nodes['catalog-categories'].dataset.activeMenu = 'lobby';
      document.body.dataset.view = 'lobby'; document.body.dataset.page = 'home';
      pageHeading.focus();
    },
    openRecentGames() { routeCategory('recent-games'); },
    openCategory(id) { routeCategory(id); },
    openFavorites() { routeCategory('favorites'); },
    openStore() {
      assert.equal(nodes['site-menu'].open, false);
      calls.push('store:open');
      document.body.dataset.view = 'lobby';
      document.body.dataset.page = 'store';
      nodes['catalog-categories'].dataset.activeMenu = 'store';
      pageHeading.focus();
    },
    openFeature(id) {
      assert.equal(nodes['site-menu'].open, false);
      calls.push(`feature:${id}`);
      document.body.dataset.view = 'lobby';
      document.body.dataset.page = id;
      nodes['catalog-categories'].dataset.activeMenu = id;
      pageHeading.focus();
    },
    openSearch() {
      assert.equal(nodes['site-menu'].open, false);
      nodes['catalog-categories'].dataset.activeMenu = 'search';
      document.body.dataset.view = 'lobby';
      document.body.dataset.page = 'search';
      calls.push('search:open');
      nodes['site-search-input'].focus();
    },
    openProviders(options) {
      assert.equal(nodes['site-menu'].open, false);
      providerCalls.push(options);
      calls.push('category:providers');
      document.body.dataset.view = 'lobby';
      document.body.dataset.page = 'providers';
      pageHeading.focus();
      nodes['catalog-categories'].dataset.activeMenu = 'providers';
      for (const button of categoryButtons.values()) button.setAttribute('aria-pressed', 'false');
    },
  };
  if (routeFromGame) catalog.returnToLobby = action => {
    calls.push('lobby:return');
    lobbyActions.push(() => { document.body.dataset.view = 'lobby'; action?.(); });
  };
  const context = {
    document, Element: Node, GAME_FAMILIES, getGamesForCategory, getFavoriteGames, catalog,
    getComputedStyle: element => ({
      transform: element.computedTransform || 'matrix(1, 0, 0, 1, 0, 0)',
      getPropertyValue: property => property === '--sidebar-duration' ? sidebarDuration : '',
    }),
    setTimeout(action, delay) { timers.set(++timerId, { action, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    createShelfIcon: () => new Node(),
    window: {
      innerWidth: 1280, innerHeight: 900,
      addEventListener(type, callback) { windowEvents[type] = callback; },
      matchMedia(query) {
        if (query === '(width > 1024px)') return breakpoint;
        if (query === '(hover: hover) and (pointer: fine)') return hoverPointer;
        assert.equal(query, '(prefers-reduced-motion: reduce)');
        return motion;
      },
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(node) { this.targets.push(node); }
      disconnect() { this.targets = []; }
    },
  };
  const api = vm.runInNewContext(`${source}\ninitSiteMenu(catalog);`, context);
  const flushClose = () => { while (closeEvents.length) closeEvents.shift()(); };
  const item = id => nodes['menu-content'].descendants().find(node => node.dataset.menuCategory === id);
  const feature = id => nodes['menu-content'].descendants().find(node => node.dataset.menuFeature === id);
  const socialCasino = nodes['menu-navigation'].children.find(node => node.dataset.menuDisclosure === 'social-casino');
  const casinoItems = socialCasino?.nextSibling;
  const finishExit = () => nodes['site-sidebar'].emit('transitionend', { propertyName: 'transform' });
  const resize = (matches, { settle = true } = {}) => {
    breakpoint.matches = matches;
    breakpoint.emit('change', { matches });
    if (settle) finishExit();
  };
  return { nodes, document, calls, categoryButtons, observers, windowEvents, context, api, timers, motion, finishExit, menuAnimations,
    item, feature, socialCasino, casinoItems, flushClose, providerCalls, helpCalls, headerParent, headerShell, headerActions, resize, pageHeading,
    keydown: (key, options = {}) => documentEvents.emit('keydown', { key, ...options }),
    setFavorites(favorites) { memberState = createMemberState({ ...memberState, favorites }); memberListeners.forEach(listener => listener()); },
    flushLobby() { while (lobbyActions.length) lobbyActions.shift()(); } };
}

test('desktop sidebar retains its width across refresh and a mobile layout round trip', () => {
  const storage = new Map();
  const first = menuPage({ desktop: true, storage });
  first.nodes['menu-toggle'].click();
  const refreshed = menuPage({ desktop: true, storage });
  assert.equal(refreshed.document.body.dataset.sidebar, 'expanded');
  assert.equal(refreshed.nodes['menu-toggle'].getAttribute('aria-expanded'), 'true');
  refreshed.resize(false);
  assert.equal(refreshed.nodes['site-menu'].open, false, 'desktop state must not open a mobile drawer');
  refreshed.resize(true);
  assert.equal(refreshed.document.body.dataset.sidebar, 'expanded');
  refreshed.nodes['menu-toggle'].click();
  assert.equal(menuPage({ desktop: true, storage }).document.body.dataset.sidebar, 'collapsed');
});

test('blocked browser storage does not prevent sidebar initialization or toggling', () => {
  const storage = { get() { throw new Error('Blocked'); }, set() { throw new Error('Blocked'); } };
  const page = menuPage({ desktop: true, storage });
  assert.equal(page.document.body.dataset.sidebar, 'collapsed');
  page.nodes['menu-toggle'].click();
  assert.equal(page.document.body.dataset.sidebar, 'expanded');
});

test('menu opens once, focuses BUY, and only lists available collections', () => {
  const page = menuPage();
  page.context.initSiteMenu();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'true');
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  assert.equal(page.nodes['menu-toggle'].listeners.get('click').length, 1);
  assert.ok(page.item('lobby'));
  assert.equal(page.item('search'), undefined, 'the Search shortcut replaces a separate Games destination');
  assert.equal(page.item('all'), undefined, 'All Games must not have a separate menu destination');
  for (const id of ['popular', 'new-releases']) {
    assert.ok(page.item(id), 'discovery shelves have direct navigation shortcuts');
    assert.equal(page.casinoItems.contains(page.item(id)), false, 'discovery shelves are not game types');
  }
  assert.equal(page.categoryButtons.has('all'), false);
  for (const category of GAME_FAMILIES) assert.equal(!!page.item(category.id), getGamesForCategory(category.id).length > 0);
  assert.deepEqual(page.casinoItems.children.map(button => button.dataset.menuCategory),
    ['slots', 'table', 'scratchcards', 'tap', 'arcade'], 'Game Types remains independent of flexible lobby categories');
  for (const id of ['wild-west', 'gold-rush', 'egypt', 'asian', 'fruit', 'megaways']) {
    assert.equal(page.item(id), undefined, `${id} is a collection, not a game type`);
  }
  assert.equal(page.feature('achievements').parentElement.nextSibling, page.nodes['menu-navigation']);
  const providersGroup = page.nodes['menu-navigation'].nextSibling;
  assert.equal(providersGroup.getAttribute('aria-label'), 'Game providers');
  assert.deepEqual(providersGroup.children, [page.item('providers')]);
  assert.equal(page.nodes['menu-navigation'].contains(page.item('providers')), false);
  assert.equal(page.item('providers').getClientRects().length, 1, 'Providers stays visible with categories closed');
  assert.equal(page.categoryButtons.has('providers'), false);
});

test('sidebar highlights a game type and clears its selection when Search opens', () => {
  const page = menuPage({ desktop: true });
  const arcade = page.item('arcade');
  assert.ok(page.item('lobby'));
  assert.equal(page.item('all'), undefined);
  page.socialCasino.click();
  arcade.click();
  assert.equal(page.calls.at(-1), 'category:arcade');
  assert.equal(page.document.body.dataset.page, 'category');
  page.observers[0].callback();
  assert.equal(arcade.getAttribute('aria-current'), 'page');
  page.nodes['menu-search'].click();
  assert.equal(page.calls.at(-1), 'search:open');
  assert.equal(page.document.body.dataset.page, 'search');
  assert.equal(page.document.activeElement, page.nodes['site-search-input']);
  page.observers[0].callback();
  assert.equal(arcade.getAttribute('aria-current'), null);
  assert.equal(page.item('search'), undefined);
  assert.equal(page.item('lobby').getAttribute('aria-current'), null);
});

test('discovery shortcuts route and highlight consistently for guests and members on desktop and mobile', () => {
  for (const guest of [true, false]) {
    for (const desktop of [true, false]) {
      const page = menuPage({ guest, desktop });
      for (const id of ['popular', 'new-releases']) {
        if (!desktop) page.api.openMenu();
        assert.equal(page.item(id).getClientRects().length, 1);
        page.item(id).click();
        page.flushClose();
        assert.equal(page.calls.at(-1), `category:${id}`);
        assert.equal(page.document.body.dataset.page, 'category');
        assert.equal(page.nodes['site-menu'].open, false, 'the drawer closes before navigating');
        if (desktop) page.observers[0].callback();
        else page.api.openMenu();
        assert.equal(page.item(id).getAttribute('aria-current'), 'page');
        assert.equal(page.item('lobby').getAttribute('aria-current'), null);
        assert.equal(page.item(id === 'popular' ? 'new-releases' : 'popular').getAttribute('aria-current'), null);
        if (!desktop) { page.api.closeMenu(); page.flushClose(); }
      }
    }
  }
});

test('Search remains available without a separate Games destination for guests and members', () => {
  for (const guest of [true, false]) {
    for (const desktop of [true, false]) {
      const page = menuPage({ guest, desktop });
      page.api.openMenu();
      assert.equal(page.item('search'), undefined, 'Games must not duplicate the Search shortcut');
      const search = page.nodes['menu-search'];
      assert.equal(search.getClientRects().length, 1);
      search.click();
      if (!desktop) assert.equal(page.calls.includes('search:open'), false, 'wait for drawer close before opening Search');
      page.flushClose();
      assert.equal(page.calls.at(-1), 'search:open');
      assert.equal(page.document.body.dataset.page, 'search');
      assert.equal(page.document.activeElement, page.nodes['site-search-input']);
      assert.equal(page.calls.includes('category:search'), false);
      if (desktop) page.observers[0].callback();
      else page.api.openMenu();
      assert.equal(page.item('search'), undefined);
      assert.equal(page.item('lobby').getAttribute('aria-current'), null);
    }
  }
});

test('Escape closes the drawer, resets its trigger and restores focus', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  const event = page.nodes['site-menu'].emit('cancel');
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.nodes['site-menu'].open, false);
  page.flushClose();
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'false');
  assert.equal(page.document.activeElement, page.nodes['menu-toggle']);
  assert.equal(page.observers[0].targets.length, 0);
});

test('a caller can open the drawer and receive focus again when it is dismissed', () => {
  const page = menuPage();
  assert.equal(page.context.initSiteMenu(), page.api, 'reinitialization returns the same menu controller');
  page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  page.nodes['site-menu'].emit('cancel');
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['bottom-menu']);
});

test('a hidden drawer opener falls back to the visible header control', () => {
  const page = menuPage();
  page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
  page.nodes['bottom-menu'].visible = false;
  page.api.closeMenu();
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['menu-toggle']);
});

test('a hidden caller and header hamburger fall back to the visible bottom Menu button', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].visible = false;
  page.nodes['mobile-nav-menu'].visible = true;
  page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
  page.nodes['bottom-menu'].visible = false;
  page.api.closeMenu();
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu']);
});

test('changing between desktop and bottom navigation transfers focus to the visible menu control', () => {
  const page = menuPage({ desktop: true });
  page.nodes['menu-toggle'].focus();
  page.nodes['menu-toggle'].visible = false;
  page.nodes['mobile-nav-menu'].visible = true;
  page.resize(false);
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu']);

  page.nodes['menu-toggle'].visible = true;
  page.nodes['mobile-nav-menu'].visible = false;
  page.resize(true);
  assert.equal(page.document.activeElement, page.nodes['menu-toggle']);
});

test('resizing an open bottom-menu drawer to desktop keeps focus on the desktop trigger after native close', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].visible = false;
  page.nodes['mobile-nav-menu'].visible = true;
  page.api.openMenu({ returnFocusTo: page.nodes['mobile-nav-menu'] });
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  page.nodes['menu-toggle'].visible = true;
  page.nodes['mobile-nav-menu'].visible = false;
  page.resize(true);
  page.flushClose();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.document.activeElement, page.nodes['menu-toggle']);
});

test('game navigation closes the menu and restores its visible shell opener', () => {
  const page = menuPage();
  page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
  page.document.body.dataset.view = 'game';
  page.windowEvents.hashchange();
  page.flushClose();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.document.activeElement, page.nodes['bottom-menu']);
});

test('choosing a category from a caller-opened drawer keeps focus on that category', () => {
  const page = menuPage();
  page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
  page.socialCasino.click();
  page.item('arcade').click();
  page.flushClose();
  assert.equal(page.calls.at(-1), 'category:arcade');
  assert.equal(page.document.activeElement, page.pageHeading);
});

test('inside clicks leave the drawer open while backdrop clicks dismiss it', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.nodes['site-menu'].emit('click', { clientX: 100, clientY: 50 });
  assert.equal(page.nodes['site-menu'].open, true);
  page.nodes['site-menu'].emit('click', { clientX: 500, clientY: 50 });
  assert.equal(page.nodes['site-menu'].open, false);
});

test('a quick reopen waits until the previous native close event finishes', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.api.closeMenu();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.calls.filter(call => call === 'menu:open').length, 1);
  page.flushClose();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'true');
  assert.ok(page.observers[0].targets.length > 0);
});

const settleAnimation = async animation => {
  animation.finish();
  await Promise.resolve();
  await Promise.resolve();
};

test('animated menu waits for its exit before native close and destination handoff', async () => {
  const page = menuPage({ animations: true }), dialog = page.nodes['site-menu'];
  page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
  assert.equal(page.menuAnimations.length, 1);
  assert.equal(page.menuAnimations[0].target, dialog);
  assert.equal(dialog.open, true);
  assert.equal(page.nodes['lobby-view'].inert, true);
  assert.equal(page.nodes['mobile-nav'].inert, false);
  await settleAnimation(page.menuAnimations[0]);
  page.nodes['menu-buy'].click();
  assert.equal(page.menuAnimations.length, 2);
  assert.equal(dialog.open, true, 'the native dialog remains open while it leaves the viewport');
  assert.equal(dialog.inert, true, 'outgoing menu controls cannot accept another action');
  assert.equal(page.nodes['lobby-view'].inert, true, 'the covered page stays inert throughout exit');
  assert.equal(page.calls.includes('menu:close'), false);
  assert.equal(page.calls.includes('store:open'), false);
  page.flushClose();
  assert.equal(page.calls.includes('store:open'), false);
  await settleAnimation(page.menuAnimations[1]);
  assert.equal(dialog.open, false);
  assert.equal(page.calls.includes('store:open'), false, 'handoff still belongs to the native close event');
  page.flushClose();
  assert.equal(page.nodes['lobby-view'].inert, false);
  assert.equal(dialog.inert, false);
  assert.equal(page.document.activeElement, page.pageHeading);
  assert.deepEqual(page.calls.slice(-2), ['menu:close', 'store:open']);
  page.flushClose();
  assert.equal(page.calls.filter(call => call === 'store:open').length, 1);
  assert.equal(page.timers.size, 0);
});

test('closing during menu entry cancels the old animation and repeated close requests cannot replace its action', async () => {
  const page = menuPage({ animations: true }), dialog = page.nodes['site-menu'];
  page.api.openMenu();
  const entry = page.menuAnimations[0];
  dialog.computedTransform = 'matrix(1, 0, 0, 1, -160, 0)';
  page.nodes['menu-buy'].click();
  assert.equal(entry.cancelled, true);
  assert.equal(page.menuAnimations.length, 2);
  assert.equal(page.menuAnimations[1].keyframes[0].transform, dialog.computedTransform,
    'reversing an unfinished entry starts from its current position instead of jumping');
  assert.equal(dialog.open, true);
  page.api.closeMenu(() => page.calls.push('unexpected:replacement'));
  page.keydown('Escape');
  page.api.openMenu();
  assert.equal(page.menuAnimations.length, 2, 'repeated commands do not restart the exit');
  await Promise.resolve();
  assert.equal(dialog.open, true, 'cancellation of entry cannot finish the newer exit');
  await settleAnimation(page.menuAnimations[1]);
  page.flushClose();
  assert.equal(page.calls.filter(call => call === 'menu:open').length, 1);
  assert.equal(page.calls.filter(call => call === 'menu:close').length, 1);
  assert.equal(page.calls.filter(call => call === 'store:open').length, 1);
  assert.equal(page.calls.includes('unexpected:replacement'), false);
  page.api.openMenu();
  assert.equal(dialog.open, true, 'the next menu session remains usable after the handoff');
  await settleAnimation(page.menuAnimations[2]);
});

test('mobile menu skips entry and exit motion for either reduced-motion preference or a hidden document', () => {
  for (const preference of [{ reduced: true }, { siteReduced: true }, { hidden: true }]) {
    const page = menuPage({ animations: true, ...preference });
    page.api.openMenu();
    page.nodes['menu-buy'].click();
    assert.equal(page.menuAnimations.length, 0);
    assert.equal(page.nodes['site-menu'].open, false);
    assert.equal(page.calls.includes('store:open'), false);
    page.flushClose();
    assert.equal(page.calls.filter(call => call === 'store:open').length, 1);
    assert.equal(page.nodes['lobby-view'].inert, false);
    assert.equal(page.timers.size, 0);
  }
});

test('switching to desktop during menu entry or exit cancels motion and discards stale actions', async () => {
  for (const duringExit of [false, true]) {
    const page = menuPage({ animations: true }), dialog = page.nodes['site-menu'];
    page.api.openMenu();
    if (duringExit) {
      await settleAnimation(page.menuAnimations[0]);
      page.nodes['menu-buy'].click();
    }
    const active = page.menuAnimations.at(-1);
    page.resize(true);
    assert.equal(active.cancelled, true);
    assert.equal(dialog.open, false);
    assert.equal(dialog.inert, false);
    assert.equal(page.nodes['lobby-view'].inert, false);
    assert.equal(page.nodes['sidebar-content'].contains(page.nodes['menu-content']), true);
    await Promise.resolve();
    page.flushClose();
    assert.equal(page.calls.filter(call => call === 'menu:close').length, 1);
    assert.equal(page.calls.includes('store:open'), false);
    assert.equal(page.document.activeElement, page.nodes['menu-toggle']);
    assert.equal(page.timers.size, 0);
  }
});

test('enabling reduced motion settles the active menu animation without duplicate close or navigation', async () => {
  for (const duringExit of [false, true]) {
    const page = menuPage({ animations: true }), dialog = page.nodes['site-menu'];
    page.api.openMenu();
    if (duringExit) {
      await settleAnimation(page.menuAnimations[0]);
      page.nodes['menu-buy'].click();
    }
    page.motion.matches = true;
    page.motion.emit('change', { matches: true });
    await Promise.resolve();
    page.flushClose();
    assert.equal(dialog.open, !duringExit);
    assert.equal(dialog.inert, false);
    assert.equal(page.calls.filter(call => call === 'menu:close').length, duringExit ? 1 : 0);
    assert.equal(page.calls.filter(call => call === 'store:open').length, duringExit ? 1 : 0);
    assert.equal(page.nodes['lobby-view'].inert, !duringExit);
    assert.equal(page.timers.size, 0);
  }
});

test('menu exit fallback closes and hands off only once if the animation never finishes', async () => {
  const page = menuPage({ animations: true }), dialog = page.nodes['site-menu'];
  page.api.openMenu();
  await settleAnimation(page.menuAnimations[0]);
  page.nodes['menu-buy'].click();
  const exit = page.menuAnimations[1];
  assert.equal(page.timers.size, 1);
  [...page.timers.values()][0].action();
  await Promise.resolve();
  assert.equal(dialog.open, false);
  page.flushClose();
  await settleAnimation(exit);
  page.flushClose();
  assert.equal(page.calls.filter(call => call === 'menu:close').length, 1);
  assert.equal(page.calls.filter(call => call === 'store:open').length, 1);
  assert.equal(page.timers.size, 0);
});

test('category and Providers page navigation runs only after the drawer closes', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.socialCasino.click();
  assert.equal(page.nodes['site-menu'].open, true);
  page.item('slots').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.ok(!page.calls.includes('category:slots'));
  page.flushClose();
  assert.equal(page.document.activeElement, page.pageHeading);
  assert.equal(page.calls.at(-1), 'category:slots');
  page.nodes['menu-toggle'].click();
  assert.equal(page.item('slots').getAttribute('aria-current'), 'page');
  assert.equal(page.categoryButtons.has('providers'), false);
  page.item('providers').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.providerCalls.length, 0, 'Providers waits for the native drawer close event');
  page.flushClose();
  assert.equal(page.calls.at(-1), 'category:providers');
  assert.equal(page.providerCalls.length, 1);
  assert.equal(page.providerCalls[0], undefined);
  assert.ok([...page.categoryButtons.values()].every(button => button.getAttribute('aria-pressed') === 'false'));
  page.nodes['menu-toggle'].click();
  assert.equal(page.item('providers').getAttribute('aria-current'), 'page');
  assert.equal(page.item('slots').getAttribute('aria-current'), null);
});

test('BUY opens the Store page only after the mobile menu closes and keeps destination focus', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.nodes['menu-buy'].click();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.calls.includes('store:open'), false);
  page.flushClose();
  assert.equal(page.document.body.dataset.page, 'store');
  assert.equal(page.document.activeElement, page.pageHeading);
  assert.deepEqual(page.calls.slice(-2), ['menu:close', 'store:open']);
});

test('mobile search opens after the drawer closes while desktop search opens directly', () => {
  const mobile = menuPage();
  mobile.nodes['menu-toggle'].click();
  mobile.nodes['menu-search'].click();
  assert.equal(mobile.nodes['site-menu'].open, false);
  assert.equal(mobile.nodes['site-search'].open, false);
  mobile.flushClose();
  assert.equal(mobile.nodes['catalog-categories'].dataset.activeMenu, 'search');
  assert.equal(mobile.document.activeElement, mobile.nodes['site-search-input']);

  const desktop = menuPage({ desktop: true });
  desktop.nodes['menu-search'].click();
  assert.equal(desktop.nodes['catalog-categories'].dataset.activeMenu, 'search');
  assert.equal(desktop.document.activeElement, desktop.nodes['site-search-input']);
  assert.equal(desktop.calls.some(call => call === 'menu:open' || call === 'menu:close'), false);
});

test('member destinations navigate after the mobile drawer closes', () => {
  const page = menuPage();
  for (const id of ['achievements',
    'support', 'settings']) {
    assert.ok(page.feature(id), `${id} has a dedicated sidebar entry`);
    assert.equal(page.feature(id).dataset.tooltip, page.feature(id).getAttribute('aria-label'));
  }
  assert.equal(page.feature('crypto-earn'), undefined, 'removed page must not remain in navigation');
  assert.equal(page.feature('lounge'), undefined, 'removed Lounge must not remain in navigation');
  assert.equal(page.feature('missions'), undefined, 'removed Missions must not remain in navigation');
  assert.equal(page.feature('bonus-hub'), undefined, 'removed Bonus Hub must not remain in navigation');
  assert.equal(page.feature('vip-club'), undefined, 'removed VIP Club must not remain in navigation');
  assert.equal(page.feature('rank-system'), undefined, 'removed Rank System must not remain in navigation');
  for (const id of ['daily-bonus', 'invite-friends', 'affiliate-program', 'partners', 'blog']) assert.equal(page.feature(id), undefined);
  page.nodes['menu-toggle'].click();
  page.feature('achievements').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.calls.includes('feature:achievements'), false);
  page.flushClose();
  assert.equal(page.calls.at(-1), 'feature:achievements');
  assert.equal(page.document.activeElement, page.pageHeading);
  page.nodes['menu-toggle'].click();
  assert.equal(page.feature('achievements').getAttribute('aria-current'), 'page');
  assert.ok(page.item('lobby'));
});

test('Lobby and personal collections stay above Achievements while discovery shortcuts sit immediately above Game Types', () => {
  for (const desktop of [true, false]) {
    const page = menuPage({ desktop });
    const group = page.item('lobby').parentElement;
    assert.equal(group.getAttribute('aria-label'), 'Games');
    assert.equal(group.nextSibling, page.feature('achievements').parentElement);
    assert.deepEqual(group.children.map(button => button.getAttribute('aria-label')),
      ['Lobby', 'Recent Games', 'Favorite Games']);
    assert.deepEqual(page.nodes['menu-navigation'].children,
      [page.item('popular'), page.item('new-releases'), page.socialCasino, page.casinoItems]);
    assert.equal(page.feature('achievements').parentElement.nextSibling, page.nodes['menu-navigation']);
    assert.equal(page.casinoItems.contains(page.item('favorites')), false);
    assert.equal(page.nodes['menu-content'].descendants().filter(node => node.dataset.menuCategory === 'favorites').length, 1);
    page.api.openMenu();
    assert.equal(page.item('favorites').getClientRects().length, 1, 'visible even without saved games');
    page.item('recent-games').click();
    page.flushClose();
    assert.equal(page.calls.at(-1), 'category:recent-games');
    page.api.openMenu();
    page.item('favorites').click();
    page.flushClose();
    assert.equal(page.calls.at(-1), 'category:favorites');
    page.api.openMenu();
    page.item('lobby').click();
    page.flushClose();
    assert.equal(page.calls.at(-1), 'home:open');
  }
});

test('REDEEM opens a separate preview destination instead of performing a transaction', () => {
  const page = menuPage({ desktop: true });
  assert.equal(page.nodes['menu-redeem'].disabled, false);
  page.nodes['menu-redeem'].click();
  assert.equal(page.calls.at(-1), 'feature:redeem');
  assert.equal(page.calls.includes('store:open'), false);
});

test('Game Types opens the desktop rail, toggles the categories in place and restores focus when closing', () => {
  const page = menuPage({ desktop: true });
  const { socialCasino, casinoItems } = page;
  assert.equal(socialCasino.dataset.menuDisclosure, 'social-casino');
  assert.equal(socialCasino.getAttribute('aria-label'), 'Game Types');
  assert.equal(socialCasino.getAttribute('aria-expanded'), 'false');
  assert.equal(socialCasino.getAttribute('aria-controls'), casinoItems.id);
  assert.equal(casinoItems.hidden, true);
  assert.equal(page.item('slots').getClientRects().length, 0);

  socialCasino.click();
  assert.equal(page.document.body.dataset.sidebar, 'expanded');
  assert.equal(socialCasino.getAttribute('aria-expanded'), 'true');
  assert.equal(page.item('slots').getClientRects().length, 1);

  page.item('slots').focus();
  socialCasino.click();
  assert.equal(casinoItems.hidden, true);
  assert.equal(page.document.activeElement, socialCasino);
  assert.equal(page.document.body.dataset.sidebar, 'expanded');
  assert.deepEqual(page.calls, []);
});

test('mobile Social Casino reveals the active category and respects a manual collapse', () => {
  const page = menuPage();
  const { socialCasino, casinoItems } = page;
  page.api.openMenu();
  assert.equal(casinoItems.hidden, true);
  socialCasino.click();
  assert.equal(page.nodes['site-menu'].open, true);
  page.item('slots').click();
  page.flushClose();
  assert.equal(page.calls.at(-1), 'category:slots');

  page.api.openMenu();
  assert.equal(socialCasino.dataset.childActive, 'true');
  assert.equal(socialCasino.getAttribute('aria-expanded'), 'true');
  assert.equal(page.item('slots').getAttribute('aria-current'), 'page');
  socialCasino.click();
  page.observers[0].callback();
  assert.equal(casinoItems.hidden, true);
});

test('How to Play appears immediately below Settings and opens help without changing pages', () => {
  const page = menuPage({ desktop: true });
  const help = page.feature('how-to-play');
  assert.equal(page.feature('settings').nextSibling, help);
  assert.equal(help.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(help.getAttribute('aria-controls'), 'how-to-play-dialog');
  help.click();
  assert.equal(page.calls.at(-1), 'help:open');
  assert.equal(page.helpCalls[0].returnFocusTo, help);
  assert.equal(page.calls.some(call => call.startsWith('feature:')), false);
  assert.equal(page.document.body.dataset.view, 'lobby');
});

test('mobile How to Play waits for menu close and restores focus to its persistent opener', () => {
  const page = menuPage();
  page.nodes['mobile-nav-menu'].visible = true;
  page.api.openMenu({ returnFocusTo: page.nodes['mobile-nav-menu'] });
  page.feature('how-to-play').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.helpCalls.length, 0, 'wait for the native menu close event');
  page.flushClose();
  assert.equal(page.calls.at(-1), 'help:open');
  assert.equal(page.helpCalls[0].returnFocusTo, page.nodes['mobile-nav-menu']);
});

test('drawer button accents track the selected currency only while open', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'GC');
  page.nodes['coin-wallet'].dataset.currency = 'SC';
  page.observers[0].callback();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'SC');
  page.api.closeMenu();
  page.flushClose();
  page.nodes['coin-wallet'].dataset.currency = 'GC';
  page.observers[0].callback();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'SC');
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'GC');
});

test('entering a game closes an existing menu and still allows reopening the game shell menu', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.document.body.dataset.view = 'game';
  page.nodes['menu-toggle'].visible = false;
  page.windowEvents.hashchange();
  page.flushClose();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.document.activeElement, page.nodes['site-logo']);
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
});

test('desktop sidebar toggles without creating a modal or moving its shared content twice', () => {
  const page = menuPage({ desktop: true });
  assert.equal(page.nodes['site-sidebar'].hidden, false);
  assert.equal(page.nodes['menu-toggle'].parentElement, page.nodes['sidebar-header']);
  assert.equal(page.nodes['menu-shortcuts'].parentElement, page.nodes['sidebar-header']);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['sidebar-content']);
  assert.equal(page.document.body.dataset.sidebar, 'collapsed');
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'false');
  assert.equal(page.nodes['site-menu'].open, false);

  page.nodes['menu-toggle'].click();
  assert.equal(page.document.body.dataset.sidebar, 'expanded');
  assert.equal(page.nodes['site-sidebar'].dataset.expanded, 'true');
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'true');
  page.nodes['menu-toggle'].click();
  assert.equal(page.document.body.dataset.sidebar, 'collapsed');
  assert.equal(page.nodes['site-sidebar'].dataset.expanded, 'false');
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.calls.includes('menu:open'), false);
  assert.deepEqual(page.nodes['sidebar-header'].children, [page.nodes['menu-toggle'], page.nodes['menu-shortcuts']]);
  assert.deepEqual(page.nodes['sidebar-content'].children, [page.nodes['menu-content']]);
});

test('desktop collection, Providers and BUY actions run immediately without a drawer close event', () => {
  const page = menuPage({ desktop: true });
  page.nodes['menu-toggle'].click();
  page.socialCasino.click();
  page.item('arcade').click();
  assert.equal(page.calls.at(-1), 'category:arcade');
  assert.equal(page.document.activeElement, page.pageHeading);
  page.item('providers').click();
  assert.equal(page.calls.at(-1), 'category:providers');
  assert.equal(page.providerCalls.length, 1);
  assert.equal(page.providerCalls[0], undefined);
  page.nodes['menu-buy'].click();
  assert.equal(page.document.body.dataset.page, 'store');
  assert.equal(page.document.activeElement, page.pageHeading);
  assert.equal(page.calls.some(call => call === 'menu:open' || call === 'menu:close'), false);
  page.flushClose();
  assert.equal(page.calls.at(-1), 'store:open');
});

test('switching an open mobile drawer to desktop closes it while the bottom bar stays in its original parent', () => {
  const page = menuPage();
  assert.equal(page.nodes['site-sidebar'].hidden, true);
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.nodes['mobile-nav'].parentElement, page.document.body);
  page.resize(true);
  assert.equal(page.nodes['mobile-nav'].parentElement, page.document.body);
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.nodes['site-sidebar'].hidden, false);
  assert.equal(page.nodes['menu-toggle'].parentElement, page.nodes['sidebar-header']);
  assert.equal(page.nodes['menu-shortcuts'].parentElement, page.nodes['sidebar-header']);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['sidebar-content']);
  assert.equal(page.document.body.dataset.sidebar, 'collapsed');
  page.flushClose();
  assert.ok(page.observers[0].targets.length > 0, 'desktop observation survives a queued native close event');
  page.nodes['menu-toggle'].click();
  assert.equal(page.document.body.dataset.sidebar, 'expanded');
  assert.equal(page.nodes['site-menu'].open, false);
});

test('switching an expanded desktop sidebar to mobile restores the header and starts with a closed drawer', () => {
  const page = menuPage({ desktop: true });
  page.nodes['menu-toggle'].click();
  page.resize(false);
  page.flushClose();
  assert.equal(page.nodes['site-sidebar'].hidden, true);
  assert.equal(page.nodes['menu-toggle'].parentElement, page.headerParent);
  assert.deepEqual(page.headerParent.children, [page.nodes['menu-toggle'], page.nodes['site-logo']]);
  assert.equal(page.nodes['menu-shortcuts'].parentElement, page.nodes['menu-mobile-header']);
  assert.deepEqual(page.nodes['menu-mobile-header'].children, [page.nodes['menu-shortcuts']]);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'false');
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
});

test('desktop exit keeps the real controls in place until its own transform finishes', () => {
  for (const expanded of [false, true]) {
    const page = menuPage({ desktop: true });
    if (expanded) page.nodes['menu-toggle'].click();
    const sidebar = page.nodes['site-sidebar'];
    page.resize(false, { settle: false });
    assert.equal(page.document.body.dataset.sidebar, 'hidden');
    assert.equal(sidebar.hidden, false, 'the outgoing sidebar remains rendered');
    assert.equal(sidebar.inert, true);
    assert.equal(sidebar.dataset.expanded, String(expanded), 'the outgoing presentation stays intact');
    assert.equal(page.nodes['menu-toggle'].parentElement, page.nodes['sidebar-header']);
    assert.equal(page.nodes['menu-shortcuts'].parentElement, page.nodes['sidebar-header']);
    assert.equal(page.nodes['menu-content'].parentElement, page.nodes['sidebar-content']);
    assert.equal(page.nodes['site-menu'].open, false);
    assert.equal([...page.timers.values()][0].delay, 320);

    sidebar.emit('transitionend', { target: page.nodes['menu-content'], propertyName: 'transform' });
    sidebar.emit('transitionend', { propertyName: 'width' });
    assert.equal(sidebar.hidden, false, 'child transitions and width changes do not finish the handoff');
    assert.equal(page.nodes['menu-content'].parentElement, page.nodes['sidebar-content']);

    page.finishExit();
    assert.equal(sidebar.hidden, true);
    assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
    assert.equal(page.nodes['menu-shortcuts'].parentElement, page.nodes['menu-mobile-header']);
    assert.equal(page.nodes['menu-toggle'].parentElement, page.headerParent);
    assert.equal(page.timers.size, 0);
  }
});

test('rapid breakpoint reversal cancels the old exit without losing the expanded preference', () => {
  const storage = new Map();
  const page = menuPage({ desktop: true, storage });
  const sidebar = page.nodes['site-sidebar'];
  page.nodes['menu-toggle'].click();
  page.resize(false, { settle: false });
  const staleTimeout = [...page.timers.values()][0].action;
  page.resize(true, { settle: false });
  assert.equal(page.timers.size, 0);
  staleTimeout();
  page.finishExit();
  assert.equal(sidebar.hidden, false);
  assert.equal(sidebar.inert, false);
  assert.equal(page.document.body.dataset.sidebar, 'expanded');
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['sidebar-content']);
  assert.equal(page.nodes['menu-toggle'].parentElement, page.nodes['sidebar-header']);
  assert.equal(storage.get('luckyloop-sidebar-expanded-v1'), 'true');
  assert.ok(page.observers[0].targets.length > 0);

  page.resize(false, { settle: false });
  assert.equal(page.timers.size, 1, 'a fresh exit gets its own completion timer');
  page.finishExit();
  assert.equal(sidebar.hidden, true);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
});

test('opening the mobile drawer during sidebar exit completes the shared-content handoff immediately', () => {
  const page = menuPage({ desktop: true });
  page.nodes['mobile-nav-menu'].visible = true;
  page.resize(false, { settle: false });
  const staleTimeout = [...page.timers.values()][0].action;
  page.api.openMenu({ returnFocusTo: page.nodes['mobile-nav-menu'] });
  assert.equal(page.nodes['site-sidebar'].hidden, true);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  assert.equal(page.nodes['lobby-view'].inert, true);
  assert.equal(page.timers.size, 0);
  staleTimeout();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  page.api.closeMenu(); page.flushClose();
  assert.equal(page.nodes['lobby-view'].inert, false);
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu']);
});

test('reduced motion from either preference completes the sidebar handoff immediately', () => {
  for (const options of [{ reduced: true }, { siteReduced: true }]) {
    const page = menuPage({ desktop: true, ...options });
    page.resize(false, { settle: false });
    assert.equal(page.nodes['site-sidebar'].hidden, true);
    assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
    assert.equal(page.document.body.dataset.sidebar, 'hidden');
    assert.equal(page.timers.size, 0);
  }
});

test('initial mobile layout has no outgoing sidebar or exit timer', () => {
  const page = menuPage();
  assert.equal(page.nodes['site-sidebar'].hidden, true);
  assert.equal(page.nodes['site-sidebar'].inert, true);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
  assert.equal(page.document.body.dataset.sidebar, 'hidden');
  assert.equal(page.timers.size, 0);
});

test('focus leaves outgoing inert controls immediately and is not stolen at transition completion', () => {
  const page = menuPage({ desktop: true });
  page.nodes['mobile-nav-menu'].visible = true;
  page.feature('settings').focus();
  assert.equal(page.document.activeElement, page.feature('settings'));
  page.resize(false, { settle: false });
  assert.equal(page.nodes['site-sidebar'].inert, true);
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu']);
  page.feature('settings').focus();
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu'], 'outgoing controls cannot regain focus');
  page.finishExit();
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu']);
  page.resize(true);
  assert.equal(page.nodes['site-sidebar'].inert, false);
  assert.equal(page.document.activeElement, page.nodes['menu-toggle']);
});

test('missing transitionend falls back to the configured CSS duration', () => {
  const page = menuPage({ desktop: true, sidebarDuration: '.2s' });
  page.resize(false, { settle: false });
  const timeout = [...page.timers.values()][0];
  assert.equal(timeout.delay, 280);
  timeout.action();
  assert.equal(page.nodes['site-sidebar'].hidden, true);
  assert.equal(page.nodes['menu-content'].parentElement, page.nodes['site-menu']);
  assert.equal(page.timers.size, 0);
});

test('collapsed desktop navigation shows one custom tooltip for pointer and keyboard interaction', () => {
  const page = menuPage({ desktop: true });
  const item = page.socialCasino;
  const sidebar = page.nodes['site-sidebar'];
  const tooltip = page.nodes['menu-tooltip'];
  item.bounds = { left: 8, right: 52, top: 160, bottom: 204, width: 44, height: 44 };

  assert.equal(item.getAttribute('title'), null, 'the custom label must not compete with a native title');
  assert.equal(tooltip.hidden, true);
  sidebar.emit('pointerover', { target: item.children[0], pointerType: 'mouse' });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Game Types');
  assert.equal(item.getAttribute('aria-describedby'), 'menu-tooltip');
  assert.ok(Number.parseFloat(tooltip.style.left) > item.bounds.right);
  sidebar.emit('pointerout', { target: item, relatedTarget: null });
  assert.equal(tooltip.hidden, true);
  assert.equal(item.getAttribute('aria-describedby'), null);

  item.focusVisible = true;
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Game Types');
  sidebar.emit('focusout', { target: item, relatedTarget: null });
  assert.equal(tooltip.hidden, true);
});

test('wide touch screens suppress tap tooltips while retaining keyboard-accessible labels', () => {
  const page = menuPage({ desktop: true, hover: false });
  const item = page.socialCasino, sidebar = page.nodes['site-sidebar'], tooltip = page.nodes['menu-tooltip'];
  sidebar.emit('pointerover', { target: item.children[0], pointerType: 'touch' });
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, true, 'touch pointer entry and its focus must not leave a sticky tooltip');
  assert.equal(item.getAttribute('aria-describedby'), null);
  sidebar.emit('pointerover', { target: item, pointerType: 'mouse' });
  assert.equal(tooltip.hidden, true, 'a synthesized pointer event cannot bypass the device hover capability');
  item.focusVisible = true;
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, false, 'a connected keyboard can still reveal the collapsed label');
  assert.equal(tooltip.textContent, 'Game Types');
  assert.equal(item.getAttribute('aria-describedby'), 'menu-tooltip');
  sidebar.emit('focusout', { target: item });
  assert.equal(tooltip.hidden, true);
});

test('hybrid devices distinguish touch input from a real mouse hover', () => {
  const page = menuPage({ desktop: true, hover: true });
  const item = page.socialCasino, sidebar = page.nodes['site-sidebar'], tooltip = page.nodes['menu-tooltip'];
  sidebar.emit('pointerover', { target: item, pointerType: 'touch' });
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, true);
  assert.equal(item.getAttribute('aria-describedby'), null);
  sidebar.emit('pointerover', { target: item, pointerType: 'mouse' });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Game Types');
  sidebar.emit('pointerout', { target: item, relatedTarget: null });
  assert.equal(tooltip.hidden, true);
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, true, 'mouse- or touch-induced focus is not keyboard focus');
});

test('expanded and mobile navigation never show collapsed-rail tooltips', () => {
  const page = menuPage({ desktop: true });
  const item = page.socialCasino;
  const sidebar = page.nodes['site-sidebar'];
  const tooltip = page.nodes['menu-tooltip'];
  item.focusVisible = true;
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, false);

  page.nodes['menu-toggle'].click();
  assert.equal(tooltip.hidden, true, 'expansion clears a visible collapsed label');
  sidebar.emit('pointerover', { target: item });
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, true);

  page.resize(false);
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  sidebar.emit('pointerover', { target: item });
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, true);
  assert.equal(item.getAttribute('aria-describedby'), null);
});

test('collapsed tooltips are dismissed by navigation but remain available in the game shell', () => {
  const page = menuPage({ desktop: true });
  const item = page.socialCasino;
  const sidebar = page.nodes['site-sidebar'];
  const tooltip = page.nodes['menu-tooltip'];
  item.focusVisible = true;
  sidebar.emit('pointerover', { target: item });
  assert.equal(tooltip.hidden, false);
  page.nodes['menu-content'].emit('scroll');
  assert.equal(tooltip.hidden, true);

  page.nodes['other-dialog'].open = true;
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, true);
  page.nodes['other-dialog'].open = false;
  sidebar.emit('pointerover', { target: item });
  assert.equal(tooltip.hidden, false);
  page.document.body.dataset.view = 'game';
  page.windowEvents.hashchange();
  assert.equal(tooltip.hidden, true);
  sidebar.emit('pointerover', { target: item });
  assert.equal(tooltip.hidden, false);
});

test('game shell menu preserves the game until BUY opens the Store page', () => {
  const page = menuPage({ routeFromGame: true });
  page.document.body.dataset.view = 'game';
  page.nodes['mobile-nav-menu'].visible = true;
  page.api.openMenu({ returnFocusTo: page.nodes['mobile-nav-menu'] });
  assert.equal(page.nodes['site-menu'].open, true);
  page.api.closeMenu();
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu']);
  assert.equal(page.document.body.dataset.view, 'game');
  assert.equal(page.calls.includes('lobby:return'), false);

  page.api.openMenu({ returnFocusTo: page.nodes['mobile-nav-menu'] });
  page.nodes['mobile-nav-menu'].visible = false;
  page.api.closeMenu();
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['menu-toggle'], 'a hidden game opener falls back to the visible shell menu control');
  page.nodes['mobile-nav-menu'].visible = true;

  page.api.openMenu({ returnFocusTo: page.nodes['mobile-nav-menu'] });
  page.nodes['menu-buy'].click();
  page.flushClose();
  assert.equal(page.document.body.dataset.page, 'store');
  assert.equal(page.document.body.dataset.view, 'lobby');
  assert.equal(page.document.activeElement, page.pageHeading);
  assert.equal(page.calls.includes('lobby:return'), false);
});

test('game shell category and provider navigation opens its own destination after menu close', () => {
  for (const id of ['arcade', 'providers']) {
    const page = menuPage({ routeFromGame: true });
    page.document.body.dataset.view = 'game';
    page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
    page.socialCasino.click();
    page.item(id).click();
    assert.equal(page.calls.includes('lobby:return'), false, 'the menu closes before game routing');
    page.flushClose();
    assert.equal(page.calls.includes('lobby:return'), false, 'routing owns game cleanup without resetting the lobby');
    assert.equal(page.document.body.dataset.view, 'lobby');
    assert.equal(page.calls.at(-1), `category:${id}`);
  }
});

test('Escape collapses an expanded desktop sidebar without also leaving the game', () => {
  const page = menuPage({ desktop: true, routeFromGame: true });
  page.document.body.dataset.view = 'game';
  page.nodes['menu-toggle'].click();
  assert.equal(page.document.body.dataset.sidebar, 'expanded');
  const event = page.nodes['site-sidebar'].emit('keydown', { key: 'Escape' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.document.body.dataset.sidebar, 'collapsed');
  assert.equal(page.document.body.dataset.view, 'game');
  assert.equal(page.calls.includes('lobby:return'), false);
});

test('menu dismissal uses the logo if every remembered or menu control is hidden', () => {
  const page = menuPage();
  page.document.body.dataset.view = 'game';
  page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
  page.nodes['bottom-menu'].visible = false;
  page.nodes['menu-toggle'].visible = false;
  page.nodes['mobile-nav-menu'].visible = false;
  page.api.closeMenu();
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['site-logo']);
});


test('mobile menu leaves one persistent bottom navigation in place through open, close and deferred actions', () => {
  const page = menuPage();
  const nav = page.nodes['mobile-nav'];
  const opener = page.nodes['mobile-nav-menu'];
  opener.visible = true;
  page.nodes['menu-toggle'].visible = false;
  assert.equal(nav.parentElement, page.document.body);
  assert.equal(nav.nextSibling, page.nodes['site-menu']);

  page.api.openMenu({ returnFocusTo: opener });
  assert.equal(nav.parentElement, page.document.body);
  assert.deepEqual(nav.children.map(button => button.id),
    ['mobile-nav-lobby', 'mobile-nav-store', 'mobile-nav-redeem', 'mobile-nav-menu']);
  assert.equal(nav.children[3], opener, 'the same controls remain in the fixed application bar');
  assert.equal(nav.nextSibling, page.nodes['site-menu']);
  assert.equal(page.nodes['site-menu'].contains(nav), false, 'the menu must not acquire a separate bottom navigation');

  let actionRan = false;
  page.api.closeMenu(() => {
    assert.equal(page.nodes['site-menu'].open, false);
    assert.equal(nav.parentElement, page.document.body);
    actionRan = true;
  });
  assert.equal(nav.parentElement, page.document.body, 'the bottom bar never moves while the close action is pending');
  assert.equal(nav.nextSibling, page.nodes['site-menu'], 'the original document position is unchanged');
  assert.equal(actionRan, false);
  page.flushClose();
  assert.equal(actionRan, true);

  page.api.openMenu({ returnFocusTo: opener });
  assert.equal(nav.parentElement, page.document.body);
  page.api.closeMenu();
  page.flushClose();
  assert.equal(nav.parentElement, page.document.body);
  assert.equal(page.document.activeElement, opener);
});

test('mobile menu makes only the background inert and restores each prior state before destination actions', () => {
  const page = menuPage();
  page.nodes['game-view'].inert = true;
  page.nodes['mobile-nav-menu'].visible = true;
  page.api.openMenu({ returnFocusTo: page.nodes['mobile-nav-menu'] });
  for (const id of ['lobby-view', 'game-view', 'store-view', 'feature-view', 'game-details-view', 'site-sidebar']) {
    assert.equal(page.nodes[id].inert, true, id);
  }
  assert.equal(page.headerParent.inert, true);
  assert.equal(page.nodes['site-menu'].inert, false);
  assert.equal(page.nodes['mobile-nav'].inert, false);
  page.nodes['site-logo'].focus();
  assert.equal(page.document.activeElement, page.nodes['menu-buy'], 'the background cannot acquire focus');
  page.nodes['mobile-nav-redeem'].focus();
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-redeem'], 'the fixed navigation remains interactive');

  let actionRan = false;
  page.api.closeMenu(() => {
    actionRan = true;
    assert.equal(page.nodes['lobby-view'].inert, false);
    assert.equal(page.headerParent.inert, false);
    assert.equal(page.nodes['game-view'].inert, true, 'previous inert states must not be erased');
  });
  assert.equal(page.nodes['lobby-view'].inert, false, 'release the shell before the native close handoff');
  assert.equal(actionRan, false);
  page.flushClose();
  assert.equal(actionRan, true);
});

test('mobile focus cycles through the menu and the permanent bottom bar and document Escape closes it', () => {
  const page = menuPage();
  const opener = page.nodes['mobile-nav-menu'];
  opener.visible = true;
  page.api.openMenu({ returnFocusTo: opener });
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  assert.equal(page.keydown('Tab', { shiftKey: true }).defaultPrevented, true);
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-menu']);
  assert.equal(page.keydown('Tab').defaultPrevented, true);
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);

  page.nodes['mobile-nav-menu'].disabled = true;
  page.nodes['mobile-nav-redeem'].visible = false;
  page.keydown('Tab', { shiftKey: true });
  assert.equal(page.document.activeElement, page.nodes['mobile-nav-store'], 'skip hidden and disabled controls');
  assert.equal(page.keydown('Tab', { ctrlKey: true }).defaultPrevented, false, 'browser shortcuts stay available');
  page.nodes['mobile-nav-menu'].disabled = false;
  assert.equal(page.keydown('Escape').defaultPrevented, true);
  assert.equal(page.nodes['site-menu'].open, false);
  page.flushClose();
  assert.equal(page.document.activeElement, opener);
  assert.equal(page.keydown('Tab').defaultPrevented, false, 'normal page focus resumes after dismissal');
});

test('guest hamburger opens and closes the menu while other header controls remain inert', () => {
  const page = menuPage({ guest: true });
  const trigger = page.nodes['menu-toggle'];
  trigger.click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.document.activeElement, page.nodes['menu-search'], 'hidden BUY and REDEEM shortcuts cannot receive focus');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(trigger.getAttribute('aria-label'), 'Close menu');
  assert.equal(page.headerShell.inert, false);
  assert.equal(page.headerParent.inert, false);
  assert.equal(page.nodes['site-logo'].inert, true);
  assert.equal(page.headerActions.inert, true, 'guest login and registration controls remain blocked');
  assert.equal(page.nodes['mobile-nav'].inert, true);
  assert.equal(page.nodes['lobby-view'].inert, true);
  page.nodes['site-logo'].focus();
  page.headerActions.children[0].focus();
  assert.equal(page.document.activeElement, page.nodes['menu-search']);
  trigger.focus();
  assert.equal(page.document.activeElement, trigger, 'the hamburger remains interactive through its nested header ancestors');
  trigger.click();
  assert.equal(page.nodes['site-menu'].open, false);
  page.flushClose();
  assert.equal(page.document.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.getAttribute('aria-label'), 'Open menu');
  assert.equal(page.headerActions.inert, false);
  assert.equal(page.nodes['site-logo'].inert, false);
  assert.equal(page.nodes['lobby-view'].inert, false);
});

test('guest keyboard focus cycles between visible menu controls and the header hamburger', () => {
  const page = menuPage({ guest: true });
  const trigger = page.nodes['menu-toggle'];
  trigger.click();
  assert.equal(page.keydown('Tab', { shiftKey: true }).defaultPrevented, true);
  assert.equal(page.document.activeElement, trigger);
  page.keydown('Tab');
  assert.equal(page.document.activeElement, page.nodes['menu-search']);
  page.feature('how-to-play').focus();
  page.keydown('Tab');
  assert.equal(page.document.activeElement, trigger, 'the hidden bottom bar is excluded');
  page.keydown('Tab', { shiftKey: true });
  assert.equal(page.document.activeElement, page.feature('how-to-play'));
  assert.equal(page.keydown('Escape').defaultPrevented, true);
  page.flushClose();
  assert.equal(page.document.activeElement, trigger);
});

test('guest menu skips a disabled first control and restores prior inert states before routing', () => {
  const page = menuPage({ guest: true });
  page.nodes['menu-search'].disabled = true;
  page.nodes['site-logo'].inert = true;
  page.nodes['menu-toggle'].click();
  assert.equal(page.document.activeElement, page.item('lobby'));
  page.item('lobby').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.headerActions.inert, false);
  assert.equal(page.nodes['site-logo'].inert, true, 'an existing inert state is preserved');
  assert.equal(page.calls.includes('home:open'), false);
  page.flushClose();
  assert.equal(page.calls.at(-1), 'home:open');
  assert.equal(page.document.activeElement, page.pageHeading, 'routing keeps destination focus');
});

test('switching to desktop releases mobile background inert state without moving the fixed bar', () => {
  const page = menuPage();
  page.api.openMenu();
  assert.equal(page.nodes['lobby-view'].inert, true);
  page.resize(true);
  assert.equal(page.nodes['lobby-view'].inert, false);
  assert.equal(page.headerParent.inert, false);
  assert.equal(page.nodes['mobile-nav'].parentElement, page.document.body);
  assert.equal(page.nodes['site-sidebar'].inert, false);
  assert.equal(page.nodes['site-menu'].open, false);
  page.flushClose();
  assert.equal(page.keydown('Tab').defaultPrevented, false);
});

test('Lobby loses its current-page highlight while viewing or playing a game', () => {
  for (const desktop of [true, false]) {
    const page = menuPage({ desktop });
    const categories = page.nodes['catalog-categories'];
    const lobby = page.item('lobby');
    page.api.openMenu();
    assert.equal(lobby.getAttribute('aria-current'), 'page');
    for (const view of ['game-details', 'game']) {
      page.document.body.dataset.page = view;
      categories.dataset.activeMenu = '';
      page.observers[0].callback();
      assert.equal(lobby.getAttribute('aria-current'), null);
    }
    categories.dataset.activeMenu = 'lobby';
    page.observers[0].callback();
    assert.equal(lobby.getAttribute('aria-current'), 'page');
  }
});
