import assert from 'node:assert/strict';
import test from 'node:test';
import { resizeHeroCarousel } from '../public/hero-resize.js';

function vector(value) {
  return {
    get: () => value,
    set(next) { value = typeof next === 'number' ? next : next.get(); },
  };
}

function fixture({ oldStep = 384, newStep = 256, oldTarget = -384, oldPosition = oldTarget,
  newTarget = -256, oldWidth = 1136, newWidth = 752 } = {}) {
  const calls = [];
  const container = { offsetWidth: newWidth };
  const slides = Array.from({ length: 4 }, () => ({ offsetWidth: newStep }));
  function engine(step, target, position, width) {
    const result = {
      options: { loop: true },
      containerRect: { width },
      slideRects: slides.map(() => ({ width: step })),
      scrollSnaps: [0, -step, -step * 2, -step * 3],
      target: vector(target),
      location: vector(position),
      offsetLocation: vector(position),
      previousLocation: vector(position),
      slideLooper: { loop() { calls.push({ action: 'loop', position: result.location.get() }); } },
      translate: { to(position) { calls.push({ action: 'translate', position }); } },
      animation: { start() { calls.push({ action: 'animate' }); } },
    };
    return result;
  }
  const before = engine(oldStep, oldTarget, oldPosition, oldWidth);
  const after = engine(newStep, newTarget, newTarget, newWidth);
  let current = before;
  const api = {
    containerNode: () => container,
    slideNodes: () => slides,
    internalEngine: () => current,
    reInit() { calls.push({ action: 'reInit' }); current = after; },
    emit(event) { calls.push({ action: 'emit', event }); },
  };
  return { api, calls, before, after, container, slides,
    entries: [{ target: container }, ...slides.map(target => ({ target }))] };
}

function positions(engine) {
  return [engine.location.get(), engine.offsetLocation.get(), engine.previousLocation.get()];
}

test('resizing a settled carousel preserves its selected whole-card anchor', () => {
  const state = fixture({ oldTarget: -768, newTarget: -512 });
  assert.equal(resizeHeroCarousel(state.api, state.entries), false);
  assert.deepEqual(positions(state.after), [-512, -512, -512]);
  assert.equal(state.after.target.get(), -512);
  assert.equal(state.calls.filter(call => call.action === 'reInit').length, 1);
  assert.equal(state.calls.some(call => call.action === 'animate'), false);
  assert.equal(state.calls.filter(call => call.action === 'emit' && call.event === 'resize').length, 1);
});

test('a resize midway through forward or backward travel keeps the remaining slide fraction', () => {
  for (const options of [
    { oldTarget: -384, oldPosition: -219, newTarget: -256 },
    { oldTarget: 0, oldPosition: -165, newTarget: 0 },
  ]) {
    const state = fixture(options);
    // Deliberately differ from the last rendered location: preserving the visible
    // offset matters more than a physics step that has not reached the screen yet.
    state.before.location.set(options.oldPosition - 11);
    resizeHeroCarousel(state.api, state.entries);
    const expected = options.newTarget - (options.oldTarget - options.oldPosition) / 384 * 256;
    for (const value of positions(state.after)) assert.ok(Math.abs(value - expected) < 1e-9);
    assert.equal(state.after.target.get(), options.newTarget);
    assert.equal(state.calls.filter(call => call.action === 'animate').length, 1);
    assert.ok(state.calls.findIndex(call => call.action === 'loop') < state.calls.findIndex(call => call.action === 'translate'));
    assert.equal(state.calls.find(call => call.action === 'translate').position, expected);
  }
});

test('loop wrap remaps motion relative to its destination after reInit rebases the track', () => {
  for (const options of [
    { oldTarget: -1536, oldPosition: -1371, newTarget: 0 },
    { oldTarget: 384, oldPosition: 219, newTarget: -768 },
  ]) {
    const state = fixture(options);
    resizeHeroCarousel(state.api, state.entries);
    const oldFraction = (options.oldTarget - options.oldPosition) / 384;
    const newFraction = (state.after.target.get() - state.after.offsetLocation.get()) / 256;
    assert.ok(Math.abs(oldFraction - newFraction) < 1e-9);
    assert.equal(state.calls.filter(call => call.action === 'loop').length, 1);
    assert.equal(state.calls.filter(call => call.action === 'animate').length, 1);
  }
});

test('unchanged or subpixel observer notifications do not reinitialize or emit resize', () => {
  const state = fixture({ newStep: 384, newWidth: 1136 });
  assert.equal(resizeHeroCarousel(state.api, state.entries), false);
  assert.deepEqual(state.calls, []);
  state.container.offsetWidth += 0.25;
  for (const slide of state.slides) slide.offsetWidth += 0.25;
  assert.equal(resizeHeroCarousel(state.api, state.entries), false);
  assert.deepEqual(state.calls, []);
});

test('a second notification for the same layout cannot create a ResizeObserver feedback loop', () => {
  const state = fixture();
  resizeHeroCarousel(state.api, state.entries);
  const count = state.calls.length;
  assert.equal(resizeHeroCarousel(state.api, state.entries), false);
  assert.equal(state.calls.length, count);
});

test('slide-width changes trigger one measurement even when the container width stays constant', () => {
  const state = fixture({ newWidth: 1136 });
  resizeHeroCarousel(state.api, [{ target: state.slides[0] }]);
  assert.equal(state.calls.filter(call => call.action === 'reInit').length, 1);
});

test('reduced motion lands on the new whole-card destination without animation', () => {
  const state = fixture({ oldPosition: -219 });
  resizeHeroCarousel(state.api, state.entries, { animate: false });
  assert.deepEqual(positions(state.after), [-256, -256, -256]);
  assert.equal(state.calls.some(call => call.action === 'animate'), false);
  assert.equal(state.calls.filter(call => call.action === 'emit' && call.event === 'resize').length, 1);
});
