import { CURRENCIES, createWalletState, formatBalance, selectCurrency } from './wallet-state.js';
import { createWalletCounter, resolveWalletFrame } from './wallet-counter.js';

const STORAGE_KEY = 'luckyloopcasino-demo-wallet-v1';
const LEGACY_STORAGE_KEYS = ['luckyloop-casino-demo-wallet-v1', 'atomic-design-demo-wallet-v1'];
let initialized = false;
let walletController;

export function initWallet({ openStore } = {}) {
  if (initialized) return walletController;
  const wallet = document.querySelector('#coin-wallet');
  const balanceCopy = document.querySelector('#coin-wallet > .wallet-balance-copy');
  const balanceValue = document.querySelector('#wallet-balance-value');
  const currencyLabel = document.querySelector('#wallet-currency-label');
  const coinSwitch = document.querySelector('#coin-type-switch');
  const switchCoin = document.querySelector('#currency-coin');
  const addButton = document.querySelector('#wallet-add');
  const addArt = document.querySelector('#wallet-add-art');
  if (![wallet, balanceCopy, balanceValue, currencyLabel, coinSwitch, switchCoin, addButton, addArt].every(Boolean)) return;
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
  let preferences = { hideBalance: false, reducedMotion: false };
  const header = wallet.parentElement;
  const leadingControl = document.querySelector('.header-context');
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
  let layoutFrame = null;
  let fontsChanged = false;

  function readLayout() {
    const outer = getComputedStyle(wallet);
    const copy = getComputedStyle(balanceCopy);
    const grid = getComputedStyle(header);
    const px = value => parseFloat(value) || 0;
    const headerWidth = header.getBoundingClientRect().width;
    const addWidth = addButton.getBoundingClientRect().width;
    const switchWidth = coinSwitch.getBoundingClientRect().width;
    const leadingWidth = leadingControl?.getBoundingClientRect().width || 0;
    const gap = px(grid.columnGap);
    const dimensions = [headerWidth, addWidth, switchWidth, leadingWidth, grid.columnGap,
      outer.paddingLeft, outer.paddingRight, outer.borderLeftWidth, outer.borderRightWidth,
      outer.columnGap, copy.paddingLeft, copy.paddingRight, copy.columnGap];
    for (const node of [currencyLabel, balanceValue]) {
      const text = getComputedStyle(node);
      dimensions.push(text.fontFamily, text.fontSize, text.fontWeight, text.fontStyle,
        text.fontStretch, text.fontVariantNumeric, text.letterSpacing);
    }
    const chrome = px(outer.paddingLeft) + px(outer.paddingRight) + px(outer.borderLeftWidth)
      + px(outer.borderRightWidth) + px(outer.columnGap) + addWidth
      + px(copy.paddingLeft) + px(copy.paddingRight) + px(copy.columnGap);
    return {
      signature: dimensions.join('|'),
      chrome,
      available: Math.max(0, headerWidth - leadingWidth - switchWidth - 2 * gap),
      headerHalf: headerWidth / 2,
      leadingLimit: leadingWidth + gap,
      trailingLimit: headerWidth - switchWidth - gap,
    };
  }

  function applyLayout(next) {
    layout = next;
    wallet.style.maxWidth = `${layout.available}px`;
    // Percentages follow the wallet's animated width, keeping its edges clear of both controls.
    wallet.style.transform = `translateX(clamp(calc(${layout.leadingLimit}px - ${layout.headerHalf}px + 50%), 0px, calc(${layout.trailingLimit}px - ${layout.headerHalf}px - 50%)))`;
  }

  function measureWallet(text) {
    if (!layout) applyLayout(readLayout());
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

  function scheduleLayout(force = false) {
    fontsChanged ||= force;
    if (layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = null;
      const next = readLayout();
      const changed = fontsChanged || next.signature !== layout?.signature;
      fontsChanged = false;
      if (!changed) return;
      applyLayout(next);
      finishBalance();
    });
  }

  function updateBalance(amount, formatter, animate, currencyChanged) {
    counter.cancel();
    targetAmount = amount;
    formatAmount = formatter;
    if (!animate || reducedMotion.matches || preferences.reducedMotion || document.hidden || counter.value === amount) {
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
    currencyLabel.textContent = code;
    applyLayout(readLayout());
    switchCoin.src = code === 'GC' ? 'assets/coins/gold-coin.svg' : 'assets/coins/sweeps-coin.svg';
    addArt.src = code === 'GC' ? 'assets/coins/add-gold.svg' : 'assets/coins/add-sweeps.svg';
    coinSwitch.setAttribute('aria-checked', String(code === 'SC'));
    coinSwitch.title = `Switch to ${CURRENCIES[code === 'GC' ? 'SC' : 'GC'].name}`;
    const precision = 10 ** CURRENCIES[code].decimals;
    const formatter = value => formatBalance(code, value * precision);
    const amount = state.balances[code] / precision;
    updateBalance(amount, formatter, animate, renderedCurrency !== null && renderedCurrency !== code);
    renderedCurrency = code;
    wallet.setAttribute('aria-label', preferences.hideBalance ? `${CURRENCIES[code].name} balance hidden`
      : `${CURRENCIES[code].name} balance: ${formatBalance(code, state.balances[code])} ${code}`);
    addButton.setAttribute('aria-label', 'Open store');
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* Session interactions remain available when browser storage is disabled. */ }
  }

  function changeCurrency(code) {
    state = selectCurrency(state, code);
    render();
    save();
    wallet.dispatchEvent(new CustomEvent('wallet:currency-change', { bubbles: true,
      detail: { currency: state.currency, demo: true } }));
  }
  coinSwitch.addEventListener('click', () => changeCurrency(state.currency === 'GC' ? 'SC' : 'GC'));
  addButton.addEventListener('click', () => openStore?.());
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    state = createWalletState(readSaved());
    render();
  });
  window.addEventListener('resize', () => scheduleLayout(), { passive: true });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) finishBalance();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finishBalance();
  });
  render({ animate: false });
  const layoutObserver = new ResizeObserver(() => scheduleLayout());
  for (const node of [header, addButton, coinSwitch, leadingControl].filter(Boolean)) layoutObserver.observe(node);
  if (document.fonts) {
    document.fonts.ready.then(() => scheduleLayout(true));
    document.fonts.addEventListener('loadingdone', () => scheduleLayout(true));
  }
  walletController = {
    refreshLayout() {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = null;
      fontsChanged = false;
      applyLayout(readLayout());
      finishBalance();
    },
    creditGold(amount) {
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 7000 || state.balances.GC + amount > 999999999) return false;
      state = { ...state, balances: { ...state.balances, GC: state.balances.GC + amount } };
      save(); render(); return true;
    },
    setPreferences(next) {
      preferences = { hideBalance: next.hideBalance === true, reducedMotion: next.reducedMotion === true };
      render({ animate: false });
      balanceCopy.setAttribute('aria-hidden', String(preferences.hideBalance));
    },
  };
  return walletController;
}
