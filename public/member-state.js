// Local prototype state only: no authentication, provider rounds or real transactions.
export const MEMBER_STORAGE_KEY = 'luckyloopcasino-member-v1';
const avatars = new Set(['L', '∞', '★', '7', 'G', 'S']);
export const TASK_REWARDS = Object.freeze({ 'complete-profile': 500, 'first-game': 500, 'daily-check-in': 250 });
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const boundedStrings = (value, max = 200) => Array.isArray(value)
  ? [...new Set(value.filter(item => typeof item === 'string' && item.length <= 100))].slice(-max) : [];

export function createMemberState(saved = {}) {
  const displayName = typeof saved?.profile?.displayName === 'string' ? saved.profile.displayName.trim().slice(0, 24) : '';
  const discovered = Array.isArray(saved?.discoveredGameIds) ? saved.discoveredGameIds
    : Array.isArray(saved?.history) ? saved.history.filter(entry => entry?.type === 'game').map(entry => entry.gameId) : [];
  return {
    profile: { displayName: displayName.length >= 2 ? displayName : 'Loop Player', avatar: avatars.has(saved?.profile?.avatar) ? saved.profile.avatar : 'L' },
    settings: { hideBalance: saved?.settings?.hideBalance === true, reducedMotion: saved?.settings?.reducedMotion === true },
    daily: { lastClaim: iso(saved?.daily?.lastClaim) ? saved.daily.lastClaim : null,
      streak: Number.isInteger(saved?.daily?.streak) && saved.daily.streak >= 0 && saved.daily.streak <= 7 ? saved.daily.streak : 0,
      totalClaims: Number.isSafeInteger(saved?.daily?.totalClaims) && saved.daily.totalClaims >= 0 ? saved.daily.totalClaims : 0 },
    taskClaims: boundedStrings(saved?.taskClaims).filter(id => Object.hasOwn(TASK_REWARDS, id)),
    favorites: boundedStrings(saved?.favorites), visited: boundedStrings(saved?.visited),
    discoveredGameIds: boundedStrings(discovered, 1000),
    history: Array.isArray(saved?.history) ? saved.history.filter(item => item && ['game', 'reward'].includes(item.type)
      && iso(item.at) && typeof item.title === 'string').slice(-200).map(item => ({
        id: String(item.id || item.at).slice(0, 100), type: item.type, at: item.at,
        title: item.title.slice(0, 160), detail: String(item.detail || '').slice(0, 300),
        ...(typeof item.gameId === 'string' ? { gameId: item.gameId.slice(0, 100) } : {}),
      })) : [],
  };
}

// Calendar days use the device's local timezone, including across daylight-saving changes.
function dayIndex(value) {
  const date = new Date(value);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}
export function dailyStatus(state, now = new Date()) {
  const today = new Date(now);
  const elapsed = state.daily.lastClaim ? dayIndex(today) - dayIndex(state.daily.lastClaim) : Infinity;
  const available = elapsed > 0;
  const nextDay = elapsed === 1 && state.daily.streak < 7 ? state.daily.streak + 1 : 1;
  const midnight = new Date(today);
  midnight.setHours(24, 0, 0, 0);
  return { available, streak: elapsed > 1 ? 0 : state.daily.streak,
    nextDay: available ? nextDay : state.daily.streak, amount: (available ? nextDay : state.daily.streak) * 1000,
    nextAt: midnight.toISOString() };
}

export function taskEligible(id, state) {
  return id === 'complete-profile' ? state.profile.displayName !== 'Loop Player'
    : id === 'first-game' ? state.discoveredGameIds.length > 0 || state.history.some(entry => entry.type === 'game')
      : id === 'daily-check-in' ? state.daily.totalClaims > 0 : false;
}
function rewardEntry(state, title, amount, now) {
  const at = new Date(now).toISOString();
  return [...state.history, { id: `reward-${at}-${state.history.length}`, type: 'reward', at, title,
    detail: `+${new Intl.NumberFormat('en-US').format(amount)} demo GC` }].slice(-200);
}
export function claimDailyReward(state, now = new Date()) {
  const status = dailyStatus(state, now);
  if (!status.available) return { state, result: { ok: false, amount: 0, reason: 'Already collected today. Come back tomorrow.' } };
  return { state: { ...state, daily: { lastClaim: new Date(now).toISOString(), streak: status.nextDay, totalClaims: state.daily.totalClaims + 1 },
    history: rewardEntry(state, `Day ${status.nextDay} bonus`, status.amount, now) },
  result: { ok: true, amount: status.amount } };
}
export function claimTaskReward(state, id, now = new Date()) {
  if (!Object.hasOwn(TASK_REWARDS, id) || !taskEligible(id, state)) return { state, result: { ok: false, amount: 0, reason: 'Complete this task first.' } };
  if (state.taskClaims.includes(id)) return { state, result: { ok: false, amount: 0, reason: 'This reward has already been collected.' } };
  const amount = TASK_REWARDS[id];
  const titles = { 'complete-profile': 'Profile complete', 'first-game': 'First game opened', 'daily-check-in': 'Daily check-in mission' };
  return { state: { ...state, taskClaims: [...state.taskClaims, id], history: rewardEntry(state, titles[id], amount, now) },
    result: { ok: true, amount } };
}

export function recordGameVisit(state, game, now = new Date()) {
  if (!game) return state;
  const at = new Date(now).toISOString();
  return { ...state, discoveredGameIds: [...new Set([...(state.discoveredGameIds || []), game.id])],
    history: [...state.history, { id: `game-${at}-${state.history.length}`, type: 'game', at,
    title: game.title, detail: `${game.providerName} · Demo opened`, gameId: game.id }].slice(-200) };
}
