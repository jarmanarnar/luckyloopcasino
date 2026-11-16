import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import * as wheelState from '../public/spin-wheel-state.js';
import { createDemoAccount, applyAccountCommand } from '../public/demo-account-state.js';

const source = (await readFile(new URL('../public/spin-wheel.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initSpinWheel', 'function initSpinWheel');

function wheelPage({ days = 0, pauseSpin, failSpin = false } = {}) {
  const elements = [], subscribers = [], routes = [];
  const document = { hidden: false, activeElement: null, addEventListener() {} };
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
    setAttribute(name, value) { this.attributes[name] = value; if (name === 'id') this.id = value; }
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
  const started = new Date();
  started.setHours(0, 0, 0, 0);
  started.setDate(started.getDate() - days);
  let saved = createDemoAccount({}, { now: started });
  saved.auth = { signedIn: true, registeredAt: started.toISOString() };
  const notify = () => subscribers.forEach(callback => callback());
  const account = {
    getSnapshot: () => saved,
    getMemberState: () => ({ settings: { reducedMotion: true } }),
    isSignedIn: () => saved.auth.signedIn,
    subscribe: callback => subscribers.push(callback),
    async spinWheel() {
      if (pauseSpin) await pauseSpin;
      if (failSpin) return { ok: false, reason: 'Could not save your spin.' };
      const outcome = applyAccountCommand(saved, { type: 'spin-wheel', index: 1 });
      saved = outcome.account; notify(); return outcome.result;
    },
  };
  const context = { ...wheelState, document, account, Intl, setTimeout, setInterval() {},
    cancelAnimationFrame() {}, window: { matchMedia: () => ({ matches: true }) },
    createUiIcon: () => new Element('svg'),
    auth: { require: callback => callback() }, router: { subscribe: callback => routes.push(callback) } };
  const api = vm.runInNewContext(`${source}\ninitSpinWheel({ account, auth, router });`, context);
  return { api, document, account, query: document.querySelector,
    navigate: () => routes.forEach(callback => callback()),
    logout() { saved.auth.signedIn = false; notify(); } };
}

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
  assert.equal(q('.rewards-popover__wheel').hidden, true);
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
