import { CURRENCIES, createWalletState, formatBalance, selectCurrency, addDemoCredit } from './wallet-state.js';

const STORAGE_KEY = 'luckyloopcasino-demo-wallet-v1';
const LEGACY_STORAGE_KEYS = ['luckyloop-casino-demo-wallet-v1', 'atomic-design-demo-wallet-v1'];
let initialized = false;

export function initWallet() {
  if (initialized) return;
  const wallet = document.querySelector('#coin-wallet');
  const dialog = document.querySelector('#wallet-dialog');
  const balanceButton = document.querySelector('#wallet-balance-button');
  const balanceValue = document.querySelector('#wallet-balance-value');
  const currencyLabel = document.querySelector('#wallet-currency-label');
  const coinSwitch = document.querySelector('#coin-type-switch');
  const switchCoin = document.querySelector('#currency-coin');
  const addButton = document.querySelector('#wallet-add');
  const addArt = document.querySelector('#wallet-add-art');
  const creditButton = document.querySelector('#wallet-add-credit');
  const status = document.querySelector('#wallet-status');
  const totals = { GC: document.querySelector('#wallet-gc-total'), SC: document.querySelector('#wallet-sc-total') };
  if (![wallet, dialog, balanceButton, balanceValue, currencyLabel, coinSwitch, switchCoin, addButton, addArt, creditButton, status,
    ...Object.values(totals)].every(Boolean)) return;
  initialized = true;

  function readSaved() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) return JSON.parse(saved);
      const legacy = LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(value => value !== null);
      if (legacy === undefined) return null;
      const migrated = createWalletState(JSON.parse(legacy));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
      catch { /* Keep migrated balances available when browser storage is read-only. */ }
      return migrated;
    }
    catch { return null; }
  }
  let state = createWalletState(readSaved());
  const selectors = [...document.querySelectorAll('[data-wallet-currency]')];

  function render() {
    const code = state.currency;
    wallet.dataset.currency = code;
    dialog.dataset.currency = code;
    currencyLabel.textContent = code;
    switchCoin.src = code === 'GC' ? 'assets/coins/gold-coin.svg' : 'assets/coins/sweeps-coin.svg';
    addArt.src = code === 'GC' ? 'assets/coins/add-gold.svg' : 'assets/coins/add-sweeps.svg';
    coinSwitch.setAttribute('aria-checked', String(code === 'SC'));
    coinSwitch.title = `Switch to ${CURRENCIES[code === 'GC' ? 'SC' : 'GC'].name}`;
    balanceValue.textContent = formatBalance(code, state.balances[code]);
    balanceButton.setAttribute('aria-label', `Demo wallet: ${formatBalance(code, state.balances[code])} ${code}`);
    addButton.setAttribute('aria-label', `Add demo ${CURRENCIES[code].name}`);
    creditButton.textContent = `Add ${formatBalance(code, CURRENCIES[code].credit)} ${code}`;
    for (const [currency, total] of Object.entries(totals)) {
      total.textContent = formatBalance(currency, state.balances[currency]);
    }
    for (const button of selectors) {
      const currency = button.dataset.walletCurrency;
      button.setAttribute('aria-pressed', String(currency === code));
      button.setAttribute('aria-label', `${CURRENCIES[currency].name}, ${formatBalance(currency, state.balances[currency])} ${currency}`);
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* Session interactions remain available when browser storage is disabled. */ }
  }

  function openWallet(focusCredit = false) {
    status.textContent = '';
    balanceButton.setAttribute('aria-expanded', 'true');
    addButton.setAttribute('aria-expanded', 'true');
    if (!dialog.open) dialog.showModal();
    if (focusCredit) creditButton.focus({ preventScroll: true });
  }

  function changeCurrency(code) {
    state = selectCurrency(state, code);
    status.textContent = '';
    render();
    save();
    wallet.dispatchEvent(new CustomEvent('wallet:currency-change', { bubbles: true,
      detail: { currency: state.currency, demo: true } }));
  }
  selectors.forEach(button => button.addEventListener('click', () => changeCurrency(button.dataset.walletCurrency)));
  coinSwitch.addEventListener('click', () => changeCurrency(state.currency === 'GC' ? 'SC' : 'GC'));
  balanceButton.addEventListener('click', () => openWallet());
  addButton.addEventListener('click', () => openWallet(true));
  creditButton.addEventListener('click', () => {
    const previous = state.balances[state.currency];
    state = addDemoCredit(state);
    render();
    save();
    const code = state.currency;
    status.textContent = previous === state.balances[code] ? 'Demo balance limit reached.'
      : `Added ${formatBalance(code, state.balances[code] - previous)} ${code}. Balance: ${formatBalance(code, state.balances[code])} ${code}.`;
  });
  dialog.addEventListener('close', () => {
    balanceButton.setAttribute('aria-expanded', 'false');
    addButton.setAttribute('aria-expanded', 'false');
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    state = createWalletState(readSaved());
    render();
  });
  render();
}
