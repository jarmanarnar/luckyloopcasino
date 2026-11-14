import { initCoinChooser } from '../public/coin-chooser.js';
import { initPlayerDisplay } from '../public/player-display.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { formatRoute, parseRoute } from '../public/routes.js';

const source = (await readFile(new URL('../public/game-view.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initGameView', 'function initGameView');

function gamePage({ hash = '', scrollY = 0, routerMode = false, currency = 'GC', preplay = false, viewportWidth = 1280, signedIn = true } = {}) {
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
    querySelector() { return { replaceChildren() {}, prepend() {} }; }
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
    'game-loading', 'game-loading-reveal', 'catalog-shelves', 'results', 'game-theater', 'game-fullscreen'];
  if (preplay) ids.push('game-preplay', 'game-play-gc', 'game-play-sc', 'game-preplay-fullscreen', 'game-play-confirm', 'game-coin-info', 'game-coin-question', 'game-coin-answer');
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
    if (tag !== 'iframe') return new Node();
    const frame = new Node();
    frames.push(frame);
    return frame;
  };
  const windowEvents = new Node();
  const window = {
    innerWidth: viewportWidth, scrollX: 0, scrollY,
    location: { get hash() { return currentHash; }, set hash(value) { currentHash = value && !value.startsWith('#') ? `#${value}` : value; } },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    matchMedia(query) { return { matches: query.startsWith('(max-width: 719px)') && viewportWidth <= 719, addEventListener() {} }; },
    setTimeout(callback) { const id = nextId++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = nextId++; raf.set(id, callback); return id; },
    cancelAnimationFrame(id) { raf.delete(id); },
    scrollTo(options) { scrolls.push(options); window.scrollX = options.left; window.scrollY = options.top; },
  };
  let route = parseRoute(hash);
  const subscribers = [];
  const routeChanges = [];
  const router = routerMode ? {
    getRoute: () => route,
    navigate(next) {
      route = next; routeChanges.push(next);
      currentHash = formatRoute(next);
      for (const listener of [...subscribers].sort((a, b) => a.priority - b.priority)) listener.fn(next);
    },
    subscribe(fn, { priority = 0 } = {}) { subscribers.push({ fn, priority }); },
    back(fallback) { this.navigate(fallback); },
  } : undefined;
  const accountListeners = [], gameVisits = [];
  let verificationOpens = 0;
  const account = { async recordGameVisit(game) { gameVisits.push(game.id); }, isSignedIn: () => signedIn, getSnapshot: () => ({ wallet: { currency } }), subscribe: fn => accountListeners.push(fn), async selectCurrency(value) { currency=value; accountListeners.forEach(fn=>fn()); return {ok:true}; } };
  const verifyPhone = () => verificationOpens++;
  const context = {
    initCoinChooser, createGameArt: () => new Node(), account, verifyPhone, initPlayerDisplay: options => initPlayerDisplay({ ...options, document, window }),
    document, window, router, formatRoute, parseRoute, navigator: { maxTouchPoints: 0 }, Element: Node, URL, URLSearchParams,
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
  const api = vm.runInNewContext(`${source}\ninitGameView({ router, account, verifyPhone });`, context);
  const flushHash = () => windowEvents.emit('hashchange');
  function launcher(id) {
    const button = new Node(`launcher-${id}`);
    button.dataset.game = id;
    nodes['catalog-shelves'].append(button);
    return button;
  }
  return { nodes, document, window, frames, gameVisits, readiness, resizers, raf, timers, scrolls, api, router, routeChanges,
    verificationOpens: () => verificationOpens,
    logout() { signedIn = false; accountListeners.forEach(fn => fn()); },
    setCurrency(value) { currency = value; accountListeners.forEach(fn => fn()); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    reinitialize: () => context.initGameView(),
    setModal(value) { modalOpen = value; },
    flushHash,
    navigate(value) { if (router) router.navigate(parseRoute(value)); else { window.location.hash = value; flushHash(); } },
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


test('catalog cards open one integrated details/player and preserve the details origin', () => {
  const page = gamePage({ hash: '#/providers/red-tiger?q=luck&sort=az', routerMode: true });
  assert.equal(page.document.body.dataset.view, 'lobby');
  page.launch('alpha');
  assert.equal(page.router.getRoute().type, 'game-details');
  assert.equal(page.router.getRoute().from, '#/providers/red-tiger?q=luck&sort=az');
  assert.equal(page.frames.length, 1, 'GC demo prepares inside the details view');
  page.router.navigate({ type: 'game', gameId: 'alpha', from: formatRoute(page.router.getRoute()) });
  assert.equal(parseRoute(page.router.getRoute().from).type, 'game-details');
  const frame = page.frames[0];
  let rendered = false;
  page.router.subscribe(route => {
    if (route.type !== 'search') return;
    assert.equal(page.nodes['game-frame-host'].children.length, 0);
    assert.equal(page.readiness[0].stopped, true);
    assert.equal(page.nodes['lobby-view'].hidden, false);
    assert.equal(page.nodes['game-view'].hidden, true);
    rendered = true;
    page.nodes.results.focus();
  });
  page.router.navigate({ type: 'search', query: 'gold' });
  page.flushPaint();
  assert.equal(rendered, true);
  assert.equal(frame.isConnected, false);
  assert.equal(page.document.activeElement, page.nodes.results);
  assert.equal(page.timers.size, 0);
});

test('returning from legacy play to same details keeps the existing iframe', () => {
 const page = gamePage({ hash: '#game=alpha&from=%23%2Fgames%2Falpha', routerMode: true });
 const frame = page.frames[0]; page.escape();
 assert.equal(page.router.getRoute().type, 'game-details');
 assert.equal(page.nodes['game-frame-host'].children[0], frame);
 assert.equal(page.frames.length, 1);
});

test('Escape from a refreshed game returns to the originating category route without resetting home', () => {
  const page = gamePage({ hash: '#game=alpha&from=%23%2Fpopular%3Fprovider%3Dred-tiger', routerMode: true });
  assert.equal(page.frames.length, 1);
  page.escape();
  assert.equal(page.router.getRoute().type, 'category');
  assert.equal(page.router.getRoute().categoryId, 'popular');
  assert.equal(page.router.getRoute().providerId, 'red-tiger');
  assert.equal(page.nodes['game-frame-host'].children.length, 0);
});

test('a removed game deep link canonicalizes to home without allocating a provider session', () => {
  const page = gamePage({ hash: '#game=removed', routerMode: true });
  assert.equal(page.router.getRoute().type, 'home');
  assert.equal(page.frames.length, 0);
  assert.equal(page.nodes['game-view'].hidden, true);
  assert.equal(page.nodes['lobby-view'].hidden, false);
});


test('SC direct game route blocks frame creation and opens phone preview on details', () => {
  const page = gamePage({ hash: '#game=alpha', routerMode: true, currency: 'SC' });
  assert.equal(page.frames.length, 0);
  page.flushTimers();
  assert.equal(page.verificationOpens(), 1);
  assert.equal(page.router.getRoute().type, 'game-details');
});

test('SC play navigation is blocked; GC still mounts its independent demo', () => {
  const page = gamePage({ routerMode: true, currency: 'SC' });
  page.router.navigate({ type: 'game', gameId: 'alpha' });
  page.flushTimers();
  assert.equal(page.frames.length, 0);
  assert.equal(page.verificationOpens(), 1);
  page.setCurrency('GC');
  page.router.navigate({ type: 'game', gameId: 'alpha' });
  assert.equal(page.frames.length, 1);
  page.setCurrency('SC');
  assert.equal(page.nodes['game-frame-host'].children.length, 0);
  page.flushTimers();
  assert.equal(page.verificationOpens(), 2);
  assert.equal(page.frames.length, 1);
});


test('GC preloads inert behind pre-play until Gold Coins is chosen', () => {
 const page = gamePage({ hash: '#game=alpha', routerMode: true, preplay: true });
 assert.equal(page.frames.length, 1);
 assert.equal(page.frames[0].inert, true);
 assert.equal(page.nodes['game-preplay'].hidden, false);
 page.readiness[0].ready('test'); page.flushPaint(); page.flushPaint();
 assert.equal(page.frames[0].inert, true);
 assert.equal(page.nodes['game-view'].dataset.previewReady, 'true');
 assert.equal(page.frames[0].getAttribute('aria-hidden'), 'true');
 page.nodes['game-play-confirm'].emit('click');
 assert.equal(page.nodes['game-view'].dataset.previewReady, undefined);
 assert.equal(page.nodes['game-preplay'].hidden, true);
 assert.equal(page.frames[0].inert, false);
});


test('Gold Coins reveals directly in details without route change or frame replacement', () => {
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true });
 const frame = page.frames[0]; const route = page.router.getRoute();
 page.readiness[0].ready('test'); page.flushPaint(); page.flushPaint();
 page.nodes['game-play-confirm'].emit('click');
 assert.equal(page.router.getRoute(), route);
 assert.equal(page.frames.length, 1);
 assert.equal(page.nodes['game-frame-host'].children[0], frame);
 assert.equal(frame.inert, false);
 assert.equal(page.document.body.dataset.playerActive, 'true');
});


test('Recent Games records an opened game once, even without leaving its details route', () => {
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true });
 const route = page.router.getRoute();
 const watch = page.readiness[0];
 watch.ready('test'); page.flushPaint(); page.flushPaint();
 assert.deepEqual(page.gameVisits, [], 'an inert preview does not count');
 page.nodes['game-play-confirm'].emit('click');
 assert.deepEqual(page.gameVisits, ['alpha']);
 assert.equal(page.router.getRoute(), route);
 watch.ready('test'); page.flushPaint(); page.flushPaint();
 assert.deepEqual(page.gameVisits, ['alpha'], 'repeated provider callbacks do not duplicate history');
});

