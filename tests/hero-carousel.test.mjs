import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { resizeHeroCarousel } from '../public/hero-resize.js';

const source = (await readFile(new URL('../public/hero-carousel.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initHeroCarousel', 'function initHeroCarousel');

function heroPage({ reduced = false, intersection = true, starting = false, welcomeGuest = false, nolimitMember = false, signedIn = false, nativeScrollLeft = 0 } = {}) {
  const calls = [], timers = new Map(), mutations = [], intersections = [], animations = [], providerCalls = [];
  const accountListeners = new Set();
  let authenticated = signedIn;
  let timerId = 0, selected = 0, modal = false, factories = 0, now = 0;
  const document = { body: { dataset: { view: 'lobby' } }, hidden: false, activeElement: null };
  if (starting) Object.assign(document.body.dataset, { appState: 'loading', appStarting: 'true' });
  class Node {
    constructor() { this.dataset = {}; this.style = {}; this.attributes = new Map(); this.listeners = new Map(); this.children = []; this.hidden = false; this.disabled = false; this.textContent = ''; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren() { for (const child of this.children) child.parent = null; this.children = []; }
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
    matches(selector) { assert.equal(selector, ':focus-visible'); return this.focusVisible === true; }
    closest(selector) {
      const property = { '[data-hero-index]': 'heroIndex', '[data-hero-category]': 'heroCategory' }[selector];
      if (!property) throw new Error(`Unexpected selector: ${selector}`);
      return Object.hasOwn(this.dataset, property) ? this : this.parent?.closest(selector) || null;
    }
    scrollIntoView(options) { calls.push({ action: 'scroll-results', options }); }
    focus(options) { document.activeElement = this; calls.push({ action: 'focus-results', options }); }
    animate(keyframes, options) {
      let currentTime = 0, startedAt = now, playState = 'running';
      const animation = {
        target: this, keyframes, options,
        get currentTime() { return playState === 'running' ? Math.min(options.duration, currentTime + now - startedAt) : currentTime; },
        set currentTime(value) { currentTime = value; startedAt = now; },
        get playState() { return playState; },
        play() { startedAt = now; playState = 'running'; },
        pause() { currentTime = this.currentTime; playState = 'paused'; },
        cancel() { currentTime = null; playState = 'idle'; },
      };
      animations.push(animation);
      return animation;
    }
  }
  const ids = ['hero-carousel', 'hero-viewport', 'hero-track', 'hero-dots',
    'hero-status', 'hero-controls', 'catalog-categories', 'catalog-shelves'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  nodes['hero-viewport'].scrollLeft = nativeScrollLeft;
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
    return slide;
  });
  if (nolimitMember) {
    const nolimit = new Node(), explore = new Node();
    Object.assign(nolimit.dataset, { heroTitle: 'Nolimit City', heroMember: '' });
    nolimit.hidden = true;
    explore.dataset.heroCategory = 'nolimit-city';
    nolimit.append(explore);
    slides.splice(3, 0, nolimit);
  }
  if (welcomeGuest) {
    const welcome = new Node(), register = new Node();
    Object.assign(welcome.dataset, { heroTitle: 'Welcome Bonus', heroGuest: '' });
    register.dataset.authOpen = 'register';
    welcome.append(register);
    slides.unshift(welcome);
  }
  nodes['hero-track'].append(...slides);
  nodes['hero-track'].querySelectorAll = selector => { assert.equal(selector, '.hero-carousel__slide'); return slides; };
  const firstShelf = new Node();
  nodes['catalog-shelves'].querySelector = selector => { assert.equal(selector, '.game-shelf'); return firstShelf; };
  let provider = 'netent', category = 'all';
  nodes['catalog-categories'].dataset.activeMenu = 'all';
  const categoryButtons = Object.fromEntries(['all', 'picks', 'tap', 'slots'].map(id => {
    const button = new Node();
    button.dataset.category = id;
    button.setAttribute('aria-pressed', String(id === 'all'));
    button.addEventListener('click', () => {
      calls.push({ action: 'category', id });
      if (id === 'all') provider = '';
      category = id;
      nodes['catalog-categories'].dataset.activeMenu = id;
      for (const [candidate, node] of Object.entries(categoryButtons)) node.setAttribute('aria-pressed', String(candidate === id));
    });
    return [id, button];
  }));
  nodes['catalog-categories'].querySelector = selector => categoryButtons[selector.match(/^\[data-category="([^"]+)"\]$/)?.[1]] || null;
  const listeners = new Map();
  const emit = type => { for (const callback of listeners.get(type) || []) callback(api, type); };
  let activeSlides = slides;
  const wrapIndex = index => ((index % activeSlides.length) + activeSlides.length) % activeSlides.length;
  const api = {
    selectedScrollSnap: () => selected,
    scrollSnapList: () => activeSlides.map((_, index) => index),
    slideNodes: () => activeSlides,
    on(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); return api; },
    scrollTo(index, jump) { calls.push({ action: 'scrollTo', index, jump }); selected = wrapIndex(index); emit('select'); },
    scrollNext(jump) { calls.push({ action: 'scrollNext', jump }); selected = wrapIndex(selected + 1); emit('select'); },
    scrollPrev(jump) { calls.push({ action: 'scrollPrev', jump }); selected = wrapIndex(selected - 1); emit('select'); },
    reInit(options = {}) {
      if (options.slides) activeSlides = [...options.slides];
      selected = Math.max(0, Math.min(options.startIndex ?? selected, activeSlides.length - 1));
      calls.push({ action: 'reInit', slides: [...activeSlides], startIndex: selected, nativeScrollLeft: nodes['hero-viewport'].scrollLeft });
      emit('reInit');
    },
  };
  const motion = new Node(); motion.matches = reduced;
  const window = new Node();
  window.matchMedia = query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return motion; };
  window.performance = { now: () => now };
  window.setTimeout = (callback, duration) => { const id = ++timerId; timers.set(id, { callback, duration, due: now + duration }); return id; };
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
  const catalog = {
    account: {
      isSignedIn: () => authenticated,
      subscribe(listener) { accountListeners.add(listener); return () => accountListeners.delete(listener); },
    },
    openStore() { calls.push({ action: 'open-store' }); },
    openFeature(id) { calls.push({ action: 'open-feature', id }); },
    openProvider(id) { calls.push({ action: 'open-provider', id }); },
    openSpinWheel(options) { calls.push({ action: 'open-wheel', returnFocusTo: options.returnFocusTo }); },
    openHome() { provider = ''; category = 'all'; calls.push({ action: 'navigate', id: 'all' }); },
    openCategory(id) { provider = ''; category = id; calls.push({ action: 'navigate', id }); },
    openProviders(options) {
      providerCalls.push(options);
      calls.push({ action: 'navigate', id: 'providers' });
      provider = '';
      category = 'providers';
      nodes['catalog-categories'].dataset.activeMenu = 'providers';
      for (const button of Object.values(categoryButtons)) button.setAttribute('aria-pressed', 'false');
    },
  };
  const context = { document, window, Element: Node, MutationObserver, IntersectionObserver,
    catalog, resizeHeroCarousel,
    EmblaCarousel(viewport, options) { factories++; assert.equal(viewport, nodes['hero-viewport']); activeSlides = [...(options.slides || slides)]; calls.push({ action: 'init', options, nativeScrollLeft: viewport.scrollLeft, ready: root.dataset.ready }); return api; } };
  vm.runInNewContext(`${source}\ninitHeroCarousel(catalog);`, context);
  return {
    nodes, slides, calls, timers, api, document, firstShelf, categoryButtons, motion, window, mutations, intersections, animations, context, providerCalls,
    get factories() { return factories; }, get provider() { return provider; }, get category() { return category; },
    get accountSubscriptionCount() { return accountListeners.size; },
    setSignedIn(value) { authenticated = value; for (const listener of accountListeners) listener(); },
    notifyAccount() { for (const listener of accountListeners) listener(); },
    visible(value = true) { intersections[0]?.callback([{ target: root, isIntersecting: value }]); },
    elapse(duration) { now += duration; },
    fireTimer() { assert.equal(timers.size, 1); const [id, timer] = timers.entries().next().value; now = Math.max(now, timer.due); timers.delete(id); timer.callback(); },
    select(index) { selected = index; emit('select'); }, emit,
    modal(value) { modal = value; mutations[0].callback(); },
    visibility(value) { document.hidden = value; documentEvents.emit('visibilitychange'); },
    preferenceMotion(value) { document.body.dataset.reduceMotion = String(value); documentEvents.emit('loop:preferences-change'); },
  };
}

test('banner autoplay waits until the loader and first revealed paint finish', () => {
  const page = heroPage({ starting: true });
  page.visible();
  assert.equal(page.timers.size, 0);
  assert.equal(page.animations.some(animation => animation.playState === 'running'), false);
  page.document.body.dataset.appState = 'ready'; page.mutations[0].callback();
  assert.equal(page.timers.size, 0, 'the first revealed paint remains still');
  delete page.document.body.dataset.appStarting; page.mutations[0].callback();
  assert.equal(page.timers.size, 1);
  assert.equal([...page.timers.values()][0].duration, 6000);
});

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

test('guests start with the welcome slide and members have no hidden promotion snap', () => {
  const guest = heroPage({ welcomeGuest: true });
  assert.equal(guest.api.slideNodes()[0], guest.slides[0]);
  assert.equal(guest.slides[0].hidden, false);
  assert.equal(guest.api.selectedScrollSnap(), 0);
  assert.equal(guest.api.scrollSnapList().length, 5);
  assert.equal(guest.nodes['hero-dots'].children.length, 5);
  assert.equal(guest.slides[0].getAttribute('aria-label'), '1 of 5: Welcome Bonus');
  assert.equal(guest.nodes['hero-dots'].children[0].getAttribute('aria-pressed'), 'true');

  const member = heroPage({ welcomeGuest: true, signedIn: true });
  assert.equal(member.slides[0].hidden, true);
  assert.equal(member.api.slideNodes()[0], member.slides[1]);
  assert.equal(member.api.scrollSnapList().length, 4);
  assert.equal(member.nodes['hero-dots'].children.length, 4);
  assert.equal(member.slides[1].getAttribute('aria-label'), '1 of 4: Our Picks');
  member.nodes['hero-viewport'].emit('keydown', { key: 'ArrowLeft' });
  assert.equal(member.api.slideNodes()[member.api.selectedScrollSnap()], member.slides[4]);
  member.nodes['hero-viewport'].emit('keydown', { key: 'ArrowRight' });
  assert.equal(member.api.slideNodes()[member.api.selectedScrollSnap()], member.slides[1]);
});

test('guest and member audiences each have five real slides, showing only their own promotion', () => {
  for (const signedIn of [false, true]) {
    const page = heroPage({ welcomeGuest: true, nolimitMember: true, signedIn });
    const welcome = page.slides[0];
    const nolimit = page.slides.find(slide => slide.dataset.heroTitle === 'Nolimit City');
    assert.equal(welcome.hidden, signedIn);
    assert.equal(nolimit.hidden, !signedIn);
    assert.equal(page.api.slideNodes().includes(welcome), !signedIn);
    assert.equal(page.api.slideNodes().includes(nolimit), signedIn);
    assert.equal(page.api.slideNodes()[0], page.slides[signedIn ? 1 : 0]);
    assert.equal(page.api.scrollSnapList().length, 5);
    assert.equal(page.nodes['hero-dots'].children.length, 5);
    assert.equal(page.nodes['hero-track'].children.length, 6);
    assert.equal(page.api.slideNodes().every(slide => !slide.hidden), true);
    const titles = page.nodes['hero-dots'].children.map(dot => dot.getAttribute('aria-label'));
    assert.equal(titles.some(title => title.includes('Nolimit City')), signedIn);
    assert.equal(titles.some(title => title.includes('Welcome Bonus')), !signedIn);
  }
});

test('audience transitions exchange welcome and Nolimit without losing a public selection or creating empty dots', () => {
  const page = heroPage({ welcomeGuest: true, nolimitMember: true });
  const welcome = page.slides[0];
  const nolimit = page.slides.find(slide => slide.dataset.heroTitle === 'Nolimit City');
  page.visible();
  for (let cycle = 0; cycle < 3; cycle++) {
    page.select(3);
    const selected = page.api.slideNodes()[3];
    page.setSignedIn(true);
    assert.equal(page.api.slideNodes()[page.api.selectedScrollSnap()], selected);
    assert.equal(page.api.selectedScrollSnap(), 2);
    assert.equal(nolimit.hidden, false);
    assert.equal(welcome.hidden, true);
    assert.equal(page.nodes['hero-dots'].children.length, 5);
    assert.equal(page.nodes['hero-dots'].children[2].getAttribute('aria-pressed'), 'true');
    page.select(page.api.slideNodes().indexOf(nolimit));
    page.setSignedIn(false);
    assert.equal(page.api.selectedScrollSnap(), 0);
    assert.equal(page.api.slideNodes()[0], welcome);
    assert.equal(nolimit.hidden, true);
    assert.equal(page.api.slideNodes().includes(nolimit), false);
    assert.equal(page.api.scrollSnapList().length, 5);
    assert.equal(page.nodes['hero-dots'].children.length, 5);
    assert.equal(page.nodes['hero-dots'].children[0].getAttribute('aria-pressed'), 'true');
    assert.equal(new Set(page.api.slideNodes()).size, 5);
    assert.equal(page.nodes['hero-track'].children.length, 6);
    assert.equal(page.timers.size, 1);
  }
});

test('initializing a guest carousel clears restored native scroll before Embla measures the first welcome slide', () => {
  const page = heroPage({ welcomeGuest: true, nativeScrollLeft: 368 });
  const initialization = page.calls.find(call => call.action === 'init');
  assert.equal(initialization.ready, 'true', 'disable native scroll-snap fallback before measurement');
  assert.equal(initialization.nativeScrollLeft, 0, 'restored wheel scroll must not offset the welcome under Embla');
  assert.equal(page.nodes['hero-viewport'].scrollLeft, 0);
  assert.equal(page.api.selectedScrollSnap(), 0);
  assert.equal(page.api.slideNodes()[0], page.slides[0]);
});

test('audience changes clear native scroll before remeasuring both member and guest slides', () => {
  const page = heroPage({ welcomeGuest: true });
  for (const signedIn of [true, false]) {
    page.nodes['hero-viewport'].scrollLeft = 368;
    page.setSignedIn(signedIn);
    const reinit = page.calls.filter(call => call.action === 'reInit').at(-1);
    assert.equal(reinit.nativeScrollLeft, 0);
    assert.equal(page.nodes['hero-viewport'].scrollLeft, 0);
    assert.equal(page.api.selectedScrollSnap(), 0);
    assert.equal(page.api.slideNodes()[0], page.slides[signedIn ? 1 : 0]);
  }
});

test('login preserves a selected public promotion and logout returns to the first welcome without duplicates', () => {
  const page = heroPage({ welcomeGuest: true });
  page.visible();
  page.select(3);
  const selectedSlide = page.api.slideNodes()[3];
  const previousFill = page.animations.at(-1);
  page.elapse(1200);
  page.setSignedIn(true);
  assert.equal(page.api.slideNodes()[page.api.selectedScrollSnap()], selectedSlide);
  assert.equal(page.api.selectedScrollSnap(), 2);
  assert.equal(page.slides[0].hidden, true);
  assert.equal(page.nodes['hero-dots'].children.length, 4);
  assert.equal(page.nodes['hero-dots'].children[2].getAttribute('aria-pressed'), 'true');
  assert.equal(previousFill.playState, 'idle');
  assert.equal(page.timers.size, 1);

  for (let cycle = 0; cycle < 3; cycle++) {
    page.setSignedIn(false);
    assert.equal(page.api.selectedScrollSnap(), 0);
    assert.equal(page.api.slideNodes()[0], page.slides[0]);
    assert.equal(page.slides[0].hidden, false);
    assert.equal(page.nodes['hero-dots'].children.length, 5);
    assert.equal(page.nodes['hero-dots'].children[0].getAttribute('aria-pressed'), 'true');
    assert.equal(new Set(page.api.slideNodes()).size, 5);
    assert.equal(page.nodes['hero-track'].children.length, 5);
    assert.equal(page.slides[4].getAttribute('aria-label'), '5 of 5: Slots');
    assert.equal(page.timers.size, 1);
    page.setSignedIn(true);
    assert.equal(page.api.selectedScrollSnap(), 0, 'removing a selected welcome falls back to the first member promotion');
    assert.equal(page.api.slideNodes()[0], page.slides[1]);
    assert.equal(page.nodes['hero-dots'].children.length, 4);
    assert.equal(page.slides[4].getAttribute('aria-label'), '4 of 4: Slots');
    assert.equal(page.timers.size, 1);
  }
  assert.equal(page.factories, 1, 'audience changes reinitialize the same carousel');
  assert.equal(page.calls.filter(call => call.action === 'reInit').length, 7);
});

test('wallet notifications preserve the selected promotion, dot nodes, fill and autoplay deadline', () => {
  for (const signedIn of [false, true]) {
    const page = heroPage({ welcomeGuest: true, signedIn });
    page.visible();
    page.select(2);
    const selectedSlide = page.api.slideNodes()[2];
    const dot = page.nodes['hero-dots'].children[2];
    const fill = page.animations.at(-1), animationCount = page.animations.length;
    const timerId = [...page.timers.keys()][0];
    page.elapse(1800);
    page.notifyAccount(); page.notifyAccount();
    assert.equal(page.calls.some(call => call.action === 'reInit'), false);
    assert.equal(page.api.slideNodes()[page.api.selectedScrollSnap()], selectedSlide);
    assert.equal(page.nodes['hero-dots'].children[2], dot);
    assert.equal(page.animations.length, animationCount);
    assert.equal(page.animations.at(-1), fill);
    assert.equal(fill.currentTime, 1800);
    assert.equal(page.timers.size, 1);
    assert.equal([...page.timers.keys()][0], timerId);
    assert.equal([...page.timers.values()][0].due, 6000);
  }
});

test('destroy unsubscribes from account updates and cannot rebuild the welcome slide or restart autoplay', () => {
  const page = heroPage({ welcomeGuest: true });
  page.visible();
  assert.equal(page.accountSubscriptionCount, 1);
  const dot = page.nodes['hero-dots'].children[0];
  const fill = page.animations.at(-1);
  page.emit('destroy');
  assert.equal(page.accountSubscriptionCount, 0);
  assert.equal(page.timers.size, 0);
  assert.equal(fill.playState, 'idle');
  page.setSignedIn(true); page.setSignedIn(false); page.notifyAccount();
  assert.equal(page.calls.some(call => call.action === 'reInit'), false);
  assert.equal(page.nodes['hero-dots'].children[0], dot);
  assert.equal(page.timers.size, 0);
});

test('saved site motion preference pauses autoplay and fill without overriding the operating-system preference', () => {
  const page = heroPage(); page.visible();
  assert.equal(page.timers.size, 1);
  page.preferenceMotion(true);
  assert.equal(page.timers.size, 0);
  assert.equal(page.animations.filter(animation => animation.playState === 'running').length, 0);
  page.nodes['hero-viewport'].emit('keydown', { key: 'ArrowRight' });
  assert.equal(page.calls.at(-1).jump, true);
  page.preferenceMotion(false);
  assert.equal(page.timers.size, 1);
  page.motion.matches = true; page.motion.emit('change');
  page.preferenceMotion(false);
  assert.equal(page.timers.size, 0);
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
  const dot = page.nodes['hero-dots'].children[0];
  root.focusVisible = true;
  dot.focusVisible = true;
  root.emit('pointerenter', { pointerType: 'mouse' }); assert.equal(page.timers.size, 0);
  root.emit('pointerleave'); assert.equal(page.timers.size, 1);
  root.emit('pointerenter', { pointerType: 'touch' }); assert.equal(page.timers.size, 1);
  root.emit('focusin'); assert.equal(page.timers.size, 0);
  root.emit('focusout', { relatedTarget: dot }); assert.equal(page.timers.size, 0);
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

test('touch focus keeps autoplay running after dot taps and audience changes', () => {
  const page = heroPage({ welcomeGuest: true }); page.visible();
  const root = page.nodes['hero-carousel'];
  const dot = page.nodes['hero-dots'].children[1];
  page.document.activeElement = dot;
  root.emit('focusin', { target: dot });
  dot.click();
  assert.equal(page.api.selectedScrollSnap(), 1);
  assert.equal(page.timers.size, 1, 'touch-focused dots must not leave autoplay paused');
  page.fireTimer();
  assert.equal(page.api.selectedScrollSnap(), 2);

  const cta = page.slides[2].children[0];
  page.document.activeElement = cta;
  root.emit('focusin', { target: cta });
  page.setSignedIn(true);
  assert.equal(page.timers.size, 1, 'audience updates must not promote touch focus to a keyboard pause');

  cta.focusVisible = true;
  root.emit('focusin', { target: cta });
  assert.equal(page.timers.size, 0, 'keyboard focus still pauses the carousel');
  const touchDot = page.nodes['hero-dots'].children[0];
  root.emit('focusout', { relatedTarget: touchDot });
  assert.equal(page.timers.size, 1, 'moving from keyboard focus to touch focus releases the pause');
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

test('banner CTAs navigate directly without clicking a hidden toolbar or resetting home first', () => {
  for (let index = 0; index < 4; index++) {
    const page = heroPage({ reduced: index === 2 });
    const id = ['picks', 'providers', 'tap', 'slots'][index];
    page.nodes['catalog-categories'].querySelector = () => { throw new Error('banner navigation must not query toolbar buttons'); };
    page.slides[index].children[0].click();
    assert.deepEqual(page.calls.filter(call => call.action === 'navigate').map(call => call.id), [id]);
    assert.equal(page.calls.some(call => ['category', 'scroll-results', 'focus-results'].includes(call.action)), false,
      'the destination owns rendering, scroll and focus');
    assert.equal(page.provider, '');
    assert.equal(page.category, id);
    if (id === 'providers') assert.equal(page.providerCalls.length, 1);
  }
  const page = heroPage();
  page.slides[0].children[0].dataset.heroCategory = 'all';
  page.slides[0].children[0].click();
  assert.deepEqual(page.calls.filter(call => call.action === 'navigate').map(call => call.id), ['all']);
});

test('wheel banner opens the existing wheel and returns focus to its CTA without navigating the catalog', () => {
  const page = heroPage();
  const button = page.slides[0].children[0];
  button.dataset.heroCategory = 'spin-wheel';
  button.click();
  const wheelCalls = page.calls.filter(call => call.action === 'open-wheel');
  assert.equal(wheelCalls.length, 1);
  assert.equal(wheelCalls[0].returnFocusTo, button);
  assert.equal(page.calls.some(call => call.action === 'navigate'), false);
  assert.equal(page.category, 'all');
});

test('offer banner opens the store without navigating or purchasing a package', () => {
  const page = heroPage();
  page.slides[1].children[0].dataset.heroCategory = 'store';
  page.slides[1].children[0].click();
  assert.equal(page.calls.filter(call => call.action === 'open-store').length, 1);
  assert.equal(page.calls.some(call => call.action === 'navigate'), false);
  assert.equal(page.category, 'all');
});

test('daily login and Nolimit banners open their existing destinations', () => {
  const page = heroPage();
  page.slides[1].children[0].dataset.heroCategory = 'achievements';
  page.slides[3].children[0].dataset.heroCategory = 'nolimit-city';
  page.slides[1].children[0].click();
  page.slides[3].children[0].click();
  assert.deepEqual(page.calls.filter(call => call.action.startsWith('open-')), [
    { action: 'open-feature', id: 'achievements' },
    { action: 'open-provider', id: 'nolimit-city' },
  ]);
  assert.equal(page.calls.some(call => call.action === 'navigate'), false);
});

test('leaving the lobby pauses the hidden hero immediately and resumes the remaining countdown on return', () => {
  const page = heroPage({ intersection: false });
  const root = page.nodes['hero-carousel'];
  const fill = page.animations.at(-1);
  page.elapse(1700);
  root.hidden = true;
  page.mutations[0].callback();
  assert.equal(page.timers.size, 0, 'the hidden page cannot retain an autoplay timer even without IntersectionObserver');
  assert.equal(fill.playState, 'paused');
  assert.equal(fill.currentTime, 1700);
  page.elapse(8000);
  page.window.emit('pageshow');
  assert.equal(page.timers.size, 0, 'other resume notifications cannot restart an off-home hero');
  root.hidden = false;
  page.mutations[0].callback();
  assert.equal(page.timers.size, 1);
  assert.equal([...page.timers.values()][0].duration, 4300);
  assert.equal(page.animations.at(-1), fill);
  const hiddenObservation = page.mutations[0].targets.find(target => target.node === root);
  assert.deepEqual([...hiddenObservation.options.attributeFilter], ['hidden']);
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

test('white fill and rotation share one countdown, including pauses with overlapping reasons', () => {
  const page = heroPage(); page.visible();
  const root = page.nodes['hero-carousel'];
  root.focusVisible = true;
  const fill = page.animations.at(-1);
  assert.equal(fill.target.className, 'hero-carousel__dot-fill');
  assert.equal(fill.options.duration, 6000);
  assert.equal(fill.options.easing, 'linear');
  assert.equal(fill.playState, 'running');
  page.elapse(2000);
  root.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(fill.playState, 'paused');
  assert.equal(fill.currentTime, 2000);
  assert.equal(page.timers.size, 0);
  page.elapse(3000);
  root.emit('focusin'); root.emit('pointerleave');
  assert.equal(fill.currentTime, 2000, 'elapsed wall time while paused must not fill the mark');
  assert.equal(page.timers.size, 0, 'focus still prevents a mouse leave from resuming');
  root.emit('focusout', { relatedTarget: null });
  assert.equal(fill.playState, 'running');
  assert.equal([...page.timers.values()][0].duration, 4000);
  assert.equal(page.animations.at(-1), fill, 'resuming must preserve the existing fill');
  page.elapse(500);
  assert.equal(fill.currentTime, 2500);
  page.fireTimer();
  assert.equal(page.nodes['hero-dots'].children[1].getAttribute('aria-pressed'), 'true');
});

test('repeated visibility, reinitialization, and body notifications do not restart the fill or deadline', () => {
  const page = heroPage(); page.visible();
  const fill = page.animations.at(-1), count = page.animations.length;
  page.elapse(2000);
  page.visible(); page.mutations[0].callback(); page.emit('reInit');
  assert.equal(page.animations.length, count);
  assert.equal(fill.currentTime, 2000);
  assert.equal(page.timers.size, 1);
  assert.equal([...page.timers.values()][0].due, 6000);
  page.fireTimer();
  assert.equal(page.nodes['hero-dots'].children[1].getAttribute('aria-pressed'), 'true');
});

test('responsive resizing pauses the countdown and resumes its remaining time after 160ms quiet', () => {
  const page = heroPage(); page.visible();
  const fill = page.animations.at(-1);
  page.elapse(1700);
  page.emit('resize');
  assert.equal(fill.playState, 'paused');
  assert.equal(fill.currentTime, 1700);
  assert.equal(page.timers.size, 1);
  assert.equal([...page.timers.values()][0].duration, 160);
  page.elapse(80);
  page.emit('reInit');
  page.emit('resize');
  assert.equal(page.timers.size, 1, 'new resize notifications replace the previous quiet timer');
  assert.equal(fill.currentTime, 1700);
  assert.equal(page.calls.some(call => call.action === 'scrollNext'), false);
  page.fireTimer();
  assert.equal(fill.playState, 'running');
  assert.equal(page.animations.at(-1), fill);
  assert.equal([...page.timers.values()][0].duration, 4300);
  page.fireTimer();
  assert.equal(page.nodes['hero-dots'].children[1].getAttribute('aria-pressed'), 'true');
});

test('finishing a resize does not bypass another autoplay pause reason', () => {
  const page = heroPage(); page.visible();
  const root = page.nodes['hero-carousel'], fill = page.animations.at(-1);
  page.elapse(1200);
  page.emit('resize');
  root.emit('pointerenter', { pointerType: 'mouse' });
  page.fireTimer();
  assert.equal(fill.playState, 'paused');
  assert.equal(page.timers.size, 0);
  root.emit('pointerleave');
  assert.equal(fill.playState, 'running');
  assert.equal([...page.timers.values()][0].duration, 4800);
});

test('destroying during a resize cancels its quiet timer and cannot restart autoplay', () => {
  const page = heroPage(); page.visible();
  const fill = page.animations.at(-1);
  page.emit('resize');
  assert.equal([...page.timers.values()][0].duration, 160);
  page.emit('destroy');
  assert.equal(page.timers.size, 0);
  assert.equal(fill.playState, 'idle');
  page.window.emit('pageshow'); page.visible(); page.mutations[0].callback();
  assert.equal(page.timers.size, 0);
});

test('manual navigation, including selecting the current dot, starts a fresh synchronized countdown', () => {
  const page = heroPage(); page.visible();
  const firstFill = page.animations.at(-1);
  page.elapse(1750);
  page.nodes['hero-dots'].children[0].children[0].click();
  const restartedFill = page.animations.at(-1);
  assert.equal(firstFill.playState, 'idle');
  assert.notEqual(restartedFill, firstFill);
  assert.equal(restartedFill.currentTime, 0);
  assert.equal([...page.timers.values()][0].duration, 6000);
  page.elapse(700);
  page.nodes['hero-dots'].children[2].children[0].click();
  assert.equal(restartedFill.playState, 'idle');
  assert.equal(page.animations.at(-1).currentTime, 0);
  assert.equal(page.nodes['hero-dots'].children[2].getAttribute('aria-pressed'), 'true');
  assert.equal(page.timers.size, 1);
  assert.equal([...page.timers.values()][0].duration, 6000);
});

test('autoplay completion rolls over to exactly one new fill and timer', () => {
  const page = heroPage(); page.visible();
  const previous = page.animations.at(-1), count = page.animations.length;
  page.fireTimer();
  assert.equal(previous.playState, 'idle');
  assert.equal(page.animations.length, count + 1);
  assert.equal(page.animations.at(-1).currentTime, 0);
  assert.equal(page.animations.at(-1).playState, 'running');
  assert.equal(page.timers.size, 1);
  assert.equal([...page.timers.values()][0].duration, 6000);
  assert.equal(page.nodes['hero-status'].textContent, '', 'progress must not create live announcements');
});

test('reduced motion and destruction leave no running fill or rotation', () => {
  const page = heroPage({ reduced: true }); page.visible();
  assert.equal(page.animations.length, 0);
  assert.equal(page.timers.size, 0);
  page.motion.matches = false; page.motion.emit('change');
  const fill = page.animations.at(-1);
  assert.equal(fill.playState, 'running');
  page.elapse(1500);
  page.motion.matches = true; page.motion.emit('change');
  assert.equal(fill.playState, 'idle');
  assert.equal(page.timers.size, 0);
  page.motion.matches = false; page.motion.emit('change');
  const resumed = page.animations.at(-1);
  assert.notEqual(resumed, fill);
  page.emit('destroy');
  assert.equal(resumed.playState, 'idle');
  assert.equal(page.timers.size, 0);
  const animationCount = page.animations.length;
  page.window.emit('pageshow'); page.visible();
  page.motion.matches = true; page.motion.emit('change');
  page.motion.matches = false; page.motion.emit('change');
  assert.equal(page.animations.length, animationCount, 'destroyed carousels must not create new animations');
  assert.equal(page.animations.filter(animation => animation.playState === 'running').length, 0);
});
