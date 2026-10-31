import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/mobile-nav.js', import.meta.url), 'utf8'))
  .replace('export function initMobileNav', 'function initMobileNav');

function navPage({ desktop = false, missing = null } = {}) {
  const calls = [], observations = [], observers = [];
  class Node {
    constructor() { this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.open = false; this.hidden = false; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this }); }
    click() { this.emit('click'); }
  }
  const ids = ['mobile-nav', 'catalog-categories', 'wallet-add', 'site-menu', 'site-search', 'wallet-dialog',
    ...['menu', 'casino', 'search', 'providers', 'wallet'].map(action => `mobile-nav-${action}`)];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  const body = new Node();
  body.dataset.view = 'lobby';
  nodes['mobile-nav'].hidden = true;
  nodes['catalog-categories'].dataset.activeMenu = 'all';
  const all = new Node();
  all.addEventListener('click', () => {
    calls.push({ action: 'all' });
    nodes['catalog-categories'].dataset.activeMenu = 'all';
  });
  nodes['catalog-categories'].querySelector = selector => {
    assert.equal(selector, '[data-category="all"]');
    return all;
  };
  nodes['wallet-add'].addEventListener('click', () => {
    calls.push({ action: 'wallet' });
    nodes['wallet-dialog'].open = true;
  });
  const dialogs = ['site-menu', 'site-search', 'wallet-dialog'];
  const document = {
    body,
    querySelector(selector) {
      if (selector === 'dialog[open]') return dialogs.map(id => nodes[id]).find(node => node.open) || null;
      const id = selector.slice(1);
      return id === missing ? null : nodes[id] || null;
    },
  };
  const media = new Node();
  media.matches = desktop;
  const api = {
    openMenu(options) { calls.push({ action: 'menu', options }); nodes['site-menu'].open = true; },
    openSearch(options) { calls.push({ action: 'search', options }); nodes['site-search'].open = true; },
    openProviders(options) { calls.push({ action: 'providers', options }); nodes['catalog-categories'].dataset.activeMenu = 'providers'; },
  };
  const context = {
    document, api,
    window: { matchMedia(query) { assert.equal(query, '(min-width: 45rem)'); return media; } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { observations.push({ target, options }); }
    },
  };
  vm.runInNewContext(`${source}\ninitMobileNav(api);`, context);
  return { nodes, body, calls, media, observations, observers,
    initialize() { vm.runInNewContext('initMobileNav(api);', context); },
    flush() { for (const observer of observers) observer.callback(); },
    button(action) { return nodes[`mobile-nav-${action}`]; },
  };
}

function active(page) {
  return ['menu', 'casino', 'search', 'providers', 'wallet'].filter(action => page.button(action).dataset.active === 'true');
}

test('mobile actions reuse canonical destinations and preserve the originating dialog button', () => {
  const page = navPage();
  assert.equal(page.nodes['mobile-nav'].hidden, false);
  assert.equal(page.body.dataset.mobileNav, 'true');
  assert.deepEqual(active(page), ['casino']);

  page.button('menu').click();
  assert.equal(page.calls.at(-1).action, 'menu');
  assert.equal(page.calls.at(-1).options.returnFocusTo, page.button('menu'));
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(active(page), ['menu']);
  page.nodes['site-menu'].open = false;
  page.flush();

  page.button('search').click();
  assert.equal(page.calls.at(-1).action, 'search');
  assert.equal(page.calls.at(-1).options.returnFocusTo, page.button('search'));
  assert.deepEqual(active(page), ['search']);
  assert.equal(page.button('search').getAttribute('aria-expanded'), 'true');
  page.nodes['site-search'].open = false;
  page.flush();

  page.button('providers').click();
  assert.equal(page.calls.at(-1).action, 'providers');
  assert.equal(page.calls.at(-1).options.focusResults, true);
  assert.equal(page.button('providers').getAttribute('aria-current'), 'page');

  page.button('casino').click();
  assert.equal(page.calls.at(-1).action, 'all');
  assert.equal(page.button('casino').getAttribute('aria-current'), 'page');

  page.button('wallet').click();
  assert.equal(page.calls.at(-1).action, 'wallet');
  assert.deepEqual(active(page), ['wallet']);
  assert.equal(page.button('wallet').getAttribute('aria-expanded'), 'true');
});

