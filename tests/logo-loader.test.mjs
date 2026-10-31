import assert from 'node:assert/strict';
import test from 'node:test';
import { initLogoLoader, LOGO_MOTION } from '../public/logo-loader.js';

function setup({ reduced = false, hidden = false } = {}) {
  const frames = new Map(), timers = new Map();
  let frameId = 0, timerId = 0, now = 0, complete = false;
  function emitter() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      emit(type) { for (const listener of listeners.get(type) || []) listener(); },
    };
  }
  const brand = { dataset: {} };
  const doc = {
    ...emitter(), body: { dataset: {} }, hidden,
    querySelector(selector) {
      assert.equal(selector, '#app-loader-brand', 'the inline SVG loader requires no image or canvas lookup');
      return brand;
    },
    createElement() { throw new Error('The lightweight loader must not allocate canvases or decode images'); },
  };
  const motion = { ...emitter(), matches: reduced };
  const scope = {
    performance: { now: () => now },
    matchMedia(query) { assert.equal(query, '(prefers-reduced-motion: reduce)'); return motion; },
    setTimeout(action, delay) { timers.set(++timerId, { action, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(action) { frames.set(++frameId, action); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const controller = initLogoLoader({ document: doc, window: scope });
  controller.minimum.then(() => { complete = true; });
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id); now = timer.at; timer.action();
    }
    now = end;
  }
  return {
    controller, brand, doc, motion, frames, timers, advance,
    get complete() { return complete; },
    paint() { const pending = [...frames.values()]; frames.clear(); pending.forEach(action => action(now)); },
  };
}

function assertStopped(page) {
  assert.equal(page.frames.size, 0, 'no pending animation frame remains');
  assert.equal(page.timers.size, 0, 'no pending minimum-display timer remains');
  assert.equal(page.brand.dataset.paused, 'true');
  assert.equal([...page.doc.listeners.values()].some(listeners => listeners.size), false);
  assert.equal([...page.motion.listeners.values()].some(listeners => listeners.size), false);
}

test('the inline infinity remains visible for two complete 1.8-second cycles beginning at its first paint', async () => {
  assert.deepEqual(LOGO_MOTION, { duration: 1800, cycles: 2 });
  const page = setup();
  page.advance(1200);
  await Promise.resolve();
  assert.equal(page.complete, false, 'time before the first rendered frame cannot shorten the loader');
  page.paint();
  assert.equal(page.brand.dataset.paused, 'false');
  assert.equal(page.brand.dataset.reduced, 'false');
  page.advance(3599);
  await Promise.resolve();
  assert.equal(page.complete, false);
  page.advance(1);
  await page.controller.minimum;
  assert.equal(page.complete, true);
  page.controller.stop();
  assertStopped(page);
});

test('hidden-tab time and the wait for a resumed paint do not count toward two visible cycles', async () => {
  const page = setup();
  page.paint();
  page.advance(900);
  page.doc.hidden = true; page.doc.emit('visibilitychange');
  assert.equal(page.brand.dataset.paused, 'true');
  assert.equal(page.timers.size, 0);
  page.advance(20_000);
  await Promise.resolve();
  assert.equal(page.complete, false);
  page.doc.hidden = false; page.doc.emit('visibilitychange');
  page.advance(500);
  page.paint();
  assert.equal(page.brand.dataset.paused, 'false');
  page.advance(2699);
  await Promise.resolve();
  assert.equal(page.complete, false);
  page.advance(1);
  await page.controller.minimum;
  assert.equal(page.complete, true);
  page.controller.stop();
  assertStopped(page);
});

test('a page opened in the background starts its visible minimum only after returning and painting', async () => {
  const page = setup({ hidden: true });
  assert.equal(page.brand.dataset.paused, 'true');
  page.advance(30_000);
  await Promise.resolve();
  assert.equal(page.complete, false);
  page.doc.hidden = false; page.doc.emit('visibilitychange');
  page.paint();
  page.advance(3600);
  await page.controller.minimum;
  assert.equal(page.complete, true);
  page.controller.stop();
  assertStopped(page);
});

test('reduced motion keeps a static infinity while retaining the same visible display minimum', async () => {
  const page = setup({ reduced: true });
  page.paint();
  assert.equal(page.brand.dataset.reduced, 'true');
  assert.equal(page.brand.dataset.paused, 'true');
  page.advance(3599);
  await Promise.resolve();
  assert.equal(page.complete, false);
  page.advance(1);
  await page.controller.minimum;
  assert.equal(page.complete, true);
  page.controller.stop();
  assertStopped(page);
});

test('OS and saved motion-preference changes preserve elapsed visible time', async () => {
  const page = setup();
  page.paint();
  page.advance(900);
  page.motion.matches = true; page.motion.emit('change'); page.paint();
  assert.equal(page.brand.dataset.reduced, 'true');
  assert.equal(page.brand.dataset.paused, 'true');
  page.advance(900);
  page.doc.body.dataset.reduceMotion = 'true';
  page.motion.matches = false; page.motion.emit('change'); page.paint();
  assert.equal(page.brand.dataset.reduced, 'true', 'a saved preference also disables motion');
  page.advance(900);
  page.doc.body.dataset.reduceMotion = 'false'; page.doc.emit('loop:preferences-change'); page.paint();
  assert.equal(page.brand.dataset.reduced, 'false');
  assert.equal(page.brand.dataset.paused, 'false');
  page.advance(899);
  await Promise.resolve();
  assert.equal(page.complete, false);
  page.advance(1);
  await page.controller.minimum;
  assert.equal(page.complete, true, 'changing preferences does not restart the two-cycle minimum');
  page.controller.stop();
  assertStopped(page);
});

test('stopping before the first paint resolves cleanup and cannot restart from later visibility or preference events', async () => {
  const page = setup();
  page.controller.stop();
  await page.controller.minimum;
  assert.equal(page.complete, true);
  assertStopped(page);
  page.doc.hidden = false; page.doc.emit('visibilitychange');
  page.motion.matches = false; page.motion.emit('change');
  page.doc.emit('loop:preferences-change');
  page.advance(10_000); page.paint();
  page.controller.stop();
  assertStopped(page);
});
