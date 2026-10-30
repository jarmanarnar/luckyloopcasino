import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

// Browser API doubles exercise the production readiness protocol and teardown.
// Provider rendering and real MessageChannel transfer require browser checks.
const source = await readFile(new URL('../public/game-ready.js', import.meta.url), 'utf8');
const executable = source.replace('export function watchGameReady', 'function watchGameReady') + '\nwatchGameReady;';
const NLC = 'https://demo.nolimitcdn.com';
const OSS = 'https://fansite.evo-games.com';

function harness() {
  let nextTimer = 1;
  const timers = new Map();
  const listeners = new Set();
  const channels = [];
  const calls = [];
  const ready = [];
  class Port {
    onmessage = null;
    closed = false;
    started = false;
    start() { this.started = true; }
    close() { this.closed = true; }
    receive(data) { if (!this.closed) this.onmessage?.({ data }); }
  }
  class MessageChannel {
    constructor() {
      this.port1 = new Port();
      this.port2 = new Port();
      channels.push(this);
    }
  }
  const target = { postMessage(...args) { calls.push(args); } };
  const wrapper = { length: 1, frames: [target] };
  const root = { length: 1, frames: [wrapper] };
  const frame = { contentWindow: root };
  const window = {
    setInterval(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay, interval: true }); return id; },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay, interval: false }); return id; },
    clearInterval(id) { timers.delete(id); },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, fn) { assert.equal(type, 'message'); listeners.add(fn); },
    removeEventListener(type, fn) { assert.equal(type, 'message'); listeners.delete(fn); },
  };
  const watch = vm.runInNewContext(executable, { window, URL, MessageChannel });
  function fire(id) {
    const timer = timers.get(id);
    if (!timer) return;
    if (!timer.interval) timers.delete(id);
    timer.fn();
  }
  return {
    watch, frame, root, target, timers, listeners, channels, calls, ready, fire,
    emit(event) { for (const fn of [...listeners]) fn(event); },
    begin(game) { return watch(frame, game, reason => ready.push(reason)); },
    interval() { return [...timers].find(([, timer]) => timer.interval)?.[0]; },
    deadline() { return [...timers].find(([, timer]) => !timer.interval)?.[0]; },
  };
}

const ossGame = { providerId: 'taparoo', url: 'https://playin.com/embed/v1/demo/bloodsuckerstapa' };
const nlcGame = { providerId: 'nolimit-city', url: 'https://playin.com/embed/v1/demo/SanQuentin' };
const ossReady = { event: 'EVO:APPLICATION_READY', tableId: 'bloodsuckerstapa', context: 'root' };

test('NLC rejects spoofed origin/source/payload; genuine ready fires once and disposes', () => {
  const h = harness();
  const dispose = h.begin(nlcGame);
  const callback = [...h.listeners][0];
  for (const event of [
    { origin: 'https://example.com', source: h.root, data: 'ready' },
    { origin: NLC, source: {}, data: 'ready' },
    { origin: NLC, source: null, data: 'ready' },
    { origin: NLC, source: h.root, data: { event: 'ready' } },
    { origin: NLC, source: h.root, data: 'idle' },
  ]) h.emit(event);
  assert.equal(h.ready.length, 0);
  assert.equal(h.channels.length, 0);
  assert.equal(h.timers.size, 0);
  const real = { origin: NLC, source: h.root, data: 'ready' };
  h.emit(real);
  callback(real); // A queued callback after teardown must not fire again.
  dispose();
  assert.deepEqual(h.ready, ['nlc-ready']);
  assert.equal(h.listeners.size, 0);
});

test('OSS handshake targets exact provider origin and transfers its message port', () => {
  const h = harness();
  const dispose = h.begin(ossGame);
  assert.equal(h.calls.length, 3);
  assert.ok(h.calls.every(call => call[1] === OSS));
  assert.equal(h.calls[0][0].command, 'EVO:CONNECT');
  assert.equal(h.calls[0][2][0], h.channels[0].port2);
  assert.equal(h.calls[1][0].event, 'EVO:GAME_LIFECYCLE');
  assert.equal(h.calls[2][0].event, 'EVO:KEEPALIVE');
  assert.equal(h.calls[1].length, 2);
  assert.ok(h.channels[0].port1.started);
  dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});

