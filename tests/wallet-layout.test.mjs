import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { afterEach } from 'node:test';
import vm from 'node:vm';
import { CURRENCIES, createWalletState, formatBalance, selectCurrency } from '../public/wallet-state.js';
import { IDBFactory } from 'fake-indexeddb';
import { openDemoAccount } from '../public/demo-account.js';
import { createWalletCounter, resolveWalletFrame } from '../public/wallet-counter.js';

const accounts = [];
afterEach(() => { accounts.splice(0).forEach(account => account.close()); });

const source = (await readFile(new URL('../public/wallet.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initWallet', 'function initWallet');

async function walletPage({ font = 16, width = 320, saved, realCounter = false, balanceInSwitch = false, initialRoute = 'home' } = {}) {
  const events = {}, frames = [], observers = [], calls = [], storeCalls = [], storageWrites = [];
  const counterFrames = new Map();
  let counterTime = 0, counterFrameId = 0;
  const rootProperties = new Map();
  const rootWrites = [];
  const rootStyle = {
    setProperty: (key, value) => { rootWrites.push({ key, value }); rootProperties.set(key, value); },
    getPropertyValue: key => rootProperties.get(key) || '',
    removeProperty: key => { rootWrites.push({ key }); rootProperties.delete(key); },
  };
  const node = () => ({
    textContent: '', style: {}, dataset: {}, attributes: {}, events: {}, width: 0, height: 0,
    append() {}, focus() {}, dispatchEvent() {},
    addEventListener(key, callback) { this.events[key] = callback; },
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key] ?? null; },
    removeAttribute(key) { delete this.attributes[key]; },
    getBoundingClientRect() { return { width: this.width, height: this.height }; },
  });
  const selectors = ['.top-bar', '.header-context', '#coin-wallet', '#coin-wallet > .wallet-balance-copy',
    '#wallet-balance-value', '#wallet-currency-label', '#coin-type-switch', '#currency-coin',
    '#wallet-add', '#wallet-add-art', '#wallet-purchase-label'];
  const nodes = Object.fromEntries(selectors.map(selector => [selector, node()]));
  if (balanceInSwitch) nodes['#coin-type-switch > .wallet-balance-copy'] = nodes['#coin-wallet > .wallet-balance-copy'];
  const header = node();
  header.width = width - 1.5 * font;
  nodes['#coin-wallet'].parentElement = header;
  nodes['#wallet-add'].width = 2.5 * font;
  nodes['#coin-type-switch'].width = 4 * font;
  nodes['#wallet-currency-label'].width = 1.62 * font;
  const topBar = nodes['.top-bar'];
  topBar.height = 4.5 * font;
  const styleFor = element => {
    const style = { paddingLeft: '0px', paddingRight: '0px', borderLeftWidth: '0px',
      borderRightWidth: '0px', columnGap: '0px', fontFamily: 'Arial', fontSize: `${font}px`,
      fontWeight: '800', fontStyle: 'normal', fontStretch: '100%', fontVariantNumeric: 'tabular-nums',
      letterSpacing: '0px' };
    if (element === header) style.columnGap = `${font / 4}px`;
    if (element === nodes['#coin-wallet']) Object.assign(style, {
      paddingRight: `${font / 4}px`, borderLeftWidth: '1px', borderRightWidth: '1px',
    });
    if (element === nodes['#coin-wallet > .wallet-balance-copy']) Object.assign(style, {
      paddingLeft: `${font / 2}px`, paddingRight: `${font * .375}px`, columnGap: `${font / 4}px`,
    });
    return style;
  };
  const fonts = { ready: Promise.resolve(), addEventListener(key, callback) { events[key] = callback; } };
  const account = await openDemoAccount({ indexedDB: new IDBFactory(), scope: undefined,
    storage: { getItem: key => key === 'luckyloopcasino-demo-wallet-v1' && saved ? JSON.stringify(saved) : null } });
  accounts.push(account);
  await account.register({ email: 'wallet-test@example.test', password: 'WalletDemo37!', accepted: true });
  let route = { type: initialRoute };
  const routeListeners = [];
  const router = { getRoute: () => route, subscribe: listener => routeListeners.push(listener) };
  const context = {
    CURRENCIES, createWalletState, formatBalance, selectCurrency, account, resolveWalletFrame, router,
    openStore: () => storeCalls.push('store'),
    createWalletCounter(options) {
      if (realCounter) return createWalletCounter({ ...options, now: () => counterTime,
        requestFrame(callback) { counterFrames.set(++counterFrameId, callback); return counterFrameId; },
        cancelFrame(id) { counterFrames.delete(id); },
      });
      const { onFrame } = options;
      let value = 0;
      return {
        immediate(next, formatter) { value = next; calls.push('finish'); onFrame(formatter(next), next); },
        cancel() { calls.push('cancel'); },
        animateTo(next, formatter) { value = next; calls.push('animate'); onFrame(formatter(next), next); },
        get value() { return value; },
      };
    },
    document: {
      hidden: false, fonts, documentElement: { style: rootStyle },
      querySelector: selector => nodes[selector], querySelectorAll: () => [], addEventListener() {},
      createElement() {
        const measure = node();
        measure.getBoundingClientRect = () => ({ width: measure.textContent.length * font * .55 });
        return measure;
      },
    },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener(key, callback) { events[key] = callback; } },
    localStorage: { getItem: () => saved ? JSON.stringify(saved) : null, setItem(key, value) { storageWrites.push({ key, value }); } },
    getComputedStyle: styleFor,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame(id) { if (id !== null) frames[id - 1] = null; },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.nodes = []; observers.push(this); }
      observe(element) { this.nodes.push(element); }
    },
    CustomEvent: class {},
  };
  const flush = () => { while (frames.length) frames.shift()?.(); };
  const controller = vm.runInNewContext(`${source}\ninitWallet({ openStore, account, router });`, context);
  await Promise.resolve();
  flush();
  return { controller, account, nodes, header, events, calls, topBar, observers, rootStyle, rootWrites, storeCalls, storageWrites, flush,
    navigate(type) { route = { type }; routeListeners.forEach(listener => listener()); },
    frame(at) {
      counterTime = at;
      const callbacks = [...counterFrames.values()];
      counterFrames.clear();
      callbacks.forEach(callback => callback());
    },
    get pendingCounterFrames() { return counterFrames.size; },
  };
}

