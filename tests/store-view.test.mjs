import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/store-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/, '')
  .replace('export function initStoreView', 'function initStoreView');

function storePage({ desktop = false, signedIn = true } = {}) {
  const navigation = [], pending = [], subscribers = [];
  class Node {
    constructor(id) { this.id = id; this.open = false; this.attributes = new Map(); }
    addEventListener() {}
    setAttribute(name, value) { this.attributes.set(name, value); }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const nodes = Object.fromEntries(['store-view', 'store-packages', 'store-dialog', 'store-dialog-packages',
    'menu-buy', 'wallet-add', 'mobile-nav-store', 'other-dialog'].map(id => [id, new Node(id)]));
  const entries = ['menu-buy', 'wallet-add', 'mobile-nav-store'].map(id => nodes[id]);
  const route = { type: 'provider', providerId: 'netent' };
  const router = {
    getRoute: () => route,
    subscribe() {},
    navigate(next) { navigation.push(next); },
  };
  const account = { isSignedIn: () => signedIn, subscribe(fn) { subscribers.push(fn); } };
  const auth = { require(action) { if (signedIn) action(); else pending.push(action); } };
  const context = {
    STORE_PACKAGES: [], router, account, auth,
    document: {
      body: { dataset: {} },
      querySelector(selector) {
        if (selector === 'dialog[open]') return [nodes['store-dialog'], nodes['other-dialog']].find(node => node.open);
        return nodes[selector.slice(1)];
      },
      querySelectorAll: () => entries,
    },
    window: { matchMedia: () => ({ matches: desktop, addEventListener() {} }) },
  };
  vm.runInNewContext(`${source}\nthis.store = initStoreView({router, account, auth, verifyPhone() {}});`, context);
  return { nodes, entries, navigation, store: context.store,
    login() { signedIn = true; while (pending.length) pending.shift()(); },
  };
}

for (const desktop of [false, true]) {
  const size = desktop ? 'desktop' : 'mobile';
  test(`${size} Store opens the shared popup without navigating away from the current page`, () => {
    const page = storePage({ desktop });
    page.store.openStore();
    assert.equal(page.nodes['store-dialog'].open, true);
    assert.equal(page.nodes['store-view'].hidden, true);
    assert.deepEqual(page.navigation, []);
    for (const entry of page.entries) {
      assert.equal(entry.attributes.get('aria-controls'), 'store-dialog');
      assert.equal(entry.attributes.get('aria-haspopup'), 'dialog');
    }
    page.nodes['store-dialog'].close();
    assert.deepEqual(page.navigation, [], 'dismissal preserves the underlying route and history');
  });

  test(`${size} Store waits for login and does not open over another dialog`, () => {
    const page = storePage({ desktop, signedIn: false });
    page.store.openStore();
    assert.equal(page.nodes['store-dialog'].open, false);
    assert.deepEqual(page.navigation, []);
    page.login();
    assert.equal(page.nodes['store-dialog'].open, true);
    page.nodes['store-dialog'].close();
    page.nodes['other-dialog'].open = true;
    page.store.openStore();
    assert.equal(page.nodes['store-dialog'].open, false);
    assert.deepEqual(page.navigation, []);
  });
}
