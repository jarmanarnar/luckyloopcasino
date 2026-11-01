import assert from 'node:assert/strict';
import test from 'node:test';
import { getShelfScrollTarget } from '../public/catalog-view.js';

function rail({ width = 1136, card = 128, gap = 16, count = 25, position = 0 } = {}) {
  const first = { getBoundingClientRect: () => ({ left: 250 - position, width: card }) };
  first.nextElementSibling = count > 1
    ? { getBoundingClientRect: () => ({ left: 250 - position + card + gap, width: card }) } : null;
  return { clientWidth: width, scrollWidth: count * (card + gap) - gap,
    scrollLeft: position, firstElementChild: count ? first : null };
}

test('the last card in an eight-card row becomes the first card after each arrow click', () => {
  const track = rail();
  assert.equal(getShelfScrollTarget(track, 'next'), 7 * 144);
  track.scrollLeft = 7 * 144;
  assert.equal(getShelfScrollTarget(track, 'next'), 14 * 144);
  assert.equal(getShelfScrollTarget(track, 'previous'), 0);
});

test('the last page exposes the end card after 24 games and cannot overscroll either edge', () => {
  const track = rail({ position: 14 * 144 });
  const end = 17 * 144;
  assert.equal(getShelfScrollTarget(track, 'next'), end);
  assert.equal(getShelfScrollTarget(track, 'next', end), end);
  assert.equal(getShelfScrollTarget(track, 'previous', 0), 0);
});

test('responsive rows use current card geometry, including fractional widths and a partial next card', () => {
  assert.equal(getShelfScrollTarget(rail({ width: 358, card: 110, gap: 14 }), 'next'), 2 * 124);
  assert.equal(getShelfScrollTarget(rail({ width: 942 }), 'next'), 6 * 144);
  const card = (942 - 6 * 16) / 7;
  assert.ok(Math.abs(getShelfScrollTarget(rail({ width: 942, card }), 'next') - 6 * (card + 16)) < .01);
});

test('rapid clicks can advance from the pending destination while smooth scrolling is still in progress', () => {
  const track = rail({ position: 180 });
  const pending = 7 * 144;
  assert.equal(getShelfScrollTarget(track, 'next', pending), 14 * 144);
  assert.equal(getShelfScrollTarget(track, 'previous', pending), 0);
});

test('short shelves stay at zero, while resized or manually scrolled shelves use their new layout', () => {
  assert.equal(getShelfScrollTarget(rail({ count: 2 }), 'next'), 0);
  assert.equal(getShelfScrollTarget(rail({ count: 1 }), 'next'), 0);
  assert.equal(getShelfScrollTarget(rail({ count: 0 }), 'next'), 0);
  assert.equal(getShelfScrollTarget(rail({ width: 560, position: 5 * 144 + 12 }), 'next'), 8 * 144);
  assert.equal(getShelfScrollTarget(rail({ width: 128 }), 'next'), 144);
});
