// Rewards use integer wallet units: GC coins and SC hundredths.
// Reference: the 55 publicly displayed Lucky Bunny achievements, checked 2026-11-19.
// COP COIN welcome milestones total 500,000 GC + 5 SC; ordinary streaks are separate.
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
export const formatAchievementRewards = rewards => Object.entries(rewards || {})
  .filter(([, units]) => units > 0).map(([code, units]) => `${number(units / (code === 'SC' ? 100 : 1))} ${code}`).join(' + ');
const playGoals = [70, 140, 280, 700, 1260, 2450, 5600, 10500, 17500, 31500];
const playRewards = [2500, 7500, 15000, 35000, 65000, 125000, 300000, 500000, 850000, 1600000];
const tierGoals = [100, 1000, 4000, 10000, 22000, 55000, 100000, 200000, 420000, 760000, 1300000];
const tierRewards = [1, 2, 10, 20, 30, 40, 60, 80, 100, 150, 200];
const welcomeStreakRewards = { GC: 100000, SC: 150 };
export const ACHIEVEMENTS = Object.freeze([
  ...playGoals.map((goal, i) => ({
    id: `limit-breaker-${i + 1}`, title: `Limit Breaker ${roman[i]}`,
    description: `Reach ${number(goal)} SC in qualifying play to receive ${number(playRewards[i])} GC and ${number(playRewards[i] / 10000)} SC.`,
    rewards: { GC: playRewards[i], SC: playRewards[i] / 100 },
    group: 'play', metric: 'playSC', goal, unit: 'Amount', progressCurrency: 'SC', icon: 'adventure', badge: roman[i], badgeLabel: 'LIMIT', action: 'Play Now',
  })),
  { id: 'welcome-member', title: '50K GC Reward', description: 'Welcome to COP COIN. Your first reward is ready when you join.', rewards: { GC: 50000 }, group: 'welcome', metric: 'registration', goal: 1, unit: 'Registration', icon: 'achievements' },
  { id: 'verify-email', title: '150K GC + 1 SC', description: 'Verify your email address to collect your welcome reward.', rewards: { GC: 150000, SC: 100 }, group: 'welcome', metric: 'email', goal: 1, unit: 'Email verified', icon: 'notifications', action: 'Verify Email' },
  { id: 'verify-phone', title: '100K GC + 1 SC', description: 'Verify your phone number to continue your welcome journey.', rewards: { GC: 100000, SC: 100 }, group: 'welcome', metric: 'phone', goal: 1, unit: 'Phone verified', icon: 'profile', action: 'Verify Phone' },
  ...[3, 7].map(goal => ({ id: `welcome-streak-${goal}`, title: `${goal}-Day Welcome Reward`, description: `Log in for ${goal} consecutive days to receive ${formatAchievementRewards(welcomeStreakRewards)}.`, rewards: welcomeStreakRewards, group: 'welcome', metric: 'streak', goal, unit: 'Days', badge: String(goal), badgeLabel: 'DAYS', action: 'Try Your Luck' })),
  ...tierGoals.map((goal, i) => ({ id: `loyalty-tier-${i + 1}`, title: `${tierRewards[i]} SC Reward`,
    description: `Reach ${number(goal)} SC of loyalty progress to unlock tier ${roman[i]} and collect ${tierRewards[i]} SC.`,
    rewards: { SC: tierRewards[i] * 100 }, group: 'tier', metric: 'loyaltySC', goal, unit: 'Amount', progressCurrency: 'SC', badge: roman[i], badgeLabel: 'TIER', action: 'Play Now' })),
  ...Array.from({ length: 29 }, (_, i) => {
    const goal = i + 2, gc = goal <= 10 ? 1500 : goal <= 20 ? 2500 : 5000;
    return { id: `login-streak-${goal}`, title: `${goal} Days Streak`, description: `Log in for ${goal} consecutive days.`,
      rewards: { GC: gc, SC: gc / 100 }, group: 'streak', metric: 'streak', goal, unit: 'Days', badge: String(goal), badgeLabel: 'DAYS', action: 'Try Your Luck' };
  }),
].map(task => Object.freeze({ ...task, rewards: Object.freeze(task.rewards), amount: task.rewards.GC || 0 })));

const tasks = new Map(ACHIEVEMENTS.map(task => [task.id, task]));
const distinct = values => new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value)).size;
export function discoveredGameCount(state) {
  return distinct(Array.isArray(state.discoveredGameIds) ? state.discoveredGameIds
    : (state.history || []).filter(item => item.type === 'game').map(item => item.gameId));
}

export function achievementProgress(id, state) {
  const task = tasks.get(id);
  if (!task) return { value: 0, goal: 1, complete: false };
  const safe = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
  const best = safe(state.attendance?.bestStreak);
  const current = safe(state.attendance?.streak);
  // Game launches, wallet credits and elapsed time are not play or loyalty progress.
  // These totals/verification flags must come from their verified integrations.
  const verified = state.achievementStats || {};
  const metrics = {
    registration: Number(best > 0),
    streak: best >= task.goal ? task.goal : current,
    playSC: safe(verified.playSCUnits) / 100,
    loyaltySC: safe(verified.loyaltySCUnits) / 100,
    email: Number(verified.emailVerified === true), phone: Number(verified.phoneVerified === true),
  };
  const value = Math.min(task.goal, metrics[task.metric] || 0);
  return { value, goal: task.goal, complete: value >= task.goal };
}

const localDay = value => {
  const date = new Date(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
};

export function recordAttendance(state, now = new Date()) {
  const previous = state.attendance || {};
  const lastDay = previous.lastVisit ? localDay(previous.lastVisit) : -Infinity;
  const today = localDay(now);
  // A refresh, second tab, or backwards clock change must never add a day.
  if (!Number.isFinite(today) || today <= lastDay) return state;
  const previousStreak = Number.isSafeInteger(previous.streak) ? Math.max(0, previous.streak) : 0;
  const streak = today - lastDay === 1 ? previousStreak + 1 : 1;
  return { ...state, attendance: { lastVisit: new Date(now).toISOString(), streak,
    bestStreak: Math.max(streak, Number.isSafeInteger(previous.bestStreak) ? previous.bestStreak : 0) } };
}
