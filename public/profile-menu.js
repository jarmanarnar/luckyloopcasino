import { getDemoRank } from './rewards-pages.js';
import { createShelfIcon } from './shelf-icons.js';

const dateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const number = new Intl.NumberFormat('en-US');

export function initProfileMenu({ router, account, openNotifications, verifyPhone }) {
  const trigger = document.querySelector('#header-profile');
  const menu = document.querySelector('#profile-menu');
  const summary = document.querySelector('#profile-summary');
  if (!trigger || !menu || !summary) return;
  if (typeof menu.showPopover !== 'function') {
    trigger.addEventListener('click', () => router.navigate({ type: 'feature', pageId: 'profile' }));
    return;
  }

  for (const item of menu.querySelectorAll('[data-profile-icon]')) {
    item.prepend(createShelfIcon(item.dataset.profileIcon));
  }
  const fields = Object.fromEntries(['avatar', 'name', 'since', 'percent', 'progress', 'rank', 'next-rank',
    'games', 'favorites', 'rewards', 'coins'].map(id => [id, summary.querySelector(`#profile-summary-${id}`)]));
  const rankBadge = menu.querySelector('#profile-menu-rank');
  const status = menu.querySelector('#profile-menu-status');
  const isMenuOpen = () => menu.matches(':popover-open');

  function positionMenu() {
    const anchor = trigger.getBoundingClientRect();
    if (!anchor.width || !anchor.height) return false;
    menu.style.setProperty('--profile-menu-top', `${anchor.bottom + 8}px`);
    menu.style.setProperty('--profile-menu-right', `${Math.max(8, document.documentElement.clientWidth - anchor.right)}px`);
    return true;
  }

  function renderRank() {
    rankBadge.textContent = getDemoRank(account.getSnapshot().member).current.name;
  }

  function renderSummary() {
    const { identity, createdAt, member, ledger } = account.getSnapshot();
    const rank = getDemoRank(member);
    const registeredAt = identity?.registeredAt || createdAt;
    const rewards = ledger.filter(entry => entry.type === 'bonus');
    const goldCredited = rewards.reduce((sum, entry) => sum + (entry.currency === 'GC' ? entry.amountUnits : 0), 0);
    fields.avatar.textContent = member.profile.avatar;
    fields.name.textContent = member.profile.displayName;
    fields.since.dateTime = registeredAt;
    fields.since.textContent = dateLabel.format(new Date(registeredAt));
    fields.percent.textContent = `${Math.round(rank.progress * 100)}%`;
    fields.progress.value = rank.progress;
    fields.progress.setAttribute('aria-label', rank.next ? `Progress to ${rank.next.name}` : 'Top rank reached');
    fields.rank.textContent = rank.current.name;
    fields['next-rank'].textContent = rank.next?.name || 'Top rank';
    fields.games.textContent = number.format(rank.games);
    fields.favorites.textContent = number.format(member.favorites.length);
    fields.rewards.textContent = number.format(rewards.length);
    fields.coins.textContent = number.format(goldCredited);
  }

  function closeMenu() {
    if (isMenuOpen()) menu.hidePopover();
  }
  function closeSummary() {
    if (summary.open) summary.close();
  }
  function close() {
    closeMenu();
    closeSummary();
  }
  menu.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open') return;
    if (!account.isSignedIn() || document.querySelector('dialog[open]') || !positionMenu()) {
      event.preventDefault();
      return;
    }
    status.textContent = '';
    renderRank();
  });

  function navigate(event) {
    const link = event.target.closest?.('[data-profile-page]');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
    const pageId = link.dataset.profilePage;
    const samePage = router.getRoute().pageId === pageId;
    router.navigate({ type: 'feature', pageId }, link.hasAttribute('data-profile-transactions')
      ? { historyFilter: 'transaction', force: samePage, replace: samePage } : {});
  }
  menu.addEventListener('click', navigate);
  summary.addEventListener('click', navigate);
  summary.querySelector('.profile-summary__close').addEventListener('click', closeSummary);
  summary.addEventListener('click', event => {
    if (event.target !== summary) return;
    const bounds = summary.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSummary();
  });

  const actions = {
    summary() {
      renderSummary();
      summary.showModal();
      summary.scrollTop = 0;
    },
    messages: openNotifications,
    redeem: verifyPhone,
  };
  for (const [name, action] of Object.entries(actions)) {
    menu.querySelector(`[data-profile-action="${name}"]`).addEventListener('click', () => {
      closeMenu();
      trigger.focus({ preventScroll: true });
      action();
    });
  }
  const logout = menu.querySelector('[data-profile-action="logout"]');
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    status.textContent = '';
    try {
      const result = await account.logout();
      if (!result.ok) status.textContent = result.reason || 'Unable to log out.';
    } catch {
      status.textContent = 'Unable to log out.';
    } finally {
      logout.disabled = false;
    }
  });

  window.addEventListener('resize', () => { if (isMenuOpen() && !positionMenu()) closeMenu(); });
  router.subscribe(close);
  account.subscribe(() => {
    if (!account.isSignedIn()) close();
    else {
      if (isMenuOpen()) renderRank();
      if (summary.open) renderSummary();
    }
  });
}
