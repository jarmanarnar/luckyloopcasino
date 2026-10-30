import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/hero-carousel.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initHeroCarousel', 'function initHeroCarousel');

function heroPage({ reduced = false, intersection = true } = {}) {
  const calls = [], timers = new Map(), mutations = [], intersections = [];
  let timerId = 0, selected = 0, modal = false, factories = 0;
  const document = { body: { dataset: { view: 'lobby' } }, hidden: false, activeElement: null };
  class Node {
    constructor() { this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.children = []; this.hidden = false; this.disabled = false; this.textContent = ''; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(callback);
    }
    emit(type, details = {}) {
      const event = { target: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...details };
      for (const callback of this.listeners.get(type) || []) callback(event);
      return event;
    }
    click() {
      if (this.disabled) return;
      const event = this.emit('click');
      for (let node = this.parent; node; node = node.parent) node.emit('click', event);
    }
    contains(node) { for (let next = node; next; next = next.parent) if (next === this) return true; return false; }
    closest(selector) {
      const property = { '[data-hero-index]': 'heroIndex', '[data-hero-category]': 'heroCategory' }[selector];
      if (!property) throw new Error(`Unexpected selector: ${selector}`);
      return Object.hasOwn(this.dataset, property) ? this : this.parent?.closest(selector) || null;
    }
    scrollIntoView(options) { calls.push({ action: 'scroll-results', options }); }
    focus(options) { document.activeElement = this; calls.push({ action: 'focus-results', options }); }
  }
  const ids = ['hero-carousel', 'hero-viewport', 'hero-track', 'hero-dots',
    'hero-status', 'hero-controls', 'catalog-categories', 'catalog-shelves'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  const root = nodes['hero-carousel'];
  root.append(nodes['hero-viewport'], nodes['hero-controls']);
  nodes['hero-viewport'].append(nodes['hero-track']);
  nodes['hero-controls'].append(nodes['hero-dots']);
  nodes['hero-controls'].hidden = true;
  const slides = ['Our Picks', 'Game Providers', 'Tap Games', 'Slots'].map((title, index) => {
    const slide = new Node(), cta = new Node();
    slide.dataset.heroTitle = title;
    cta.dataset.heroCategory = ['picks', 'providers', 'tap', 'slots'][index];
    slide.append(cta);
    nodes['hero-track'].append(slide);
    return slide;
  });
  nodes['hero-track'].querySelectorAll = selector => { assert.equal(selector, '.hero-carousel__slide'); return slides; };
  const firstShelf = new Node();
  nodes['catalog-shelves'].querySelector = selector => { assert.equal(selector, '.game-shelf'); return firstShelf; };
  let provider = 'netent', category = 'all';
  const categoryButtons = Object.fromEntries(['all', 'picks', 'providers', 'tap', 'slots'].map(id => {
    const button = new Node();
    button.addEventListener('click', () => {
      calls.push({ action: 'category', id });
      if (id === 'all' || id === 'providers') provider = '';
      category = id;
    });
    return [id, button];
  }));
  nodes['catalog-categories'].querySelector = selector => categoryButtons[selector.match(/^\[data-category="([^"]+)"\]$/)?.[1]] || null;
  const listeners = new Map();
  const emit = type => { for (const callback of listeners.get(type) || []) callback(api, type); };
  const api = {
    selectedScrollSnap: () => selected,
    scrollSnapList: () => [0, 1, 2, 3],
    on(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); return api; },
    scrollTo(index, jump) { calls.push({ action: 'scrollTo', index, jump }); selected = ((index % 4) + 4) % 4; emit('select'); },
    scrollNext(jump) { calls.push({ action: 'scrollNext', jump }); selected = (selected + 1) % 4; emit('select'); },
    scrollPrev(jump) { calls.push({ action: 'scrollPrev', jump }); selected = (selected + 3) % 4; emit('select'); },
  };
  const motion = new Node(); motion.matches = reduced;
  const window = new Node();
  window.matchMedia = query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return motion; };
  window.setTimeout = (callback, duration) => { const id = ++timerId; timers.set(id, { callback, duration }); return id; };
  window.clearTimeout = id => timers.delete(id);
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; }
    observe(node, options) { this.targets.push({ node, options }); }
    disconnect() { this.disconnected = true; }
  }
  class MutationObserver extends Observer { constructor(callback) { super(callback); mutations.push(this); } }
  class IntersectionObserver extends Observer { constructor(callback) { super(callback); intersections.push(this); } }
  if (intersection) window.IntersectionObserver = IntersectionObserver;
  const documentEvents = new Node();
  document.addEventListener = documentEvents.addEventListener.bind(documentEvents);
  document.querySelector = selector => selector === 'dialog[open]' ? (modal ? new Node() : null) : nodes[selector.slice(1)] || null;
  document.createElement = () => new Node();
  const context = { document, window, Element: Node, MutationObserver, IntersectionObserver,
    EmblaCarousel(viewport, options) { factories++; assert.equal(viewport, nodes['hero-viewport']); calls.push({ action: 'init', options }); return api; } };
  vm.runInNewContext(`${source}\ninitHeroCarousel();`, context);
  return {
    nodes, slides, calls, timers, api, document, firstShelf, categoryButtons, motion, window, mutations, intersections, context,
    get factories() { return factories; }, get provider() { return provider; }, get category() { return category; },
    visible(value = true) { intersections[0]?.callback([{ target: root, isIntersecting: value }]); },
    fireTimer() { assert.equal(timers.size, 1); const [id, timer] = timers.entries().next().value; timers.delete(id); timer.callback(); },
    select(index) { selected = index; emit('select'); }, emit,
    modal(value) { modal = value; mutations[0].callback(); },
    visibility(value) { document.hidden = value; documentEvents.emit('visibilitychange'); },
  };
}

