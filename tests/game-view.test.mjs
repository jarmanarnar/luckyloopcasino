import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/game-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initGameView', 'function initGameView');

function gamePage({ hash = '', scrollY = 0 } = {}) {
  const frames = [], readiness = [], resizers = [], raf = new Map(), timers = new Map(), scrolls = [];
  let nextId = 1, currentHash = hash;
  const document = { activeElement: null };
  class Node {
    constructor(id = '') {
      this.id = id;
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.hidden = false;
      this.isConnected = true;
      this.style = { removeProperty(name) { delete this[name]; } };
    }
    append(...children) {
      for (const child of children) { child.parent = this; this.children.push(child); }
    }
    replaceChildren(...children) {
      for (const child of this.children) { child.parent = null; child.isConnected = false; }
      this.children = [];
      this.append(...children);
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, details = {}) {
      const event = { target: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...details };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
    focus() { document.activeElement = this; }
    contains(node) {
      for (let candidate = node; candidate; candidate = candidate.parent) if (candidate === this) return true;
      return false;
    }
    closest(selector) {
      assert.equal(selector, '.game-launch[data-game]');
      return this.dataset.game ? this : this.parent?.closest(selector) || null;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    getBoundingClientRect() { return this.bounds || { width: 1000, height: 650 }; }
  }
  const ids = ['lobby-view', 'game-view', 'game-frame-host', 'game-load-status',
    'game-loading', 'game-loading-reveal', 'catalog-shelves', 'results'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node(id)]));
  document.body = new Node('body');
  document.body.append(nodes['lobby-view'], nodes['game-view'], nodes.results);
  nodes['lobby-view'].append(nodes['catalog-shelves']);
  nodes['game-view'].append(nodes['game-frame-host'], nodes['game-loading']);
  nodes['game-loading'].append(nodes['game-load-status'], nodes['game-loading-reveal']);
  const events = new Node();
  document.addEventListener = events.addEventListener.bind(events);
  let modalOpen = false;
  document.querySelector = selector => selector === 'dialog[open]'
    ? modalOpen ? new Node('dialog') : null : nodes[selector.slice(1)] || null;
  document.createElement = tag => {
    assert.equal(tag, 'iframe');
    const frame = new Node();
    frames.push(frame);
    return frame;
  };
  const windowEvents = new Node();
  const window = {
    innerWidth: 1280, scrollX: 0, scrollY,
    location: { get hash() { return currentHash; }, set hash(value) { currentHash = value && !value.startsWith('#') ? `#${value}` : value; } },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    matchMedia(query) { assert.equal(query, '(any-pointer: coarse)'); return { matches: false }; },
    setTimeout(callback) { const id = nextId++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = nextId++; raf.set(id, callback); return id; },
    cancelAnimationFrame(id) { raf.delete(id); },
    scrollTo(options) { scrolls.push(options); window.scrollX = options.left; window.scrollY = options.top; },
  };
  const context = {
    document, window, navigator: { maxTouchPoints: 0 }, Element: Node, URL, URLSearchParams,
    GAMES: [
      { id: 'alpha', title: 'Alpha', providerId: 'red-tiger' },
      { id: 'beta', title: 'Beta', providerId: 'netent' },
    ],
    getLaunchDevice(width) { return width <= 1024 ? 'mobile' : 'desktop'; },
    getLaunchUrl(game, device) { return `https://demo.example/${game.id}?device=${device}`; },
    getFrameScale() { return 1; },
    watchGameReady(frame, game, ready) {
      const watch = { frame, game, ready, stopped: false };
      readiness.push(watch);
      return () => { watch.stopped = true; };
    },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; resizers.push(this); }
      observe(node) { this.target = node; }
    },
  };
  const api = vm.runInNewContext(`${source}\ninitGameView();`, context);
  const flushHash = () => windowEvents.emit('hashchange');
  function launcher(id) {
    const button = new Node(`launcher-${id}`);
    button.dataset.game = id;
    nodes['catalog-shelves'].append(button);
    return button;
  }
  return { nodes, document, window, frames, readiness, resizers, raf, timers, scrolls, api,
    reinitialize: () => context.initGameView(),
    setModal(value) { modalOpen = value; },
    flushHash,
    navigate(value) { window.location.hash = value; flushHash(); },
    launch(id) { const button = launcher(id); button.focus(); nodes['catalog-shelves'].emit('click', { target: button }); flushHash(); return button; },
    flushPaint() {
      const pending = [...raf.values()]; raf.clear();
      pending.forEach(callback => callback());
    },
    escape(details = {}) { return events.emit('keydown', { key: 'Escape', ...details }); },
  };
}

