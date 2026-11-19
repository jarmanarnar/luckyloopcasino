import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createMemberState } from '../public/member-state.js';
import { getDiscoveredGameCount } from '../public/rewards-pages.js';

const source = (await readFile(new URL('../public/profile-menu.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initProfileMenu', 'function initProfileMenu');

function profilePage({ preparePhoto = async () => 'test-photo', popupNavigation } = {}) {
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
    '#profile-summary-title', '#profile-summary-overview', '.profile-summary__body', '.profile-summary__edit', '.profile-summary__close',
    '#profile-editor', '.profile-editor__fields', '#profile-editor-name', '#profile-editor-avatars', '#profile-editor-cancel', '#profile-editor-save', '#profile-editor-status',
    ...['preview', 'file', 'upload', 'remove', 'status'].map(id => `#profile-photo-${id}`),
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
  const context = { document, window: { addEventListener() {} }, router, account, popupNavigation, getDiscoveredGameCount, createShelfIcon() {},
    prepareProfilePhoto: preparePhoto,
    renderProfileAvatar(element, profile) { element.textContent = profile.avatar; element.photo = profile.photo || null; } };
  const api = vm.runInNewContext(`${source}\ninitProfileMenu({router, account, popupNavigation});`, context);
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

function profileNavigation() {
  const steps = new Map();
  return {
    steps,
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
}

test('browser Back from editing restores the profile without saving draft changes', async () => {
  const popupNavigation = profileNavigation();
  const page = profilePage({ popupNavigation }), n = page.nodes, dialog = n['#profile-summary'];
  page.api.open({ edit: true });
  n['#profile-editor-name'].value = 'Unsaved name';
  await page.choices[2].fire('click');
  for (const selector of ['#profile-summary', '.profile-summary__body', '#profile-summary-overview', '.profile-editor__fields']) {
    n[selector].scrollTop = 180;
  }
  assert.equal(popupNavigation.backStep(dialog, 'edit'), true);
  assert.equal(dialog.open, true);
  assert.equal(n['#profile-editor'].hidden, true);
  assert.equal(n['#profile-summary-name'].textContent, 'Alice');
  assert.equal(page.focused(), n['.profile-summary__edit']);
  assert.deepEqual(page.writes, []);
  assert.deepEqual(page.navigations, []);
  assert.equal(popupNavigation.steps.size, 0);
  for (const selector of ['#profile-summary', '.profile-summary__body', '#profile-summary-overview', '.profile-editor__fields']) {
    assert.equal(n[selector].scrollTop, 0);
  }
  await n['.profile-summary__edit'].fire('click');
  assert.equal(n['#profile-editor-name'].value, 'Alice');
  assert.equal(page.choices[0].getAttribute('aria-pressed'), 'true');
  await n['#profile-editor-cancel'].fire('click');
  assert.equal(popupNavigation.steps.size, 0, 'Cancel consumes the same inner step as browser Back');
});

test('Back invalidates a pending photo preview and X still closes the whole profile', async () => {
  const popupNavigation = profileNavigation();
  let finishPhoto;
  const page = profilePage({ popupNavigation, preparePhoto: () => new Promise(resolve => { finishPhoto = resolve; }) });
  const n = page.nodes, dialog = n['#profile-summary'];
  page.api.open({ edit: true });
  n['#profile-photo-file'].files = [{}];
  const pending = n['#profile-photo-file'].fire('change');
  popupNavigation.backStep(dialog, 'edit');
  finishPhoto('stale-photo');
  await pending;
  await n['.profile-summary__edit'].fire('click');
  assert.equal(n['#profile-photo-preview'].photo, null);
  assert.equal(n['#profile-photo-status'].textContent, '');
  assert.deepEqual(page.writes, []);
  await n['.profile-summary__close'].fire('click');
  assert.equal(dialog.open, false);
  assert.equal(popupNavigation.steps.size, 0);
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

test('photo selection is previewed without persistence and Cancel discards it', async () => {
  const page = profilePage(), n = page.nodes;
  page.api.open({ edit: true });
  n['#profile-photo-file'].files = [{}];
  await n['#profile-photo-file'].fire('change');
  assert.equal(n['#profile-photo-preview'].photo, 'test-photo');
  assert.equal(n['#profile-photo-remove'].hidden, false);
  assert.ok(page.choices.every(choice => choice.getAttribute('aria-pressed') === 'false'));
  assert.deepEqual(page.writes, []);
  await n['#profile-editor-cancel'].fire('click');
  page.api.open({ edit: true });
  assert.equal(n['#profile-photo-preview'].photo, null);
  assert.equal(n['#profile-photo-remove'].hidden, true);
});

test('upload, replace and removal save only the photo field and restore the fallback avatar', async () => {
  let photo = 'first-photo';
  const page = profilePage({ preparePhoto: async () => photo }), n = page.nodes;
  page.snapshot.member.profile.avatar = '★';
  for (const next of ['first-photo', 'replacement-photo']) {
    photo = next;
    page.api.open({ edit: true });
    n['#profile-photo-file'].files = [{}];
    await n['#profile-photo-file'].fire('change');
    await n['#profile-editor'].fire('submit');
    assert.deepEqual(page.writes.at(-1), { photo });
    assert.equal(n['#profile-summary-avatar'].photo, photo);
  }
  page.api.open({ edit: true });
  await n['#profile-photo-remove'].fire('click');
  assert.equal(n['#profile-photo-preview'].textContent, '★');
  assert.equal(n['#profile-photo-preview'].photo, null);
  assert.equal(page.snapshot.member.profile.photo, 'replacement-photo', 'removal is a draft until Save');
  await n['#profile-editor'].fire('submit');
  assert.deepEqual(page.writes.at(-1), { photo: null });
  assert.equal(n['#profile-summary-avatar'].photo, null);
  assert.equal(n['#profile-summary-avatar'].textContent, '★');
});

test('selecting a preset avatar replaces a photo; a name-only save preserves a concurrently updated photo', async () => {
  const page = profilePage(), n = page.nodes;
  page.snapshot.member.profile.photo = 'old-photo';
  page.api.open({ edit: true });
  await page.choices[2].fire('click');
  await n['#profile-editor'].fire('submit');
  assert.deepEqual(page.writes.at(-1), { avatar: '★', photo: null });
  page.api.open({ edit: true });
  n['#profile-editor-name'].value = 'Alice Updated';
  page.snapshot.member.profile.photo = 'newer-photo';
  await n['#profile-editor'].fire('submit');
  assert.deepEqual(page.writes.at(-1), { displayName: 'Alice Updated' });
  assert.equal(n['#profile-summary-avatar'].photo, 'newer-photo');
});

test('failed image decoding preserves the current photo and allows retry', async () => {
  const page = profilePage({ preparePhoto: async () => { throw new Error('Choose a JPG, PNG or WebP image.'); } }), n = page.nodes;
  page.snapshot.member.profile.photo = 'saved-photo';
  page.api.open({ edit: true });
  n['#profile-photo-file'].files = [{}];
  await n['#profile-photo-file'].fire('change');
  assert.equal(n['#profile-photo-preview'].photo, 'saved-photo');
  assert.match(n['#profile-photo-status'].textContent, /JPG/);
  assert.equal(n['#profile-editor-save'].disabled, false);
  assert.equal(n['#profile-photo-upload'].disabled, false);
  await n['#profile-editor'].fire('submit');
  assert.deepEqual(page.writes, []);
});

test('a photo finishing after the editor is closed cannot overwrite a new draft', async () => {
  let finish;
  const page = profilePage({ preparePhoto: () => new Promise(resolve => { finish = resolve; }) }), n = page.nodes;
  page.api.open({ edit: true });
  n['#profile-photo-file'].files = [{}];
  const pending = n['#profile-photo-file'].fire('change');
  assert.equal(n['#profile-editor-save'].disabled, true);
  await n['#profile-editor'].fire('submit');
  assert.deepEqual(page.writes, []);
  n['#profile-summary'].close();
  page.api.open({ edit: true });
  await page.choices[2].fire('click');
  finish('late-photo');
  await pending;
  assert.equal(n['#profile-photo-preview'].photo, null);
  assert.equal(n['#profile-photo-preview'].textContent, '★');
  assert.equal(n['#profile-photo-status'].textContent, '');
  assert.equal(n['#profile-editor-save'].disabled, false);
});
