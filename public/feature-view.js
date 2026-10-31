import { FEATURE_PAGES, isFeaturePage } from './feature-pages.js';
import { createMemberState, MEMBER_STORAGE_KEY, dailyStatus, claimDailyReward, claimTaskReward, recordGameVisit } from './member-state.js';
import { renderRewardsPage } from './rewards-pages.js';
import { renderAccountPage } from './account-pages.js';
import { createShelfIcon } from './shelf-icons.js';
import { GAMES } from './catalog.js';
import { formatRoute } from './routes.js';

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
export function initFeatureView({ router, wallet } = {}) {
  const root = document.querySelector('#feature-view');
  const content = document.querySelector('#feature-content');
  const header = document.querySelector('#feature-header');
  const back = document.querySelector('#feature-back');
  const title = document.querySelector('#feature-title');
  const notice = document.querySelector('#feature-status');
  if (!router || !root || !content || !title || !header || !back) return;
  let saved;
  try { saved = JSON.parse(localStorage.getItem(MEMBER_STORAGE_KEY)); } catch { /* Use an empty local account. */ }
  let state = createMemberState(saved);
  let currentPage = null;
  const memberListeners = new Set();
  const games = new Map(GAMES.map(game => [game.id, game]));
  // Previously removed game IDs must never reappear through local history or favorites.
  state.history = state.history.filter(entry => entry.type !== 'game' || games.has(entry.gameId));
  state.favorites = state.favorites.filter(id => games.has(id));
  state.discoveredGameIds = state.discoveredGameIds.filter(id => games.has(id));

  function applyPreferences() {
    document.body.dataset.reduceMotion = String(state.settings.reducedMotion);
    document.body.dataset.hideBalance = String(state.settings.hideBalance);
    wallet?.setPreferences(state.settings);
    document.dispatchEvent(new CustomEvent('loop:preferences-change'));
  }
  function persist({ refresh = true } = {}) {
    try { localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(state)); } catch { /* Session state still works. */ }
    if (refresh && currentPage) renderContent();
    for (const listener of memberListeners) listener();
  }
  const notify = text => { notice.textContent = text; };
  function renderContent() {
    content.replaceChildren(renderRewardsPage(currentPage, ctx) || renderAccountPage(currentPage, ctx)
      || node('p', 'feature-muted', 'This page is unavailable.'));
  }
  function settleClaim(outcome) {
    if (!outcome.result.ok) return outcome.result;
    if (!wallet?.creditGold(outcome.result.amount)) return { ok: false, amount: 0, reason: 'The demo balance could not be updated.' };
    state = outcome.state;
    persist();
    return outcome.result;
  }
  const ctx = {
    node, icon: createShelfIcon, router, games: GAMES, state: () => state, ui: { historyFilter: 'all' },
    dailyStatus: () => dailyStatus(state), notify,
    claimDaily: () => settleClaim(claimDailyReward(state)),
    claimTask: id => settleClaim(claimTaskReward(state, id)),
    link(pageId, text, className = 'feature-button') {
      const a = node('a', className, text);
      const route = isFeaturePage(pageId) ? { type: 'feature', pageId }
        : pageId === 'store' ? { type: 'store' } : pageId === 'providers' ? { type: 'providers' }
          : pageId === 'all' || pageId === 'home' ? { type: 'home' } : { type: 'category', categoryId: pageId };
      a.href = formatRoute(route);
      a.addEventListener('click', event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); router.navigate(route);
      });
      return a;
    },
    saveProfile(profile) {
      const name = String(profile.displayName || '').trim();
      if (name.length < 2 || name.length > 24) return false;
      state = createMemberState({ ...state, profile }); persist(); return true;
    },
    saveSettings(settings) {
      state = createMemberState({ ...state, settings: { ...state.settings, ...settings } });
      applyPreferences(); persist();
    },
    toggleFavorite(id) {
      if (!games.has(id)) return;
      const exists = state.favorites.includes(id);
      state = { ...state, favorites: exists ? state.favorites.filter(value => value !== id) : [...state.favorites, id] };
      persist(); notify(exists ? 'Removed from favorites.' : 'Saved to favorites.');
    },
    openGame(id) {
      if (games.has(id)) router.navigate({ type: 'game-details', gameId: id, from: formatRoute(router.getRoute()) });
    },
    async copy(text) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch { notify('Select and copy the link from the field.'); return false; }
    },
  };

  function render(route, meta = {}) {
    const isFeature = route.type === 'feature' && isFeaturePage(route.pageId);
    root.hidden = !isFeature;
    currentPage = isFeature ? route.pageId : null;
    if (route.type === 'game' && games.has(route.gameId)) {
      state = recordGameVisit(state, games.get(route.gameId)); persist({ refresh: false });
    }
    if (!isFeature) return;
    const page = FEATURE_PAGES[currentPage];
    header.className = page.showHeader ? 'feature-header' : 'feature-header visually-hidden';
    back.hidden = !page.showHeader;
    document.body.dataset.page = 'feature';
    document.querySelector('#catalog-categories').dataset.activeMenu = currentPage;
    title.textContent = page.title;
    document.title = `${page.title} · LuckyLoop Casino`;
    notice.textContent = '';
    state.visited = [...new Set([...state.visited, currentPage])]; persist({ refresh: false });
    renderContent();
    if (meta.source === 'navigate' && meta.focus !== false) title.focus({ preventScroll: true });
  }
  back.addEventListener('click', () => router.navigate({ type: 'home' }));
  router.subscribe(render);
  applyPreferences();
  render(router.getRoute());
  // Re-evaluate daily availability when a sleeping tab becomes active, without timers.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ['daily-bonus', 'free-money'].includes(currentPage)) renderContent();
  });
  return {
    openFeature: pageId => { if (isFeaturePage(pageId)) router.navigate({ type: 'feature', pageId }); },
    member: {
      getState: () => createMemberState(state),
      getDailyStatus: now => dailyStatus(state, now),
      toggleFavorite: id => ctx.toggleFavorite(id),
      subscribe(listener) {
        memberListeners.add(listener);
        return () => memberListeners.delete(listener);
      },
    },
  };
}
