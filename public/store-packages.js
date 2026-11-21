// Local preview catalog from the Lucky Bunny store and supplied screenshots.
// Prices are USD cents; checkout remains the existing verification flow.
export const STORE_PACKAGES = Object.freeze([
  { id: 'gc-180k-new', goldCoins: 180000, sweepsCoins: 18, priceCents: 699, originalPriceCents: 1800, badge: 'New', offer: 'new' },
  { id: 'gc-400k-popular', goldCoins: 400000, sweepsCoins: 40, priceCents: 1599, originalPriceCents: 4000, badge: 'Popular', offer: 'popular' },
  { id: 'gc-600k-sale', goldCoins: 600000, sweepsCoins: 60, priceCents: 2399, originalPriceCents: 6000, badge: 'Sale', offer: 'sale' },
  { id: 'gc-50k', goldCoins: 50000, sweepsCoins: 5, priceCents: 499 },
  { id: 'gc-500k', goldCoins: 500000, sweepsCoins: 50, priceCents: 4999 },
  { id: 'gc-1m', goldCoins: 1000000, sweepsCoins: 101, priceCents: 9999, originalPriceCents: 10100 },
  { id: 'gc-2m', goldCoins: 2000000, sweepsCoins: 202, priceCents: 19999, originalPriceCents: 20200 },
  { id: 'gc-5m', goldCoins: 5000000, sweepsCoins: 510, priceCents: 49999, originalPriceCents: 51000 },
  { id: 'gc-10m', goldCoins: 10000000, sweepsCoins: 1020, priceCents: 99999, originalPriceCents: 102000 },
  { id: 'gc-100k', goldCoins: 100000, sweepsCoins: 10, priceCents: 999 },
  { id: 'gc-200k', goldCoins: 200000, sweepsCoins: 20, priceCents: 1999 },
  { id: 'gc-300k', goldCoins: 300000, sweepsCoins: 30, priceCents: 2999 },
  { id: 'gc-2_5m', goldCoins: 2500000, sweepsCoins: 253, priceCents: 24999, originalPriceCents: 25300 },
  { id: 'gc-22k', goldCoins: 22000, sweepsCoins: 0, priceCents: 199 },
  { id: 'gc-55k', goldCoins: 55000, sweepsCoins: 0, priceCents: 499 },
  { id: 'gc-110k', goldCoins: 110000, sweepsCoins: 0, priceCents: 999 },
].map(Object.freeze));

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatPackagePrice = packageInfo => usd.format(packageInfo.priceCents / 100);
export const formatOriginalPrice = packageInfo => packageInfo.originalPriceCents
  ? usd.format(packageInfo.originalPriceCents / 100).replace(/\.00$/, '') : '';
export const formatPackageCoins = amount => new Intl.NumberFormat('en-US').format(amount).replaceAll(',', '\u00a0');
export const getStorePackage = id => STORE_PACKAGES.find(packageInfo => packageInfo.id === id) || null;
