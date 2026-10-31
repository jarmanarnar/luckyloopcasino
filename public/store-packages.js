// Standard packages visible in the user's Crown Coins Store on 2026-10-31.
// Prices are USD cents. These are prototype display values, not payment offers.
// Source: https://crowncoinscasino.com/ (Store, including free SC and badges).
export const STORE_PACKAGES = Object.freeze([
  { id: 'gc-40k', goldCoins: 40000, goldLabel: '40K', sweepsCoins: 0, priceCents: 199 },
  { id: 'gc-100k', goldCoins: 100000, goldLabel: '100K', sweepsCoins: 5, priceCents: 499 },
  { id: 'gc-200k', goldCoins: 200000, goldLabel: '200K', sweepsCoins: 10, priceCents: 999 },
  { id: 'gc-400k', goldCoins: 400000, goldLabel: '400K', sweepsCoins: 21, priceCents: 1999 },
  { id: 'gc-800k', goldCoins: 800000, goldLabel: '800K', sweepsCoins: 42, priceCents: 3999 },
  { id: 'gc-1m', goldCoins: 1000000, goldLabel: '1M', sweepsCoins: 52, priceCents: 4999 },
  { id: 'gc-1200k', goldCoins: 1200000, goldLabel: '1.2M', sweepsCoins: 63, priceCents: 5999, badge: 'Popular' },
  { id: 'gc-1600k', goldCoins: 1600000, goldLabel: '1.6M', sweepsCoins: 84, priceCents: 7999 },
  { id: 'gc-2m', goldCoins: 2000000, goldLabel: '2M', sweepsCoins: 105, priceCents: 9999, badge: 'Best' },
].map(Object.freeze));

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatPackagePrice = packageInfo => usd.format(packageInfo.priceCents / 100);
export const getStorePackage = id => STORE_PACKAGES.find(packageInfo => packageInfo.id === id) || null;
