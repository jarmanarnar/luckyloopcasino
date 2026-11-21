import assert from 'node:assert/strict';
import test from 'node:test';
import { initPopoverMotion, closePopovers, POPUP_MOTION } from '../public/popover-motion.js';

function browser() {
  const events = () => ({ listeners: new Map(), addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn);
  }, emit(name, event = {}) {
    event.target ||= this; event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const fn of this.listeners.get(name) || []) fn(event);
    return event;
  } });
  const doc = { ...events(), body: { dataset: {} }, hidden: false, activeElement: null };
  const reduced = { ...events(), matches: false }, timers = new Map(), animations = [];
  let nextTimer = 0;
  const scope = { matchMedia: () => reduced, getComputedStyle: element => ({ opacity: element.opacity, transform: element.transform, translate: element.translate }),
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); } };
  doc.defaultView = scope;
  function element(id) { return { ...events(), id, ownerDocument: doc, dataset: {}, attributes: {}, opacity: '1', transform: 'none', translate: 'none', inert: false,
    setAttribute(key, value) { this.attributes[key] = value; }, getAttribute(key) { return this.attributes[key]; },
    contains(target) { return target === this || target.parent === this; }, focus() { doc.activeElement = this; },
    matches(selector) { return selector === ':popover-open' && Boolean(this.open); },
    showPopover() { const event = this.emit('beforetoggle', { newState: 'open' }); if (!event.defaultPrevented) this.open = true; },
    hidePopover() { this.open = false; },
    animate(frames, options) {
      let resolve, reject;
      const animation = { frames, options, cancelled: false, target: this,
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        finish() { resolve(); }, cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
      animations.push(animation); return animation;
    } };
  }
  function popup(id) {
    const panel = element(id), trigger = element(`${id}-trigger`);
    const motion = initPopoverMotion(panel, { trigger });
    return { panel, trigger, motion };
  }
  async function finish() { animations.at(-1).finish(); await Promise.resolve(); await Promise.resolve(); }
  return { doc, reduced, timers, animations, popup, element, finish,
    flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}

test('popover toggle uses identical entry/exit motion and reverses a closing panel from its visible frame', async () => {
  const page = browser(), { panel, trigger, motion } = page.popup('rewards');
  trigger.emit('click');
  assert.equal(panel.open, true); assert.equal(panel.attributes.popover, 'manual');
  assert.deepEqual(page.animations[0].frames[0], { opacity: 0, translate: '0 20px' });
  await page.finish(); trigger.emit('click');
  const exit = page.animations.at(-1);
  assert.equal(exit.options.duration, POPUP_MOTION.duration);
  assert.equal(exit.options.easing, page.animations[0].options.easing);
  assert.deepEqual(exit.frames.at(-1), page.animations[0].frames[0]);
  assert.equal(panel.inert, true); assert.equal(panel.open, true);
  panel.opacity = '.55'; panel.translate = '0px 9px';
  trigger.emit('click');
  assert.equal(exit.cancelled, true); assert.equal(panel.inert, false); assert.equal(motion.isClosing(), false);
  assert.deepEqual(page.animations.at(-1).frames[0], { opacity: '.55', translate: '0px 9px' });
  await page.finish();
  motion.dismiss({ restoreFocus: true }); await page.finish();
  assert.equal(panel.open, false); assert.equal(panel.inert, false); assert.equal(page.doc.activeElement, trigger);
  assert.equal(page.timers.size, 0);
});

test('popover group preserves exclusivity and immediate handoffs; outside dismissal does not steal focus', async () => {
  const page = browser(), rewards = page.popup('rewards'), profile = page.popup('profile');
  rewards.panel.showPopover(); profile.panel.showPopover();
  assert.equal(rewards.panel.open, false); assert.equal(rewards.panel.inert, false);
  const outside = page.element('outside');
  page.doc.emit('pointerdown', { target: outside }); outside.focus();
  assert.equal(profile.panel.open, true); await page.finish();
  assert.equal(profile.panel.open, false); assert.equal(page.doc.activeElement, outside);
  profile.panel.showPopover();
  page.doc.emit('keydown', { key: 'Escape' }); await page.finish();
  assert.equal(page.doc.activeElement, profile.trigger);
  rewards.panel.showPopover(); rewards.motion.dismiss(); closePopovers(page.doc);
  assert.equal(rewards.panel.open, false); assert.equal(rewards.panel.inert, false);
  profile.panel.showPopover(); profile.panel.hidePopover();
  assert.equal(profile.panel.open, false, 'programmatic hide is never delayed');
  await Promise.resolve(); assert.equal(page.timers.size, 0);
});

test('guarded opens, timeout fallback, reduced motion and hidden wallet panels retain their behavior', async () => {
  const page = browser(), guarded = page.popup('guarded');
  guarded.panel.addEventListener('beforetoggle', event => event.preventDefault());
  guarded.motion.open(); assert.equal(Boolean(guarded.panel.open), false); assert.equal(page.animations.length, 0);
  const wallet = page.element('wallet'), trigger = page.element('wallet-trigger'); wallet.hidden = true;
  wallet.transform = 'translateX(-50%)';
  const motion = initPopoverMotion(wallet, { trigger, native: false, bindTrigger: false,
    isOpen: () => !wallet.hidden, show: () => { wallet.hidden = false; }, hide: () => { wallet.hidden = true; } });
  motion.open(); motion.dismiss(); page.flush();
  assert.ok(page.animations.every(animation => animation.frames.every(frame => !Object.hasOwn(frame, 'transform'))), 'motion must not replace the wallet centering transform');
  assert.equal(wallet.transform, 'translateX(-50%)');
  assert.equal(wallet.hidden, true); assert.equal(wallet.inert, false);
  motion.open(); motion.dismiss(); page.reduced.matches = true; page.reduced.emit('change');
  assert.equal(wallet.hidden, true); assert.equal(page.timers.size, 0);
  const count = page.animations.length; motion.open(); motion.dismiss();
  assert.equal(page.animations.length, count); assert.equal(wallet.hidden, true);
  await Promise.resolve();
});
