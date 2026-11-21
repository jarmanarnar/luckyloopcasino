import { requestDialogClose } from '../public/dialog-motion.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createAuthRouter, requiresAccount } from '../public/auth-routing.js';

const source = (await readFile(new URL('../public/auth-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initAuthView', 'function initAuthView');

function authPage() {
  let focused, signedIn = false;
  const nodes = {}, dialogs = [], writes = [], steps = new Map();
  class Node {
    constructor() { this.listeners = new Map(); this.attributes = new Map(); this.dataset = {}; this.open = false; this.hidden = false; this.isConnected = true; this.value = ''; }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    async fire(type, event = {}) { for (const fn of this.listeners.get(type) || []) await fn({ preventDefault() {}, ...event }); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    querySelector(selector) { return nodes[selector]; }
    focus() { focused = this; }
    showModal() { this.open = true; }
    close() { this.open = false; steps.delete(this); }
    reportValidity() { return true; }
    reset() { nodes['#auth-email'].value = ''; nodes['#auth-password'].value = ''; }
  }
  for (const selector of ['#auth-dialog', '#auth-form', '#auth-email', '#auth-password', '#auth-accepted', '#auth-submit',
    '#auth-feedback', '#auth-register-fields', '#auth-forgot', '#auth-recovery', '#auth-recovery-back', '#auth-resume-demo',
    '#auth-password-toggle', '#auth-tab-login', '#auth-tab-register', '#auth-title', '#auth-panel', '#auth-close',
    '#auth-terms-toggle', '#auth-terms', '.auth-layout', '#guest-header-actions', '#coin-wallet', '#coin-type-switch',
    '#header-profile', '#header-wallet-controls', '#header-member-actions']) nodes[selector] = new Node();
  const opener = new Node(), otherDialog = new Node();
  dialogs.push(nodes['#auth-dialog'], otherDialog);
  const document = {
    body: { dataset: {} }, activeElement: opener, addEventListener() {},
    querySelector: selector => selector === 'dialog[open]' ? dialogs.find(dialog => dialog.open) : nodes[selector],
    querySelectorAll: selector => selector === 'dialog[open]' ? dialogs.filter(dialog => dialog.open) : [],
  };
  const popupNavigation = {
    pushStep(dialog, step) { steps.set(dialog, step); },
    clearSteps(dialog) { steps.delete(dialog); },
    backStep(dialog, id) {
      const step = steps.get(dialog);
      if (!step || step.id !== id) return false;
      steps.delete(dialog);
      step.onBack();
      return true;
    },
  };
  const account = {
    isSignedIn: () => signedIn, subscribe() {}, getSnapshot: () => ({ isTest: true, identity: {} }),
    async login(input) { writes.push(input); signedIn = true; return { ok: true }; },
    async register() { throw new Error('Not expected'); },
  };
  const router = { subscribe() {}, getRoute: () => ({ type: 'home' }), navigate() {} };
  const context = { requestDialogClose, document, account, router, popupNavigation, createAuthRouter, requiresAccount, queueMicrotask };
  const api = vm.runInNewContext(`${source}\ninitAuthView({account, router, popupNavigation});`, context);
  return { api, nodes, popupNavigation, steps, opener, otherDialog, document, writes, focused: () => focused };
}

test('Back from account recovery restores login in place and preserves the requested action', async () => {
  const page = authPage(), n = page.nodes, dialog = n['#auth-dialog'];
  let resumed = 0;
  page.api.require(() => { resumed++; });
  n['#auth-email'].value = 'member@example.com';
  await n['#auth-forgot'].fire('click');
  assert.equal(n['#auth-form'].hidden, true);
  assert.equal(n['#auth-recovery'].hidden, false);
  assert.equal(page.focused(), n['#auth-recovery-back']);
  dialog.scrollTop = 180;
  n['.auth-layout'].scrollTop = 180;
  assert.equal(page.popupNavigation.backStep(dialog, 'recovery'), true);
  assert.equal(dialog.open, true);
  assert.equal(n['#auth-form'].hidden, false);
  assert.equal(n['#auth-recovery'].hidden, true);
  assert.equal(n['#auth-email'].value, 'member@example.com');
  assert.equal(page.focused(), n['#auth-tab-login']);
  assert.equal(dialog.scrollTop, 0);
  assert.equal(n['.auth-layout'].scrollTop, 0);
  assert.equal(resumed, 0);
  assert.deepEqual(page.writes, []);
  n['#auth-password'].value = 'safe-password';
  await n['#auth-form'].fire('submit');
  assert.equal(dialog.open, false);
  assert.equal(resumed, 1);
});

test('Back to Login consumes its step and closing recovery cancels the pending action', async () => {
  const page = authPage(), n = page.nodes, dialog = n['#auth-dialog'];
  let resumed = 0;
  page.api.require(() => { resumed++; });
  await n['#auth-forgot'].fire('click');
  await n['#auth-recovery-back'].fire('click');
  assert.equal(page.steps.size, 0);
  assert.equal(dialog.open, true);
  await n['#auth-forgot'].fire('click');
  await n['#auth-close'].fire('click');
  await dialog.fire('close');
  assert.equal(dialog.open, false);
  assert.equal(page.focused(), page.opener);
  page.api.open();
  await n['#auth-form'].fire('submit');
  assert.equal(resumed, 0);
});

test('a late auth close event neither steals another popup focus nor resets reopened login', async () => {
  const page = authPage(), n = page.nodes, dialog = n['#auth-dialog'];
  page.api.open();
  await n['#auth-close'].fire('click');
  page.otherDialog.showModal();
  page.otherDialog.focus();
  await dialog.fire('close');
  assert.equal(page.focused(), page.otherDialog);
  page.otherDialog.close();
  page.api.open();
  n['#auth-email'].value = 'draft@example.com';
  await dialog.fire('close');
  assert.equal(n['#auth-email'].value, 'draft@example.com');
  assert.equal(page.document.body.dataset.authDialog, 'open');
});
