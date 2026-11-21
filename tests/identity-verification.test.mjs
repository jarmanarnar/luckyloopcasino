import { requestDialogClose } from '../public/dialog-motion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../public/identity-verification.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initIdentityVerification', 'function initIdentityVerification');
const tick = () => new Promise(resolve => setImmediate(resolve));
function page({ hold } = {}) {
  let time = Date.now(), sent = 0, requested, signedIn = true;
  const nodes = [], listeners = [], stats = { emailVerified: false, phoneVerified: false }, document = { activeElement: null };
  class Element {
    constructor(tag) { this.tag = tag; this.events = {}; this.children = []; this.value = ''; this.hidden = false; this.attributes = {}; nodes.push(this); }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.events[key] = fn; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
    reportValidity() { return (!this.required || Boolean(this.value)) && (!this.value || !this.pattern || new RegExp(`^(?:${this.pattern})$`).test(this.value)); }
    click() { if (!this.disabled) this.events.click?.({ target: this }); }
  }
  document.createElement = tag => new Element(tag); document.body = new Element('body');
  document.querySelector = selector => selector.startsWith('dialog[open]') ? nodes.find(node => node.tag === 'dialog' && node.open) : null;
  const account = { isSignedIn: () => signedIn, getSnapshot: () => ({ playerId: 'player', identity: { email: 'member@example.test' } }),
    getMemberState: () => ({ achievementStats: stats }), getCapabilities: () => ({ verification: { email: true, phone: true } }), subscribe: fn => listeners.push(fn),
    async startVerification(channel, destination) { sent++; requested = { channel, destination }; if (hold) await hold; return { ok: true, challengeId: `challenge-${channel}` }; },
    async checkVerification(channel, id, code) {
      if (code !== '123456') return { ok: false, reason: 'Incorrect code' };
      stats[`${channel}Verified`] = true; listeners.forEach(fn => fn()); return { ok: true, verified: true };
    },
  };
  let viewed;
  const context = { requestDialogClose, document, account, auth: { require: fn => fn() }, router: { subscribe() {} }, createUiIcon: () => new Element('svg'),
    setInterval: () => 1, clearInterval() {}, Date: { now: () => time }, onVerified: channel => { viewed = channel; } };
  const api = vm.runInNewContext(`${source}\ninitIdentityVerification({document, account, auth, router, onVerified});`, context);
  return { api, stats, get sent() { return sent; }, get requested() { return requested; }, get viewed() { return viewed; },
    dialog: nodes.find(node => node.tag === 'dialog'), form: nodes.find(node => node.tag === 'form'),
    contact: nodes.find(node => node.id === 'identity-verification-contact'), code: nodes.find(node => node.id === 'identity-verification-code'),
    find: text => nodes.find(node => node.textContent === text), advance: ms => { time += ms; },
    submit: async () => { nodes.find(node => node.tag === 'form').events.submit({ preventDefault() {} }); await tick(); },
    logout: () => { signedIn = false; listeners.forEach(fn => fn()); },
  };
}

test('verification UI sends without marking verified, handles a wrong code and leads to the reward only after approval', async () => {
  const view = page(); view.api.open('email');
  assert.equal(view.contact.value, 'member@example.test'); assert.equal(view.contact.readOnly, true);
  await view.submit(); assert.equal(view.sent, 1); assert.equal(view.stats.emailVerified, false);
  view.code.value = '000000'; await view.submit(); assert.ok(view.find('Incorrect code')); assert.equal(view.stats.emailVerified, false);
  view.code.value = '123456'; await view.submit(); assert.equal(view.stats.emailVerified, true); assert.ok(view.find('Email verified'));
  view.find('View reward').click(); assert.equal(view.viewed, 'email'); assert.equal(view.dialog.open, false);
});
test('resending is not blocked by an unfinished invalid code and never crosses email and phone channels', async () => {
  const view = page(); view.api.open('phone'); view.contact.value = '+12025550123'; await view.submit();
  view.code.value = 'abc'; view.advance(61000);
  const resend = view.form.children.find(node => node.type === 'button' && node.textContent.startsWith('Send a new code'));
  resend.events.click(); await tick(); assert.equal(view.sent, 2); assert.equal(view.requested.channel, 'phone'); assert.equal(view.requested.destination, '+12025550123');
  view.dialog.close(); view.api.open('email'); assert.equal(view.code.value, ''); assert.equal(view.contact.value, 'member@example.test');
});
test('closing during a send cannot put its code into a newly opened channel or strand its controls', async () => {
  let release; const view = page({ hold: new Promise(resolve => { release = resolve; }) });
  view.api.open('email'); await view.submit(); view.dialog.close(); view.api.open('phone');
  release(); await tick(); assert.equal(view.code.hidden, true); assert.equal(view.find('Send code').disabled, false);
  assert.equal(view.contact.value, ''); view.logout(); assert.equal(view.dialog.open, false);
});
