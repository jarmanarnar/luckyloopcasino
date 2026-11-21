import assert from 'node:assert/strict';
import test from 'node:test';
import { initDialogMotion, requestDialogClose } from '../public/dialog-motion.js';

function browser({ mobile = true, reduced = false, animate = true } = {}) {
  const events = () => ({ listeners: new Map(),
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); },
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); },
    emit(name, event = {}) { event.target ||= this; for (const fn of this.listeners.get(name) || []) fn(event); } });
  const media = { ...events(), matches: mobile }, preference = { ...events(), matches: reduced };
  const timers = new Map(), animations = [], observers = [];
  let timerId = 0;
  const doc = { ...events(), body: { dataset: {} }, hidden: false };
  class Dialog {
    constructor(id = 'store-dialog') { Object.assign(this, events()); this.id = id; this.ownerDocument = doc; this.dataset = {}; this.open = false; this.closes = 0; this.opacity = '1'; this.transform = 'none'; }
    matches(selector) { return this.id !== 'site-menu' && selector.includes(`#${this.id}`); }
    contains(element) { return element.dialog === this; }
    showModal() { if (this.failOpen) throw new Error('Cannot open'); this.open = true; }
    show() { this.open = true; }
    close(value) { if (!this.open) return; this.open = false; this.closes++; this.returnValue = value; doc.emit('close', { target: this }); }
    animate(frames, options) {
      let resolve, reject;
      const animation = { target: this, frames, options, cancelled: false,
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        finish() { resolve(); }, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
      animations.push(animation); return animation;
    }
  }
  if (!animate) Dialog.prototype.animate = undefined;
  const scope = { HTMLDialogElement: Dialog,
    matchMedia: query => query.includes('reduced') ? preference : media,
    getComputedStyle: dialog => ({ opacity: dialog.opacity, transform: dialog.transform }),
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  };
  const nativeClose = Dialog.prototype.close;
  const controller = initDialogMotion({ window: scope, document: doc });
  const microtasks = async () => { await Promise.resolve(); await Promise.resolve(); };
  return { Dialog, doc, scope, media, preference, timers, animations, observers, controller, nativeClose, microtasks,
    async finish() { animations.at(-1).finish(); await microtasks(); },
    flushTimers() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    preferenceChanged() { observers[0].callback([{ attributeName: 'data-reduce-motion', target: doc.body }]); },
  };
}

test('opening animates without deferring native modal state; dismissal holds the modal until finished', async () => {
  const page = browser(), dialog = new page.Dialog();
  dialog.showModal();
  assert.equal(dialog.open, true);
  assert.deepEqual(page.animations[0].frames, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)' }]);
  await page.finish();
  assert.equal(dialog.dataset.dialogMotion, undefined);
  let completed = 0;
  requestDialogClose(dialog, { returnValue: 'done', onClosed: () => completed++ });
  assert.equal(dialog.open, true, 'native modal/inert/focus lifecycle remains intact during exit');
  assert.equal(dialog.inert, true, 'buttons cannot trigger another action while the shell exits');
  assert.equal(completed, 0);
  await page.finish();
  assert.equal(dialog.open, false);
  assert.equal(dialog.inert, false);
  assert.equal(dialog.returnValue, 'done');
  assert.equal(completed, 1);
  assert.equal(page.timers.size, 0);
  page.controller.destroy();
});

test('native close stays synchronous for close/open handoffs and does not animate the menu', async () => {
  const page = browser(), first = new page.Dialog(), next = new page.Dialog('auth-dialog'), menu = new page.Dialog('site-menu');
  assert.equal(page.Dialog.prototype.close, page.nativeClose);
  first.showModal(); first.close(); next.showModal();
  assert.equal(first.open, false); assert.equal(next.open, true);
  assert.equal(page.animations[0].cancelled, true);
  const count = page.animations.length;
  menu.showModal(); requestDialogClose(menu);
  assert.equal(page.animations.length, count); assert.equal(menu.open, false);
  await page.microtasks(); assert.equal(next.open, true, 'cancelled previous entry cannot close its replacement');
  page.controller.destroy();
});

