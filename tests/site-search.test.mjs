import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/site-search.js', import.meta.url), 'utf8'))
  .replace('export function initSiteSearch', 'function initSiteSearch');

function searchPage() {
  const calls = [], closeEvents = [], windowEvents = {};
  const document = { body: { dataset: { view: 'lobby' } }, activeElement: null };
  class Node {
    constructor() { this.listeners = new Map(); this.open = false; this.visible = true; this.value = ''; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, details = {}) {
      const event = { target: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...details };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
    focus() { if (this.visible) document.activeElement = this; }
    select() { this.selected = true; }
    getClientRects() { return this.visible ? [{}] : []; }
    getBoundingClientRect() { return { left: 20, right: 500, top: 20, bottom: 200 }; }
    showModal() { this.open = true; calls.push('search:open'); }
    close() { this.open = false; calls.push('search:close'); closeEvents.push(() => this.emit('close')); }
  }
  const ids = ['site-search', 'site-search-input', 'site-search-form', 'site-search-close',
    'menu-search', 'menu-toggle', 'wallet-dialog', 'catalog-results', 'back-to-lobby'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  document.querySelector = selector => selector === 'dialog[open]'
    ? ['site-search', 'wallet-dialog'].map(id => nodes[id]).find(node => node.open) || null
    : nodes[selector.slice(1)] || null;
  const controller = {
    searchGames(query) {
      assert.equal(nodes['site-search'].open, false, 'the search modal closes before results receive focus');
      calls.push({ search: query });
      nodes['catalog-results'].focus();
    },
  };
  const window = { addEventListener(type, listener) { windowEvents[type] = listener; } };
  const api = vm.runInNewContext(`${source}\ninitSiteSearch(controller);`, { document, controller, window });
  return { nodes, document, calls, api, windowEvents,
    flushClose() { while (closeEvents.length) closeEvents.shift()(); } };
}

test('search focuses and selects its input while respecting the active modal and game view', () => {
  const page = searchPage();
  page.nodes['wallet-dialog'].open = true;
  page.api.openSearch();
  assert.equal(page.nodes['site-search'].open, false);
  page.nodes['wallet-dialog'].open = false;
  page.document.body.dataset.view = 'game';
  page.api.openSearch();
  assert.equal(page.nodes['site-search'].open, false);

  page.document.body.dataset.view = 'lobby';
  page.nodes['site-search-input'].value = 'previous query';
  page.api.openSearch();
  page.api.openSearch();
  assert.equal(page.nodes['site-search'].open, true);
  assert.equal(page.document.activeElement, page.nodes['site-search-input']);
  assert.equal(page.nodes['site-search-input'].selected, true);
  assert.equal(page.calls.filter(call => call === 'search:open').length, 1);
});

test('search rejects an empty query and submits trimmed text without stealing focus back from results', () => {
  const page = searchPage();
  page.api.openSearch();
  page.nodes['site-search-input'].value = '   ';
  assert.equal(page.nodes['site-search-form'].emit('submit').defaultPrevented, true);
  assert.equal(page.nodes['site-search'].open, true);
  assert.equal(page.calls.some(call => typeof call === 'object'), false);

  page.nodes['site-search-input'].value = '  Dragon luck  ';
  page.nodes['site-search-form'].emit('submit');
  assert.deepEqual(page.calls.at(-1), { search: 'Dragon luck' });
  assert.equal(page.document.activeElement, page.nodes['catalog-results']);
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['catalog-results']);
});

test('dismissing search restores the visible search control or its menu fallback', () => {
  const page = searchPage();
  page.api.openSearch();
  page.nodes['site-search'].emit('click', { clientX: 100, clientY: 100 });
  assert.equal(page.nodes['site-search'].open, true);
  page.nodes['site-search'].emit('click', { clientX: 600, clientY: 100 });
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['menu-search']);

  page.api.openSearch();
  page.nodes['menu-search'].visible = false;
  page.nodes['site-search-close'].emit('click');
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['menu-toggle']);
});

test('history navigation into a game closes search and restores the visible game back control', () => {
  const page = searchPage();
  page.api.openSearch();
  page.document.body.dataset.view = 'game';
  page.nodes['menu-search'].visible = false;
  page.nodes['menu-toggle'].visible = false;
  page.windowEvents.hashchange();
  assert.equal(page.nodes['site-search'].open, false);
  page.flushClose();
  assert.equal(page.document.activeElement, page.nodes['back-to-lobby']);

  const closes = page.calls.filter(call => call === 'search:close').length;
  page.windowEvents.hashchange();
  page.flushClose();
  assert.equal(page.calls.filter(call => call === 'search:close').length, closes,
    'navigation must not close an already closed dialog');
});
