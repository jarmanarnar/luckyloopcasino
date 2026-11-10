import assert from 'node:assert/strict';
import test from 'node:test';
import { STORE_PACKAGES, formatPackagePrice, getStorePackage } from '../public/store-packages.js';

test('Store matches the featured offer and six packages in the supplied reference', () => {
  assert.deepEqual(STORE_PACKAGES.map(p => [p.goldCoins, p.goldLabel, p.sweepsCoins, formatPackagePrice(p), p.badge]), [
    [250000, '250K', 50, '$24.99', 'Special Offer'],
    [20000, '20K', 0, '$2.99', undefined],
    [50000, '50K', 5, '$4.99', undefined],
    [75000, '75K', 10, '$9.99', undefined],
    [125000, '125K', 21, '$19.99', undefined],
    [300000, '300K', 52, '$49.99', 'Popular'],
    [625000, '625K', 105, '$99.99', 'Most Value'],
  ]);
  assert.deepEqual(STORE_PACKAGES.filter(p => p.featured), [STORE_PACKAGES[0]]);
});

test('Package selection resolves a unique immutable display package and rejects unknown IDs', () => {
  assert.equal(new Set(STORE_PACKAGES.map(p => p.id)).size, STORE_PACKAGES.length);
  for (const packageInfo of STORE_PACKAGES) {
    assert.equal(getStorePackage(packageInfo.id), packageInfo);
    assert.ok(Object.isFrozen(packageInfo));
    assert.ok(Number.isSafeInteger(packageInfo.priceCents));
  }
  assert.ok(Object.isFrozen(STORE_PACKAGES));
  assert.equal(getStorePackage('missing'), null);
});
