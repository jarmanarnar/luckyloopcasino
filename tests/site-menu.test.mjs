import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { CATEGORIES, getGamesForCategory } from '../public/collections.js';

const source = (await readFile(new URL('../public/site-menu.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initSiteMenu', 'function initSiteMenu');

function menuPage() {
  const calls = [], closeEvents = [], observers = [], windowEvents = {}, providerCalls = [];
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
    }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren() { this.children = []; }
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
      if (selector !== '[data-menu-category]') throw new Error(`Unexpected selector ${selector}`);
      return this.dataset.menuCategory ? this : this.parent?.closest(selector) || null;
    }
    contains(node) { for (let next = node; next; next = next.parent) if (next === this) return true; return false; }
    focus() { if (this.visible) document.activeElement = this; }
    getClientRects() { return this.visible ? [{}] : []; }
    getBoundingClientRect() { return { left: 0, right: 320, top: 0, bottom: 700 }; }
    showModal() { this.open = true; calls.push('menu:open'); }
    close() { this.open = false; calls.push('menu:close'); closeEvents.push(() => this.emit('close')); }
  }
  const ids = ['menu-toggle', 'site-menu', 'menu-close', 'menu-navigation', 'menu-buy',
    'catalog-categories', 'coin-wallet', 'wallet-add', 'wallet-dialog', 'back-to-lobby', 'wallet-credit'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
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
    if (selector === 'dialog[open]') return ['site-menu', 'wallet-dialog'].map(id => nodes[id]).find(node => node.open) || null;
    return nodes[selector.slice(1)] || null;
  };
  document.createElement = () => new Node();
  const catalog = {
    openProviders(options) {
      assert.equal(nodes['site-menu'].open, false);
      providerCalls.push(options);
      calls.push('category:providers');
      nodes['catalog-categories'].dataset.activeMenu = 'providers';
      for (const button of categoryButtons.values()) button.setAttribute('aria-pressed', 'false');
    },
  };
  const context = {
    document, Element: Node, CATEGORIES, getGamesForCategory, catalog,
    createShelfIcon: () => new Node(),
    window: { addEventListener(type, callback) { windowEvents[type] = callback; } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(node) { this.targets.push(node); }
      disconnect() { this.targets = []; }
    },
  };
  vm.runInNewContext(`${source}\ninitSiteMenu(catalog);`, context);
  const flushClose = () => { while (closeEvents.length) closeEvents.shift()(); };
  const item = id => nodes['menu-navigation'].children.find(node => node.dataset.menuCategory === id);
  return { nodes, document, calls, categoryButtons, observers, windowEvents, context, item, flushClose, providerCalls };
}

test('menu opens once, focuses its close control, and only lists available collections', () => {
  const page = menuPage();
  page.context.initSiteMenu();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.equal(page.nodes['menu-toggle'].getAttribute('aria-expanded'), 'true');
  assert.equal(page.document.activeElement, page.nodes['menu-close']);
  assert.equal(page.nodes['menu-toggle'].listeners.get('click').length, 1);
  assert.equal(page.item('all').getAttribute('aria-current'), 'page');
  for (const category of CATEGORIES) assert.equal(!!page.item(category.id), category.id === 'all' || getGamesForCategory(category.id).length > 0);
  assert.equal(page.nodes['menu-navigation'].children[1], page.item('providers'));
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
  page.nodes['menu-close'].click();
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

test('drawer button accents track the selected currency only while open', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'GC');
  page.nodes['coin-wallet'].dataset.currency = 'SC';
  page.observers[0].callback();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'SC');
  page.nodes['menu-close'].click();
  page.flushClose();
  page.nodes['coin-wallet'].dataset.currency = 'GC';
  page.observers[0].callback();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'SC');
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].dataset.currency, 'GC');
});

test('entering a game closes the menu and returns focus to the visible back control', () => {
  const page = menuPage();
  page.nodes['menu-toggle'].click();
  page.document.body.dataset.view = 'game';
  page.nodes['menu-toggle'].visible = false;
  page.windowEvents.hashchange();
  page.flushClose();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.document.activeElement, page.nodes['back-to-lobby']);
  page.nodes['menu-toggle'].click();
  assert.equal(page.nodes['site-menu'].open, false);
});
