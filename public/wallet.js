import { CURRENCIES, formatBalance } from './wallet-state.js';
import { createWalletCounter, resolveWalletFrame } from './wallet-counter.js';
import { initWalletMenu } from './wallet-menu.js';

let initialized = false;
let walletController;

export function initWallet({ openStore, account, router } = {}) {
  if (initialized) return walletController;
  const wallet = document.querySelector('#coin-wallet');
  const switchBalanceCopy = document.querySelector('#coin-type-switch > .wallet-balance-copy');
  const balanceCopy = switchBalanceCopy || document.querySelector('#coin-wallet > .wallet-balance-copy');
  const balanceValue = document.querySelector('#wallet-balance-value');
  const currencyLabel = document.querySelector('#wallet-currency-label');
  const coinSwitch = document.querySelector('#coin-type-switch');
  const switchCoin = document.querySelector('#currency-coin');
  const purchaseLabel = document.querySelector('#wallet-purchase-label');
  const addButton = document.querySelector('#wallet-add');
  const addArt = document.querySelector('#wallet-add-art');
  if (![wallet, balanceCopy, balanceValue, currencyLabel, coinSwitch, switchCoin, addButton, addArt].every(Boolean)) return;
  initialized = true;

  let state = account.getSnapshot().wallet;
  let preferences = account.getMemberState().settings;
  let signedIn = account.isSignedIn();
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
  const menu = document.querySelector('#wallet-currency-menu')
    ? initWalletMenu({ account, router, openStore, selectCurrency: changeCurrency }) : null;

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
    if (!animate || reducedMotion.matches || preferences.reducedMotion || document.hidden || (!currencyChanged && counter.value === amount)) {
      finishBalance();
      return;
    }
    const fromWidth = wallet.getBoundingClientRect().width;
    animation = {
      deferDecimals: false,
      fromWidth,
      toWidth: Math.min(measureWallet(formatter(amount)), layout.available),
      previousWidth: fromWidth,
    };
    wallet.dataset.widthMotion = 'true';
    // A new currency counts up from zero, never from the other currency's balance.
    if (currencyChanged) counter.immediate(0, formatter);
    counter.animateTo(amount, formatter);
  }

  const inGame = () => router?.getRoute().type === 'game';
  function syncHeaderAction() {
    if (menu) { balanceCopy.hidden = false; menu.render(); return; }
    const purchasing = inGame();
    balanceCopy.hidden = purchasing;
    if (purchaseLabel) purchaseLabel.hidden = !purchasing;
    coinSwitch.dataset.action = purchasing ? 'store' : 'currency';
    switchCoin.src = purchasing ? addArt.src
      : state.currency === 'GC' ? 'assets/coins/gold-coin.svg' : 'assets/coins/sweeps-coin.svg';
    coinSwitch.setAttribute('role', purchasing ? 'button' : 'switch');
    if (purchasing) coinSwitch.removeAttribute('aria-checked');
    else coinSwitch.setAttribute('aria-checked', String(state.currency === 'SC'));
    const action = purchasing ? 'Buy Coins' : `Switch to ${CURRENCIES[state.currency === 'GC' ? 'SC' : 'GC'].name}`;
    coinSwitch.title = action;
    if (purchasing || switchBalanceCopy) coinSwitch.setAttribute('aria-label', purchasing ? action
      : `${wallet.getAttribute('aria-label')}. ${action}`);
  }

  function render({ animate = true } = {}) {
    const code = state.currency;
    wallet.dataset.currency = code;
    currencyLabel.textContent = code;
    if (switchBalanceCopy) coinSwitch.dataset.balanceMotion = String(animate && renderedCurrency !== null && renderedCurrency !== code &&
      !reducedMotion.matches && !preferences.reducedMotion && !document.hidden);
    applyLayout(readLayout());
    addArt.src = code === 'GC' ? 'assets/coins/add-gold.svg' : 'assets/coins/add-sweeps.svg';
    const precision = 10 ** CURRENCIES[code].decimals;
    const formatter = value => formatBalance(code, value * precision);
    const amount = state.balances[code] / precision;
    updateBalance(amount, formatter, animate, renderedCurrency !== null && renderedCurrency !== code);
    renderedCurrency = code;
    wallet.setAttribute('aria-label', preferences.hideBalance ? `${CURRENCIES[code].name} balance hidden`
      : `${CURRENCIES[code].name} balance: ${formatBalance(code, state.balances[code])} ${code}`);
    if (switchBalanceCopy) {
      balanceCopy.setAttribute('aria-hidden', 'true');
    }
    addButton.setAttribute('aria-label', 'Open store');
    syncHeaderAction();
  }

  async function changeCurrency(code) {
    coinSwitch.disabled = true;
    try {
      const result = await account.selectCurrency(code);
      if (!result.ok) throw new Error(result.reason);
      wallet.dispatchEvent(new CustomEvent('wallet:currency-change', { bubbles: true,
        detail: { currency: state.currency, demo: true } }));
      syncHeaderAction();
      return true;
    } catch {
      if (!inGame()) coinSwitch.title = 'Unable to save your currency. Please try again.';
      return false;
    } finally { coinSwitch.disabled = false; }
  }
  coinSwitch.addEventListener('click', () => menu ? menu.toggle() : inGame() ? openStore?.() : changeCurrency(state.currency === 'GC' ? 'SC' : 'GC'));
  addButton.addEventListener('click', () => openStore?.());
  account.subscribe(() => {
    const next = account.getSnapshot().wallet;
    const settings = account.getMemberState().settings;
    const sessionChanged = signedIn !== account.isSignedIn();
    signedIn = account.isSignedIn();
    const changed = JSON.stringify(next) !== JSON.stringify(state) || JSON.stringify(settings) !== JSON.stringify(preferences);
    state = next;
    preferences = settings;
    if (changed || sessionChanged) render({ animate: !sessionChanged });
  });
  window.addEventListener('resize', () => scheduleLayout(), { passive: true });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) finishBalance();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finishBalance();
  });
  render({ animate: false });
  router?.subscribe(syncHeaderAction);
  const layoutObserver = new ResizeObserver(() => scheduleLayout());
  // The dropdown trigger follows its text width; counter frames must not
  // interrupt themselves when that width changes during currency counting.
  for (const node of [header, addButton, ...(!menu ? [coinSwitch] : []), leadingControl].filter(Boolean)) layoutObserver.observe(node);
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
    setPreferences(next) {
      preferences = { hideBalance: next.hideBalance === true, reducedMotion: next.reducedMotion === true };
      render({ animate: false });
      balanceCopy.setAttribute('aria-hidden', String(preferences.hideBalance || Boolean(switchBalanceCopy)));
    },
  };
  return walletController;
}
