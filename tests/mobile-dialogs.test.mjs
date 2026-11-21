import assert from 'node:assert/strict';
import test from 'node:test';
import { initMobileDialogs } from '../public/mobile-dialogs.js';

test('mobile popup height follows the keyboard viewport, while desktop and pinch zoom keep native layout', () => {
  const events = () => ({ listeners: new Map(), addEventListener(name, fn) { this.listeners.set(name, fn); }, removeEventListener(name) { this.listeners.delete(name); } });
  const values = new Map(), frames = [];
  const media = { ...events(), matches: true };
  const viewport = { ...events(), height: 844, offsetTop: 0, scale: 1 };
  const scope = { ...events(), innerHeight: 844, visualViewport: viewport, matchMedia: () => media,
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {} };
  const doc = { ...events(), body: { dataset: {} }, documentElement: { style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } } };
  const flush = () => { while (frames.length) frames.shift()(); };
  const controller = initMobileDialogs({ window: scope, document: doc });
  assert.equal(values.get('--popup-viewport-height'), '844px');
  viewport.height = 420; viewport.offsetTop = 24;
  viewport.listeners.get('resize')(); viewport.listeners.get('scroll')();
  assert.equal(frames.length, 1, 'keyboard events share one layout update'); flush();
  assert.equal(values.get('--popup-viewport-height'), '420px');
  assert.equal(values.get('--popup-viewport-top'), '24px');
  viewport.scale = 2; viewport.listeners.get('resize')(); flush();
  assert.equal(values.size, 0, 'pinch zoom remains controlled by the browser');
  viewport.scale = 1; media.matches = false; media.listeners.get('change')(); flush();
  assert.equal(values.size, 0);
  controller.destroy();
  assert.equal(viewport.listeners.size, 0); assert.equal(scope.listeners.size, 0);
});