test('desktop, game mode and every open dialog prevent hidden or overlapping actions', () => {
  for (const mode of ['desktop', 'game', 'site-menu', 'site-search', 'wallet-dialog']) {
    const page = navPage({ desktop: mode === 'desktop' });
    if (mode === 'game') page.body.dataset.view = 'game';
    else if (page.nodes[mode]) page.nodes[mode].open = true;
    for (const action of ['menu', 'casino', 'search', 'providers', 'wallet']) page.button(action).click();
    assert.equal(page.calls.length, 0, mode);
  }
  const page = navPage({ desktop: true });
  page.media.matches = false;
  page.media.emit('change');
  page.button('providers').click();
  assert.equal(page.calls.at(-1).action, 'providers', 'mobile actions resume after the breakpoint changes');
});

test('state follows navigation from other surfaces and distinguishes destinations from dialog actions', () => {
  const page = navPage();
  for (const category of ['popular', 'spooky', 'picks', 'slots']) {
    page.nodes['catalog-categories'].dataset.activeMenu = category;
    page.flush();
    assert.deepEqual(active(page), ['casino']);
    assert.equal(page.button('casino').getAttribute('aria-current'), 'page');
  }
  page.nodes['catalog-categories'].dataset.activeMenu = 'providers';
  page.flush();
  assert.deepEqual(active(page), ['providers']);
  assert.equal(page.button('providers').getAttribute('aria-current'), 'page');

  page.nodes['catalog-categories'].dataset.activeMenu = 'search';
  page.flush();
  assert.deepEqual(active(page), ['search']);
  assert.equal(page.button('search').getAttribute('aria-current'), null);
  assert.equal(page.button('search').getAttribute('aria-expanded'), 'false');
});

test('dialog state takes precedence and clears expanded/current attributes on dismissal', () => {
  const page = navPage();
  page.nodes['catalog-categories'].dataset.activeMenu = 'providers';
  page.nodes['wallet-dialog'].open = true;
  page.flush();
  assert.deepEqual(active(page), ['wallet']);
  assert.equal(page.button('providers').getAttribute('aria-current'), null);
  assert.equal(page.button('wallet').getAttribute('aria-expanded'), 'true');
  page.nodes['site-search'].open = true;
  page.flush();
  assert.deepEqual(active(page), ['search']);
  page.nodes['site-menu'].open = true;
  page.flush();
  assert.deepEqual(active(page), ['menu']);
  for (const id of ['site-menu', 'site-search', 'wallet-dialog']) page.nodes[id].open = false;
  page.flush();
  assert.deepEqual(active(page), ['providers']);
  for (const action of ['menu', 'search', 'wallet']) {
    assert.equal(page.button(action).getAttribute('aria-expanded'), 'false');
    assert.equal(page.button(action).getAttribute('aria-current'), null);
  }
});

test('initialization is idempotent, requires a complete shell and watches only relevant attributes', () => {
  const incomplete = navPage({ missing: 'mobile-nav-wallet' });
  assert.equal(incomplete.nodes['mobile-nav'].hidden, true);
  assert.equal(incomplete.observers.length, 0);

  const page = navPage();
  page.initialize();
  assert.equal(page.observers.length, 1);
  assert.equal(page.observations.length, 5);
  for (const observation of page.observations) {
    assert.equal(observation.options.attributes, true);
    assert.equal(observation.options.childList, undefined);
    assert.equal(observation.options.subtree, undefined);
    const expected = observation.target === page.body ? 'data-view'
      : observation.target === page.nodes['catalog-categories'] ? 'data-active-menu' : 'open';
    assert.equal(observation.options.attributeFilter.length, 1);
    assert.equal(observation.options.attributeFilter[0], expected);
  }
  page.button('providers').click();
  assert.equal(page.calls.length, 1, 'no duplicate click handlers are added');
});
