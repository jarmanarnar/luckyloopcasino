import assert from 'node:assert/strict';
import test from 'node:test';
import { redemptionAmount } from '../public/redeem-state.js';

test('redemption preview preserves exact hundredths and accepts decimal keyboard input', () => {
  for (const [value, units] of [['0.01', 1], ['0.29', 29], ['.5', 50], ['1,25', 125], [' 15 ', 1500], ['15.00', 1500]]) {
    assert.deepEqual(redemptionAmount(value, 1500), { ok: true, units });
  }
  assert.deepEqual(redemptionAmount('9999999.99', 999999999), { ok: true, units: 999999999 });
});

test('redemption preview rejects invalid, over-precise and out-of-balance amounts', () => {
  for (const value of ['', ' ', '0', '-1', 'NaN', 'Infinity', '1e2', '1,000', '1.001', '1.2.3', '15.01', '9007199254740991']) {
    assert.equal(redemptionAmount(value, 1500).ok, false, value);
  }
  for (const available of [0, -1, NaN, undefined, '1500', 1500.5]) {
    assert.equal(redemptionAmount('0.01', available).ok, false);
  }
  assert.equal(redemptionAmount('15', 1499).ok, false, 'rechecks the latest available balance');
});
