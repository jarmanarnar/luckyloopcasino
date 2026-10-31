import assert from 'node:assert/strict';
import test from 'node:test';
import { STORE_PACKAGES, formatPackagePrice, getStorePackage } from '../public/store-packages.js';

test('Store matches all nine observed Crown packages, USD prices and free SC amounts', () => {
  assert.deepEqual(STORE_PACKAGES.map(p => [p.goldCoins, p.sweepsCoins, formatPackagePrice(p)]), [
    [40000, 0, '$1.99'], [100000, 5, '$4.99'], [200000, 10, '$9.99'],
    [400000, 21, '$19.99'], [800000, 42, '$39.99'], [1000000, 52, '$49.99'],
    [1200000, 63, '$59.99'], [1600000, 84, '$79.99'], [2000000, 105, '$99.99'],
  ]);
  assert.equal(STORE_PACKAGES.filter(p => p.badge === 'Popular')[0].priceCents, 5999);
  assert.equal(STORE_PACKAGES.filter(p => p.badge === 'Best')[0].priceCents, 9999);
});

test('Package selection resolves a unique immutable display package and rejects unknown IDs', () => {
  assert.equal(new Set(STORE_PACKAGES.map(p => p.id)).size, 9);
  for (const packageInfo of STORE_PACKAGES) {
    assert.equal(getStorePackage(packageInfo.id), packageInfo);
    assert.ok(Object.isFrozen(packageInfo));
    assert.ok(Number.isSafeInteger(packageInfo.priceCents));
  }
  assert.ok(Object.isFrozen(STORE_PACKAGES));
  assert.equal(getStorePackage('missing'), null);
});