test('OSS rejects wrong tables, invalid schemas and unrelated window messages', () => {
  const h = harness();
  const dispose = h.begin(ossGame);
  const port = h.channels[0].port1;
  for (const data of [null, [], 'ready', { event: 7 },
    { ...ossReady, tableId: 'another-game' }, { ...ossReady, tableId: 1 },
    { ...ossReady, context: 1 }, { event: 'something-else' }]) port.receive(data);
  h.emit({ origin: OSS, source: h.target, data: ossReady });
  h.emit({ origin: NLC, source: h.root, data: 'ready' });
  assert.equal(h.ready.length, 0);
  assert.equal(h.timers.size, 2);
  dispose();
});

test('Lifecycle ACK stops reconnection without marking ready; READY cleans resources', () => {
  const h = harness();
  const dispose = h.begin(ossGame);
  const port = h.channels[0].port1;
  port.receive({ event: 'EVO:GAME_LIFECYCLE', tableId: 'bloodsuckerstapa', interruptAllowed: 1 });
  assert.equal(h.timers.size, 2);
  port.receive({ event: 'EVO:GAME_LIFECYCLE', tableId: 'bloodsuckerstapa', interruptAllowed: false });
  assert.equal(h.ready.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(port.closed, false);
  const queued = port.onmessage;
  port.receive(ossReady);
  queued({ data: ossReady });
  dispose();
  assert.deepEqual(h.ready, ['evo-application-ready']);
  assert.equal(h.listeners.size, 0);
  assert.equal(port.closed, true);
  assert.equal(h.channels[0].port2.closed, true);
});

test('Replaced attempt ports are closed and queued stale events are ignored', () => {
  const h = harness();
  const dispose = h.begin(ossGame);
  const first = h.channels[0];
  const queued = first.port1.onmessage;
  h.fire(h.interval());
  assert.equal(h.channels.length, 2);
  assert.ok(first.port1.closed && first.port2.closed);
  queued({ data: ossReady });
  assert.equal(h.ready.length, 0);
  h.channels[1].port1.receive(ossReady);
  assert.deepEqual(h.ready, ['evo-application-ready']);
  dispose();
});

test('Disposing a launch isolates the next game from stale readiness callbacks', () => {
  const h = harness();
  const firstDispose = h.begin(ossGame);
  const queued = h.channels[0].port1.onmessage;
  firstDispose();
  const nextGame = { providerId: 'sneaky-slots', url: 'https://playin.com/embed/v1/demo/niptuck000000000' };
  const secondDispose = h.begin(nextGame);
  queued({ data: ossReady });
  h.channels[1].port1.receive(ossReady);
  assert.equal(h.ready.length, 0);
  h.channels[1].port1.receive({ event: 'EVO:APPLICATION_READY', tableId: 'niptuck000000000' });
  assert.deepEqual(h.ready, ['evo-application-ready']);
  secondDispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});

test('Thirty-second deadline closes attempts and never marks ready', () => {
  const h = harness();
  const dispose = h.begin(ossGame);
  const queued = h.channels[0].port1.onmessage;
  const deadline = h.deadline();
  assert.equal(h.timers.get(deadline).delay, 30_000);
  h.fire(deadline);
  queued({ data: ossReady });
  assert.equal(h.ready.length, 0);
  assert.equal(h.timers.size, 0);
  assert.ok(h.channels[0].port1.closed);
  dispose();
  assert.equal(h.listeners.size, 0);
});

test('Provider KEEPALIVE is accepted as a fallback; local timers do not generate it', () => {
  const h = harness();
  h.begin(ossGame);
  h.channels[0].port1.receive({ event: 'EVO:KEEPALIVE', context: 'root' });
  assert.deepEqual(h.ready, ['evo-keepalive']);
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});

test('Missing or inaccessible descendant bridge remains unready and times out cleanly', () => {
  for (const inaccessible of [false, true]) {
    const h = harness();
    if (inaccessible) Object.defineProperty(h.root, 'frames', { get() { throw new Error('Unavailable frame'); } });
    else h.root.length = 0;
    const dispose = h.begin(ossGame);
    h.fire(h.interval());
    h.fire(h.deadline());
    assert.equal(h.channels.length, 0);
    assert.equal(h.ready.length, 0);
    assert.equal(h.timers.size, 0);
    dispose();
  }
});

test('Failed provider postMessage closes ports and never reports readiness', () => {
  const h = harness();
  h.target.postMessage = () => { throw new Error('Unavailable target'); };
  const dispose = h.begin(ossGame);
  assert.ok(h.channels[0].port1.closed && h.channels[0].port2.closed);
  assert.equal(h.ready.length, 0);
  dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
});
