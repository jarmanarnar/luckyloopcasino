const metricOrder = new Map([
  ['registration', 0], ['email', 1], ['phone', 2],
  ['streak', 3], ['playSC', 4], ['loyaltySC', 5],
]);

// Presentation order balances one-time setup, short waits and early play/tier
// milestones. These positions never change goals, eligibility or reward values.
const discoveryOrder = [
  'welcome-member', 'verify-email', 'verify-phone',
  'login-streak-2', 'limit-breaker-1', 'welcome-streak-3',
  'login-streak-3', 'loyalty-tier-1', 'login-streak-4',
  'limit-breaker-2', 'login-streak-5', 'loyalty-tier-2',
  'login-streak-6', 'welcome-streak-7', 'login-streak-7',
  'limit-breaker-3', 'login-streak-8', 'loyalty-tier-3',
  'login-streak-9', 'limit-breaker-4', 'login-streak-10',
  'loyalty-tier-4', 'login-streak-11', 'login-streak-12',
  'limit-breaker-5', 'login-streak-13', 'loyalty-tier-5',
  'login-streak-14', 'login-streak-15', 'limit-breaker-6',
  'login-streak-16', 'loyalty-tier-6', 'login-streak-17',
  'login-streak-18', 'limit-breaker-7', 'login-streak-19',
  'loyalty-tier-7', 'login-streak-20', 'login-streak-21',
  'limit-breaker-8', 'login-streak-22', 'loyalty-tier-8',
  'login-streak-23', 'login-streak-24', 'limit-breaker-9',
  'login-streak-25', 'loyalty-tier-9', 'login-streak-26',
  'login-streak-27', 'limit-breaker-10', 'login-streak-28',
  'loyalty-tier-10', 'login-streak-29', 'login-streak-30',
  'loyalty-tier-11',
];
const discoveryRank = new Map(discoveryOrder.map((id, index) => [id, index]));
const maxProgressBoost = 6;
const onboardingCount = 3;

export function isAchievementInProgress(entry) {
  return !entry.complete && !entry.claimed && !entry.ready
    && Number.isFinite(entry.progress) && Number.isFinite(entry.goal)
    && entry.progress > 0 && entry.progress < entry.goal;
}

function bucket(entry) {
  if (entry.claimed) return 2;
  if (entry.ready) return 0;
  return 1;
}

function catalogOrder(a, b) {
  const metric = (metricOrder.get(a.metric) ?? metricOrder.size)
    - (metricOrder.get(b.metric) ?? metricOrder.size);
  if (metric || a.metric !== b.metric) return metric;
  const aGoal = Number.isFinite(a.goal) ? a.goal : Infinity;
  const bGoal = Number.isFinite(b.goal) ? b.goal : Infinity;
  return aGoal === bGoal ? 0 : aGoal < bGoal ? -1 : 1;
}

export function sortAchievements(entries) {
  const baseline = entries.map((entry, index) => ({ entry, index }))
    .sort((a, b) => (discoveryRank.get(a.entry.id) ?? Infinity) - (discoveryRank.get(b.entry.id) ?? Infinity)
      || catalogOrder(a.entry, b.entry) || a.index - b.index);
  return baseline.map(({ entry, index }, position) => {
    const rank = discoveryRank.get(entry.id) ?? discoveryOrder.length + position;
    // A nearby goal may rise by up to half a page. A single login must never
    // promote all 31 streak rewards ahead of the other unfinished achievements.
    const boost = isAchievementInProgress(entry) ? maxProgressBoost * entry.progress / entry.goal : 0;
    // Keep welcome, email and phone together within their claim state.
    const score = rank < onboardingCount ? rank : Math.max(onboardingCount, rank - boost);
    return { entry, index, rank, score, bucket: bucket(entry) };
  }).sort((a, b) => a.bucket - b.bucket
      || (a.bucket === 1 ? a.score - b.score : 0)
      || a.rank - b.rank || a.index - b.index)
    .map(({ entry }) => entry);
}