test('inside a game the wallet becomes Buy Coins, opens Store without changing currency or ledger, and restores the toggle on exit', async () => {
  for (const currency of ['GC', 'SC']) {
    const page = await walletPage({ balanceInSwitch: true, saved: { currency, balances: { GC: 130000, SC: 8500 } } });
    const before = page.account.getSnapshot();
    const button = page.nodes['#coin-type-switch'];
    page.navigate('game');
    assert.equal(button.attributes.role, 'button');
    assert.equal(button.attributes['aria-label'], 'Buy Coins');
    assert.equal(button.attributes['aria-checked'], undefined);
    assert.equal(page.nodes['#wallet-purchase-label'].hidden, false);
    assert.equal(page.nodes['#coin-type-switch > .wallet-balance-copy'].hidden, true);
    assert.equal(page.nodes['#currency-coin'].src, currency === 'GC' ? 'assets/coins/add-gold.svg' : 'assets/coins/add-sweeps.svg');
    await button.events.click();
    assert.deepEqual(page.storeCalls, ['store']);
    assert.deepEqual(page.account.getSnapshot().wallet, before.wallet);
    assert.deepEqual(page.account.getSnapshot().ledger, before.ledger);
    page.navigate('store');
    assert.equal(button.attributes.role, 'switch');
    assert.equal(button.attributes['aria-checked'], String(currency === 'SC'));
    assert.equal(page.nodes['#wallet-purchase-label'].hidden, true);
    assert.equal(page.nodes['#coin-type-switch > .wallet-balance-copy'].hidden, false);
    assert.equal(page.nodes['#currency-coin'].src, currency === 'GC' ? 'assets/coins/gold-coin.svg' : 'assets/coins/sweeps-coin.svg');
    await button.events.click();
    assert.notEqual(page.account.getSnapshot().wallet.currency, currency);
  }
});

