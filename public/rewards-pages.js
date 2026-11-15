import { renderAchievements } from './achievements-view.js';

// Local prototype content. Rewards use the local demo ledger; vendor wagers,
// purchases are not connected to these pages.
export const DEMO_TASKS = Object.freeze([
  Object.freeze({ id: 'complete-profile', title: 'Make it yours', description: 'Choose your display name in Profile.', amount: 500, target: 'profile', action: 'Edit profile' }),
  Object.freeze({ id: 'first-game', title: 'Try your first game', description: 'Open a game from the casino lobby.', amount: 500, target: 'popular', action: 'Browse games' }),
]);

const amount = value => new Intl.NumberFormat('en-US').format(value);
export const getDiscoveredGameCount = state => new Set(Array.isArray(state.discoveredGameIds) ? state.discoveredGameIds
  : (state.history || []).filter(item => item.type === 'game' && item.gameId).map(item => item.gameId)).size;

export function taskComplete(id, state) {
  if (id === 'complete-profile') return Boolean(state.profile?.displayName?.trim() && state.profile.displayName.trim() !== 'Loop Player');
  if (id === 'first-game') return getDiscoveredGameCount(state) > 0 || (state.history || []).some(item => item.type === 'game');
  return false;
}

export function getAchievements(state) {
  const claimed = new Set(state.taskClaims || []);
  return DEMO_TASKS.map(task => {
    const collected = claimed.has(task.id);
    const complete = collected || taskComplete(task.id, state);
    return { ...task, claimed: collected, complete, ready: complete && !collected };
  });
}

export async function collectAchievements(ctx, ids) {
  if (ctx.ui.achievementsCollecting) return { count: 0, amount: 0 };
  ctx.ui.achievementsCollecting = true;
  ctx.refresh('achievements');
  let total = 0, count = 0, reason = '';
  try {
    for (const id of new Set(ids)) {
      // Re-read after each committed claim, including changes from other tabs.
      if (!getAchievements(ctx.state()).some(entry => entry.id === id && entry.ready)) continue;
      const result = await ctx.claimTask(id);
      if (result.ok) { total += result.amount; count++; }
      else { reason = result.reason || 'This reward is not available.'; break; }
    }
  } catch {
    reason = 'Your rewards could not be collected. Please try again.';
  } finally {
    ctx.ui.achievementsCollecting = false;
    if (ctx.refresh('achievements', 'achievement-filter-' + (ctx.ui.achievementFilter || 'all'))) {
      const success = count ? `${amount(total)} GC collected. ` : '';
      ctx.notify(success + (reason || (count ? 'Your balance is up to date.' : 'No rewards are ready to collect.')));
    }
  }
  return { count, amount: total, reason };
}

export function renderRewardsPage(pageId, ctx) {
  switch (pageId) {
    case 'achievements': return renderAchievements(ctx, getAchievements(ctx.state()), ids => collectAchievements(ctx, ids));
    default: return null;
  }
}
