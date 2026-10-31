import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { FEATURE_PAGES, isFeaturePage } from '../public/feature-pages.js';
import { createMemberState, MEMBER_STORAGE_KEY, dailyStatus, claimDailyReward, claimTaskReward, recordGameVisit } from '../public/member-state.js';
import { formatRoute } from '../public/routes.js';

const source = (await readFile(new URL('../public/feature-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initFeatureView', 'function initFeatureView');

function memberPage(initialRoute, storage = new Map()) {
  let route = initialRoute, pageContext;
  const subscribers = [], navigations = [];
  class Node {
    constructor(tag = 'div') { this.tagName = tag; this.dataset = {}; this.children = []; this.listeners = new Map(); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    focus() {}
  }
  const ids = ['feature-view', 'feature-content', 'feature-header', 'feature-title', 'feature-description',
    'feature-status', 'feature-back', 'catalog-categories'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  const document = {
    body: new Node('body'), hidden: false,
    querySelector: selector => nodes[selector.slice(1)] || null,
    createElement(tag) { assert.notEqual(tag, 'iframe', 'member navigation cannot allocate a provider frame'); return new Node(tag); },
    dispatchEvent() {}, addEventListener() {},
  };
  const router = {
    getRoute: () => route,
    navigate(next, meta = {}) {
      route = next; navigations.push(next);
      subscribers.forEach(fn => fn(next, { source: 'navigate', ...meta }));
    },
    subscribe(fn) { subscribers.push(fn); },
    back() { throw new Error('The internal Back button must navigate to the lobby directly'); },
  };
  const context = {
    document, router, wallet: { setPreferences() {} }, FEATURE_PAGES, isFeaturePage,
    createMemberState, MEMBER_STORAGE_KEY, dailyStatus, claimDailyReward, claimTaskReward, recordGameVisit,
    createShelfIcon: () => new Node('svg'), formatRoute,
    GAMES: [{ id: 'alpha', title: 'Alpha', providerId: 'studio', providerName: 'Studio' }],
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type) { this.type = type; } },
    renderRewardsPage: () => null,
    renderAccountPage(pageId, ctx) { pageContext = ctx; return new Node(); },
  };
  const api = vm.runInNewContext(`${source}\ninitFeatureView({ router, wallet });`, context);
  return { api, router, storage, nodes, navigations, context: () => pageContext };
}

test('visible member Back controls return to the lobby after visiting another internal page', () => {
  for (const { id: pageId } of Object.values(FEATURE_PAGES).filter(page => page.showHeader && page.showBack)) {
    const page = memberPage({ type: 'feature', pageId: 'profile' });
    page.router.navigate({ type: 'feature', pageId });
    page.nodes['feature-back'].listeners.get('click')();
    assert.equal(page.navigations.at(-1).type, 'home', pageId);
    assert.equal(page.nodes['feature-view'].hidden, true);
  }
});

test('selected page headers are hidden while Notifications keeps its title without a Back button', () => {
  const page = memberPage({ type: 'feature', pageId: 'settings' });
  for (const pageId of ['invite-friends', 'affiliate-program', 'profile', 'history']) {
    page.router.navigate({ type: 'feature', pageId });
    assert.match(page.nodes['feature-header'].className, /visually-hidden/);
    assert.equal(page.nodes['feature-back'].hidden, true);
    assert.equal(page.nodes['feature-view'].hidden, false, 'the page content remains available');
  }
  page.router.navigate({ type: 'feature', pageId: 'notifications' });
  assert.equal(page.nodes['feature-header'].className, 'feature-header');
  assert.equal(page.nodes['feature-title'].textContent, 'Notifications');
  assert.equal(page.nodes['feature-back'].hidden, true);
  page.router.navigate({ type: 'feature', pageId: 'settings' });
  assert.equal(page.nodes['feature-back'].hidden, false, 'other pages restore their Back control');
});

test('shared favorites persist and notify across views while returned snapshots cannot mutate member state', () => {
  const page = memberPage({ type: 'game-details', gameId: 'alpha' });
  let changes = 0;
  const unsubscribe = page.api.member.subscribe(() => changes++);
  page.api.member.toggleFavorite('alpha');
  assert.deepEqual([...page.api.member.getState().favorites], ['alpha']);
  assert.deepEqual(JSON.parse(page.storage.get(MEMBER_STORAGE_KEY)).favorites, ['alpha']);
  assert.equal(changes, 1);
  const snapshot = page.api.member.getState();
  snapshot.favorites.length = 0;
  snapshot.profile.displayName = 'Unpersisted edit';
  assert.deepEqual([...page.api.member.getState().favorites], ['alpha']);
  assert.notEqual(page.api.member.getState().profile.displayName, snapshot.profile.displayName);
  page.api.member.toggleFavorite('removed');
  assert.equal(changes, 1, 'removed game IDs never enter saved favorites');
  unsubscribe();
  page.api.member.toggleFavorite('alpha');
  assert.equal(changes, 1);
  assert.deepEqual([...page.api.member.getState().favorites], []);
});

test('account links open the Favorites catalog and browsing details does not record game history', () => {
  const page = memberPage({ type: 'feature', pageId: 'profile' });
  const link = page.context().link('favorites', 'Favorites');
  assert.equal(link.href, '#/favorites');
  link.listeners.get('click')({ preventDefault() {} });
  assert.equal(page.navigations.at(-1).type, 'favorites');
  assert.equal(page.nodes['feature-view'].hidden, true);
  page.context().openGame('alpha');
  assert.equal(page.navigations.at(-1).type, 'game-details');
  assert.equal(page.navigations.at(-1).from, '#/favorites');
  assert.equal(page.api.member.getState().history.length, 0);
  assert.equal(page.api.member.getState().discoveredGameIds.length, 0);
  page.router.navigate({ type: 'game', gameId: 'alpha', from: '#/games/alpha?from=%23%2Ffavorites' });
  const state = page.api.member.getState();
  assert.equal(state.history.filter(entry => entry.type === 'game').length, 1);
  assert.equal(state.history[0].gameId, 'alpha');
  assert.deepEqual([...state.discoveredGameIds], ['alpha']);
  page.router.navigate({ type: 'game-details', gameId: 'alpha' });
  assert.equal(page.api.member.getState().history.filter(entry => entry.type === 'game').length, 1);
  const restored = memberPage({ type: 'game-details', gameId: 'alpha' }, page.storage);
  assert.equal(restored.api.member.getState().history[0].gameId, 'alpha');
  assert.equal(restored.nodes['feature-view'].hidden, true);
});
