import { renderAchievements } from './achievements-view.js';
import { ACHIEVEMENTS, achievementProgress, discoveredGameCount, formatAchievementRewards } from './achievement-catalog.js';

// Local prototype content. Rewards use the local demo ledger; vendor wagers,
// purchases are not connected to these pages.
export const DEMO_TASKS = ACHIEVEMENTS;

export const getDiscoveredGameCount = discoveredGameCount;

export function taskComplete(id, state) {
  return achievementProgress(id, state).complete;
}

export function getAchievements(state) {
  const claimed = new Set(state.taskClaims || []);
  return DEMO_TASKS.map(task => {
    const collected = claimed.has(task.id);
    const progress = achievementProgress(task.id, state);
    const complete = collected || progress.complete;
    const credits = collected ? (state.history || []).filter(item => item.source === 'task' && item.sourceId === task.id && item.amountUnits > 0) : [];
    const rewards = credits.length ? Object.fromEntries(credits.map(item => [item.currency, item.amountUnits])) : task.rewards;
    const title = task.id === 'welcome-member' && collected && rewards.GC !== 50000 ? 'Welcome to COP COIN' : task.title;
    return { ...task, title, rewards, amount: rewards.GC || 0, progress: collected ? task.goal : progress.value, claimed: collected, complete, ready: complete && !collected };
  });
}

export async function collectAchievements(ctx, ids) {
  if (ctx.ui.achievementsCollecting) return { count: 0, amount: 0 };
  ctx.ui.achievementsCollecting = true;
  ctx.refresh('achievements');
  let total = 0, count = 0, reason = '';
  const rewards = { GC: 0, SC: 0 };
  try {
    for (const id of new Set(ids)) {
      // Re-read after each committed claim, including changes from other tabs.
      if (!getAchievements(ctx.state()).some(entry => entry.id === id && entry.ready)) continue;
      const result = await ctx.claimTask(id);
      if (result.ok) {
        const credit = result.rewards || { GC: result.amount };
        for (const code of ['GC', 'SC']) rewards[code] += credit[code] || 0;
        total += result.amount; count++;
      }
      else { reason = result.reason || 'This reward is not available.'; break; }
    }
  } catch {
    reason = 'Your rewards could not be collected. Please try again.';
  } finally {
    ctx.ui.achievementsCollecting = false;
    if (ctx.refresh('achievements', 'achievement-filter-' + (ctx.ui.achievementFilter || 'all'))) {
      const success = count ? `${formatAchievementRewards(rewards)} collected. ` : '';
      ctx.notify(success + (reason || (count ? 'Your balance is up to date.' : 'No rewards are ready to collect.')));
    }
  }
  return { count, amount: total, rewards, reason };
}

export function renderRewardsPage(pageId, ctx) {
  switch (pageId) {
    case 'achievements': return renderAchievements(ctx, getAchievements(ctx.state()), ids => collectAchievements(ctx, ids));
    default: return null;
  }
}
