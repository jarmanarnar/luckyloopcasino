import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import * as chatState from '../public/chat-state.js';

const source = (await readFile(new URL('../public/community-chat.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initCommunityChat', 'function initCommunityChat');

function chatPage({ desktop = false, reduced = false, siteReduced = false,
  duration = '280ms', delay = '0s', properties = 'transform' } = {}) {
  const nodes = [], timers = new Map(), accountListeners = [], routeListeners = [], sheetDismissals = [], authCalls = [];
  let timerId = 0, signedIn = true, registration;
  const popupEvents = [];
  class Node {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase(); this.listeners = new Map(); this.attributes = new Map();
      this.children = []; this.selections = new Map(); this.dataset = {}; this.style = {};
      this.hidden = false; this.inert = false; this.open = false; this.value = ''; this.textContent = '';
      this.scrollHeight = 100; this.clientHeight = 100; this.scrollTop = 0;
      this.tabIndex = ['BUTTON', 'TEXTAREA'].includes(this.tagName) ? 0 : -1;
      nodes.push(this);
    }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, fn) { const handlers = this.listeners.get(type) || new Set(); handlers.add(fn); this.listeners.set(type, handlers); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, details = {}) {
      const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...details };
      for (const fn of [...this.listeners.get(type) || []]) fn(event);
    }
    querySelector(selector) {
      if (!this.selections.has(selector)) {
        const tag = selector === '.chat-sheet' ? 'dialog' : selector === '#chat-form' ? 'form'
          : selector === '#chat-message' ? 'textarea' : /button|chat-close|chat-send|chat-latest|Choose emoji/.test(selector) ? 'button' : 'div';
        const child = new Node(tag);
        if (selector === '.chat-close') child.dataset.chatAction = 'close';
        this.selections.set(selector, child); this.append(child);
      }
      return this.selections.get(selector);
    }
    querySelectorAll() { return this.descendants().filter(item => ['BUTTON', 'TEXTAREA'].includes(item.tagName)); }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    contains(child) { for (let current = child; current; current = current.parent) if (current === this) return true; return false; }
    closest(selector) { return selector === '[data-chat-action]' && this.dataset.chatAction ? this : null; }
    getClientRects() {
      for (let current = this; current; current = current.parent) if (current.hidden) return [];
      return [{}];
    }
    getBoundingClientRect() { return { left: 0, top: 0, right: 400, bottom: 700 }; }
    focus() {
      for (let current = this; current; current = current.parent) if (current.inert) return;
      if (this.getClientRects().length) document.activeElement = this;
    }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const document = new Node();
  document.body = new Node();
  if (siteReduced) document.body.dataset.reduceMotion = 'true';
  const main = new Node(), header = new Node();
  document.body.append(header, main);
  document.createElement = tag => new Node(tag);
  document.querySelector = selector => selector === '#header-member-actions' ? header
    : selector === 'dialog[open]' ? nodes.find(item => item.tagName === 'DIALOG' && item.open) || null : null;
  const media = new Node(), motion = new Node();
  media.matches = desktop; motion.matches = reduced;
  const account = {
    isSignedIn: () => signedIn,
    getSnapshot: () => ({ playerId: 'test-player' }),
    getMemberState: () => ({ profile: { displayName: 'Player', avatar: 'L' } }),
    subscribe(fn) { accountListeners.push(fn); },
  };
  const popupNavigation = { register(value) {
    registration = value;
    return { opened() { popupEvents.push('opened'); }, closed() { popupEvents.push('closed'); } };
  } };
  const context = {
    ...chatState, document, account, popupNavigation, window: { addEventListener() {} },
    router: { subscribe(fn) { routeListeners.push(fn); } },
    auth: { open(mode) { assert.equal(main.inert, false, 'release the chat before opening authentication'); authCalls.push(mode); } },
    matchMedia(query) { return query === '(min-width: 75rem)' ? media : motion; },
    getComputedStyle: () => ({ transitionProperty: properties, transitionDuration: duration, transitionDelay: delay }),
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout(callback, wait) { timers.set(++timerId, { callback, wait }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    icon: () => '', renderProfileAvatar() {},
    requestDialogClose(dialog) { sheetDismissals.push(dialog); dialog.close(); },
  };
  const api = vm.runInNewContext(`${source}\ninitCommunityChat({account, auth, router, popupNavigation});`, context);
  const panel = document.body.children.find(item => item.className === 'community-chat');
  const backdrop = document.body.children.find(item => item.className === 'chat-backdrop');
  return { api, document, panel, backdrop, main, trigger: header.children[0], timers, registration, popupEvents,
    motion, media, sheetDismissals, authCalls,
    route() { routeListeners.forEach(callback => callback()); },
    signOut(notify = true) { signedIn = false; if (notify) accountListeners.forEach(callback => callback()); },
    end(propertyName = 'transform', target = panel) { panel.emit('transitionend', { propertyName, target }); },
  };
}

test('chat user close keeps its backdrop and background lock until its own transform finishes', () => {
  const page = chatPage();
  page.api.open(page.trigger);
  const closeButton = page.panel.querySelector('.chat-close');
  page.panel.emit('click', { target: closeButton });
  assert.equal(page.registration.isOpen(), true);
  assert.equal(page.panel.hidden, false);
  assert.equal(page.panel.inert, true);
  assert.equal(page.backdrop.hidden, false);
  assert.equal(page.main.inert, true);
  assert.equal(page.document.body.dataset.chatModal, 'true');
  assert.notEqual(page.document.activeElement, page.trigger, 'focus does not jump behind the departing panel');
  assert.deepEqual(page.popupEvents, ['opened']);
  page.end('opacity');
  page.end('transform', closeButton);
  assert.equal(page.panel.hidden, false, 'unrelated transitions cannot finish the chat exit');
  page.end();
  assert.equal(page.panel.hidden, true);
  assert.equal(page.backdrop.hidden, true);
  assert.equal(page.main.inert, false);
  assert.equal(page.registration.isOpen(), false);
  assert.equal(page.document.activeElement, page.trigger);
  assert.equal(page.trigger.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(page.popupEvents, ['opened', 'closed']);
  assert.equal(page.timers.size, 0);
});

test('chat derives its exit fallback from CSS seconds or milliseconds and completes only once', () => {
  for (const duration of ['180ms, 280ms', '.18s, .28s']) {
    const page = chatPage({ duration, delay: '0ms, 40ms', properties: 'opacity, transform' });
    page.api.open();
    page.backdrop.emit('click');
    const pending = [...page.timers.values()][0];
    assert.equal(pending.wait, 400);
    let dismissed = 0;
    page.registration.dismiss({ onClosed: () => { dismissed++; } });
    page.api.close();
    assert.equal(page.timers.size, 1, 'repeated dismissal requests do not restart the exit');
    assert.equal(dismissed, 0);
    pending.callback();
    page.end();
    pending.callback();
    assert.equal(page.panel.hidden, true);
    assert.equal(dismissed, 1);
    assert.equal(page.popupEvents.filter(event => event === 'closed').length, 1);
    assert.equal(page.timers.size, 0);
  }
});

test('reopening chat cancels a pending exit and stale completion cannot hide the new session', () => {
  const page = chatPage({ desktop: true });
  page.trigger.emit('click');
  let dismissed = 0;
  page.registration.dismiss({ onClosed: () => { dismissed++; } });
  const stale = [...page.timers.values()][0].callback;
  page.trigger.emit('click');
  assert.equal(page.timers.size, 0);
  assert.equal(page.panel.hidden, false);
  assert.equal(page.panel.inert, false);
  assert.equal(page.document.body.dataset.chat, 'open');
  stale();
  page.end();
  assert.equal(page.registration.isOpen(), true);
  assert.equal(page.panel.hidden, false);
  assert.equal(dismissed, 0, 'canceling an exit does not run its after-close action');
  assert.equal(page.popupEvents.includes('closed'), false);
  page.api.close();
  page.end();
  assert.equal(page.popupEvents.filter(event => event === 'closed').length, 1);
});

test('chat route, authentication and account handoffs close immediately, including during an exit', () => {
  for (const handoff of ['route', 'login', 'logout', 'popup-navigation']) {
    const page = chatPage();
    page.api.open();
    page.api.close();
    if (handoff === 'route') page.route();
    if (handoff === 'login') { page.signOut(false); page.api.open(); }
    if (handoff === 'logout') page.signOut();
    if (handoff === 'popup-navigation') page.registration.close();
    assert.equal(page.panel.hidden, true, handoff);
    assert.equal(page.main.inert, false, handoff);
    assert.equal(page.backdrop.hidden, true, handoff);
    assert.equal(page.timers.size, 0, handoff);
    assert.equal(page.popupEvents.filter(event => event === 'closed').length, 1, handoff);
    if (handoff === 'login') assert.deepEqual(page.authCalls, ['login']);
  }
});

test('chat respects both reduced-motion preferences and zero-duration styles', () => {
  for (const preference of [{ reduced: true }, { siteReduced: true }, { duration: '0s' }]) {
    const page = chatPage(preference);
    page.api.open();
    page.api.close();
    assert.equal(page.panel.hidden, true);
    assert.equal(page.main.inert, false);
    assert.equal(page.backdrop.hidden, true);
    assert.equal(page.timers.size, 0);
  }
});

test('changing motion preference or layout settles an outgoing chat without leaving the page locked', () => {
  for (const preference of ['motion', 'media']) {
    const page = chatPage();
    page.api.open();
    page.api.close();
    page[preference].matches = true;
    page[preference].emit('change');
    assert.equal(page.panel.hidden, true);
    assert.equal(page.main.inert, false);
    assert.equal(page.backdrop.hidden, true);
    assert.equal(page.timers.size, 0);
    page.end();
    assert.equal(page.popupEvents.filter(event => event === 'closed').length, 1);
  }
});

test('chat-sheet dismiss buttons use shared motion while parent handoffs close synchronously', () => {
  const page = chatPage(), sheet = page.panel.querySelector('.chat-sheet');
  page.api.open();
  sheet.showModal();
  sheet.querySelector('header button').emit('click');
  assert.deepEqual(page.sheetDismissals, [sheet]);
  sheet.showModal();
  sheet.emit('click', { clientX: 500, clientY: 750 });
  assert.equal(page.sheetDismissals.length, 2);
  sheet.showModal();
  page.api.close({ immediate: true });
  assert.equal(sheet.open, false);
  assert.equal(page.sheetDismissals.length, 2);
});
