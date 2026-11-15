import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createMemberState } from '../public/member-state.js';
import { getDiscoveredGameCount } from '../public/rewards-pages.js';

const source = (await readFile(new URL('../public/profile-menu.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initProfileMenu', 'function initProfileMenu');

function profilePage() {
  let focused;
  class Node {
    constructor() { this.listeners = new Map(); this.attributes = new Map(); this.dataset = {}; this.open = false; this.hidden = false; }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    async fire(type, event = {}) { for (const fn of this.listeners.get(type) || []) await fn({ preventDefault() {}, ...event }); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    querySelector(selector) { return nodes[selector]; }
    querySelectorAll(selector) { return selector === '[data-avatar]' ? choices : []; }
    matches() { return false; }
    focus() { focused = this; }
    reportValidity() { return true; }
    showModal() { this.open = true; }
    close() { this.open = false; void this.fire('close'); }
    showPopover() {}
  }
  const selectors = ['#header-profile', '#profile-menu', '#profile-summary', '#profile-menu-status',
    '#profile-summary-title', '#profile-summary-overview', '.profile-summary__edit', '.profile-summary__close',
    '#profile-editor', '#profile-editor-name', '#profile-editor-avatars', '#profile-editor-cancel', '#profile-editor-save', '#profile-editor-status',
    ...['avatar', 'name', 'since', 'games', 'favorites', 'rewards', 'coins'].map(id => `#profile-summary-${id}`),
    ...['summary', 'messages', 'redeem', 'logout'].map(action => `[data-profile-action="${action}"]`)];
  const nodes = Object.fromEntries(selectors.map(selector => [selector, new Node()]));
  const choices = ['L', '∞', '★', '7', 'G', 'S'].map(avatar => { const node = new Node(); node.dataset.avatar = avatar; return node; });
  nodes['#profile-editor'].hidden = true;
  const snapshot = { createdAt: '2026-11-14T00:00:00Z', member: createMemberState({ profile: { displayName: 'Alice', avatar: 'L' } }), ledger: [] };
  const subscribers = [], writes = [], navigations = [];
  const account = {
    isSignedIn: () => true,
    getSnapshot: () => structuredClone(snapshot),
    subscribe: fn => subscribers.push(fn),
    async saveProfile(patch) {
      writes.push({ ...patch }); Object.assign(snapshot.member.profile, patch);
      subscribers.forEach(fn => fn()); return { ok: true };
    },
  };
  const document = { querySelector: selector => selector === 'dialog[open]' ? nodes['#profile-summary'].open ? nodes['#profile-summary'] : null : nodes[selector] };
  const router = { subscribe() {}, getRoute: () => ({ type: 'category', categoryId: 'popular' }), navigate: route => navigations.push(route) };
  const context = { document, window: { addEventListener() {} }, router, account, getDiscoveredGameCount, createShelfIcon() {} };
  const api = vm.runInNewContext(`${source}\ninitProfileMenu({router, account});`, context);
  return { api, nodes, choices, snapshot, account, writes, navigations, subscribers, focused: () => focused };
}

test('profile edit and cancel stay in the same popup without changing the account or route', async () => {
  const page = profilePage(), n = page.nodes;
  page.api.open();
  await n['.profile-summary__edit'].fire('click');
  assert.equal(n['#profile-summary'].open, true);
  assert.equal(n['#profile-editor'].hidden, false);
  n['#profile-editor-name'].value = 'Unsaved';
  await page.choices[2].fire('click');
  await n['#profile-editor-cancel'].fire('click');
  assert.equal(n['#profile-summary-overview'].hidden, false);
  assert.equal(n['#profile-summary-name'].textContent, 'Alice');
  assert.deepEqual(page.writes, []);
  assert.deepEqual(page.navigations, []);
  assert.equal(page.focused(), n['.profile-summary__edit']);
  await n['.profile-summary__edit'].fire('click');
  assert.equal(n['#profile-editor-name'].value, 'Alice');
  assert.equal(page.choices[0].getAttribute('aria-pressed'), 'true');
});

test('saving profile updates the shared summary and preserves concurrent untouched fields', async () => {
  const page = profilePage(), n = page.nodes;
  page.api.open({ edit: true });
  n['#profile-editor-name'].value = '  Updated Alice  ';
  page.snapshot.member.profile.avatar = '★';
  page.subscribers.forEach(fn => fn());
  assert.equal(n['#profile-editor-name'].value, '  Updated Alice  ', 'account updates must not overwrite the draft');
  await n['#profile-editor'].fire('submit');
  assert.deepEqual(page.writes, [{ displayName: 'Updated Alice' }]);
  assert.equal(n['#profile-summary-name'].textContent, 'Updated Alice');
  assert.equal(n['#profile-summary-avatar'].textContent, '★');
  assert.equal(n['#profile-editor'].hidden, true);
  assert.equal(n['#profile-editor-status'].textContent, 'Profile saved.');
  assert.equal(n['#profile-summary'].open, true);
  assert.deepEqual(page.navigations, []);
});

test('invalid and failed saves keep the editor available for correction', async () => {
  const page = profilePage(), n = page.nodes;
  page.api.open({ edit: true });
  n['#profile-editor-name'].value = '  ';
  await n['#profile-editor'].fire('submit');
  assert.equal(page.writes.length, 0);
  assert.match(n['#profile-editor-status'].textContent, /2–24/);
  n['#profile-editor-name'].value = 'Changed';
  page.account.saveProfile = async () => { throw new Error('Offline'); };
  await n['#profile-editor'].fire('submit');
  assert.equal(n['#profile-editor'].hidden, false);
  assert.equal(n['#profile-editor-name'].value, 'Changed');
  assert.equal(n['#profile-editor-save'].disabled, false);
  assert.match(n['#profile-editor-status'].textContent, /could not be saved/);
});

test('closing a pending save does not reopen the dialog or overwrite a new editing session', async () => {
  const page = profilePage(), n = page.nodes;
  let finish;
  page.account.saveProfile = () => new Promise(resolve => { finish = resolve; });
  page.api.open({ edit: true });
  await page.choices[2].fire('click');
  const pending = n['#profile-editor'].fire('submit');
  n['#profile-summary'].close();
  finish({ ok: true });
  await pending;
  assert.equal(n['#profile-summary'].open, false);
  assert.equal(n['#profile-editor-status'].textContent, '');
  page.api.open({ edit: true });
  assert.equal(n['#profile-editor-name'].value, 'Alice');
  assert.equal(n['#profile-editor-save'].disabled, false);
});
