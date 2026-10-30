import { CURRENCIES, createWalletState, formatBalance, selectCurrency, addDemoCredit } from './wallet-state.js';
import { createWalletCounter, resolveWalletFrame } from './wallet-counter.js';

const STORAGE_KEY = 'luckyloopcasino-demo-wallet-v1';
const LEGACY_STORAGE_KEYS = ['luckyloop-casino-demo-wallet-v1', 'atomic-design-demo-wallet-v1'];
let initialized = false;

export function initWallet() {
  if (initialized) return;
  const wallet = document.querySelector('#coin-wallet');
  const dialog = document.querySelector('#wallet-dialog');
  const balanceCopy = document.querySelector('#coin-wallet > .wallet-balance-copy');
  const balanceValue = document.querySelector('#wallet-balance-value');
  const currencyLabel = document.querySelector('#wallet-currency-label');
  const coinSwitch = document.querySelector('#coin-type-switch');
  const switchCoin = document.querySelector('#currency-coin');
  const addButton = document.querySelector('#wallet-add');
  const addArt = document.querySelector('#wallet-add-art');
  const creditButton = document.querySelector('#wallet-add-credit');
  const status = document.querySelector('#wallet-status');
  const totals = { GC: document.querySelector('#wallet-gc-total'), SC: document.querySelector('#wallet-sc-total') };
  if (![wallet, dialog, balanceCopy, balanceValue, currencyLabel, coinSwitch, switchCoin, addButton, addArt, creditButton, status,
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
  const header = wallet.parentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const valueMeasure = document.createElement('span');
  valueMeasure.className = 'wallet-value-measure';
  valueMeasure.setAttribute('aria-hidden', 'true');
  balanceCopy.append(valueMeasure);
  let layout;
  let targetAmount = 0;
  let formatAmount = String;
  let renderedCurrency = null;
  let animation = null;

  function measureWallet(text) {
    if (!layout) {
      const outer = getComputedStyle(wallet);
      const copy = getComputedStyle(balanceCopy);
      const grid = getComputedStyle(header);
      const px = value => parseFloat(value) || 0;
      layout = {
        chrome: px(outer.paddingLeft) + px(outer.paddingRight) + px(outer.borderLeftWidth)
          + px(outer.borderRightWidth) + px(outer.columnGap) + addButton.offsetWidth
          + px(copy.paddingLeft) + px(copy.paddingRight) + px(copy.columnGap),
        available: Math.max(0, header.clientWidth - 2 * (coinSwitch.offsetWidth + px(grid.columnGap))),
      };
      wallet.style.maxWidth = `${layout.available}px`;
    }
    valueMeasure.textContent = text;
    const naturalWidth = Math.ceil(layout.chrome + currencyLabel.getBoundingClientRect().width
      + valueMeasure.getBoundingClientRect().width);
    return naturalWidth;
  }

  function fitWallet(requestedWidth) {
    const textWidth = measureWallet(balanceValue.textContent);
    const minimumWidth = Math.min(textWidth, layout.available);
    wallet.style.minWidth = `${minimumWidth}px`;
    const width = Math.min(requestedWidth ?? textWidth, layout.available);
    if (wallet.style.width !== `${width}px`) wallet.style.width = `${width}px`;
  }

  const counter = createWalletCounter({
    duration: 720,
    onFrame(formatted, value) {
      if (animation && value !== targetAmount) {
        wallet.dataset.widthMotion = 'true';
        const frame = resolveWalletFrame({
          ...animation,
          formatted,
          integer: formatBalance('GC', value),
          measure: measureWallet,
        });
        balanceValue.textContent = frame.text;
        animation.previousWidth = frame.width;
        fitWallet(animation.toWidth > animation.fromWidth ? animation.toWidth : frame.width);
      } else {
        animation = null;
        balanceValue.textContent = formatted;
        fitWallet();
      }
    },
  });

  function finishBalance() {
    animation = null;
    wallet.dataset.widthMotion = 'false';
    counter.immediate(targetAmount, formatAmount);
  }

  function updateBalance(amount, formatter, animate, currencyChanged) {
    counter.cancel();
    targetAmount = amount;
    formatAmount = formatter;
    if (!animate || reducedMotion.matches || document.hidden || counter.value === amount) {
      finishBalance();
      return;
    }
    const fromWidth = wallet.getBoundingClientRect().width;
    animation = {
      deferDecimals: currencyChanged && state.currency === 'SC',
      fromWidth,
      toWidth: Math.min(measureWallet(formatter(amount)), layout.available),
      previousWidth: fromWidth,
    };
    counter.animateTo(amount, formatter);
  }

  function render({ animate = true } = {}) {
    const code = state.currency;
    wallet.dataset.currency = code;
    dialog.dataset.currency = code;
    currencyLabel.textContent = code;
    switchCoin.src = code === 'GC' ? 'assets/coins/gold-coin.svg' : 'assets/coins/sweeps-coin.svg';
    addArt.src = code === 'GC' ? 'assets/coins/add-gold.svg' : 'assets/coins/add-sweeps.svg';
    coinSwitch.setAttribute('aria-checked', String(code === 'SC'));
    coinSwitch.title = `Switch to ${CURRENCIES[code === 'GC' ? 'SC' : 'GC'].name}`;
    const precision = 10 ** CURRENCIES[code].decimals;
    const formatter = value => formatBalance(code, value * precision);
    const amount = state.balances[code] / precision;
    updateBalance(amount, formatter, animate, renderedCurrency !== null && renderedCurrency !== code);
    renderedCurrency = code;
    wallet.setAttribute('aria-label', `Demo wallet: ${formatBalance(code, state.balances[code])} ${code}`);
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

  function openWallet() {
    status.textContent = '';
    addButton.setAttribute('aria-expanded', 'true');
    if (!dialog.open) dialog.showModal();
    creditButton.focus({ preventScroll: true });
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
  addButton.addEventListener('click', () => openWallet());
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
  window.addEventListener('resize', () => {
    layout = null;
    finishBalance();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) finishBalance();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finishBalance();
  });
  render({ animate: false });
}
