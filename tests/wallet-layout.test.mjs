import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { CURRENCIES, createWalletState, formatBalance, selectCurrency, addDemoCredit } from '../public/wallet-state.js';

const source = (await readFile(new URL('../public/wallet.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initWallet', 'function initWallet');

async function walletPage({ font = 16, width = 320, saved } = {}) {
  const events = {}, frames = [], observers = [], calls = [];
  const rootProperties = new Map();
  const rootStyle = {
    setProperty: (key, value) => rootProperties.set(key, value),
    getPropertyValue: key => rootProperties.get(key) || '',
    removeProperty: key => rootProperties.delete(key),
  };
  const node = () => ({
    textContent: '', style: {}, dataset: {}, attributes: {}, events: {}, width: 0, height: 0,
    append() {}, focus() {}, dispatchEvent() {},
    addEventListener(key, callback) { this.events[key] = callback; },
    setAttribute(key, value) { this.attributes[key] = value; },
    getBoundingClientRect() { return { width: this.width, height: this.height }; },
  });
  const selectors = ['.top-bar', '#coin-wallet', '#wallet-dialog', '#coin-wallet > .wallet-balance-copy',
    '#wallet-balance-value', '#wallet-currency-label', '#coin-type-switch', '#currency-coin',
    '#wallet-add', '#wallet-add-art', '#wallet-add-credit', '#wallet-status', '#wallet-gc-total', '#wallet-sc-total'];
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
    CURRENCIES, createWalletState, formatBalance, selectCurrency, addDemoCredit,
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
    localStorage: { getItem: () => saved ? JSON.stringify(saved) : null, setItem() {} },
    getComputedStyle: styleFor,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.nodes = []; observers.push(this); }
      observe(element) { this.nodes.push(element); }
    },
    CustomEvent: class {},
  };
  const flush = () => { while (frames.length) frames.shift()(); };
  vm.runInNewContext(`${source}\ninitWallet();`, context);
  await Promise.resolve();
  flush();
  return { nodes, header, events, calls, topBar, observers, rootStyle, flush };
}

test('height-only viewport changes keep the balance counter running', async () => {
  const page = await walletPage();
  assert.equal(page.header.dataset.walletReflow, 'false');
  page.nodes['#coin-type-switch'].events.click();
  const before = page.calls.length;
  page.topBar.height += 5;
  page.events.resize(); page.flush();
  assert.equal(page.calls.length, before);
  assert.equal(page.rootStyle.getPropertyValue('--top-bar-height'), '');
  assert.ok(!page.observers[0].nodes.includes(page.nodes['#coin-wallet']));
});

test('large saved balances use full width without switching layout on currency changes', async () => {
  const page = await walletPage({ saved: { currency: 'SC', balances: { GC: 999999999, SC: 1500 } } });
  assert.equal(page.header.dataset.walletReflow, 'true');
  assert.equal(parseFloat(page.nodes['#coin-wallet'].style.maxWidth), page.header.width);
  page.nodes['#coin-type-switch'].events.click();
  assert.equal(page.header.dataset.walletReflow, 'true');
  page.header.width = 1200;
  page.events.resize(); page.flush();
  assert.equal(page.header.dataset.walletReflow, 'false');
  assert.equal(page.rootStyle.getPropertyValue('--top-bar-height'), '');
});

test('enlarged text reflows and physical height changes only update the sticky offset', async () => {
  const page = await walletPage({ font: 32 });
  assert.equal(page.header.dataset.walletReflow, 'true');
  assert.ok(parseFloat(page.nodes['#coin-wallet'].style.maxWidth) > 0);
  page.nodes['#coin-type-switch'].events.click();
  const before = page.calls.length;
  page.topBar.height = 256;
  page.observers[0].callback(); page.flush();
  assert.equal(page.rootStyle.getPropertyValue('--top-bar-height'), '256px');
  assert.equal(page.calls.length, before);
});

test('font loading remeasures balances even if CSS font declarations stay the same', async () => {
  const page = await walletPage();
  const before = page.calls.length;
  page.events.loadingdone(); page.flush();
  assert.equal(page.calls.length, before + 1);
});