test('a legacy game route does not record until its player is revealed', () => {
 const page = gamePage({ hash: '#game=alpha', routerMode: true });
 assert.deepEqual(page.gameVisits, []);
 page.readiness[0].ready('test'); page.flushPaint(); page.flushPaint();
 assert.deepEqual(page.gameVisits, ['alpha']);
});

test('opening a known failed frame manually does not add a visit', () => {
 const page = gamePage({ hash: '#game=alpha', routerMode: true });
 page.frames[0].emit('error');
 page.nodes['game-loading-reveal'].emit('click');
 assert.deepEqual(page.gameVisits, []);
});

test('mobile card does not load an iframe until Gold Coins enters immersive mode', () => {
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true, viewportWidth: 390 });
 const route = page.router.getRoute(), view = page.nodes['game-view'];
 assert.equal(page.frames.length, 0);
 assert.equal(view.dataset.compactPreplay, 'true');
 assert.equal(page.document.body.dataset.playerMobile, 'false');
 assert.equal(page.nodes['game-preplay'].hidden, false);
 page.window.scrollY = 144;
 page.nodes['game-play-confirm'].emit('click');
 const play = page.frames[0];
 assert.equal(page.frames.length, 1);
 assert.equal(view.dataset.compactPreplay, 'false');
 assert.equal(page.window.scrollY, 0);
 assert.equal(page.nodes['game-frame-host'].children[0], play);
 assert.equal(page.document.body.dataset.playerMobile, 'true');
 assert.equal(page.nodes['game-preplay'].hidden, true);
 assert.equal(page.nodes['game-loading'].hidden, false);
 assert.equal(play.inert, true);
 page.readiness[0].ready('test'); page.flushPaint(); page.flushPaint();
 assert.equal(play.inert, false);
 assert.deepEqual(page.gameVisits, ['alpha']);
 assert.equal(page.router.getRoute(), route);
});

