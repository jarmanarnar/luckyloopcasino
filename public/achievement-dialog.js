import { getAchievements } from './rewards-pages.js';
import { achievementMedal, formatAchievementProgress as format } from './achievements-view.js';
import { formatAchievementRewards } from './achievement-catalog.js';
import { createShelfIcon } from './shelf-icons.js';
import { createUiIcon } from './ui-icons.js';

export function initAchievementDialog({ account, auth, router, openVerification, document: doc = document }) {
  const node = (tag, css, text) => { const el = doc.createElement(tag); if (css) el.className = css; if (text !== undefined) el.textContent = text; return el; };
  const dialog = node('dialog', 'achievement-dialog'); dialog.id = 'achievement-dialog'; dialog.dir = 'ltr'; dialog.lang = 'en';
  dialog.setAttribute('aria-labelledby', 'achievement-detail-title');
  const close = node('button', 'dialog-close icon-button achievement-dialog__close'); close.type = 'button'; close.setAttribute('aria-label', 'Close achievement'); close.append(createUiIcon('close'));
  const body = node('div', 'achievement-dialog__body'), notice = node('p', 'achievement-dialog__notice'), actions = node('div', 'achievement-dialog__actions'); notice.setAttribute('role', 'status');
  dialog.append(close, body, notice, actions); doc.body.append(dialog);
  let selected = null, opener = null, pending = false, session = 0;
  const ctx = { node, icon: createShelfIcon };
  const button = (text, css, action) => { const el = node('button', css, text); el.type = 'button'; el.addEventListener('click', action); return el; };
  function render() {
    const entry = getAchievements(account.getMemberState()).find(item => item.id === selected); if (!entry) return;
    const medal = achievementMedal(ctx, entry, true), title = node('h2', '', entry.title); title.id = 'achievement-detail-title';
    const description = node('p', 'achievement-dialog__description', entry.description), progress = node('div', 'achievement-dialog__progress');
    progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', `${entry.title} progress`);
    progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', String(entry.goal)); progress.setAttribute('aria-valuenow', String(entry.progress));
    progress.append(createShelfIcon('history'), node('strong', '', `${format(entry.progress)} / ${format(entry.goal)}`));
    if (entry.progressCurrency) { const coin = node('img'); coin.src = 'assets/coins/super-coin-front.png'; coin.alt = 'SC'; coin.width = coin.height = 18; progress.append(coin); }
    progress.append(node('span', 'achievement-dialog__unit', entry.unit));
    const rewards = node('div', 'achievement-dialog__rewards');
    for (const [code, units] of Object.entries(entry.rewards)) {
      const reward = node('div', 'achievement-dialog__reward'), coin = node('img');
      coin.src = `assets/coins/${code === 'GC' ? 'gold' : 'super'}-coin-front.png`; coin.alt = ''; coin.width = coin.height = 28;
      const copy = node('span'); copy.append(node('span', '', code), node('strong', '', format(units / (code === 'SC' ? 100 : 1)))); reward.append(coin, copy); rewards.append(reward);
    }
    body.replaceChildren(medal, title, description, progress, node('h3', '', 'Rewards'), rewards); actions.replaceChildren();
    if (entry.ready) {
      const claim = button(pending ? 'Claiming…' : 'Claim', 'achievement-claim', () => claimReward(entry.id)); claim.disabled = pending; actions.append(claim);
    } else {
      actions.append(button('Close', 'achievement-dialog__secondary', () => dialog.close()));
      if (!entry.claimed) {
        const verification = ['email', 'phone'].includes(entry.metric);
        const action = button(entry.action || 'Go to lobby', 'achievement-claim', () => {
          dialog.close();
          if (verification) openVerification?.(entry.metric); else router.navigate({ type: 'home' });
        }); action.disabled = verification && !openVerification; actions.append(action);
        if (verification && !account.getCapabilities?.().verification?.[entry.metric]) body.append(node('p', 'achievement-dialog__availability', 'Verification is currently unavailable.'));
        else if (['playSC', 'loyaltySC'].includes(entry.metric) && !account.getCapabilities?.().gameEvents) body.append(node('p', 'achievement-dialog__availability', 'Game and loyalty progress are not connected yet.'));
      }
    }
  }
  async function claimReward(id) {
    if (pending || !account.isSignedIn()) return;
    const current = session, player = account.getSnapshot().playerId;
    pending = true; notice.textContent = ''; render();
    try {
      const result = await account.claimTask(id);
      if (!dialog.open || current !== session || player !== account.getSnapshot().playerId) return;
      notice.textContent = result.ok ? `${formatAchievementRewards(result.rewards || { GC: result.amount })} added to your balance.` : result.reason || 'Unable to claim. Please try again.';
    } catch { if (dialog.open && current === session) notice.textContent = 'Unable to claim. Please try again.'; }
    finally {
      pending = false;
      if (dialog.open) { render(); if (current === session) actions.querySelector('button')?.focus({ preventScroll: true }); }
    }
  }
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  } });
  dialog.addEventListener('close', () => {
    session++; selected = null;
    const target = opener?.isConnected ? opener : doc.getElementById('achievement-filter-all') || doc.querySelector('#header-rewards'); target?.focus({ preventScroll: true });
  });
  router.subscribe(() => { if (dialog.open) dialog.close(); });
  account.subscribe(() => { if (dialog.open) { if (!account.isSignedIn()) dialog.close(); else render(); } });
  return { open(id) { return auth.require(() => {
    if (doc.querySelector('dialog[open]') || !getAchievements(account.getMemberState()).some(item => item.id === id)) return;
    selected = id; opener = doc.activeElement; session++; notice.textContent = ''; render(); dialog.showModal(); close.focus({ preventScroll: true });
  }); } };
}