test('early dismissal starts from the visible frame; repeated close and rapid reopen cannot finish a stale exit', async () => {
  const page = browser(), dialog = new page.Dialog();
  dialog.showModal(); dialog.opacity = '.45'; dialog.transform = 'matrix(1, 0, 0, 1, 0, 11)';
  requestDialogClose(dialog);
  const exit = page.animations.at(-1);
  assert.deepEqual(exit.frames[0], { opacity: '.45', transform: 'matrix(1, 0, 0, 1, 0, 11)' });
  requestDialogClose(dialog); assert.equal(page.animations.at(-1), exit);
  dialog.showModal(); assert.equal(exit.cancelled, true);
  assert.equal(dialog.inert, false, 'a reopened dialog is interactive again');
  exit.finish(); await page.microtasks();
  assert.equal(dialog.open, true); assert.equal(dialog.closes, 0);
  page.controller.destroy();
});

test('reduced motion, desktop and missing WAAPI immediately use native close', () => {
  for (const options of [{ reduced: true }, { mobile: false }, { animate: false }]) {
    const page = browser(options), dialog = new page.Dialog();
    dialog.showModal(); requestDialogClose(dialog);
    assert.equal(dialog.open, false); assert.equal(page.animations.length, 0);
    page.controller.destroy();
  }
});

test('timeout, motion preference, visibility and teardown all settle a pending exit exactly once', async () => {
  for (const settle of [page => page.flushTimers(), page => { page.preference.matches = true; page.preference.emit('change'); },
    page => { page.doc.body.dataset.reduceMotion = 'true'; page.preferenceChanged(); },
    page => { page.doc.hidden = true; page.doc.emit('visibilitychange'); }, page => page.controller.destroy()]) {
    const page = browser(), dialog = new page.Dialog(); let completed = 0;
    dialog.showModal(); requestDialogClose(dialog, { onClosed: () => completed++ });
    settle(page); await page.microtasks(); page.flushTimers();
    assert.equal(dialog.open, false); assert.equal(dialog.closes, 1); assert.equal(completed, 1);
    assert.equal(page.timers.size, 0);
    page.controller.destroy();
  }
});

test('Escape preserves feature cancellation, while ordinary dialog forms animate and prevented submits remain open', async () => {
  const page = browser(), dialog = new page.Dialog(); let featureCalls = 0;
  dialog.addEventListener('cancel', () => featureCalls++); dialog.showModal();
  const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  dialog.emit('cancel', event);
  assert.equal(featureCalls, 1); assert.equal(event.defaultPrevented, true); assert.equal(dialog.open, true);
  await page.finish(); assert.equal(dialog.open, false);
  const guarded = new page.Dialog('auth-dialog');
  guarded.addEventListener('cancel', event => event.preventDefault()); guarded.showModal();
  const count = page.animations.length;
  guarded.emit('cancel', { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  assert.equal(page.animations.length, count, 'feature prevention wins');
  const form = { getAttribute: () => 'dialog', closest: () => guarded };
  const submit = { target: form, submitter: { value: 'x', getAttribute: () => null }, defaultPrevented: true,
    preventDefault() { this.defaultPrevented = true; } };
  page.doc.emit('submit', submit); assert.equal(page.animations.length, count);
  submit.defaultPrevented = false; page.doc.emit('submit', submit);
  assert.equal(submit.defaultPrevented, true); assert.equal(guarded.open, true);
  await page.finish(); assert.equal(guarded.returnValue, 'x');
  page.controller.destroy();
});

test('initial content does not double animate; an actual visible internal step does', async () => {
  const page = browser(), dialog = new page.Dialog('auth-dialog'); dialog.showModal();
  const step = { id: 'auth-recovery', dialog, hidden: false, matches: () => true, closest: () => dialog,
    animate: (...args) => dialog.animate(...args) };
  const change = () => page.observers[0].callback([{ attributeName: 'hidden', target: step }]);
  change(); assert.equal(page.animations.length, 1);
  await page.finish(); change();
  assert.equal(page.animations.length, 2); assert.equal(page.animations[1].options.duration, 180);
  requestDialogClose(dialog); assert.equal(page.animations[1].cancelled, true);
  page.controller.destroy();
});
