import { formatBalance } from './wallet-state.js';
import { redemptionAmount } from './redeem-state.js';

const methods = { bank: 'Bank Transfer', card: 'Card Redemption' };
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function initRedeemView({ router, account, auth, popupNavigation }) {
  const dialog = document.querySelector('#redeem-dialog');
  const chooser = dialog.querySelector('#redeem-methods');
  const details = dialog.querySelector('#redeem-details');
  const form = dialog.querySelector('#redeem-form');
  const amount = dialog.querySelector('#redeem-amount');
  const error = dialog.querySelector('#redeem-error');
  const status = dialog.querySelector('#redeem-status');
  const output = dialog.querySelector('#redeem-receive');
  const change = dialog.querySelector('#redeem-change');
  const max = dialog.querySelector('#redeem-max');
  const footer = dialog.querySelector('.redeem-dialog__footer');
  let method = null;
  let returnFocus = null;
  let showErrors = false;

  function balance() {
    const value = account.getSnapshot().wallet.balances.SC;
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function updateAmount() {
    const result = redemptionAmount(amount.value, balance());
    output.textContent = dollars.format(result.ok ? result.units / 100 : 0);
    const invalid = showErrors && !result.ok;
    error.textContent = invalid ? result.error : '';
    error.hidden = !invalid;
    amount.setAttribute('aria-invalid', String(invalid));
    return result;
  }

  function updateBalance() {
    for (const field of dialog.querySelectorAll('[data-redeem-balance]')) {
      field.textContent = formatBalance('SC', balance());
    }
    max.disabled = balance() === 0;
    updateAmount();
  }

  function resetAmount() {
    form.reset();
    showErrors = false;
    status.textContent = '';
    status.hidden = true;
    updateBalance();
  }

  function resetScroll() {
    dialog.scrollTop = 0;
    const body = dialog.querySelector('.redeem-dialog__body');
    if (body) body.scrollTop = 0;
  }

  function showMethods(focus = false, reset = false) {
    const previous = method;
    method = null;
    chooser.hidden = false;
    details.hidden = true;
    if (footer) footer.hidden = true;
    if (reset) resetAmount();
    resetScroll();
    if (focus) chooser.querySelector(`[data-redeem-method="${previous || 'bank'}"]`).focus({ preventScroll: true });
  }

  for (const button of chooser.querySelectorAll('[data-redeem-method]')) {
    button.addEventListener('click', () => {
      method = button.dataset.redeemMethod;
      if (!Object.hasOwn(methods, method)) return;
      dialog.querySelector('#redeem-method-name').textContent = methods[method];
      details.dataset.method = method;
      chooser.hidden = true;
      details.hidden = false;
      if (footer) footer.hidden = false;
      updateBalance();
      resetScroll();
      popupNavigation?.pushStep(dialog, { id: 'redeem-details', onBack: () => showMethods(true) });
      // Keep the mobile keyboard closed until the user taps the amount.
      change.focus({ preventScroll: true });
    });
  }
  change.addEventListener('click', () => {
    if (!popupNavigation?.backStep(dialog, 'redeem-details')) showMethods(true);
  });
  amount.addEventListener('input', () => {
    status.hidden = true;
    status.textContent = '';
    updateAmount();
  });
  max.addEventListener('click', () => {
    amount.value = (balance() / 100).toFixed(2);
    showErrors = true;
    status.hidden = true;
    status.textContent = '';
    updateAmount();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!account.isSignedIn() || !Object.hasOwn(methods, method)) return;
    showErrors = true;
    status.hidden = true;
    const result = updateAmount();
    if (!result.ok) return amount.focus();
    status.textContent = `${methods[method]} is not connected yet. This ${dollars.format(result.units / 100)} preview hasn't sent a request or changed your balance.`;
    status.hidden = false;
  });

  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    showMethods(false, true);
    if (returnFocus?.isConnected && !document.querySelector('dialog[open]')) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  router.subscribe(close);
  account.subscribe(() => {
    if (!account.isSignedIn()) close();
    else if (dialog.open) {
      status.hidden = true;
      updateBalance();
    }
  });

  return {
    open() {
      return auth.require(() => {
        if (document.querySelector('dialog[open]')) return;
        returnFocus = document.activeElement;
        showMethods(false, true);
        dialog.showModal();
        dialog.querySelector('.dialog-close').focus({ preventScroll: true });
      });
    },
  };
}
