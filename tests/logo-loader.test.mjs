import assert from 'node:assert/strict';
import test from 'node:test';
import { initLogoLoader, LOGO_MOTION } from '../public/logo-loader.js';

function setup({ reduced = false, pendingImage = false, canvasAvailable = true } = {}) {
  const frames = new Map(), contexts = [], observers = [];
  let frameId = 0, now = 0, resolveImage;
  function emitter() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(type, action) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(action); },
      removeEventListener(type, action) { listeners.get(type)?.delete(action); },
      emit(type) { for (const action of listeners.get(type) || []) action(); },
    };
  }
  function makeCanvas() {
    const ctx = {
      images: [], lastPoint: null,
      drawImage(...args) { this.images.push(args); },
      getImageData() { return { data: new Uint8ClampedArray([255, 255, 255, 255]) }; },
      putImageData() {}, clearRect() {}, fillRect() {}, setTransform() {}, scale() {},
      beginPath() {}, moveTo() {}, lineTo(x, y) { this.lastPoint = { x, y }; }, stroke() {},
    };
    contexts.push(ctx);
    return { hidden: true, width: 0, height: 0, getContext: () => canvasAvailable ? ctx : null };
  }
  const canvas = makeCanvas();
  const source = {
    hidden: false,
    decode: () => pendingImage ? new Promise(resolve => { resolveImage = resolve; }) : Promise.resolve(),
  };
  const brand = { getBoundingClientRect: () => ({ width: 320, height: 320 * 373 / 1416 }) };
  const nodes = { '#app-loader-brand': brand, '#app-loader-source': source, '#app-loader-logo': canvas };
  const doc = { ...emitter(), body: { dataset: {} }, hidden: false,
    querySelector: selector => nodes[selector], createElement: makeCanvas };
  const motion = { ...emitter(), matches: reduced };
  const scope = {
    devicePixelRatio: 1, matchMedia: () => motion,
    requestAnimationFrame(action) { frames.set(++frameId, action); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(action) { this.action = action; this.nodes = new Set(); observers.push(this); }
      observe(node) { this.nodes.add(node); }
      disconnect() { this.nodes.clear(); this.disconnected = true; }
    },
  };
  const controller = initLogoLoader({ document: doc, window: scope });
  return { controller, source, canvas, brand, doc, motion, frames, contexts, observers,
    resolveImage: () => resolveImage(),
    tick(delta = 0) { now += delta; const pending = [...frames.values()]; frames.clear(); pending.forEach(action => action(now)); } };
}

test('the selected full-wordmark loader uses the approved logo and exact motion settings', async () => {
  assert.deepEqual(LOGO_MOTION, { duration: 1800, tail: .25, color: '#eeeef2' });
  const page = setup();
  await page.controller.ready;
  assert.equal(page.canvas.hidden, false);
  assert.equal(page.source.hidden, true);
  assert.deepEqual(page.contexts[1].images[0].slice(1), [542, 216, 782, 373, 0, 0, 782, 373]);
  assert.deepEqual(page.contexts[2].images[0].slice(1), [250, 216, 1416, 373, 0, 0, 1416, 373]);
  page.tick();
  const start = { ...page.contexts[3].lastPoint };
  for (let i = 0; i < 36; i++) page.tick(50);
  const finish = page.contexts[3].lastPoint;
  assert.ok(Math.hypot(start.x - finish.x, start.y - finish.y) < 1e-8, 'a full cycle takes 1.8 seconds');
  page.controller.stop();
  assert.equal(page.frames.size, 0, 'no animation remains after startup completes');
  assert.equal(page.observers[0].disconnected, true);
  assert.equal([...page.doc.listeners.values()].some(listeners => listeners.size), false);
  assert.equal([...page.motion.listeners.values()].some(listeners => listeners.size), false);
});

test('background tabs and reduced motion pause the animation without hiding the wordmark', async () => {
  const page = setup();
  await page.controller.ready;
  assert.equal(page.frames.size, 1);
  page.doc.hidden = true; page.doc.emit('visibilitychange');
  assert.equal(page.frames.size, 0);
  page.doc.hidden = false; page.doc.emit('visibilitychange');
  assert.equal(page.frames.size, 1);
  page.motion.matches = true; page.motion.emit('change');
  assert.equal(page.frames.size, 0);
  assert.equal(page.canvas.hidden, false);
  page.motion.matches = false; page.motion.emit('change');
  assert.equal(page.frames.size, 1);
  page.doc.body.dataset.reduceMotion = 'true'; page.doc.emit('loop:preferences-change');
  assert.equal(page.frames.size, 0);
  page.controller.stop();
});

test('a stopped loader cannot start later when a slow image finally arrives', async () => {
  const page = setup({ pendingImage: true });
  page.controller.stop();
  page.resolveImage();
  await page.controller.ready;
  assert.equal(page.frames.size, 0);
  assert.equal(page.canvas.hidden, true);
  assert.equal(page.source.hidden, false);
  assert.equal(page.observers[0].nodes.size, 0);
});

test('static fallback remains usable when motion is reduced or canvas is unavailable', async () => {
  const reduced = setup({ reduced: true });
  await reduced.controller.ready;
  assert.equal(reduced.frames.size, 0);
  assert.equal(reduced.canvas.hidden, false);
  reduced.controller.stop();
  const fallback = setup({ canvasAvailable: false });
  await fallback.controller.ready;
  assert.equal(fallback.source.hidden, false);
  assert.equal(fallback.frames.size, 0);
  fallback.controller.stop();
});
