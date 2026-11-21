import test from 'node:test';
import assert from 'node:assert/strict';
import { initPageMotion } from '../public/page-motion.js';

function page() {
  const doc = new EventTarget(), media = new EventTarget(), calls = [];
  doc.body = { dataset: { appState: 'ready' } };
  doc.hidden = false;
  media.matches = false;
  doc.querySelector = selector => ({ hidden: false, animate(frames, timing) {
    const call = { selector, frames, timing, canceled: false };
    calls.push(call);
    return { cancel() { call.canceled = true; }, finished: new Promise(() => {}) };
  } });
  let listener;
  const controller = initPageMotion({ document: doc, window: { matchMedia: () => media }, router: {
    getRoute: () => ({ type: 'home' }),
    subscribe(fn, options) { assert.ok(options.priority > 0); listener = fn; return () => { listener = null; }; }
  } });
  return { doc, media, calls, controller, navigate: (route, meta) => listener(route, meta) };
}

test('destination changes reveal only their content while typing and filtering remain immediate', () => {
  const p = page();
  p.navigate({ type: 'search', query: '' });
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].selector, '#lobby-view');
  assert.ok(p.calls[0].frames.every(frame => !('transform' in frame)));
  p.navigate({ type: 'search', query: 'gold', providerId: 'netent', sort: 'az' });
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].canceled, true);
  p.navigate({ type: 'feature', pageId: 'achievements' });
  assert.equal(p.calls.at(-1).selector, '#feature-view');
  p.navigate({ type: 'store' });
  assert.equal(p.calls.at(-1).selector, '#store-view');
  assert.equal(p.calls.at(-2).canceled, true, 'rapid navigation cancels the previous reveal');
  p.navigate({ type: 'category', gameTypeId: 'slots' });
  const count = p.calls.length;
  p.navigate({ type: 'category', gameTypeId: 'arcade' }, { preserveScroll: true, focus: false });
  p.navigate({ type: 'search' }, { preserveScroll: true, focus: false });
  assert.equal(p.calls.length, count, 'changing or clearing game-type filters is not page navigation');
});

test('game launches retain provider loading while returning to details may reveal normally', () => {
  const p = page();
  p.navigate({ type: 'game', gameId: 'one' });
  assert.equal(p.calls.length, 0);
  p.navigate({ type: 'game-details', gameId: 'one' });
  assert.equal(p.calls[0].selector, '#game-details-view');
});

test('startup, background and reduced-motion preferences do not add page animation', () => {
  const p = page();
  p.doc.body.dataset.appStarting = 'true';
  p.navigate({ type: 'search' });
  delete p.doc.body.dataset.appStarting;
  p.media.matches = true;
  p.navigate({ type: 'home' });
  p.media.matches = false;
  p.doc.hidden = true;
  p.navigate({ type: 'store' });
  p.doc.hidden = false;
  p.doc.body.dataset.reduceMotion = 'true';
  p.navigate({ type: 'home' });
  assert.equal(p.calls.length, 0);
  delete p.doc.body.dataset.reduceMotion;
  p.navigate({ type: 'search' });
  p.media.matches = true;
  p.media.dispatchEvent(new Event('change'));
  assert.equal(p.calls[0].canceled, true);
  p.controller.destroy();
});