test('narrow content switches to a static card without disturbing a running desktop game', () => {
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true });
 const view = page.nodes['game-view'], host = page.nodes['game-frame-host'];
 assert.equal(view.dataset.compactPreplay, 'false');
 view.bounds = { width: 550, height: 500 }; page.resizers[0].callback();
 assert.equal(view.dataset.compactPreplay, 'true');
 assert.equal(host.children.length, 0);
 assert.equal(page.readiness[0].stopped, true);
 view.bounds.width = 600; page.resizers[0].callback();
 assert.equal(view.dataset.compactPreplay, 'false');
 const mounted = page.frames.at(-1);
 page.nodes['game-play-confirm'].emit('click');
 view.bounds.width = 550; page.resizers[0].callback();
 assert.equal(view.dataset.compactPreplay, 'false');
 assert.equal(host.children[0], mounted);
});

test('desktop Sweep Coins shows a strictly read-only public demo preview', async () => {
 const viewportWidth = 1440;
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true, viewportWidth });
 const first = page.frames[0], route = page.router.getRoute();
 page.nodes['game-play-sc'].emit('click'); await new Promise(resolve => setImmediate(resolve));
 const preview = page.frames[1], view = page.nodes['game-view'];
 assert.equal(page.frames.length, 2);
 assert.equal(preview.src, first.src, 'SC uses only the public demo URL');
 assert.equal(page.nodes['game-frame-host'].children[0], preview);
 assert.equal(preview.allowFullscreen, false);
 assert.match(preview.allow, /fullscreen 'none'/);
 assert.equal(preview.getAttribute('sandbox'), 'allow-scripts allow-same-origin');
 assert.equal(preview.inert, true);
 assert.equal(preview.getAttribute('aria-hidden'), 'true');
 assert.equal(page.verificationOpens(), 0);
 assert.equal(page.nodes['game-preplay'].hidden, false);
 assert.equal(page.nodes['game-play-confirm'].textContent, 'Play with Sweep Coins');
 assert.equal(view.dataset.sessionKind, 'verification-preview');
 assert.equal(view.dataset.mode, 'SC');
 assert.equal(view.dataset.previewReady, undefined);
 page.readiness[1].ready('test'); page.flushPaint(); page.flushPaint();
 assert.equal(view.dataset.previewReady, 'true');
 page.nodes['game-loading-reveal'].emit('click');
 page.nodes['game-play-confirm'].emit('click'); await new Promise(resolve => setImmediate(resolve));
 assert.equal(page.verificationOpens(), 1);
 assert.equal(page.nodes['game-preplay'].hidden, false);
 assert.equal(page.document.body.dataset.playerActive, 'false');
 assert.equal(preview.inert, true);
 assert.equal(preview.getAttribute('aria-hidden'), 'true');
 assert.deepEqual(page.gameVisits, []);
 page.nodes['game-play-gc'].emit('click'); await new Promise(resolve => setImmediate(resolve));
 assert.equal(page.frames.length, 3);
 assert.notEqual(page.frames[2], preview);
 assert.equal(view.dataset.sessionKind, 'public-demo');
 assert.equal(view.dataset.mode, 'GC');
 assert.equal(view.dataset.previewReady, undefined);
 assert.equal(page.frames[2].inert, true);
 assert.equal(page.nodes['game-preplay'].hidden, false);
 assert.equal(page.router.getRoute(), route);
});

