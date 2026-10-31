import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { formatRoute, parseRoute } from '../public/routes.js';

const source = (await readFile(new URL('../public/game-details-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initGameDetails', 'function initGameDetails');

const games = [
  { id: 'alpha', title: 'Alpha', providerId: 'studio', providerName: 'Studio' },
  { id: 'beta', title: 'Beta', providerId: 'studio', providerName: 'Studio' },
  { id: 'gamma', title: 'Gamma', providerId: 'other', providerName: 'Other Studio' },
];

function detailsPage(initialRoute = { type: 'game-details', gameId: 'alpha', from: '#/popular' }) {
  let route = initialRoute, favorites = [];
  const created = [], subscriptions = [], memberSubscriptions = new Set(), navigations = [], backs = [];
  const document = { activeElement: null, title: '' };
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map();
      this.listeners = new Map(); this.hidden = false; this._text = '';
      this.classList = { add: value => { this.className = `${this.className || ''} ${value}`.trim(); } };
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    emit(type, properties = {}) {
      const event = { target: this, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
      for (const fn of this.listeners.get(type) || []) fn(event);
      return event;
    }
    focus() { document.activeElement = this; }
  }
  const root = new Node('main'), categories = new Node('nav');
  root.hidden = true;
  document.body = new Node('body');
  document.querySelector = selector => selector === '#game-details-view' ? root : selector === '#catalog-categories' ? categories : null;
  document.createElement = tag => {
    assert.notEqual(tag, 'iframe', 'browsing pre-game details must never start a provider session');
    const element = new Node(tag); created.push(element); return element;
  };
  document.createElementNS = (_, tag) => document.createElement(tag);
  document.createTextNode = text => { const node = new Node('#text'); node.textContent = text; return node; };
  const router = {
    getRoute: () => route,
    navigate(next, options = {}) {
      route = next; navigations.push({ route: next, options });
      subscriptions.forEach(fn => fn(next, { source: 'navigate', ...options }));
    },
    subscribe(fn) { subscriptions.push(fn); },
    back(fallback) { backs.push(fallback); },
  };
  const member = {
    getState: () => ({ favorites: [...favorites] }),
    toggleFavorite(id) { favorites = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id]; memberSubscriptions.forEach(fn => fn()); },
    subscribe(fn) { memberSubscriptions.add(fn); return () => memberSubscriptions.delete(fn); },
  };
  const context = {
    document, router, member, formatRoute, parseRoute, GAMES: games,
    PROVIDERS: [{ id: 'studio', name: 'Studio' }, { id: 'other', name: 'Other Studio' }],
    CATEGORIES: [{ id: 'all', title: 'All Games' }, { id: 'popular', title: 'Popular' }, { id: 'slots', title: 'Slots' }],
    LEGACY_CATEGORIES: [], GAME_TYPES: [{ id: 'slots', title: 'Slots' }],
    getGameTypeId: () => 'slots', getGameCategoryIds: () => ['all', 'popular', 'slots'],
    getGameReleaseDate: game => game.id === 'beta' ? '2026-01-15' : null,
    createShelfIcon: () => document.createElement('svg'),
    fetch() { throw Error('Pre-game details cannot load provider resources'); },
  };
  const api = vm.runInNewContext(`${source}\ninitGameDetails({ router, member });`, context);
  const descendants = (element = root) => [element, ...element.children.flatMap(child => descendants(child))];
  const byText = (tag, text) => descendants().find(node => node.tagName === tag && node.textContent === text);
  const byRole = (role, label) => descendants().find(node => node.getAttribute('role') === role && node.textContent === label);
  return { api, root, categories, document, created, router, member, navigations, backs,
    descendants, byText, byRole,
    byId: id => descendants().find(node => node.id === id),
    get route() { return route; },
  };
}

test('pre-game details show actual catalog fields without loading a game or inventing unavailable metrics', () => {
  const page = detailsPage();
  assert.equal(page.root.hidden, false);
  assert.equal(page.byText('h1', 'Alpha').textContent, 'Alpha');
  assert.ok(page.byText('a', 'Studio'));
  assert.ok(page.byText('a', 'Slots'));
  assert.ok(page.byText('a', 'Popular'));
  assert.equal(page.document.body.dataset.page, 'game-details');
  assert.equal(page.categories.dataset.activeMenu, '', 'a game details page must not falsely select All Games');
  assert.equal(page.navigations.length, 0);
  assert.equal(page.created.some(node => node.tagName === 'iframe'), false);
  assert.equal(page.descendants().some(node => node.tagName === 'dt' && /RTP|Volatility|Max Win|Release date/i.test(node.textContent)), false);
  page.router.navigate({ type: 'game-details', gameId: 'beta' });
  assert.ok(page.byText('dt', 'Release date'));
  assert.equal(page.descendants().find(node => node.tagName === 'time').dateTime, '2026-01-15');
});

test('Play demo explicitly launches the game and points Back to its pre-game page', () => {
  const page = detailsPage();
  const detailsRoute = page.route;
  page.byText('button', 'Play demo').emit('click');
  assert.equal(page.route.type, 'game');
  assert.equal(page.route.gameId, 'alpha');
  assert.equal(page.route.from, formatRoute(detailsRoute));
  assert.equal(page.root.hidden, true);
  page.router.navigate(detailsRoute, { source: 'history', focus: false });
  assert.equal(page.root.hidden, false);
  assert.ok(page.byText('h1', 'Alpha'));
});

test('provider and collection links navigate to independent pages and Back preserves the originating page', () => {
  const page = detailsPage();
  page.byText('button', 'Back').emit('click');
  assert.equal(page.backs.at(-1).type, 'category');
  assert.equal(page.backs.at(-1).categoryId, 'popular');
  const provider = page.byText('a', 'Studio');
  assert.equal(provider.href, '#/providers/studio');
  const modified = provider.emit('click', { ctrlKey: true });
  assert.equal(modified.defaultPrevented, false);
  assert.equal(page.navigations.length, 0, 'modified clicks retain native link behavior');
  const click = provider.emit('click');
  assert.equal(click.defaultPrevented, true);
  assert.equal(page.route.type, 'provider');
  assert.equal(page.route.providerId, 'studio');
  assert.equal(page.root.hidden, true);
});

test('favorite controls share member state and reflect changes made elsewhere without rerendering the page', () => {
  const page = detailsPage();
  const favorite = page.descendants().find(node => node.getAttribute('aria-label') === 'Save Alpha to favorites');
  assert.equal(favorite.getAttribute('aria-pressed'), 'false');
  favorite.emit('click');
  assert.deepEqual(page.member.getState().favorites, ['alpha']);
  assert.equal(favorite.getAttribute('aria-pressed'), 'true');
  assert.equal(favorite.getAttribute('aria-label'), 'Remove Alpha from favorites');
  page.member.toggleFavorite('alpha');
  assert.equal(favorite.getAttribute('aria-pressed'), 'false');
  assert.equal(favorite.textContent, 'Favorite');
});

test('information and description use one keyboard-operable selected tab and matching visible panel', () => {
  const page = detailsPage();
  const information = page.byRole('tab', 'Information'), description = page.byRole('tab', 'Description');
  assert.equal(information.getAttribute('aria-selected'), 'true');
  assert.equal(description.tabIndex, -1);
  const key = information.emit('keydown', { key: 'ArrowRight' });
  assert.equal(key.defaultPrevented, true);
  assert.equal(page.document.activeElement, description);
  assert.equal(description.getAttribute('aria-selected'), 'true');
  assert.equal(information.tabIndex, -1);
  assert.equal(page.byId(information.getAttribute('aria-controls')).hidden, true);
  assert.equal(page.byId(description.getAttribute('aria-controls')).hidden, false);
  description.emit('keydown', { key: 'Home' });
  assert.equal(page.document.activeElement, information);
  assert.equal(information.getAttribute('aria-selected'), 'true');
});

test('related games retain the originating collection and removed game links cannot start a session', () => {
  const page = detailsPage();
  const related = page.descendants().find(node => node.dataset.game === 'beta');
  related.emit('click');
  assert.equal(page.route.type, 'game-details');
  assert.equal(page.route.gameId, 'beta');
  assert.equal(page.route.from, '#/popular');
  assert.ok(page.byText('h1', 'Beta'));
  assert.equal(page.descendants().some(node => node.dataset.game === 'gamma'), false, 'related games stay within the provider');
  page.router.navigate({ type: 'game-details', gameId: 'removed' });
  assert.equal(page.route.type, 'home');
  assert.equal(page.navigations.at(-1).options.replace, true);
  assert.equal(page.root.hidden, true);
  assert.equal(page.created.some(node => node.tagName === 'iframe'), false);
});
