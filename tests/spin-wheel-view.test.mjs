import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import * as wheelState from '../public/spin-wheel-state.js';
import { createDemoAccount, applyAccountCommand } from '../public/demo-account-state.js';
import { createWalletCounter } from '../public/wallet-counter.js';
import { CURRENCIES, formatBalance } from '../public/wallet-state.js';
import { initWalletMenu } from '../public/wallet-menu.js';

const source = (await readFile(new URL('../public/spin-wheel.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initSpinWheel', 'function initSpinWheel');

function wheelPage({ days = 0, pauseSpin, failSpin = false, now = Date.now(), wallet,
  reducedMotion = true, hideBalance = false, prizeIndex = 1, signedIn = true } = {}) {
  const elements = [], subscribers = [], routes = [], intervals = [];
  const frames = new Map(), documentEvents = {};
  let nextFrame = 0;
  const requestFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  const cancelFrame = id => frames.delete(id);
  const document = { hidden: false, activeElement: null,
    addEventListener(name, callback) { documentEvents[name] = callback; } };
  const matches = (element, selector) => selector.startsWith('#') ? element.id === selector.slice(1)
    : selector.startsWith('.') ? element.className.split(' ').includes(selector.slice(1))
    : selector === 'dialog[open]' ? element.tagName === 'dialog' && element.open : element.tagName === selector;
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.className = ''; this.dataset = {}; this.attributes = {};
      this.listeners = {}; this.hidden = false; this.open = false; this.textContent = '';
      this.style = { setProperty() {} };
      this.classList = { add: name => { this.className += ` ${name}`; }, toggle() {} };
      elements.push(this);
    }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    after(child) {
      child.parentElement = this.parentElement;
      this.parentElement.children.splice(this.parentElement.children.indexOf(this) + 1, 0, child);
    }
    before(child) {
      child.parentElement = this.parentElement;
      this.parentElement.children.splice(this.parentElement.children.indexOf(this), 0, child);
    }
    setAttribute(name, value) { this.attributes[name] = value; if (name === 'id') this.id = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    querySelector(selector) {
      for (const child of this.children) {
        if (matches(child, selector)) return child;
        const found = child.querySelector(selector); if (found) return found;
      }
      return null;
    }
    focus() { document.activeElement = this; }
    closest() { return null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    showModal() { this.open = true; }
    close() { if (this.open) { this.open = false; queueMicrotask(() => this.listeners.close?.()); } }
    hidePopover() {}
    animate() { return { finished: Promise.resolve(), cancel() {} }; }
    click(event = {}) { if (!this.disabled) return this.listeners.click?.({ target: this, ...event }); }
  }
  document.body = new Element('body');
  document.querySelector = selector => elements.find(element => matches(element, selector)) ?? null;
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_, tag) => new Element(tag);
  for (const id of ['menu-content', 'menu-search', 'header-rewards', 'rewards-popover', 'mobile-nav-menu']) {
    const element = new Element('div'); element.id = id; document.body.append(element);
    if (id === 'rewards-popover') element.append(new Element('header'));
  }
  const started = new Date(now);
  started.setHours(0, 0, 0, 0);
  started.setDate(started.getDate() - days);
  let saved = createDemoAccount({ wallet, member: { settings: { reducedMotion, hideBalance } } }, { now: started });
  saved.auth = { signedIn, registeredAt: started.toISOString() };
  const notify = () => subscribers.forEach(callback => callback());
  const account = {
    getSnapshot: () => saved,
    getMemberState: () => saved.member,
    isSignedIn: () => saved.auth.signedIn,
    subscribe: callback => subscribers.push(callback),
    async saveSettings(patch) {
      const outcome = applyAccountCommand(saved, { type: 'settings', patch }, now);
      saved = outcome.account; notify(); return outcome.result;
    },
    async spinWheel() {
      if (pauseSpin) await pauseSpin;
      if (failSpin) return { ok: false, reason: 'Could not save your spin.' };
      const outcome = applyAccountCommand(saved, { type: 'spin-wheel', index: prizeIndex }, now);
      saved = outcome.account; notify(); return outcome.result;
    },
  };
  const context = { ...wheelState, document, account, Intl, setTimeout, CURRENCIES, formatBalance, initWalletMenu,
    createWalletCounter: options => createWalletCounter({ ...options, requestFrame, cancelFrame, now: () => now }),
    spinStatus: snapshot => wheelState.spinStatus(snapshot, now),
    setInterval: callback => intervals.push(callback),
    requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame,
    window: { matchMedia: () => ({ matches: false }) },
    createUiIcon: () => new Element('svg'),
    auth: { require: callback => callback() }, router: { subscribe: callback => routes.push(callback) } };
  const api = vm.runInNewContext(`${source}\ninitSpinWheel({ account, auth, router });`, context);
  return { api, document, account, query: document.querySelector,
    advance(milliseconds) {
      now += milliseconds; intervals.forEach(callback => callback());
      const pending = [...frames]; frames.clear(); pending.forEach(([, callback]) => callback(now));
    },
    get pendingFrames() { return frames.size; },
    settings(patch) { saved = applyAccountCommand(saved, { type: 'settings', patch }, now).account; notify(); },
    visibility(hidden) { document.hidden = hidden; documentEvents.visibilitychange(); },
    navigate: () => routes.forEach(callback => callback()),
    logout() { saved.auth.signedIn = false; notify(); },
    login() { saved.auth.signedIn = true; notify(); } };
}

test('guests cannot see the wheel launchers; sign-in restores them and sign-out hides them again', () => {
  const page = wheelPage({ signedIn: false, days: 2 }), q = page.query;
  assert.equal(q('#menu-spin-wheel').hidden, true);
  assert.equal(q('.rewards-popover__wheel').hidden, true);
  assert.equal(q('#rewards-spin-wheel').hidden, true);
  page.login();
  assert.equal(q('#menu-spin-wheel').hidden, false);
  assert.equal(q('.rewards-popover__wheel').hidden, false);
  assert.equal(q('#rewards-spin-wheel').hidden, false);
  page.logout();
  assert.equal(q('#menu-spin-wheel').hidden, true);
  assert.equal(q('.rewards-popover__wheel').hidden, true);
  assert.equal(q('#rewards-spin-wheel').hidden, true);
});

test('last-spin win is a separate popup; dismissal and reopening always show the wheel', async () => {
  const page = wheelPage(), q = page.query;
  page.api.openSpinWheel();
  assert.equal(q('.spin-launcher__badge').hidden, true);
  const nextAt = wheelState.spinStatus(page.account.getSnapshot()).nextAt;
  await q('#spin-wheel-start').click();
  assert.equal(q('#spin-wheel-dialog').open, true);
  assert.equal(q('.spin-wheel__play').hidden, false, 'the wheel stays mounted and visible behind the popup');
  assert.equal(q('#spin-win-dialog').open, true);
  assert.equal(q('#spin-win-amount').textContent, '3');
  assert.equal(q('#spin-win-currency').textContent, 'Super Coins');
  assert.equal(q('#spin-wheel-start').disabled, true);
  assert.equal(q('.spin-wheel__availability').textContent, 'No spins left');
  assert.equal(q('.spin-launcher__badge').hidden, false);
  assert.equal(q('.rewards-popover__wheel').hidden, false);
  assert.equal(q('#rewards-spin-wheel').hidden, true);
  assert.equal(q('#rewards-spin-waiting').hidden, false);
  const ledgerLength = page.account.getSnapshot().ledger.length;
  const result = q('#spin-win-dialog');
  await result.querySelector('.spin-wheel__spin').click();
  assert.equal(result.open, false);
  assert.equal(q('#spin-wheel-dialog').open, true);
  assert.equal(q('#spin-wheel-dialog').dataset.phase, 'wheel');
  assert.equal(page.document.activeElement, q('#spin-wheel-dialog').querySelector('.dialog-close'));
  assert.equal(wheelState.spinStatus(page.account.getSnapshot()).nextAt, nextAt);
  assert.equal(page.account.getSnapshot().ledger.length, ledgerLength, 'dismissing a result never grants it twice');
  q('#spin-wheel-dialog').close(); await Promise.resolve();
  page.api.openSpinWheel();
  assert.equal(result.open, false);
  assert.equal(q('.spin-wheel__play').hidden, false);
  assert.equal(q('.spin-wheel__availability').textContent, 'No spins left');
});

test('closing a reward returns to remaining spins without spending one', async () => {
  const page = wheelPage({ days: 2 }), q = page.query;
  page.api.openSpinWheel();
  await q('#spin-wheel-start').click();
  await q('.spin-win__close').click();
  assert.equal(q('.spin-wheel__availability').textContent, '2 spins left');
  assert.equal(page.document.activeElement, q('#spin-wheel-start'));
  assert.equal(q('.spin-launcher__badge').hidden, true);
  assert.equal(q('.rewards-popover__wheel').hidden, false);
  assert.equal(q('#rewards-spin-wheel').hidden, false);
  assert.equal(q('#rewards-spin-wheel').disabled, false);
  assert.equal(q('#rewards-spin-waiting').hidden, true);
  assert.equal(wheelState.spinStatus(page.account.getSnapshot()).spinsAvailable, 2);
  await q('#spin-wheel-start').click();
  assert.equal(wheelState.spinStatus(page.account.getSnapshot()).spinsAvailable, 1);
  assert.equal(q('#spin-win-dialog').open, true);
});

test('navigation and logout close both dialogs without reviving the wheel from a popup close event', async () => {
  for (const action of ['navigate', 'logout']) {
    const page = wheelPage(); page.api.openSpinWheel();
    await page.query('#spin-wheel-start').click();
    page[action](); await Promise.resolve();
    assert.equal(page.query('#spin-wheel-dialog').open, false);
    assert.equal(page.query('#spin-win-dialog').open, false);
    if (action === 'logout') assert.equal(page.query('.rewards-popover__wheel').hidden, true);
  }
});

test('closing while a spin is saving prevents a late result popup, even if the wheel is reopened', async () => {
  let release;
  const page = wheelPage({ pauseSpin: new Promise(resolve => { release = resolve; }) }), q = page.query;
  page.api.openSpinWheel();
  const pending = q('#spin-wheel-start').click();
  q('#spin-wheel-dialog').close(); await Promise.resolve();
  page.api.openSpinWheel();
  release(); await pending;
  assert.equal(q('#spin-wheel-dialog').open, true);
  assert.equal(q('#spin-win-dialog').open, false);
  assert.equal(q('.spin-wheel__availability').textContent, 'No spins left');
  assert.equal(page.account.getSnapshot().ledger.filter(item => item.source === 'spin-wheel').length, 1);
});

test('a failed spin leaves the wheel ready with its error and no celebration or cooldown badge', async () => {
  const page = wheelPage({ failSpin: true }), q = page.query;
  page.api.openSpinWheel(); await q('#spin-wheel-start').click();
  assert.equal(q('#spin-win-dialog').open, false);
  assert.equal(q('#spin-wheel-start').disabled, false);
  assert.equal(q('.spin-launcher__badge').hidden, true);
  assert.equal(q('.spin-wheel__message').textContent, 'Could not save your spin.');
});

test('the exhausted wheel counts down to midnight and becomes ready without reopening', async () => {
  const page = wheelPage({ now: +new Date(2026, 10, 16, 23, 59, 58) }), q = page.query;
  page.api.openSpinWheel();
  assert.equal(q('.spin-wheel__cooldown').hidden, true);
  await q('#spin-wheel-start').click();
  await q('.spin-win__close').click();
  assert.equal(q('.spin-wheel__actions').dataset.state, 'waiting');
  assert.equal(q('.spin-wheel__cooldown').hidden, false);
  assert.equal(q('#spin-wheel-next-time').textContent, '00:00:02');
  assert.equal(q('#spin-wheel-start').disabled, true);
  assert.equal(q('.rewards-popover__wheel').hidden, false);
  assert.equal(q('#rewards-spin-waiting').hidden, false);
  assert.equal(q('#rewards-spin-next-time').textContent, '00:00:00:02');
  assert.equal(q('#rewards-spin-wheel').hidden, true);
  assert.equal(q('#rewards-spin-wheel').disabled, true);
  page.advance(1000);
  assert.equal(q('#spin-wheel-next-time').textContent, '00:00:01');
  assert.equal(q('#rewards-spin-next-time').textContent, '00:00:00:01');
  page.advance(1000);
  assert.equal(q('.spin-wheel__actions').dataset.state, 'ready');
  assert.equal(q('.spin-wheel__cooldown').hidden, true);
  assert.equal(q('#spin-wheel-start').disabled, false);
  assert.equal(q('.spin-wheel__availability').textContent, '1 spin left');
  assert.equal(q('.rewards-popover__wheel').hidden, false);
  assert.equal(q('#rewards-spin-waiting').hidden, true);
  assert.equal(q('#rewards-spin-wheel').hidden, false);
  assert.equal(q('#rewards-spin-wheel').disabled, false);
  assert.equal(page.account.getSnapshot().ledger.filter(item => item.source === 'spin-wheel').length, 1);
});

test('a pending spin hides the next-spin countdown and a save failure restores the ready action', async () => {
  let release;
  const page = wheelPage({ pauseSpin: new Promise(resolve => { release = resolve; }), failSpin: true }), q = page.query;
  page.api.openSpinWheel();
  const pending = q('#spin-wheel-start').click();
  page.advance(1000);
  assert.equal(q('.spin-wheel__actions').dataset.state, 'spinning');
  assert.equal(q('.spin-wheel__cooldown').hidden, true);
  assert.equal(q('#spin-wheel-start').disabled, true);
  release(); await pending;
  assert.equal(q('.spin-wheel__actions').dataset.state, 'ready');
  assert.equal(q('.spin-wheel__cooldown').hidden, true);
  assert.equal(q('#spin-wheel-start').disabled, false);
  assert.equal(q('.spin-wheel__message').textContent, 'Could not save your spin.');
});

test('the reward wallet counts SC from the committed pre-spin balance without switching the selected wallet', async () => {
  const page = wheelPage({ reducedMotion: false, wallet: { currency: 'GC', balances: { GC: 4200, SC: 525 } } });
  const q = page.query;
  page.api.openSpinWheel(); await q('#spin-wheel-start').click();
  assert.equal(q('#spin-win-dialog').open, true);
  assert.equal(q('#spin-win-wallet-value').textContent, '5.25');
  assert.equal(page.account.getSnapshot().wallet.balances.SC, 825);
  assert.equal(page.account.getSnapshot().wallet.currency, 'GC');
  page.advance(650);
  assert.ok(Number(q('#spin-win-wallet-value').textContent) > 5.25);
  assert.ok(Number(q('#spin-win-wallet-value').textContent) < 8.25);
  page.advance(650);
  assert.equal(q('#spin-win-wallet-value').textContent, '8.25');
  assert.equal(q('.spin-win__wallet').attributes['aria-label'], 'Super Coins balance: 8.25. Choose currency');
  assert.equal(page.pendingFrames, 0);
});

test('reduced motion displays the final GC balance immediately with the right reward', async () => {
  const page = wheelPage({ prizeIndex: 0, wallet: { currency: 'SC', balances: { GC: 375000, SC: 525 } } });
  page.api.openSpinWheel(); await page.query('#spin-wheel-start').click();
  assert.equal(page.query('#spin-win-wallet-value').textContent, '475,000');
  assert.equal(page.account.getSnapshot().wallet.balances.SC, 525);
  assert.equal(page.pendingFrames, 0);
});

test('hiding the balance masks the reward wallet and stops its animation', async () => {
  const page = wheelPage({ reducedMotion: false });
  page.api.openSpinWheel(); await page.query('#spin-wheel-start').click();
  page.advance(200);
  page.settings({ hideBalance: true });
  assert.equal(page.query('#spin-win-wallet-value').textContent, '••••••');
  assert.equal(page.query('.spin-win__wallet').attributes['aria-label'], 'Super Coins balance hidden. Choose currency');
  assert.equal(page.pendingFrames, 0);
  page.settings({ hideBalance: false });
  assert.equal(page.query('#spin-win-wallet-value').textContent, formatBalance('SC', page.account.getSnapshot().wallet.balances.SC));
});

test('closing the reward cancels counting and backgrounding after close is safe', async () => {
  const page = wheelPage({ reducedMotion: false });
  page.api.openSpinWheel(); await page.query('#spin-wheel-start').click();
  assert.equal(page.pendingFrames, 1);
  const ledgerLength = page.account.getSnapshot().ledger.length;
  await page.query('.spin-win__close').click();
  assert.equal(page.pendingFrames, 0);
  page.visibility(true); page.advance(2000); page.visibility(false);
  assert.equal(page.query('#spin-win-dialog').open, false);
  assert.equal(page.account.getSnapshot().ledger.length, ledgerLength);
});

test('the win wallet menu displays both balances and switches its view without changing the main wallet or reward', async () => {
  const page = wheelPage({ wallet: { currency: 'GC', balances: { GC: 4200, SC: 525 } } }), q = page.query;
  page.api.openSpinWheel(); await q('#spin-wheel-start').click();
  const ledger = page.account.getSnapshot().ledger;
  await q('.spin-win__wallet').click();
  assert.equal(q('#spin-win-wallet-menu').hidden, false);
  assert.equal(q('.spin-win__wallet').attributes['aria-expanded'], 'true');
  assert.equal(q('#spin-win-wallet-select-GC').querySelector('.wallet-currency-amount').textContent, '4,200');
  assert.equal(q('#spin-win-wallet-select-SC').querySelector('.wallet-currency-amount').textContent, '8.25');
  await q('#spin-win-wallet-select-GC').click();
  assert.equal(q('#spin-win-wallet-value').textContent, '4,200');
  assert.equal(q('#spin-win-wallet-menu').hidden, true);
  await q('.spin-win__wallet').click();
  await q('#spin-win-wallet-select-SC').click();
  assert.equal(q('#spin-win-wallet-value').textContent, '8.25');
  assert.equal(page.account.getSnapshot().wallet.currency, 'GC');
  assert.equal(q('#spin-win-currency').textContent, 'Super Coins');
  assert.deepEqual(page.account.getSnapshot().ledger, ledger);
  await q('.spin-win__wallet').click();
  await q('.wallet-hide-balance').click();
  assert.equal(q('#spin-win-wallet-value').textContent, '••••••');
  assert.equal(q('#spin-win-wallet-select-SC').querySelector('.wallet-currency-amount').textContent, '••••••');
  await q('.spin-win__close').click();
  assert.equal(q('#spin-win-wallet-menu').hidden, true);
});
