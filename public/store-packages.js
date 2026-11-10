// Display packages from the supplied Store reference. Prices are in USD cents.
export const STORE_PACKAGES = Object.freeze([
  { id: 'gc-250k', goldCoins: 250000, goldLabel: '250K', sweepsCoins: 50, priceCents: 2499, badge: 'Special Offer', featured: true },
  { id: 'gc-20k', goldCoins: 20000, goldLabel: '20K', sweepsCoins: 0, priceCents: 299 },
  { id: 'gc-50k', goldCoins: 50000, goldLabel: '50K', sweepsCoins: 5, priceCents: 499 },
  { id: 'gc-75k', goldCoins: 75000, goldLabel: '75K', sweepsCoins: 10, priceCents: 999 },
  { id: 'gc-125k', goldCoins: 125000, goldLabel: '125K', sweepsCoins: 21, priceCents: 1999 },
  { id: 'gc-300k', goldCoins: 300000, goldLabel: '300K', sweepsCoins: 52, priceCents: 4999, badge: 'Popular' },
  { id: 'gc-625k', goldCoins: 625000, goldLabel: '625K', sweepsCoins: 105, priceCents: 9999, badge: 'Most Value' },
].map(Object.freeze));

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatPackagePrice = packageInfo => usd.format(packageInfo.priceCents / 100);
export const getStorePackage = id => STORE_PACKAGES.find(packageInfo => packageInfo.id === id) || null;