test('a direct game entry and account settings updates retain the purchase action without exposing a balance', async () => {
  const page = await walletPage({ balanceInSwitch: true, initialRoute: 'game' });
  const button = page.nodes['#coin-type-switch'];
  assert.equal(button.attributes['aria-label'], 'Buy Coins');
  await page.account.saveSettings({ hideBalance: true, reducedMotion: true });
  assert.equal(button.attributes['aria-label'], 'Buy Coins');
  assert.equal(button.attributes.role, 'button');
  assert.equal(page.nodes['#coin-type-switch > .wallet-balance-copy'].hidden, true);
  assert.equal(page.nodes['#wallet-purchase-label'].hidden, false);
});

test('the balance inside the switch uses the same counter and changes mode without changing balances or the ledger', async () => {
  const page = await walletPage({ balanceInSwitch: true, realCounter: true,
    saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  const before = page.account.getSnapshot();
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '130,000');
  assert.equal(page.nodes['#coin-type-switch'].dataset.balanceMotion, 'false');
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#coin-type-switch'].attributes['aria-checked'], 'true');
  assert.equal(page.nodes['#wallet-currency-label'].textContent, 'SC');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '0.00');
  assert.equal(page.nodes['#coin-type-switch'].dataset.balanceMotion, 'true');
  page.frame(720);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '85.00');
  assert.match(page.nodes['#coin-type-switch'].attributes['aria-label'], /Sweeps Coins balance: 85.00 SC/);
  await page.nodes['#coin-type-switch'].events.click();
  page.frame(1440);
  assert.equal(page.nodes['#coin-type-switch'].attributes['aria-checked'], 'false');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '130,000');
  assert.deepEqual(page.account.getSnapshot().wallet.balances, before.wallet.balances);
  assert.deepEqual(page.account.getSnapshot().ledger, before.ledger);
});

test('balance-toggle presentation respects hidden balance and reduced-motion settings', async () => {
  const page = await walletPage({ balanceInSwitch: true, saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  await page.account.saveSettings({ hideBalance: true, reducedMotion: true });
  page.controller.setPreferences({ hideBalance: true, reducedMotion: true });
  assert.equal(page.nodes['#coin-type-switch > .wallet-balance-copy'].attributes['aria-hidden'], 'true');
  assert.match(page.nodes['#coin-type-switch'].attributes['aria-label'], /balance hidden/);
  assert.doesNotMatch(page.nodes['#coin-type-switch'].attributes['aria-label'], /130,000/);
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#coin-type-switch'].dataset.balanceMotion, 'false');
});

test('wallet UI cannot grant arbitrary credit or write a separate legacy balance', async () => {
  const page = await walletPage({ saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  assert.equal(page.controller.creditGold, undefined);
  assert.deepEqual(page.storageWrites, []);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '130,000');
});

test('a valid local reward adds only Gold Coins and preserves the selected Sweeps balance', async () => {
  const page = await walletPage({ saved: { currency: 'SC', balances: { GC: 130000, SC: 8500 } } });
  assert.equal((await page.account.claimDaily()).ok, true);
  const saved = page.account.getSnapshot().wallet;
  assert.deepEqual(saved, { currency: 'SC', balances: { GC: 131000, SC: 8500 } });
  assert.equal(page.nodes['#wallet-currency-label'].textContent, 'SC');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '85.00');
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Sweeps Coins balance: 85.00 SC');

  await page.account.saveSettings({ reducedMotion: true });
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '131,000', 'the reward is visible when switching to GC');
  assert.equal((await page.account.claimDaily()).ok, false);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '131,000');
});

