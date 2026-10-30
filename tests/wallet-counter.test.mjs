import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletCounter } from '../public/wallet-counter.js';

function harness(options = {}) {
  let time = 0;
  let sequence = 0;
  const pending = new Map();
  const cancelled = [];
  const output = [];
  const counter = createWalletCounter({
    format: value => value.toFixed(0),
    onFrame: (text, value) => output.push({ text, value }),
    requestFrame: callback => { pending.set(++sequence, callback); return sequence; },
    cancelFrame: handle => { cancelled.push(pending.get(handle)); pending.delete(handle); },
    now: () => time,
    ...options,
  });
  return {
    counter, output, cancelled,
    get pending() { return pending.size; },
    frame(at) {
      time = at;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach(callback => callback(at));
    },
  };
}

test('rises smoothly with ease-out and stops on the exact target', () => {
  const run = harness();
  run.counter.immediate(0);
  run.counter.animateTo(100);
  run.frame(125);
  assert.equal(run.counter.value, 57.8125);
  run.frame(250);
  assert.equal(run.counter.value, 87.5);
  run.frame(500);
  assert.deepEqual(run.output.at(-1), { text: '100', value: 100 });
  assert.equal(run.pending, 0);
});

test('falls smoothly instead of jumping straight to a smaller balance', () => {
  const run = harness();
  run.counter.immediate(100);
  run.counter.animateTo(0);
  run.frame(250);
  assert.equal(run.counter.value, 12.5);
  run.frame(500);
  assert.equal(run.counter.value, 0);
  assert.equal(run.pending, 0);
});

test('retargets from the current displayed value and ignores a stale callback', () => {
  const run = harness();
  run.counter.immediate(0);
  run.counter.animateTo(100);
  run.frame(250);
  run.counter.animateTo(50);
  assert.equal(run.counter.value, 87.5);
  const count = run.output.length;
  run.cancelled.at(-1)();
  assert.equal(run.output.length, count);
  assert.equal(run.counter.value, 87.5);
  run.frame(500);
  assert.equal(run.counter.value, 54.6875);
  run.frame(750);
  assert.equal(run.counter.value, 50);
});

test('uses transition formatting and preserves the exact fractional final value', () => {
  const run = harness();
  run.counter.immediate(125000);
  run.counter.animateTo(15.27, value => value.toFixed(2));
  assert.equal(run.output.at(-1).text, '125000.00');
  run.frame(249);
  assert.ok(run.counter.value > 15.27 && run.counter.value < 125000);
  run.frame(500);
  assert.deepEqual(run.output.at(-1), { text: '15.27', value: 15.27 });
});

test('immediate replacement cancels animation and cannot be overwritten later', () => {
  const run = harness();
  run.counter.immediate(0);
  run.counter.animateTo(100);
  run.frame(100);
  run.counter.immediate(7.25, value => value.toFixed(2));
  assert.equal(run.pending, 0);
  const count = run.output.length;
  run.cancelled.at(-1)();
  run.frame(600);
  assert.equal(run.output.length, count);
  assert.deepEqual(run.output.at(-1), { text: '7.25', value: 7.25 });
});

test('finish snaps to the exact target while cancel freezes the current value', () => {
  const run = harness();
  run.counter.immediate(0);
  run.counter.animateTo(15.27);
  run.frame(100);
  run.counter.finish();
  assert.equal(run.counter.value, 15.27);
  assert.equal(run.pending, 0);
  run.counter.animateTo(100);
  run.frame(350);
  const displayed = run.counter.value;
  run.counter.cancel();
  run.cancelled.at(-1)();
  assert.equal(run.counter.value, displayed);
  assert.equal(run.pending, 0);
});

test('zero duration publishes the final value without scheduling a frame', () => {
  const run = harness({ duration: 0 });
  run.counter.animateTo(42.75, value => value.toFixed(2));
  assert.deepEqual(run.output.at(-1), { text: '42.75', value: 42.75 });
  assert.equal(run.pending, 0);
});
