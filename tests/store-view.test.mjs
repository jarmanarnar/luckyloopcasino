import { requestDialogClose } from '../public/dialog-motion.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import * as packages from '../public/store-packages.js';

const source = (await readFile(new URL('../public/store-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
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
  const context = { requestDialogClose,
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

test('Package rows expose full accessible amounts, real discounts and no empty free bonus', () => {
  class Node {
    constructor(tagName) { this.tagName = tagName; this.children = []; this.dataset = {}; this.attributes = new Map(); }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes.set(name, value); }
  }
  const list = new Node('ul');
  vm.runInNewContext(`${source}\nrenderPackages(list, 'h3');`, {
    ...packages, list, document: { createElement: tag => new Node(tag) },
  });
  assert.equal(list.children.length, 16);
  for (const row of list.children) {
    const entry = packages.getStorePackage(row.dataset.packageId);
    const bonus = row.children.find(child => child.className === 'store-package__bonus');
    assert.equal(Boolean(bonus), entry.sweepsCoins > 0);
    if (bonus) {
      assert.equal(bonus.children.find(child => child.tagName === 'strong').textContent, packages.formatPackageCoins(entry.sweepsCoins));
      assert.equal(bonus.children.find(child => child.className === 'store-package__free').textContent, 'free');
    }
    const purchase = row.children.find(child => child.className === 'store-package__purchase');
    const oldPrice = purchase.children.find(child => child.tagName === 's');
    assert.equal(Boolean(oldPrice), Boolean(entry.originalPriceCents));
    const price = purchase.children.find(child => child.tagName === 'button');
    assert.equal(price.dataset.package, entry.id);
    assert.equal(price.attributes.get('aria-controls'), 'phone-verification-dialog');
    assert.match(price.attributes.get('aria-label'), /Gold Coins/);
    assert.equal(price.attributes.get('aria-label').includes('Super Coins'), entry.sweepsCoins > 0);
  }
});

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
