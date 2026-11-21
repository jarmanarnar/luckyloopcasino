import assert from 'node:assert/strict';
import test from 'node:test';
import { STORE_PACKAGES, formatPackagePrice, formatOriginalPrice, formatPackageCoins, getStorePackage } from '../public/store-packages.js';

test('Store includes all reference packages with accurate coin amounts and offer prices', () => {
  assert.deepEqual(STORE_PACKAGES.map(p => [p.goldCoins, p.sweepsCoins, formatPackagePrice(p), formatOriginalPrice(p)]), [
    [180000, 18, '$6.99', '$18'], [400000, 40, '$15.99', '$40'], [600000, 60, '$23.99', '$60'],
    [50000, 5, '$4.99', ''], [500000, 50, '$49.99', ''],
    [1000000, 101, '$99.99', '$101'], [2000000, 202, '$199.99', '$202'],
    [5000000, 510, '$499.99', '$510'], [10000000, 1020, '$999.99', '$1,020'],
    [100000, 10, '$9.99', ''], [200000, 20, '$19.99', ''], [300000, 30, '$29.99', ''],
    [2500000, 253, '$249.99', '$253'], [22000, 0, '$1.99', ''], [55000, 0, '$4.99', ''], [110000, 0, '$9.99', ''],
  ]);
  assert.deepEqual(STORE_PACKAGES.filter(p => p.offer).map(p => p.badge), ['New', 'Popular', 'Sale']);
  assert.equal(formatPackageCoins(10000000), '10\u00a0000\u00a0000');
  assert.equal(formatPackageCoins(1020), '1\u00a0020');
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
  assert.equal(getStorePackage('gc-150k-new'), null, 'the removed promotional package cannot be selected');
  assert.deepEqual(STORE_PACKAGES.filter(p => p.priceCents === 999).map(p => p.id), ['gc-100k', 'gc-110k'],
    'the other $9.99 packages remain available');
});