test('preplay explanation follows the selected currency without changing play behavior', async () => {
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true, viewportWidth: 390 });
 const { nodes } = page;
 assert.equal(nodes['game-coin-question'].textContent, 'What are Gold Coins?');
 assert.match(nodes['game-coin-answer'].textContent, /no cash value/);
 nodes['game-coin-info'].open = true;
 nodes['game-play-sc'].emit('click'); await new Promise(resolve => setImmediate(resolve));
 assert.equal(nodes['game-coin-question'].textContent, 'What are Sweep Coins?');
 assert.match(nodes['game-coin-answer'].textContent, /play is unavailable/);
 assert.equal(nodes['game-coin-info'].open, true);
 nodes['game-play-confirm'].emit('click'); await new Promise(resolve => setImmediate(resolve));
 assert.equal(nodes['game-coin-info'].open, false);
 assert.equal(page.verificationOpens(), 1);
 assert.equal(page.frames.length, 0);
});

test('mobile Sweep Coins shows only the card and opens verification, never a provider frame', async () => {
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true, viewportWidth: 390 });
 page.nodes['game-play-sc'].emit('click'); await new Promise(resolve => setImmediate(resolve));
 page.nodes['game-play-confirm'].emit('click'); await new Promise(resolve => setImmediate(resolve));
 assert.equal(page.frames.length, 0);
 assert.equal(page.verificationOpens(), 1);
 assert.equal(page.nodes['game-preplay'].hidden, false);
 assert.equal(page.document.body.dataset.playerMobile, 'false');
});

test('direct Sweep Coins details preloads a read-only demo without opening verification', () => {
 const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true, currency: 'SC' });
 assert.equal(page.frames.length, 1);
 assert.equal(page.frames[0].inert, true);
 assert.equal(page.nodes['game-view'].dataset.sessionKind, 'verification-preview');
 assert.equal(page.nodes['game-preplay'].hidden, false);
 assert.equal(page.verificationOpens(), 0);
});

for (const hash of ['#/games/alpha', '#game=alpha']) {
  test(`guest cannot mount a provider through ${hash}, even without the route guard`, () => {
    const page = gamePage({ hash, routerMode: true, signedIn: false, preplay: true });
    assert.equal(page.frames.length, 0);
    assert.equal(page.nodes['game-view'].hidden, true);
    page.setCurrency('SC');
    page.setCurrency('GC');
    assert.equal(page.frames.length, 0);
  });
}

test('logging out removes the current provider frame and currency updates cannot reopen it', () => {
  const page = gamePage({ hash: '#/games/alpha', routerMode: true, preplay: true });
  assert.equal(page.frames.length, 1);
  page.logout();
  assert.equal(page.nodes['game-frame-host'].children.length, 0);
  assert.equal(page.nodes['game-view'].hidden, true);
  page.setCurrency('SC'); page.setCurrency('GC');
  assert.equal(page.frames.length, 1);
});
