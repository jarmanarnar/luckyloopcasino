import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletCounter, resolveWalletFrame } from '../public/wallet-counter.js';

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
  assert.equal(run.output.length, 1);
  assert.deepEqual(run.output.at(-1), { text: '125000', value: 125000 });
  run.frame(249);
  assert.equal(run.output.length, 2);
  assert.match(run.output.at(-1).text, /^\d+\.\d{2}$/);
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

function resolveTrace({ fromWidth, toWidth, deferDecimals = true, frames }) {
  let previousWidth = fromWidth;
  return frames.map(([formatted, integer]) => {
    const result = resolveWalletFrame({
      formatted, integer, deferDecimals, fromWidth, toWidth, previousWidth,
      measure: text => text.length,
    });
    previousWidth = result.width;
    return result;
  });
}

test('shrinking currency entry shows decimals as soon as the full formatted text fits', () => {
  const output = resolveTrace({
    fromWidth: 7, toWidth: 5,
    frames: [
      ['130,000.00', '130,000'], ['50,000.00', '50,000'],
      ['8,500.00', '8,500'], ['850.00', '850'], ['185.00', '185'], ['85.00', '85'],
    ],
  });
  assert.deepEqual(output, [
    { text: '130,000', width: 7 }, { text: '50,000', width: 7 },
    { text: '8,500', width: 7 }, { text: '850.00', width: 6 },
    { text: '185.00', width: 6 }, { text: '85.00', width: 5 },
  ]);
});

test('a fractional SC target keeps decimals before crossing below one', () => {
  const output = resolveTrace({
    fromWidth: 7, toWidth: 4,
    frames: [['1,000.85', '1,001'], ['99.85', '100'], ['1.85', '2'], ['0.99', '1'], ['0.85', '1']],
  });
  assert.equal(output[1].text, '99.85');
  assert.equal(output[2].text, '1.85');
  assert.equal(output[3].text, '0.99');
  assert.deepEqual(output.at(-1), { text: '0.85', width: 4 });
  assert.ok(output.every(frame => frame.text !== '0'));
});

test('growing from zero shows fractional formatting immediately instead of deferring it', () => {
  const output = resolveTrace({
    fromWidth: 1, toWidth: 5,
    frames: [['0.00', '0'], ['0.85', '1'], ['5.27', '5'], ['15.27', '15']],
  });
  assert.deepEqual(output.map(frame => frame.text), ['0.00', '0.85', '5.27', '15.27']);
  assert.deepEqual(output.map(frame => frame.width), [4, 4, 4, 5]);
});

test('frame widths never reverse or overshoot their endpoints', () => {
  for (const [fromWidth, toWidth] of [[7, 4], [1, 5]]) {
    const output = resolveTrace({
      fromWidth, toWidth, deferDecimals: false,
      frames: [['123456789', ''], ['1', ''], ['12345678', ''], ['12', ''], ['1234567', '']],
    });
    let previous = fromWidth;
    for (const { width } of output) {
      assert.ok(width >= Math.min(fromWidth, toWidth) && width <= Math.max(fromWidth, toWidth));
      assert.ok(toWidth < fromWidth ? width <= previous : width >= previous);
      previous = width;
    }
  }
});
