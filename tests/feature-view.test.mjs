import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { afterEach } from 'node:test';
import vm from 'node:vm';
import { FEATURE_PAGES, isFeaturePage } from '../public/feature-pages.js';
import { createMemberState, MEMBER_STORAGE_KEY } from '../public/member-state.js';
import { formatRoute } from '../public/routes.js';
import { IDBFactory } from 'fake-indexeddb';
import { openDemoAccount } from '../public/demo-account.js';

const databases = new WeakMap(), accounts = [];
afterEach(() => accounts.splice(0).forEach(account => account.close()));

const source = (await readFile(new URL('../public/feature-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initFeatureView', 'function initFeatureView');

async function memberPage(initialRoute, storage = new Map()) {
  let route = initialRoute, pageContext;
  const subscribers = [], navigations = [], profileOpens = [], dialogOpens = [], authOpens = [];
  class Node {
    constructor(tag = 'div') { this.tagName = tag; this.dataset = {}; this.children = []; this.listeners = new Map(); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    focus() {}
  }
  const ids = ['feature-view', 'feature-content', 'feature-header', 'feature-title', 'feature-description',
    'feature-status', 'catalog-categories'];
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
  };
  if (!databases.has(storage)) databases.set(storage, new IDBFactory());
  const account = await openDemoAccount({ indexedDB: databases.get(storage), scope: undefined,
    storage: { getItem: key => storage.get(key) ?? null }, catalogIds: ['alpha'] });
  accounts.push(account);
  if (!account.isSignedIn()) await account.register({ email: 'feature-test@example.test', password: 'FeatureDemo37!', accepted: true });
  const context = {
    document, router, account, structuredClone, wallet: { setPreferences() {} }, FEATURE_PAGES, isFeaturePage,
    openProfile: options => profileOpens.push(options),
    openRedeem: () => dialogOpens.push('redeem'),
    openNotifications: () => dialogOpens.push('notifications'),
    auth: { open: mode => authOpens.push(mode) },
    createMemberState, MEMBER_STORAGE_KEY,
    createShelfIcon: () => new Node('svg'), formatRoute,
    GAMES: [{ id: 'alpha', title: 'Alpha', providerId: 'studio', providerName: 'Studio' }],
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type) { this.type = type; } },
    renderRewardsPage: () => null,
    renderAccountPage(pageId, ctx) { pageContext = ctx; return new Node(); },
  };
  const api = vm.runInNewContext(`${source}\ninitFeatureView({ router, wallet, account, auth, openProfile, openRedeem, openNotifications });`, context);
  await account.refresh();
  return { api, account, router, storage, nodes, navigations, profileOpens, dialogOpens, authOpens, context: () => pageContext };
}

test('demo deletion opens registration only after persistence succeeds and keeps failures inline', async () => {
  const page = await memberPage({ type: 'feature', pageId: 'settings' });
  const playerId = page.account.getSnapshot().playerId;
  const remove = page.account.deleteAccount;
  page.account.deleteAccount = async () => { throw new Error('Persistence unavailable'); };
  const failed = await page.context().deleteDemoAccount(playerId);
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /could not be deleted/);
  assert.equal(page.account.isSignedIn(), true);
  assert.equal(page.router.getRoute().pageId, 'settings');
  assert.equal(page.nodes['feature-status'].textContent, '', 'a global notice must not cover the retry button');
  assert.deepEqual(page.authOpens, []);
  page.account.deleteAccount = remove;
  assert.equal((await page.context().deleteDemoAccount(playerId)).ok, true);
  assert.equal(page.account.isSignedIn(), false);
  assert.equal(page.router.getRoute().type, 'home');
  assert.deepEqual(page.authOpens, ['register']);
});

test('member pages render and remain navigable without a page Back control', async () => {
  for (const { id: pageId } of Object.values(FEATURE_PAGES).filter(page => page.showHeader)) {
    const page = await memberPage({ type: 'feature', pageId: 'profile' });
    page.router.navigate({ type: 'feature', pageId });
    assert.equal(page.nodes['feature-view'].hidden, false, pageId);
    assert.equal(page.nodes['feature-title'].textContent, FEATURE_PAGES[pageId].title);
    page.router.navigate({ type: 'home' });
    assert.equal(page.navigations.at(-1).type, 'home', pageId);
    assert.equal(page.nodes['feature-view'].hidden, true);
  }
});

test('selected page headers are hidden while Settings keeps its title', async () => {
  const page = await memberPage({ type: 'feature', pageId: 'settings' });
  for (const pageId of ['history', 'achievements']) {
    page.router.navigate({ type: 'feature', pageId });
    assert.match(page.nodes['feature-header'].className, /visually-hidden/);
    assert.equal(page.nodes['feature-view'].hidden, false, 'the page content remains available');
  }
  page.router.navigate({ type: 'feature', pageId: 'settings' });
  assert.equal(page.nodes['feature-header'].className, 'feature-header');
  assert.equal(page.nodes['feature-title'].textContent, 'Settings');
});

