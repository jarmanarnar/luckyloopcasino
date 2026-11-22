import assert from 'node:assert/strict';
import test from 'node:test';
import { bootApplication } from '../public/bootstrap.js';
import { waitForStableLayout } from '../public/app-readiness.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const router = () => ({ prepareLayout() {}, restoreInitialScroll() {} });

function startup({ fonts = Promise.resolve(), fontLoad = Promise.resolve(), artwork = Promise.resolve(),
  hidden = false, load, initialize, geometry = () => 0, styles = [], fade } = {}) {
  const calls = [], logoCalls = [], timers = new Map(), frames = new Map(), fades = [];
  let timerId = 0, frameId = 0, now = 0, revealedAt;
  const element = () => ({
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ x: geometry(now), y: 0, width: 320, height: 400 }),
  });
  const nodes = {
    'app-loader': { hidden: false },
    'app-load-status': { className: 'app-loader__message', textContent: 'Loading COP COIN…' },
    'app-load-retry': { hidden: true, click() { this.onclick(); } },
  };
  if (fade) nodes['app-loader'].animate = (frames, options) => {
    fades.push({ frames, options });
    return { finished: fade, cancel() {} };
  };
  const pageImage = { ...element(), loading: 'lazy', decode() {
    calls.push('decode-image');
    return artwork;
  } };
  const closedDialogImage = { getClientRects: () => [], decode() { throw new Error('Hidden dialog image should not be loaded'); } };
  const doc = {
    body: { ...element(), dataset: { appState: 'loading', appStarting: 'true' } }, hidden,
    fonts: { ready: fonts, load: () => fontLoad }, images: [pageImage, closedDialogImage],
    querySelector: selector => nodes[selector.slice(1)],
    querySelectorAll: selector => selector === 'link[data-app-styles]' ? styles : [element()],
    addEventListener() {}, removeEventListener() {},
  };
  const scope = {
    location: { reload() { calls.push('reload'); } },
    console: { error() { calls.push('error'); } },
    setTimeout(action, delay) { timers.set(++timerId, { action, delay, due: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(action) {
      assert.equal(doc.body.dataset.appStarting, 'true', 'startup motion stays disabled through reveal');
      if (doc.body.dataset.appState === 'ready') revealedAt ??= now;
      const id = ++frameId;
      frames.set(id, action);
      if (!doc.hidden) queueMicrotask(() => { if (frames.delete(id)) { now += 16; action(now); } });
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const ready = bootApplication({ document: doc, window: scope,
    createLogo(options) {
      assert.equal(options.document, doc);
      assert.equal(options.window, scope);
      logoCalls.push('start');
      return { stop() { logoCalls.push('stop'); } };
    },
    load: () => {
      assert.deepEqual(logoCalls, ['start'], 'the loader starts before application imports and initialization');
      return load ? load() : Promise.resolve({
        initApplication() {
          calls.push('initialize');
          initialize?.();
          return {
            prepareLayout() { calls.push('prepare-layout'); },
            restoreInitialScroll() { calls.push('restore-scroll'); },
          };
        },
      });
    },
  });
  return { doc, nodes, calls, logoCalls, timers, pageImage, ready, fades,
    fireTimeout(delay) {
      const timer = [...timers.entries()].find(([, item]) => item.delay === delay);
      assert.ok(timer, `Expected a ${delay}ms timer`);
      const [id, item] = timer;
      timers.delete(id);
      now = Math.max(now, item.due);
      item.action();
    },
    get revealedAt() { return revealedAt; } };
}

test('startup gives fonts a short grace period while leaving images lazy and independent', async () => {
  const fonts = deferred(), artwork = deferred();
  const page = startup({ fonts: fonts.promise, artwork: artwork.promise });
  await settle();
  assert.deepEqual(page.calls, ['initialize']);
  assert.equal(page.pageImage.loading, 'lazy');
  fonts.resolve();
  assert.equal(await page.ready, true);
  assert.deepEqual(page.calls, ['initialize', 'prepare-layout', 'restore-scroll']);
  assert.equal(page.doc.body.dataset.appState, 'ready');
  assert.equal(page.doc.body.dataset.appStarting, undefined);
  assert.equal(page.nodes['app-loader'].hidden, true);
  assert.ok(page.revealedAt >= 200);
  assert.equal(page.timers.size, 0);
  assert.deepEqual(page.logoCalls, ['start', 'stop']);
});

test('ready fonts reveal the page without waiting for the full grace period', async () => {
  const fade = deferred(), page = startup({ fade: fade.promise });
  await settle();
  assert.equal(page.doc.body.dataset.appState, 'ready');
  assert.equal(page.nodes['app-loader'].hidden, false, 'the loader fades over the already initialized page');
  assert.equal(page.fades[0].options.duration, 160);
  fade.resolve();
  assert.equal(await page.ready, true);
  assert.equal(page.nodes['app-loader'].hidden, true);
  assert.ok(page.revealedAt >= 200 && page.revealedAt < 600);
  assert.equal(page.timers.size, 0);
});

function stylesheet({ state, cached = false } = {}) {
  const handlers = new Map();
  return {
    dataset: state ? { styleState: state } : {}, sheet: cached ? {} : null, media: 'print',
    getAttribute: () => 'theme.css',
    addEventListener(type, fn) { handlers.set(type, fn); },
    removeEventListener(type) { handlers.delete(type); },
    emit(type) { handlers.get(type)?.(); },
    get listening() { return handlers.size; },
  };
}

test('application styles gate initialization, including cached styles and slow downloads that eventually finish', async () => {
  const cached = stylesheet({ cached: true }), pending = stylesheet();
  const page = startup({ styles: [cached, pending], initialize() {
    assert.equal(cached.media, 'all');
    assert.equal(pending.media, 'all');
  } });
  await settle();
  assert.deepEqual(page.calls, []);
  assert.equal(cached.listening, 0, 'a cached stylesheet does not wait for another load event');
  assert.equal(page.nodes['app-loader'].hidden, false);
  page.fireTimeout(15_000);
  assert.equal(page.nodes['app-load-retry'].hidden, false);
  pending.emit('load');
  assert.equal(await page.ready, true);
  assert.equal(pending.listening, 0);
  assert.deepEqual(page.calls, ['initialize', 'prepare-layout', 'restore-scroll']);
  assert.equal(page.nodes['app-load-retry'].hidden, true);
});

test('stylesheet failures before or after bootstrap expose retry without initializing an unstyled page', async () => {
  for (const early of [true, false]) {
    const failed = stylesheet({ state: early ? 'error' : undefined }), pending = stylesheet();
    const page = startup({ styles: [failed, pending] });
    if (!early) failed.emit('error');
    assert.equal(await page.ready, false);
    assert.equal(page.doc.body.dataset.appState, 'error');
    assert.equal(page.nodes['app-load-status'].className, 'app-loader__message');
    assert.equal(page.nodes['app-loader'].hidden, false);
    assert.equal(page.calls.includes('initialize'), false);
    assert.equal(failed.dataset.styleState, 'error');
    assert.equal(pending.listening, 0);
    page.nodes['app-load-retry'].click();
    assert.equal(page.calls.at(-1), 'reload');
  }
});

test('slow fonts stop delaying startup after 600ms and may finish later', async () => {
  const fonts = deferred(), fontLoad = deferred();
  const page = startup({ fonts: fonts.promise, fontLoad: fontLoad.promise });
  await settle();
  assert.deepEqual(page.calls, ['initialize'], 'account initialization does not wait for fonts');
  assert.equal(page.doc.body.dataset.appState, 'loading');
  page.fireTimeout(600);
  assert.equal(await page.ready, true);
  fonts.resolve();
  fontLoad.resolve();
  await settle();
  assert.equal(page.doc.body.dataset.appState, 'ready');
  assert.equal(page.timers.size, 0);
});

test('failed font requests fall back without failing startup', async () => {
  const page = startup({ fonts: Promise.reject(new Error('Font unavailable')),
    fontLoad: Promise.reject(new Error('Font request failed')) });
  assert.equal(await page.ready, true);
  assert.equal(page.calls.includes('error'), false);
});

test('a late layout change restarts the stability interval', async () => {
  const page = startup({ geometry: time => time < 96 ? 0 : 160 });
  assert.equal(await page.ready, true);
  assert.ok(page.revealedAt >= 296);
});

test('a slow application import offers retry but automatically opens when it finishes', async () => {
  const application = deferred();
  const page = startup({ load: () => application.promise });
  await settle();
  page.fireTimeout(15_000);
  assert.equal(page.doc.body.dataset.appState, 'loading');
  assert.equal(page.nodes['app-loader'].hidden, false);
  assert.equal(page.nodes['app-load-status'].textContent, 'Taking longer than usual. Still loading…');
  assert.equal(page.nodes['app-load-retry'].hidden, false);
  assert.deepEqual(page.logoCalls, ['start']);
  application.resolve({ initApplication: router });
  assert.equal(await page.ready, true);
  assert.equal(page.nodes['app-loader'].hidden, true);
  assert.equal(page.nodes['app-load-retry'].hidden, true);
  assert.deepEqual(page.logoCalls, ['start', 'stop']);
  assert.equal(page.calls.includes('error'), false);
});

test('account initialization gates reveal and can still complete after the retry prompt appears', async () => {
  const account = deferred();
  const page = startup({ load: () => Promise.resolve({ initApplication: () => account.promise }) });
  await settle();
  assert.equal(page.doc.body.dataset.appState, 'loading');
  assert.equal(page.nodes['app-loader'].hidden, false);
  assert.equal(page.nodes['app-load-retry'].hidden, true);
  page.fireTimeout(15_000);
  assert.equal(page.doc.body.dataset.appState, 'loading');
  assert.equal(page.nodes['app-load-retry'].hidden, false);
  account.resolve(router());
  assert.equal(await page.ready, true);
  assert.equal(page.nodes['app-loader'].hidden, true);
  assert.equal(page.nodes['app-load-retry'].hidden, true);
  assert.equal(page.timers.size, 0);
});

test('essential import and initialization rejections expose a working retry', async () => {
  for (const options of [
    { load: () => Promise.reject(new Error('Module unavailable')) },
    { initialize() { throw new Error('Initialization failed'); } },
    { load: () => Promise.resolve({ initApplication: () => Promise.reject(new Error('Storage unavailable')) }) },
  ]) {
    const page = startup(options);
    assert.equal(await page.ready, false);
    assert.equal(page.doc.body.dataset.appState, 'error');
    assert.equal(page.nodes['app-load-retry'].hidden, false);
    assert.equal(page.nodes['app-loader'].hidden, false);
    page.nodes['app-load-retry'].click();
    assert.equal(page.calls.at(-1), 'reload');
    assert.deepEqual(page.logoCalls, ['start', 'stop']);
    assert.equal(page.timers.size, 0);
  }
});

test('an unresponsive import keeps loading and exposes a working manual retry', async () => {
  const page = startup({ load: () => new Promise(() => {}) });
  page.fireTimeout(15_000);
  assert.equal(page.doc.body.dataset.appState, 'loading');
  assert.equal(page.nodes['app-load-retry'].hidden, false);
  assert.equal(page.calls.includes('initialize'), false);
  page.nodes['app-load-retry'].click();
  assert.equal(page.calls.at(-1), 'reload');
  assert.equal(page.timers.size, 0);
  assert.deepEqual(page.logoCalls, ['start']);
});

test('a background tab opens without waiting for suspended animation frames', async () => {
  const page = startup({ hidden: true });
  assert.equal(await page.ready, true);
  assert.equal(page.doc.body.dataset.appState, 'ready');
  assert.equal(page.doc.body.dataset.appStarting, undefined);
  assert.equal(page.timers.size, 0);
});

test('layout settling is bounded and resolves even when no animation frame arrives', async () => {
  const timers = new Map(), frames = new Map();
  let id = 0;
  const scope = {
    setTimeout(action, delay) { timers.set(++id, { action, delay }); return id; },
    clearTimeout(timer) { timers.delete(timer); },
    requestAnimationFrame(action) { frames.set(++id, action); return id; },
    cancelAnimationFrame(frame) { frames.delete(frame); },
  };
  const ready = waitForStableLayout({ hidden: false }, scope);
  const timeout = [...timers.values()][0];
  assert.equal(timeout.delay, 1_000);
  timeout.action();
  await ready;
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
});