test('initial lobby and direct game links initialize one stable controller and one frame', () => {
  const lobby = gamePage();
  assert.equal(lobby.document.querySelector('#back-to-lobby'), null);
  assert.equal(lobby.document.body.dataset.view, 'lobby');
  assert.equal(lobby.nodes['game-view'].hidden, true);
  assert.equal(lobby.reinitialize(), lobby.api);
  assert.equal(lobby.resizers.length, 1);

  const page = gamePage({ hash: '#game=alpha' });
  assert.equal(page.document.body.dataset.view, 'game');
  assert.equal(page.nodes['lobby-view'].hidden, true);
  assert.equal(page.frames.length, 1);
  assert.equal(page.frames[0].title, 'Alpha demo');
  page.flushHash();
  assert.equal(page.frames.length, 1, 'the same hash never restarts a game');
});

test('shell destinations unmount the game before rendering and keep their results focus', () => {
  const page = gamePage({ scrollY: 720 });
  page.launch('alpha');
  const frame = page.frames[0];
  let calls = 0;
  page.api.returnToLobby(() => {
    calls++;
    assert.equal(page.window.location.hash, '');
    assert.equal(page.document.body.dataset.view, 'lobby');
    assert.equal(page.nodes['lobby-view'].hidden, false);
    assert.equal(page.nodes['game-view'].hidden, true);
    assert.equal(page.nodes['game-frame-host'].children.length, 0);
    assert.equal(page.nodes['game-frame-host'].getAttribute('aria-busy'), null);
    assert.equal(page.readiness[0].stopped, true);
    assert.equal(page.timers.size, 0);
    page.nodes.results.focus();
    page.window.scrollTo({ left: 0, top: 100 });
  });
  assert.equal(calls, 1, 'the destination runs synchronously');
  assert.equal(frame.isConnected, false);
  page.flushHash();
  page.flushPaint();
  assert.equal(calls, 1);
  assert.equal(page.document.activeElement, page.nodes.results);
  assert.equal(page.window.scrollY, 100);
});

test('returning to the lobby restores scroll and launcher even after the queued hash event', () => {
  const page = gamePage({ scrollY: 620 });
  const launcher = page.launch('alpha');
  page.api.returnToLobby();
  assert.equal(page.document.body.dataset.view, 'lobby');
  page.flushHash();
  page.flushPaint();
  assert.equal(page.window.scrollY, 620);
  assert.equal(page.document.activeElement, launcher);
});

test('a new shell destination cancels a pending native history restoration', () => {
  const page = gamePage({ scrollY: 500 });
  page.launch('alpha');
  page.navigate('');
  page.api.returnToLobby(() => page.nodes.results.focus());
  page.flushHash();
  page.flushPaint();
  assert.equal(page.document.activeElement, page.nodes.results);
  assert.equal(page.window.scrollY, 0);
});

test('Escape respects modal and handled events, then exits without leaving provider resources', () => {
  const page = gamePage();
  page.launch('alpha');
  page.setModal(true);
  assert.equal(page.escape().defaultPrevented, false);
  page.setModal(false);
  page.escape({ defaultPrevented: true });
  assert.equal(page.document.body.dataset.view, 'game');
  assert.equal(page.escape().defaultPrevented, true);
  assert.equal(page.document.body.dataset.view, 'lobby');
  assert.equal(page.readiness[0].stopped, true);
  assert.equal(page.timers.size, 0);
});

test('resize and shell overlays keep the same iframe session and original device selection', () => {
  const page = gamePage();
  page.launch('alpha');
  const frame = page.frames[0];
  const originalUrl = frame.src;
  page.window.innerWidth = 390;
  page.setModal(true);
  page.resizers[0].callback();
  assert.equal(page.frames.length, 1);
  assert.equal(page.nodes['game-frame-host'].children[0], frame);
  assert.equal(frame.src, originalUrl);
  assert.equal(frame.dataset.device, 'desktop');
  assert.equal(page.readiness[0].stopped, false);
});

test('game-to-game and native history changes clean up replaced frames and ignore stale readiness', () => {
  const page = gamePage({ scrollY: 350 });
  const launcher = page.launch('alpha');
  page.navigate('#game=beta');
  assert.equal(page.frames.length, 2);
  assert.equal(page.readiness[0].stopped, true);
  page.readiness[0].ready('old-provider');
  assert.equal(page.raf.size, 0);
  assert.equal(page.nodes['game-view'].dataset.loadState, 'loading');
  page.navigate('');
  page.flushPaint();
  assert.equal(page.frames.every(frame => !frame.isConnected), true);
  assert.equal(page.readiness[1].stopped, true);
  assert.equal(page.window.scrollY, 350);
  assert.equal(page.document.activeElement, launcher);
});

test('invalid or removed links stay in the lobby and cannot create a frame', () => {
  const page = gamePage({ hash: '#game=removed' });
  assert.equal(page.frames.length, 0);
  assert.equal(page.document.body.dataset.view, 'lobby');
  page.navigate('#game=alpha');
  page.navigate('#game=removed');
  assert.equal(page.nodes['game-frame-host'].children.length, 0);
  assert.equal(page.document.body.dataset.view, 'lobby');
});