test('private balances have a hidden accessible name and reduced-motion preferences stop currency animation', async () => {
  const page = await walletPage({ saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  await page.account.saveSettings({ hideBalance: true, reducedMotion: true });
  page.controller.setPreferences({ hideBalance: true, reducedMotion: true });
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Gold Coins balance hidden');
  assert.equal(page.nodes['#coin-wallet > .wallet-balance-copy'].attributes['aria-hidden'], 'true');
  const before = page.calls.length;
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.calls.slice(before).includes('animate'), false);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '85.00');
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Sweeps Coins balance hidden');

  await page.account.saveSettings({ hideBalance: false, reducedMotion: false });
  page.controller.setPreferences({ hideBalance: false, reducedMotion: false });
  assert.equal(page.nodes['#coin-wallet > .wallet-balance-copy'].attributes['aria-hidden'], 'false');
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Sweeps Coins balance: 85.00 SC');
  const restored = page.calls.length;
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.calls.slice(restored).includes('animate'), true, 'normal motion restores counting within the selected currency');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '130,000');
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '85.00');
});

test('currency changes count from zero to the selected balance without mixing currencies or changing the ledger', async () => {
  const page = await walletPage({ realCounter: true, saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  const before = page.account.getSnapshot();
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#wallet-currency-label'].textContent, 'SC');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '0.00');
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Sweeps Coins balance: 85.00 SC');
  assert.equal(page.pendingCounterFrames, 1);
  page.frame(180);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '49.14');
  page.frame(720);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '85.00');
  assert.equal(page.pendingCounterFrames, 0);
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#wallet-currency-label'].textContent, 'GC');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '0');
  page.frame(900);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '75,156');
  page.frame(1440);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '130,000');
  assert.deepEqual(page.account.getSnapshot().wallet.balances, before.wallet.balances);
  assert.deepEqual(page.account.getSnapshot().ledger, before.ledger);
});

test('rapid currency changes cancel the previous count and a zero balance settles without a pending frame', async () => {
  const page = await walletPage({ realCounter: true, saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  await page.nodes['#coin-type-switch'].events.click();
  page.frame(180);
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '0');
  page.frame(360);
  assert.equal(page.nodes['#wallet-currency-label'].textContent, 'GC');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '75,156');
  page.frame(900);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '130,000');
  assert.equal(page.pendingCounterFrames, 0);

  const empty = await walletPage({ realCounter: true, saved: { currency: 'GC', balances: { GC: 100, SC: 0 } } });
  await empty.nodes['#coin-type-switch'].events.click();
  assert.equal(empty.nodes['#wallet-balance-value'].textContent, '0.00');
  assert.equal(empty.pendingCounterFrames, 0);
});

