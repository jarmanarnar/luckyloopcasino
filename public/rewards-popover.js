import { getAchievements } from './rewards-pages.js';
import { createShelfIcon } from './shelf-icons.js';
import { ACHIEVEMENTS, formatAchievementRewards } from './achievement-catalog.js';
import { sortAchievements } from './achievement-order.js';

export function initRewardsPopover({ router, account, openAchievement, openRegistration }) {
  const trigger = document.querySelector('#header-rewards');
  const panel = document.querySelector('#rewards-popover');
  if (!trigger || !panel) return;
  const badge = document.createElement('span');
  badge.className = 'rewards-count header-rewards__count';
  badge.setAttribute('aria-hidden', 'true');
  trigger.append(badge);
  const titleBadge = document.createElement('span');
  titleBadge.className = 'rewards-count';
  titleBadge.setAttribute('aria-hidden', 'true');
  panel.querySelector('#rewards-popover-title')?.append(titleBadge);
  function updateCount() {
    const signed = account.isSignedIn();
    const ready = signed ? getAchievements(account.getMemberState()).filter(task => task.ready) : [];
    // Guests get one invitation indicator; only members have a claimable reward count.
    badge.textContent = String(signed ? ready.length : 1);
    badge.hidden = signed && ready.length === 0;
    titleBadge.textContent = String(ready.length);
    titleBadge.hidden = ready.length === 0;
    trigger.setAttribute('aria-label', !signed ? 'Rewards, 1 new notification' : ready.length
      ? `Rewards, ${ready.length} ${ready.length === 1 ? 'reward' : 'rewards'} ready to claim` : 'Rewards');
    return ready;
  }
  updateCount();
  if (typeof panel.showPopover !== 'function') {
    trigger.addEventListener('click', () => router.navigate({ type: 'feature', pageId: 'achievements' }));
    account.subscribe(updateCount);
    return;
  }

  const missions = panel.querySelector('#rewards-missions');
  const empty = document.createElement('p');
  empty.className = 'rewards-popover__empty';
  empty.textContent = 'No rewards ready to claim.';
  const notice = document.createElement('p');
  notice.className = 'rewards-popover__notice';
  notice.setAttribute('role', 'status');
  missions.after(empty, notice);
  const pageSize = 2;
  let pending = null;
  let signedIn = account.isSignedIn();
  // Public catalog previews never expose a signed-out player's claims or progress.
  const guestRewards = ['verify-email', 'loyalty-tier-1'].map(id => ACHIEVEMENTS.find(task => task.id === id)).filter(Boolean);

  function joinRewards() {
    close();
    trigger.focus({ preventScroll: true });
    openRegistration?.();
  }

  function viewAchievement(id) {
    close();
    if (openAchievement) openAchievement(id);
    else router.navigate({ type: 'feature', pageId: 'achievements' });
  }

  function rewardRow(task) {
    const guest = !account.isSignedIn();
    const hasDetails = guest || openAchievement;
    const row = document.createElement('li');
    row.className = `reward-preview reward-preview--claim${hasDetails ? ' reward-preview--details' : ''}${task.ready ? '' : ' reward-preview--suggestion'}${guest ? ' reward-preview--guest' : ''}`;
    row.dataset.rewardId = task.id;
    const icon = document.createElement('span');
    icon.className = 'reward-preview__icon';
    icon.setAttribute('aria-hidden', 'true');
    if (task.badge) {
      const value = document.createElement('strong');
      value.textContent = task.badge;
      const label = document.createElement('small');
      label.textContent = task.badgeLabel;
      icon.append(value, label);
    } else icon.append(createShelfIcon(task.icon || 'achievements'));
    const copy = document.createElement('div');
    copy.className = 'reward-preview__copy';
    const title = document.createElement('strong');
    title.textContent = task.title;
    const status = document.createElement('span');
    status.className = 'reward-preview__status';
    status.textContent = task.ready ? formatAchievementRewards(task.rewards) : task.description;
    if (hasDetails) {
      const details = document.createElement('button');
      details.type = 'button'; details.className = 'reward-preview__details';
      details.setAttribute('aria-label', `View ${task.title}`);
      details.append(icon, copy);
      details.addEventListener('click', () => viewAchievement(task.id));
      row.append(details);
    } else row.append(icon, copy);
    const claim = document.createElement('button');
    claim.type = 'button';
    claim.className = `reward-preview__action ${guest ? 'reward-preview__join' : task.ready ? 'reward-preview__claim' : 'reward-preview__show-more'}`;
    claim.textContent = guest ? 'Join & Unlock' : task.ready ? pending === task.id ? 'Claiming…' : 'Claim' : 'Show more';
    claim.setAttribute('aria-label', guest ? `Join & Unlock ${task.title}` : task.ready ? `Claim ${task.title} reward` : `Show more about ${task.title}`);
    claim.disabled = !guest && pending !== null;
    claim.addEventListener('click', () => guest ? joinRewards() : task.ready ? claimReward(task.id) : viewAchievement(task.id));
    copy.append(title, status);
    row.append(claim);
    return row;
  }

  const isOpen = () => panel.matches(':popover-open');
  function close() {
    if (isOpen()) panel.hidePopover();
  }
  function position() {
    const anchor = trigger.getBoundingClientRect();
    if (!anchor.width || !anchor.height) return false;
    panel.style.setProperty('--rewards-popover-top', `${anchor.bottom + 8}px`);
    panel.style.setProperty('--rewards-popover-right', `${Math.max(8, document.documentElement.clientWidth - anchor.right)}px`);
    return true;
  }

  function render() {
    const ready = updateCount();
    const suggestions = account.isSignedIn() && ready.length === 0
      ? sortAchievements(getAchievements(account.getMemberState()).filter(task => !task.complete)) : [];
    const visible = (account.isSignedIn() ? ready.length ? ready : suggestions : guestRewards).slice(0, pageSize);
    missions.replaceChildren(...visible.map(rewardRow));
    empty.hidden = visible.length > 0;
    empty.textContent = account.isSignedIn() ? 'All achievements completed.' : 'No rewards ready to claim.';
    notice.hidden = !notice.textContent;
  }

  async function claimReward(id) {
    if (pending !== null || !account.isSignedIn()) return;
    // The account command revalidates eligibility and commits the credit atomically.
    if (!getAchievements(account.getMemberState()).some(task => task.id === id && task.ready)) { render(); return; }
    pending = id;
    notice.textContent = '';
    render();
    try {
      const result = await account.claimTask(id);
      if (account.isSignedIn() && !result.ok) notice.textContent = result.reason || 'Unable to claim this reward. Please try again.';
    } catch {
      if (account.isSignedIn()) notice.textContent = 'Unable to claim this reward. Please try again.';
    } finally {
      pending = null;
      render();
      if (isOpen() && !panel.contains(document.activeElement)) {
        (missions.querySelector('button') || panel.querySelector('[data-rewards-page]'))?.focus({ preventScroll: true });
      }
    }
  }

  panel.addEventListener('beforetoggle', event => {
    if (event.newState === 'closed') return;
    if (document.querySelector('dialog[open]') || !position()) {
      event.preventDefault();
      return;
    }
    notice.textContent = '';
    render();
    panel.scrollTop = 0;
  });
  panel.addEventListener('click', event => {
    const link = event.target.closest?.('[data-rewards-page]');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
    router.navigate({ type: 'feature', pageId: link.dataset.rewardsPage });
  });
  window.addEventListener('resize', () => { if (isOpen() && !position()) close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && isOpen()) render(); });
  router.subscribe(close);
  account.subscribe(() => {
    if (account.isSignedIn() !== signedIn) { signedIn = account.isSignedIn(); close(); render(); }
    else if (isOpen()) render();
    else updateCount();
  });
}
