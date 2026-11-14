import { CURRENCIES, formatBalance } from './wallet-state.js';

export function initWalletMenu({ account, router, selectCurrency, document: doc = document } = {}) {
  const shell = doc.querySelector('#header-wallet-controls');
  const panel = doc.querySelector('#wallet-currency-menu');
  const trigger = doc.querySelector('#coin-type-switch');
  if (!shell || !panel || !trigger) return null;
  const coin = doc.querySelector('#currency-coin');
  const hide = doc.querySelector('#wallet-hide-balance');
  const feedback = doc.querySelector('#wallet-menu-status');
  const avatar = doc.querySelector('#header-avatar');
  const options = new Map(['GC', 'SC'].map(code => [code, {
    row: doc.querySelector(`#wallet-row-${code}`),
    button: doc.querySelector(`#wallet-select-${code}`),
    amount: doc.querySelector(`#wallet-amount-${code}`),
  }]));
  let busy = false;

  function close(focus = false) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus({ preventScroll: true });
  }
  function render() {
    const { wallet } = account.getSnapshot();
    const member = account.getMemberState();
    const hidden = member.settings.hideBalance;
    const code = wallet.currency;
    trigger.setAttribute('role', 'button');
    trigger.removeAttribute('aria-checked');
    trigger.dataset.action = 'currencies';
    trigger.title = 'Choose currency';
    trigger.setAttribute('aria-label', (['game', 'game-details'].includes(router?.getRoute?.().type) || doc.body?.dataset.playerActive === 'true') ? `${code} In Play. Choose currency` : hidden ? `${code} balance hidden. Choose currency`
      : `${code} balance: ${formatBalance(code, wallet.balances[code])}. Choose currency`);
    coin.src = code === 'GC' ? 'assets/coins/gold-coin.svg' : 'assets/coins/sweeps-coin.svg';
    hide.setAttribute('aria-checked', String(hidden));
    hide.disabled = busy;
    for (const [currency, option] of options) {
      option.row.dataset.active = String(currency === code);
      option.button.setAttribute('aria-pressed', String(currency === code));
      option.button.setAttribute('aria-label', `${CURRENCIES[currency].name}, ${hidden ? 'balance hidden' : formatBalance(currency, wallet.balances[currency])}`);
      option.amount.textContent = hidden ? '••••••' : formatBalance(currency, wallet.balances[currency]);
      option.button.disabled = busy;
    }
    if (avatar) avatar.textContent = member.profile.avatar || 'L';
    if (!account.isSignedIn()) close();
  }
  function toggle() {
    if (!account.isSignedIn()) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    feedback.textContent = '';
  }
  async function save(action, dismiss = false) {
    if (busy) return;
    busy = true;
    feedback.textContent = '';
    render();
    try {
      const result = await action();
      if (result === false || result?.ok === false) throw new Error('Save failed');
      if (dismiss) close(true);
    } catch { feedback.textContent = 'Unable to save. Please try again.'; }
    finally { busy = false; render(); }
  }
  for (const [code, option] of options) {
    option.button.addEventListener('click', () => save(() => selectCurrency(code), true));
  }
  hide.addEventListener('click', () => save(() => account.saveSettings({ hideBalance: !account.getMemberState().settings.hideBalance })));
  trigger.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (panel.hidden) toggle();
    options.get(account.getSnapshot().wallet.currency).button.focus();
  });
  doc.addEventListener('pointerdown', event => { if (!panel.hidden && !shell.contains(event.target)) close(); });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
  });
  account.subscribe(render);
  router?.subscribe(() => close());
  render();
  return { toggle, render, close };
}