test('initializes once, reveals controls, and labels the four promotions with one selected dot', () => {
  const page = heroPage();
  page.context.initHeroCarousel();
  assert.equal(page.factories, 1);
  assert.equal(page.calls[0].options.loop, true);
  assert.equal(page.nodes['hero-carousel'].dataset.ready, 'true');
  assert.equal(page.nodes['hero-controls'].hidden, false);
  const dots = page.nodes['hero-dots'].children;
  assert.equal(dots.length, 4);
  assert.equal(dots[0].getAttribute('aria-label'), 'Show promotion 1: Our Picks');
  assert.deepEqual(dots.map(dot => dot.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false']);
  assert.equal(page.slides[3].getAttribute('aria-label'), '4 of 4: Slots');
  assert.equal(page.nodes['hero-status'].textContent, '');
  assert.equal(page.timers.size, 0, 'intersection must confirm visibility before autoplay');
});

test('dots and viewport keys navigate through the loop and announce only manual changes', () => {
  const page = heroPage();
  page.nodes['hero-viewport'].emit('keydown', { key: 'ArrowLeft' });
  assert.equal(page.nodes['hero-dots'].children[3].getAttribute('aria-pressed'), 'true');
  assert.match(page.nodes['hero-status'].textContent, /Promotion 4 of 4: Slots/);
  page.nodes['hero-viewport'].emit('keydown', { key: 'ArrowRight' });
  assert.equal(page.nodes['hero-dots'].children[0].getAttribute('aria-pressed'), 'true');
  page.nodes['hero-dots'].children[2].children[0].click();
  assert.equal(page.nodes['hero-dots'].children[2].getAttribute('aria-pressed'), 'true');
  const key = page.nodes['hero-viewport'].emit('keydown', { key: 'ArrowRight' });
  assert.equal(key.defaultPrevented, true);
  assert.match(page.nodes['hero-status'].textContent, /Promotion 4 of 4/);
  const before = page.calls.length;
  assert.equal(page.nodes['hero-viewport'].emit('keydown', { key: 'ArrowLeft', altKey: true }).defaultPrevented, false);
  assert.equal(page.calls.length, before);
});

test('one six-second timer rotates without live announcements and stops for game, modal, hidden, and offscreen states', () => {
  const page = heroPage();
  page.visible();
  assert.equal([...page.timers.values()][0].duration, 6000);
  page.fireTimer();
  assert.equal(page.nodes['hero-dots'].children[1].getAttribute('aria-pressed'), 'true');
  assert.equal(page.nodes['hero-status'].textContent, '');
  assert.equal(page.timers.size, 1);
  page.select(3); page.fireTimer();
  assert.equal(page.nodes['hero-dots'].children[0].getAttribute('aria-pressed'), 'true');
  assert.equal(page.nodes['hero-status'].textContent, '');
  page.document.body.dataset.view = 'game'; page.mutations[0].callback();
  assert.equal(page.timers.size, 0);
  page.document.body.dataset.view = 'lobby'; page.mutations[0].callback();
  assert.equal(page.timers.size, 1);
  page.modal(true); assert.equal(page.timers.size, 0);
  page.modal(false); assert.equal(page.timers.size, 1);
  page.visibility(true); assert.equal(page.timers.size, 0);
  page.visibility(false); assert.equal(page.timers.size, 1);
  page.visible(false); assert.equal(page.timers.size, 0);
  page.visible(); assert.equal(page.timers.size, 1);
});

test('hover, focus, and dragging suspend rotation until all temporary pause states clear', () => {
  const page = heroPage(); page.visible();
  const root = page.nodes['hero-carousel'];
  root.emit('pointerenter', { pointerType: 'mouse' }); assert.equal(page.timers.size, 0);
  root.emit('pointerleave'); assert.equal(page.timers.size, 1);
  root.emit('pointerenter', { pointerType: 'touch' }); assert.equal(page.timers.size, 1);
  root.emit('focusin'); assert.equal(page.timers.size, 0);
  root.emit('focusout', { relatedTarget: page.nodes['hero-dots'].children[0] }); assert.equal(page.timers.size, 0);
  root.emit('focusout', { relatedTarget: null }); assert.equal(page.timers.size, 1);
  page.emit('pointerDown'); assert.equal(page.timers.size, 0);
  page.select(2); assert.equal(page.timers.size, 0);
  page.emit('pointerUp'); assert.equal(page.timers.size, 1);
  assert.match(page.nodes['hero-status'].textContent, /Tap Games/);
  root.emit('pointerenter', { pointerType: 'mouse' }); root.emit('focusin');
  root.emit('pointerleave'); assert.equal(page.timers.size, 0);
  root.emit('focusout', { relatedTarget: null }); assert.equal(page.timers.size, 1);
});

test('a tap without a slide change does not make a later autoplay movement announce', () => {
  const page = heroPage(); page.visible();
  page.emit('pointerDown'); page.emit('pointerUp'); page.emit('settle');
  page.fireTimer(); page.emit('settle');
  assert.equal(page.nodes['hero-status'].textContent, '');
});

test('reduced motion disables autoplay, jumps manual navigation, and updates without a page reload', () => {
  const page = heroPage({ reduced: true }); page.visible();
  assert.equal(page.timers.size, 0);
  page.nodes['hero-viewport'].emit('keydown', { key: 'ArrowRight' });
  assert.equal(page.calls.find(call => call.action === 'scrollNext').jump, true);
  page.motion.matches = false; page.motion.emit('change');
  assert.equal(page.timers.size, 1);
  page.nodes['hero-viewport'].emit('keydown', { key: 'ArrowRight' });
  assert.equal(page.calls.filter(call => call.action === 'scrollNext').at(-1).jump, false);
  page.motion.matches = true; page.motion.emit('change');
  assert.equal(page.timers.size, 0);
  page.motion.matches = false; page.motion.emit('change');
  assert.equal(page.timers.size, 1);
});

test('all banner CTAs clear the current provider before opening real collections and move focus to results', () => {
  for (let index = 0; index < 4; index++) {
    const page = heroPage({ reduced: index === 2 });
    const id = ['picks', 'providers', 'tap', 'slots'][index];
    page.slides[index].children[0].click();
    assert.deepEqual(page.calls.filter(call => call.action === 'category').map(call => call.id), ['all', id]);
    assert.equal(page.provider, '');
    assert.equal(page.category, id);
    const scroll = page.calls.find(call => call.action === 'scroll-results');
    assert.equal(scroll.options.behavior, index === 2 ? 'instant' : 'smooth');
    assert.equal(page.document.activeElement, page.firstShelf);
    assert.equal(page.firstShelf.tabIndex, -1);
    assert.equal(page.calls.at(-1).options.preventScroll, true);
  }
});

test('page suspension and carousel destruction clear timers; a restored page resumes safely', () => {
  const page = heroPage({ intersection: false });
  assert.equal(page.timers.size, 1);
  page.window.emit('pagehide'); assert.equal(page.timers.size, 0);
  page.window.emit('pageshow'); assert.equal(page.timers.size, 1);
  page.emit('destroy'); assert.equal(page.timers.size, 0);
  assert.equal(page.mutations[0].disconnected, true);
  assert.equal(page.nodes['hero-carousel'].dataset.ready, undefined);
  assert.equal(page.nodes['hero-controls'].hidden, true);
  page.window.emit('pageshow'); assert.equal(page.timers.size, 0);
});
