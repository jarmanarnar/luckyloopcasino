import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { CURRENCIES, createWalletState, formatBalance, selectCurrency } from '../public/wallet-state.js';

const source = (await readFile(new URL('../public/wallet.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initWallet', 'function initWallet');

async function walletPage({ font = 16, width = 320, saved } = {}) {
  const events = {}, frames = [], observers = [], calls = [], storeCalls = [], storageWrites = [];
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
    getBoundingClientRect() { return { width: this.width, height: this.height }; },
  });
  const selectors = ['.top-bar', '.header-context', '#coin-wallet', '#coin-wallet > .wallet-balance-copy',
    '#wallet-balance-value', '#wallet-currency-label', '#coin-type-switch', '#currency-coin',
    '#wallet-add', '#wallet-add-art'];
  const nodes = Object.fromEntries(selectors.map(selector => [selector, node()]));
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
  const context = {
    CURRENCIES, createWalletState, formatBalance, selectCurrency,
    openStore: () => storeCalls.push('store'),
    createWalletCounter({ onFrame }) {
      let value = 0;
      return {
        immediate(next, formatter) { value = next; calls.push('finish'); onFrame(formatter(next), next); },
        cancel() { calls.push('cancel'); }, animateTo() { calls.push('animate'); },
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
  const controller = vm.runInNewContext(`${source}\ninitWallet({ openStore });`, context);
  await Promise.resolve();
  flush();
  return { controller, nodes, header, events, calls, topBar, observers, rootStyle, rootWrites, storeCalls, storageWrites, flush };
}

test('demo Gold Coin awards validate amounts before touching saved balances', async () => {
  const page = await walletPage({ saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  const before = page.calls.length;
  for (const amount of [0, -1, 1.5, NaN, Infinity, 7001, '1000', null, undefined]) {
    assert.equal(page.controller.creditGold(amount), false, `invalid award ${String(amount)}`);
  }
  assert.deepEqual(page.storageWrites, []);
  assert.equal(page.calls.length, before, 'rejected awards do not restart the counter');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '130,000');

  const full = await walletPage({ saved: { currency: 'GC', balances: { GC: 999999999, SC: 8500 } } });
  assert.equal(full.controller.creditGold(1), false, 'an award cannot exceed the balance limit');
  assert.deepEqual(full.storageWrites, []);
});

test('a valid local reward adds only Gold Coins and preserves the selected Sweeps balance', async () => {
  const page = await walletPage({ saved: { currency: 'SC', balances: { GC: 130000, SC: 8500 } } });
  assert.equal(page.controller.creditGold(1000), true);
  const saved = JSON.parse(page.storageWrites.at(-1).value);
  assert.deepEqual(saved, { currency: 'SC', balances: { GC: 131000, SC: 8500 } });
  assert.equal(page.nodes['#wallet-currency-label'].textContent, 'SC');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '85.00');
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Sweeps Coins balance: 85.00 SC');

  page.controller.setPreferences({ reducedMotion: true });
  page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '131,000', 'the reward is visible when switching to GC');
  assert.equal(page.controller.creditGold(7000), true, 'the largest supported demo award remains valid');
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '138,000');
});

test('private balances have a hidden accessible name and reduced-motion preferences stop currency animation', async () => {
  const page = await walletPage({ saved: { currency: 'GC', balances: { GC: 130000, SC: 8500 } } });
  page.controller.setPreferences({ hideBalance: true, reducedMotion: true });
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Gold Coins balance hidden');
  assert.equal(page.nodes['#coin-wallet > .wallet-balance-copy'].attributes['aria-hidden'], 'true');
  const before = page.calls.length;
  page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.calls.slice(before).includes('animate'), false);
  assert.equal(page.nodes['#wallet-balance-value'].textContent, '85.00');
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Sweeps Coins balance hidden');

  page.controller.setPreferences({ hideBalance: false, reducedMotion: false });
  assert.equal(page.nodes['#coin-wallet > .wallet-balance-copy'].attributes['aria-hidden'], 'false');
  assert.equal(page.nodes['#coin-wallet'].attributes['aria-label'], 'Sweeps Coins balance: 85.00 SC');
  const restored = page.calls.length;
  page.nodes['#coin-type-switch'].events.click();
  assert.ok(page.calls.slice(restored).includes('animate'), 'normal animation resumes when the preference is disabled');
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
  page.nodes['#coin-type-switch'].events.click();
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
      page.nodes['#coin-type-switch'].events.click();
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
  page.nodes['#coin-type-switch'].events.click();
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
