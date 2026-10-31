import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { CATEGORIES, getGamesForCategory } from '../public/collections.js';

const source = (await readFile(new URL('../public/site-menu.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initSiteMenu', 'function initSiteMenu');

function menuPage({ desktop = false, routeFromGame = false } = {}) {
  const calls = [], closeEvents = [], observers = [], windowEvents = {}, providerCalls = [], lobbyActions = [];
  const document = { body: { dataset: { view: 'lobby' } }, activeElement: null };
  class Node {
    constructor() {
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.textContent = '';
      this.visible = true;
      this.open = false;
      this.hidden = false;
      this.style = {};
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
        target: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...details,
      };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
    click() {
      const event = this.emit('click');
      for (let parent = this.parent; parent; parent = parent.parent) parent.emit('click', event);
    }
    closest(selector) {
      const property = { '[data-menu-category]': 'menuCategory', '[data-tooltip]': 'tooltip' }[selector];
      if (!property) throw new Error(`Unexpected selector ${selector}`);
      return this.dataset[property] ? this : this.parent?.closest(selector) || null;
    }
    contains(node) { for (let next = node; next; next = next.parent) if (next === this) return true; return false; }
    focus() { if (this.visible) document.activeElement = this; }
    getClientRects() { return this.visible ? [{}] : []; }
    getBoundingClientRect() { return this.bounds || { left: 0, right: 320, top: 0, bottom: 700, width: 320, height: 700 }; }
    showModal() { this.open = true; calls.push('menu:open'); }
    close() { this.open = false; calls.push('menu:close'); closeEvents.push(() => this.emit('close')); }
  }
  document.body = new Node();
  document.body.dataset.view = 'lobby';
  const ids = ['menu-toggle', 'site-menu', 'menu-navigation', 'menu-buy',
    'catalog-categories', 'coin-wallet', 'wallet-add', 'wallet-dialog', 'site-logo', 'wallet-credit',
    'site-sidebar', 'sidebar-header', 'sidebar-content', 'menu-content', 'menu-shortcuts',
    'menu-mobile-header', 'menu-search', 'menu-promotion', 'menu-tooltip', 'site-search', 'site-search-input',
    'bottom-menu', 'mobile-nav', 'mobile-nav-menu'];
  const nodes = Object.fromEntries(ids.map(id => {
    const node = new Node();
    node.id = id;
    return [id, node];
  }));
  nodes['menu-tooltip'].hidden = true;
  nodes['mobile-nav-menu'].visible = false;
  nodes['menu-tooltip'].bounds = { left: 0, right: 120, top: 0, bottom: 32, width: 120, height: 32 };
  const headerParent = new Node();
  headerParent.append(nodes['menu-toggle'], nodes['site-logo']);
  nodes['site-menu'].append(nodes['menu-mobile-header'], nodes['menu-content']);
  nodes['menu-mobile-header'].append(nodes['menu-shortcuts']);
  nodes['menu-shortcuts'].append(nodes['menu-buy']);
  nodes['menu-content'].append(nodes['menu-search'], nodes['menu-promotion'], nodes['menu-navigation']);
  nodes['site-sidebar'].append(nodes['sidebar-header'], nodes['sidebar-content']);
  nodes['mobile-nav'].append(nodes['mobile-nav-menu']);
  document.body.append(headerParent, nodes['site-sidebar'], nodes['mobile-nav'], nodes['site-menu']);
  const breakpoint = new Node();
  breakpoint.matches = desktop;
  nodes['coin-wallet'].dataset.currency = 'GC';
  nodes['catalog-categories'].dataset.activeMenu = 'all';
  const categoryButtons = new Map(CATEGORIES.map(category => category.id).map(id => {
    const button = new Node();
    button.dataset.category = id;
    button.setAttribute('aria-pressed', String(id === 'all'));
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
  nodes['wallet-add'].addEventListener('click', () => {
    assert.equal(nodes['site-menu'].open, false);
    nodes['wallet-dialog'].open = true;
    calls.push('wallet:open');
    nodes['wallet-credit'].focus();
  });
  document.querySelector = selector => {
    if (selector === 'dialog[open]') return ['site-menu', 'wallet-dialog', 'site-search'].map(id => nodes[id]).find(node => node.open) || null;
    return nodes[selector.slice(1)] || null;
  };
  document.createElement = () => new Node();
  const catalog = {
    openSearch() {
      assert.equal(nodes['site-menu'].open, false);
      nodes['site-search'].open = true;
      calls.push('search:open');
      nodes['site-search-input'].focus();
    },
    openProviders(options) {
      assert.equal(nodes['site-menu'].open, false);
      providerCalls.push(options);
      calls.push('category:providers');
      nodes['catalog-categories'].dataset.activeMenu = 'providers';
      for (const button of categoryButtons.values()) button.setAttribute('aria-pressed', 'false');
    },
  };
  if (routeFromGame) catalog.returnToLobby = action => {
    calls.push('lobby:return');
    lobbyActions.push(() => { document.body.dataset.view = 'lobby'; action?.(); });
  };
  const context = {
    document, Element: Node, CATEGORIES, getGamesForCategory, catalog,
    createShelfIcon: () => new Node(),
    window: {
      innerWidth: 1280, innerHeight: 900,
      addEventListener(type, callback) { windowEvents[type] = callback; },
      matchMedia(query) {
        assert.match(query, /min-width:\s*45rem/);
        return breakpoint;
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
  const item = id => nodes['menu-navigation'].children.find(node => node.dataset.menuCategory === id);
  const resize = matches => {
    breakpoint.matches = matches;
    breakpoint.emit('change', { matches });
  };
  return { nodes, document, calls, categoryButtons, observers, windowEvents, context, api,
    item, flushClose, providerCalls, headerParent, resize,
    flushLobby() { while (lobbyActions.length) lobbyActions.shift()(); } };
}

test('menu opens once, focuses BUY, and only lists available collections', () => {
  const page = menuPage();
  page.context.initSiteMenu();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'true');
  assert.equal(page.document.activeElement, page.nodes['menu-buy']);
  assert.equal(page.nodes['menu-toggle'].listeners.get('click').length, 1);
  assert.equal(page.item('all').getAttribute('aria-current'), 'page');
  for (const category of CATEGORIES) assert.equal(!!page.item(category.id), category.id === 'all' || getGamesForCategory(category.id).length > 0);
  assert.equal(page.nodes['menu-navigation'].children.at(-1), page.item('providers'));
  assert.equal(page.categoryButtons.has('providers'), false);
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
  page.item('popular').click();
  page.flushClose();
  assert.equal(page.calls.at(-1), 'category:popular');
  assert.equal(page.document.activeElement, page.categoryButtons.get('popular'));
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

test('collections reuse the toolbar and Providers opens independently after the drawer closes', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.item('picks').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.ok(!page.calls.includes('category:picks'));
  page.flushClose();
  assert.equal(page.document.activeElement, page.categoryButtons.get('picks'));
  assert.equal(page.calls.at(-1), 'category:picks');
  page.nodes['menu-toggle'].click();
  assert.equal(page.item('picks').getAttribute('aria-current'), 'page');
  assert.equal(page.categoryButtons.has('providers'), false);
  page.item('providers').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.providerCalls.length, 0, 'Providers waits for the native drawer close event');
  page.flushClose();
  assert.equal(page.calls.at(-1), 'category:providers');
  assert.equal(page.providerCalls.length, 1);
  assert.equal(page.providerCalls[0].focusResults, true);
  assert.ok([...page.categoryButtons.values()].every(button => button.getAttribute('aria-pressed') === 'false'));
  page.nodes['menu-toggle'].click();
  assert.equal(page.item('providers').getAttribute('aria-current'), 'page');
  assert.equal(page.item('all').getAttribute('aria-current'), null);
});

test('BUY hands off to the existing wallet without overlapping modals or losing focus', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.nodes['menu-buy'].click();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.nodes['wallet-dialog'].open, false);
  page.flushClose();
  assert.equal(page.nodes['wallet-dialog'].open, true);
  assert.equal(page.document.activeElement, page.nodes['wallet-credit']);
  assert.deepEqual(page.calls.slice(-2), ['menu:close', 'wallet:open']);
});

test('mobile search opens after the drawer closes while desktop search opens directly', () => {
  const mobile = menuPage();
  mobile.nodes['menu-toggle'].click();
  mobile.nodes['menu-search'].click();
  assert.equal(mobile.nodes['site-menu'].open, false);
  assert.equal(mobile.nodes['site-search'].open, false);
  mobile.flushClose();
  assert.equal(mobile.nodes['site-search'].open, true);
  assert.equal(mobile.document.activeElement, mobile.nodes['site-search-input']);

  const desktop = menuPage({ desktop: true });
  desktop.nodes['menu-search'].click();
  assert.equal(desktop.nodes['site-search'].open, true);
  assert.equal(desktop.document.activeElement, desktop.nodes['site-search-input']);
  assert.equal(desktop.calls.some(call => call === 'menu:open' || call === 'menu:close'), false);
});

test('the sidebar promotion opens the existing Our Picks category', () => {
  const page = menuPage({ desktop: true });
  page.nodes['menu-promotion'].click();
  assert.equal(page.calls.at(-1), 'category:picks');
  assert.equal(page.document.activeElement, page.categoryButtons.get('picks'));
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
  page.item('popular').click();
  assert.equal(page.calls.at(-1), 'category:popular');
  assert.equal(page.document.activeElement, page.categoryButtons.get('popular'));
  page.item('providers').click();
  assert.equal(page.calls.at(-1), 'category:providers');
  assert.equal(page.providerCalls.length, 1);
  assert.equal(page.providerCalls[0].focusResults, true);
  page.nodes['menu-buy'].click();
  assert.equal(page.nodes['wallet-dialog'].open, true);
  assert.equal(page.document.activeElement, page.nodes['wallet-credit']);
  assert.equal(page.calls.some(call => call === 'menu:open' || call === 'menu:close'), false);
  page.flushClose();
  assert.equal(page.calls.at(-1), 'wallet:open');
});

test('switching an open mobile drawer to desktop closes it and reparents one live navigation tree', () => {
  const page = menuPage();
  assert.equal(page.nodes['site-sidebar'].hidden, true);
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.nodes['mobile-nav'].parentElement, page.nodes['site-menu']);
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

test('collapsed desktop navigation shows one custom tooltip for pointer and keyboard interaction', () => {
  const page = menuPage({ desktop: true });
  const item = page.item('slots');
  const sidebar = page.nodes['site-sidebar'];
  const tooltip = page.nodes['menu-tooltip'];
  item.bounds = { left: 8, right: 52, top: 160, bottom: 204, width: 44, height: 44 };

  assert.equal(item.getAttribute('title'), null, 'the custom label must not compete with a native title');
  assert.equal(tooltip.hidden, true);
  sidebar.emit('pointerover', { target: item.children[0] });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Slots');
  assert.equal(item.getAttribute('aria-describedby'), 'menu-tooltip');
  assert.ok(Number.parseFloat(tooltip.style.left) > item.bounds.right);
  sidebar.emit('pointerout', { target: item, relatedTarget: null });
  assert.equal(tooltip.hidden, true);
  assert.equal(item.getAttribute('aria-describedby'), null);

  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Slots');
  sidebar.emit('focusout', { target: item, relatedTarget: null });
  assert.equal(tooltip.hidden, true);
});

test('expanded and mobile navigation never show collapsed-rail tooltips', () => {
  const page = menuPage({ desktop: true });
  const item = page.item('picks');
  const sidebar = page.nodes['site-sidebar'];
  const tooltip = page.nodes['menu-tooltip'];
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
  const item = page.item('popular');
  const sidebar = page.nodes['site-sidebar'];
  const tooltip = page.nodes['menu-tooltip'];
  sidebar.emit('pointerover', { target: item });
  assert.equal(tooltip.hidden, false);
  page.nodes['menu-content'].emit('scroll');
  assert.equal(tooltip.hidden, true);

  page.nodes['wallet-dialog'].open = true;
  sidebar.emit('focusin', { target: item });
  assert.equal(tooltip.hidden, true);
  page.nodes['wallet-dialog'].open = false;
  sidebar.emit('pointerover', { target: item });
  assert.equal(tooltip.hidden, false);
  page.document.body.dataset.view = 'game';
  page.windowEvents.hashchange();
  assert.equal(tooltip.hidden, true);
  sidebar.emit('pointerover', { target: item });
  assert.equal(tooltip.hidden, false);
});

test('game shell menu overlays preserve the game and restore their visible opener', () => {
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
  assert.equal(page.nodes['wallet-dialog'].open, true);
  assert.equal(page.document.body.dataset.view, 'game');
  assert.equal(page.calls.includes('lobby:return'), false);
});

test('game shell category and provider navigation wait for lobby restoration', () => {
  for (const id of ['popular', 'providers']) {
    const page = menuPage({ routeFromGame: true });
    page.document.body.dataset.view = 'game';
    page.api.openMenu({ returnFocusTo: page.nodes['bottom-menu'] });
    page.item(id).click();
    assert.equal(page.calls.includes('lobby:return'), false, 'the menu closes before game routing');
    page.flushClose();
    assert.equal(page.calls.at(-1), 'lobby:return');
    assert.equal(page.calls.includes(`category:${id}`), false);
    page.flushLobby();
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


test('full-screen menu keeps the same bottom navigation interactive and restores it before deferred actions', () => {
  const page = menuPage();
  const nav = page.nodes['mobile-nav'];
  const opener = page.nodes['mobile-nav-menu'];
  opener.visible = true;
  page.nodes['menu-toggle'].visible = false;
  assert.equal(nav.parentElement, page.document.body);
  assert.equal(nav.nextSibling, page.nodes['site-menu']);

  page.api.openMenu({ returnFocusTo: opener });
  assert.equal(nav.parentElement, page.nodes['site-menu']);
  assert.equal(nav.children[0], opener, 'the live navigation is moved, preserving its controls and listeners');
  assert.equal(page.nodes['site-menu'].children.at(-1), nav);

  let actionRan = false;
  page.api.closeMenu(() => {
    assert.equal(page.nodes['site-menu'].open, false);
    assert.equal(nav.parentElement, page.document.body);
    actionRan = true;
  });
  assert.equal(nav.parentElement, page.document.body, 'restore before the native close event, so the bottom bar does not disappear');
  assert.equal(nav.nextSibling, page.nodes['site-menu'], 'restore the original document position');
  assert.equal(actionRan, false);
  page.flushClose();
  assert.equal(actionRan, true);

  page.api.openMenu({ returnFocusTo: opener });
  assert.equal(nav.parentElement, page.nodes['site-menu']);
  page.api.closeMenu();
  page.flushClose();
  assert.equal(nav.parentElement, page.document.body);
  assert.equal(page.document.activeElement, opener);
});
