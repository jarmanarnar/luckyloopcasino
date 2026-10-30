export const CURRENCIES = Object.freeze({
  GC: Object.freeze({ name: 'Gold Coins', decimals: 0, initial: 125000, credit: 1000 }),
  SC: Object.freeze({ name: 'Sweeps Coins', decimals: 2, initial: 1500, credit: 1000 }),
});

const MAX_BALANCE = 999999999;
const formatters = Object.fromEntries(Object.entries(CURRENCIES).map(([code, currency]) => [code,
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }),
]));

// Balances are integer units (GC) or integer hundredths (SC).
// This is prototype-only state, independent of every provider game session.
export function createWalletState(saved) {
  const balances = {};
  for (const [code, currency] of Object.entries(CURRENCIES)) {
    const value = saved?.balances?.[code];
    balances[code] = Number.isSafeInteger(value) && value >= 0 && value <= MAX_BALANCE
      ? value : currency.initial;
  }
  return { currency: Object.hasOwn(CURRENCIES, saved?.currency) ? saved.currency : 'GC', balances };
}

export function formatBalance(code, units) {
  return formatters[code].format(units / 10 ** CURRENCIES[code].decimals);
}

export function selectCurrency(state, code) {
  return Object.hasOwn(CURRENCIES, code) ? { ...state, currency: code } : state;
}

export function addDemoCredit(state) {
  const code = state.currency;
  return {
    ...state,
    balances: { ...state.balances, [code]: Math.min(MAX_BALANCE, state.balances[code] + CURRENCIES[code].credit) },
  };
}
