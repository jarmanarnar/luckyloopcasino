import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { formatBalance } from '../public/wallet-state.js';
import { redemptionAmount } from '../public/redeem-state.js';

const source = (await readFile(new URL('../public/redeem-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initRedeemView', 'function initRedeemView');

function redeemPage() {
  let focused;
  const nodes = {}, steps = new Map(), navigations = [], accountWrites = [], backCalls = [];
  class Node {
    constructor() { this.listeners = new Map(); this.attributes = new Map(); this.dataset = {}; this.open = false; this.hidden = false; this.isConnected = true; this.value = ''; }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    async fire(type, event = {}) { for (const fn of this.listeners.get(type) || []) await fn({ preventDefault() {}, ...event }); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelector(selector) { return nodes[selector]; }
    querySelectorAll(selector) { return selector === '[data-redeem-method]' ? methods : selector === '[data-redeem-balance]' ? balances : []; }
    focus() { focused = this; }
    showModal() { this.open = true; }
    close() { this.open = false; steps.delete(this); return this.fire('close'); }
    reset() { nodes['#redeem-amount'].value = ''; }
  }
  for (const selector of ['#redeem-dialog', '#redeem-methods', '#redeem-details', '#redeem-form', '#redeem-amount',
    '#redeem-error', '#redeem-status', '#redeem-receive', '#redeem-change', '#redeem-max', '#redeem-method-name',
    '.redeem-dialog__body', '.redeem-dialog__footer', '.dialog-close', '[data-redeem-method="bank"]', '[data-redeem-method="card"]']) nodes[selector] = new Node();
  const methods = ['bank', 'card'].map(method => {
    const button = nodes[`[data-redeem-method="${method}"]`];
    button.dataset.redeemMethod = method;
    return button;
  });
  const balances = [new Node(), new Node()], opener = new Node(), dialog = nodes['#redeem-dialog'];
  const snapshot = { wallet: { balances: { SC: 12500, GC: 50000 } }, ledger: [] };
  const account = {
    isSignedIn: () => true, subscribe() {}, getSnapshot: () => structuredClone(snapshot),
    requestRedemption(input) { accountWrites.push(input); },
    applyWalletTransaction(input) { accountWrites.push(input); },
  };
  const popupNavigation = {
    pushStep(target, step) { steps.set(target, step); },
    backStep(target, id) {
      backCalls.push(id);
      const step = steps.get(target);
      if (!step || step.id !== id) return false;
      steps.delete(target);
      step.onBack();
      return true;
    },
  };
  const router = { subscribe() {}, navigate(route) { navigations.push(route); } };
  const auth = { require(action) { return action(); } };
  const document = { activeElement: opener, querySelector: selector => selector === 'dialog[open]' ? dialog.open ? dialog : null : nodes[selector] };
  const context = { document, router, account, auth, popupNavigation, formatBalance, redemptionAmount };
  const api = vm.runInNewContext(`${source}\ninitRedeemView({router, account, auth, popupNavigation});`, context);
  return { api, nodes, steps, popupNavigation, backCalls, snapshot, accountWrites, navigations, opener, focused: () => focused };
}

test('browser Back from redemption details restores the chooser and retains the entered amount', async () => {
  const page = redeemPage(), n = page.nodes, dialog = n['#redeem-dialog'];
  page.api.open();
  await n['[data-redeem-method="bank"]'].fire('click');
  n['#redeem-amount'].value = '75.50';
  await n['#redeem-amount'].fire('input');
  dialog.scrollTop = 160;
  n['.redeem-dialog__body'].scrollTop = 160;
  assert.equal(page.popupNavigation.backStep(dialog, 'redeem-details'), true);
  assert.equal(dialog.open, true);
  assert.equal(n['#redeem-methods'].hidden, false);
  assert.equal(n['#redeem-details'].hidden, true);
  assert.equal(n['.redeem-dialog__footer'].hidden, true);
  assert.equal(n['#redeem-amount'].value, '75.50');
  assert.equal(page.focused(), n['[data-redeem-method="bank"]']);
  assert.equal(dialog.scrollTop, 0);
  assert.equal(n['.redeem-dialog__body'].scrollTop, 0);
  await n['[data-redeem-method="bank"]'].fire('click');
  assert.equal(n['.redeem-dialog__footer'].hidden, false);
  assert.equal(n['#redeem-amount'].value, '75.50');
  assert.equal(n['#redeem-receive'].textContent, '$75.50');
  assert.equal(page.focused(), n['#redeem-change'], 'opening details does not force the phone keyboard open');
  assert.deepEqual(page.accountWrites, []);
  assert.deepEqual(page.navigations, []);
});

test('Change method consumes the details step and keeps the draft across redemption methods', async () => {
  const page = redeemPage(), n = page.nodes;
  const originalAccount = structuredClone(page.snapshot);
  page.api.open();
  await n['[data-redeem-method="card"]'].fire('click');
  n['#redeem-amount'].value = '12.34';
  await n['#redeem-amount'].fire('input');
  await n['#redeem-change'].fire('click');
  assert.deepEqual(page.backCalls, ['redeem-details']);
  assert.equal(page.steps.size, 0);
  assert.equal(page.focused(), n['[data-redeem-method="card"]']);
  await n['[data-redeem-method="bank"]'].fire('click');
  assert.equal(n['#redeem-details'].dataset.method, 'bank');
  assert.equal(n['#redeem-amount'].value, '12.34');
  assert.equal(n['#redeem-receive'].textContent, '$12.34');
  await n['#redeem-form'].fire('submit');
  assert.equal(n['#redeem-status'].hidden, false);
  assert.match(n['#redeem-status'].textContent, /preview hasn't sent a request/);
  assert.deepEqual(page.snapshot, originalAccount);
  assert.deepEqual(page.accountWrites, []);
  assert.deepEqual(page.navigations, []);
});

test('closing the entire redemption dialog resets its draft and reopening starts with the chooser', async () => {
  const page = redeemPage(), n = page.nodes, dialog = n['#redeem-dialog'];
  page.api.open();
  await n['[data-redeem-method="bank"]'].fire('click');
  n['#redeem-amount'].value = '45';
  await n['#redeem-form'].fire('submit');
  // The header X is a native form[method="dialog"] submit and closes the whole dialog.
  await dialog.close();
  assert.equal(dialog.open, false);
  assert.equal(n['#redeem-amount'].value, '');
  assert.equal(n['#redeem-status'].hidden, true);
  assert.equal(page.steps.size, 0);
  assert.equal(page.focused(), page.opener);
  page.api.open();
  assert.equal(dialog.open, true);
  assert.equal(n['#redeem-methods'].hidden, false);
  assert.equal(n['#redeem-details'].hidden, true);
  assert.equal(n['#redeem-amount'].value, '');
  assert.equal(n['#redeem-receive'].textContent, '$0.00');
  assert.equal(page.focused(), n['.dialog-close']);
  assert.deepEqual(page.accountWrites, []);
  assert.deepEqual(page.navigations, []);
});