test('notifications and redeem shortcuts still open dialogs without navigating to removed pages', async () => {
  const page = await memberPage({ type: 'home' });
  page.api.openFeature('notifications');
  page.api.openFeature('redeem');
  page.api.openFeature('coinback');
  assert.deepEqual(page.dialogOpens, ['notifications', 'redeem']);
  assert.deepEqual(page.navigations, []);
  assert.equal(page.nodes['feature-view'].hidden, true);
});

test('shared favorites persist and notify across views while returned snapshots cannot mutate member state', async () => {
  const page = await memberPage({ type: 'game-details', gameId: 'alpha' });
  let changes = 0;
  const unsubscribe = page.api.member.subscribe(() => changes++);
  await page.api.member.toggleFavorite('alpha');
  assert.deepEqual([...page.api.member.getState().favorites], ['alpha']);
  assert.deepEqual(page.account.getSnapshot().member.favorites, ['alpha']);
  assert.equal(changes, 1);
  const snapshot = page.api.member.getState();
  snapshot.favorites.length = 0;
  snapshot.profile.displayName = 'Unpersisted edit';
  assert.deepEqual([...page.api.member.getState().favorites], ['alpha']);
  assert.notEqual(page.api.member.getState().profile.displayName, snapshot.profile.displayName);
  await page.api.member.toggleFavorite('removed');
  assert.equal(changes, 1, 'removed game IDs never enter saved favorites');
  unsubscribe();
  await page.api.member.toggleFavorite('alpha');
  assert.equal(changes, 1);
  assert.deepEqual([...page.api.member.getState().favorites], []);
});

test('account links open the Favorites catalog and browsing details does not record game history', async () => {
  const page = await memberPage({ type: 'feature', pageId: 'settings' });
  const link = page.context().link('favorites', 'Favorites');
  assert.equal(link.href, '#/favorites');
  link.listeners.get('click')({ preventDefault() {} });
  assert.equal(page.navigations.at(-1).type, 'favorites');
  assert.equal(page.nodes['feature-view'].hidden, true);
  page.context().openGame('alpha');
  assert.equal(page.navigations.at(-1).type, 'game-details');
  assert.equal(page.navigations.at(-1).from, '#/favorites');
  assert.equal(page.api.member.getState().history.filter(entry => entry.type === 'game').length, 0);
  assert.equal(page.api.member.getState().discoveredGameIds.length, 0);
  page.router.navigate({ type: 'game', gameId: 'alpha', from: '#/games/alpha?from=%23%2Ffavorites' });
  await page.account.refresh();
  assert.equal(page.api.member.getState().history.filter(entry => entry.type === 'game').length, 0, 'navigation alone does not open a playable game');
  await page.account.recordGameVisit({ id: 'alpha', title: 'Alpha', providerName: 'Studio' });
  const state = page.api.member.getState();
  assert.equal(state.history.filter(entry => entry.type === 'game').length, 1);
  assert.equal(state.history.find(entry => entry.type === 'game').gameId, 'alpha');
  assert.deepEqual([...state.discoveredGameIds], ['alpha']);
  page.router.navigate({ type: 'game-details', gameId: 'alpha' });
  assert.equal(page.api.member.getState().history.filter(entry => entry.type === 'game').length, 1);
  const restored = await memberPage({ type: 'game-details', gameId: 'alpha' }, page.storage);
  assert.equal(restored.api.member.getState().history.find(entry => entry.type === 'game').gameId, 'alpha');
  assert.equal(restored.nodes['feature-view'].hidden, true);
});

test('old profile URLs open the dialog over the lobby without mounting a profile page', async () => {
  const page = await memberPage({ type: 'feature', pageId: 'profile' });
  assert.equal(page.router.getRoute().type, 'home');
  assert.equal(page.nodes['feature-view'].hidden, true);
  assert.equal(page.context(), undefined);
  assert.equal(page.profileOpens.length, 1);
});

test('profile task links edit inside the dialog and keep the current page', async () => {
  const page = await memberPage({ type: 'feature', pageId: 'achievements' });
  const link = page.context().link('profile', 'Edit profile');
  link.listeners.get('click')({ preventDefault() {} });
  assert.equal(page.profileOpens.at(-1).edit, true);
  assert.equal(page.router.getRoute().pageId, 'achievements');
  assert.equal(page.navigations.length, 0);
  page.api.openFeature('profile');
  assert.equal(page.profileOpens.length, 2);
  assert.equal(page.navigations.length, 0);
});