test('header plus opens the Store page without requiring a wallet dialog or adding credit', async () => {
  const page = await walletPage({ saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  const balance = page.nodes['#wallet-balance-value'].textContent;
  const before = page.calls.length;
  assert.equal(page.nodes['#wallet-dialog'], undefined);
  assert.equal(page.nodes['#wallet-add-credit'], undefined);
  assert.equal(page.nodes['#wallet-add'].attributes['aria-label'], 'Open store');
  page.nodes['#wallet-add'].events.click();
  assert.deepEqual(page.storeCalls, ['store']);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, balance);
  assert.equal(page.calls.length, before, 'opening the Store does not restart the balance animation');
  assert.deepEqual(page.storageWrites, [], 'opening the Store must not grant coins or alter saved balances');
});

test('height-only viewport changes keep the balance counter running', async () => {
  const page = await walletPage();
  assert.equal(page.header.dataset.walletReflow, undefined);
  await page.nodes['#coin-type-switch'].events.click();
  const before = page.calls.length;
  page.topBar.height += 5;
  page.events.resize(); page.flush();
  assert.equal(page.calls.length, before);
  assert.equal(page.rootStyle.getPropertyValue('--top-bar-height'), '');
  assert.deepEqual(page.rootWrites, []);
  assert.ok(!page.observers[0].nodes.includes(page.nodes['#coin-wallet']));
  assert.ok(!page.observers[0].nodes.includes(page.topBar));
});

for (const width of [318, 320, 323, 360, 390]) {
  test(`actual GC and SC balances keep a single header layout at ${width}px`, async () => {
    for (const currency of ['GC', 'SC']) {
      const balances = { GC: 130000, SC: 8500 };
      const page = await walletPage({ width, saved: { currency, balances } });
      assert.equal(page.nodes['#wallet-balance-value'].textContent, formatBalance(currency, balances[currency]));
      assert.equal(page.header.dataset.walletReflow, undefined);
      const available = page.header.width - page.nodes['#coin-type-switch'].width - 8;
      assert.equal(parseFloat(page.nodes['#coin-wallet'].style.maxWidth), available);
      const transform = page.nodes['#coin-wallet'].style.transform;
      assert.match(transform, /^translateX\(clamp\(/);
      await page.nodes['#coin-type-switch'].events.click();
      assert.equal(page.nodes['#coin-wallet'].style.transform, transform);
      assert.equal(parseFloat(page.nodes['#coin-wallet'].style.maxWidth), available);
      assert.equal(page.header.dataset.walletReflow, undefined);
      assert.deepEqual(page.rootWrites, []);
    }
  });
}

test('maximum balances use the actual collision lane without changing header rows or height', async () => {
  const page = await walletPage({ saved: { currency: 'GC', balances: { GC: 999999999, SC: 999999999 } } });
  const wallet = page.nodes['#coin-wallet'];
  const available = page.header.width - page.nodes['#coin-type-switch'].width - 8;
  assert.equal(parseFloat(wallet.style.maxWidth), available);
  assert.ok(parseFloat(wallet.style.width) <= available);
  assert.equal(page.header.dataset.walletReflow, undefined);
  await page.nodes['#coin-type-switch'].events.click();
  assert.equal(parseFloat(wallet.style.maxWidth), available);
  assert.equal(page.header.dataset.walletReflow, undefined);
  assert.deepEqual(page.rootWrites, []);
});

test('leading header content updates collision bounds without changing header rows', async () => {
  const page = await walletPage();
  const leading = page.nodes['.header-context'];
  assert.ok(page.observers[0].nodes.includes(leading));
  const initial = parseFloat(page.nodes['#coin-wallet'].style.maxWidth);
  const previousTransform = page.nodes['#coin-wallet'].style.transform;
  leading.width = 44;
  page.observers[0].callback(); page.flush();
  assert.equal(parseFloat(page.nodes['#coin-wallet'].style.maxWidth), initial - 44);
  assert.notEqual(page.nodes['#coin-wallet'].style.transform, previousTransform);
  assert.equal(page.header.dataset.walletReflow, undefined);
  assert.deepEqual(page.rootWrites, []);
});

test('enlarged text keeps positive collision space and never requests a stacked header', async () => {
  const page = await walletPage({ font: 32 });
  assert.equal(page.header.dataset.walletReflow, undefined);
  assert.ok(parseFloat(page.nodes['#coin-wallet'].style.maxWidth) > 0);
  assert.deepEqual(page.rootWrites, []);
});

test('font loading remeasures balances even if CSS font declarations stay the same', async () => {
  const page = await walletPage();
  const before = page.calls.length;
  page.events.loadingdone(); page.flush();
  assert.equal(page.calls.length, before + 1);
});

test('startup explicitly finishes wallet layout before revealing the page', async () => {
  const page = await walletPage();
  const initial = parseFloat(page.nodes['#coin-wallet'].style.maxWidth);
  page.nodes['.header-context'].width = 44;
  page.observers[0].callback();
  const before = page.calls.length;
  page.controller.refreshLayout();
  assert.equal(parseFloat(page.nodes['#coin-wallet'].style.maxWidth), initial - 44);
  assert.equal(page.calls.length, before + 1);
  page.flush();
  assert.equal(page.calls.length, before + 1, 'a queued measurement must not change the wallet after reveal');
});
