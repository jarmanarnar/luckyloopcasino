import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TASKS, getDiscoveredGameCount, taskComplete, getAchievements, collectAchievements } from '../public/rewards-pages.js';

test('discovery statistics count distinct game launches rather than reward events or repeat opens', () => {
  const state = { history: [{ type: 'game', gameId: 'a' }, { type: 'game', gameId: 'a' },
    { type: 'reward', gameId: 'b' }, { type: 'game', gameId: 'b' }, { type: 'game', gameId: 'c' }] };
  assert.equal(getDiscoveredGameCount(state), 3);
  assert.equal(getDiscoveredGameCount({}), 0);
  const discoveredGameIds = Array.from({ length: 25 }, (_, i) => String(i));
  assert.equal(getDiscoveredGameCount({ discoveredGameIds, history: [] }), 25);
  assert.equal(getDiscoveredGameCount({ discoveredGameIds: ['a', 'a'], history: [] }), 1);
});

test('completed includes collected rewards while ready excludes them and retired tasks', () => {
  const entries = getAchievements({ attendance: { streak: 4, bestStreak: 4 }, taskClaims: ['login-streak-2', 'daily-check-in', 'complete-profile'] });
  const collected = entries.find(entry => entry.id === 'login-streak-2');
  assert.equal(collected.complete, true); assert.equal(collected.claimed, true); assert.equal(collected.ready, false);
  assert.equal(entries.length, 55);
  assert.equal(entries.some(entry => ['daily-check-in', 'complete-profile', 'first-game'].includes(entry.id)), false);
  assert.equal(entries.filter(entry => entry.complete).length, 5);
  assert.equal(entries.filter(entry => entry.ready).length, 4);
});

function rewardContext(state, claim) {
  const notices = [], refreshes = [];
  return { state: () => state, ui: {}, notices, refreshes,
    refresh: (...args) => { refreshes.push(args); return true; },
    notify: message => notices.push(message), claimTask: claim };
}

test('guest claim attempts open registration without submitting any rewards', async () => {
  let registrations = 0, claims = 0;
  const ctx = rewardContext({ attendance: { bestStreak: 30 } }, () => { claims++; });
  ctx.isSignedIn = () => false;
  ctx.openRegistration = () => registrations++;
  assert.deepEqual(await collectAchievements(ctx, ['welcome-member', 'login-streak-2']), { count: 0, amount: 0 });
  assert.equal(registrations, 1);
  assert.equal(claims, 0);
  assert.deepEqual(ctx.notices, []);
});

test('logging out during claim-all stops further claims and hides private reward notices', async () => {
  let signedIn = true, release;
  const calls = [];
  const gate = new Promise(resolve => { release = resolve; });
  const ctx = rewardContext({ attendance: { bestStreak: 3 }, taskClaims: [] }, async id => {
    calls.push(id); await gate;
    return { ok: true, amount: 1500, rewards: { GC: 1500, SC: 15 } };
  });
  ctx.isSignedIn = () => signedIn;
  const result = collectAchievements(ctx, ['login-streak-2', 'login-streak-3']);
  signedIn = false; release(); await result;
  assert.deepEqual(calls, ['login-streak-2']);
  assert.equal(ctx.ui.achievementsCollecting, false);
  assert.deepEqual(ctx.notices, []);
});

test('claim all serializes eligible rewards, ignores stale and duplicate IDs, and blocks duplicate clicks', async () => {
  const state = { attendance: { bestStreak: 3, streak: 3 }, taskClaims: [] };
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ctx = rewardContext(state, async id => {
    calls.push(id);
    await gate;
    state.taskClaims.push(id);
    return { ok: true, amount: 1500, rewards: { GC: 1500, SC: 15 } };
  });
  const first = collectAchievements(ctx, ['login-streak-2', 'login-streak-2', 'daily-check-in', 'unknown', 'login-streak-3']);
  assert.equal(ctx.ui.achievementsCollecting, true);
  assert.deepEqual(await collectAchievements(ctx, ['login-streak-3']), { count: 0, amount: 0 });
  release();
  assert.deepEqual(await first, { count: 2, amount: 3000, rewards: { GC: 3000, SC: 30 }, reason: '' });
  assert.deepEqual(calls, ['login-streak-2', 'login-streak-3']);
  assert.equal(ctx.ui.achievementsCollecting, false);
  assert.match(ctx.notices[0], /3,000 GC \+ 0.3 SC collected/);
  await collectAchievements(ctx, ['login-streak-2', 'login-streak-3']);
  assert.equal(calls.length, 2, 'collected rewards cannot be submitted again');
});

test('claim all preserves a partial success, reports a failure, and can be retried', async () => {
  const state = { attendance: { bestStreak: 3, streak: 3 }, taskClaims: [] };
  let fail = true;
  const ctx = rewardContext(state, async id => {
    if (id === 'login-streak-3' && fail) throw new Error('Storage unavailable');
    state.taskClaims.push(id);
    return { ok: true, amount: 1500, rewards: { GC: 1500, SC: 15 } };
  });
  const result = await collectAchievements(ctx, ['login-streak-2', 'login-streak-3']);
  assert.equal(result.amount, 1500); assert.equal(result.rewards.SC, 15);
  assert.match(ctx.notices[0], /1,500 GC \+ 0.15 SC collected.*could not be collected/);
  assert.equal(ctx.ui.achievementsCollecting, false);
  fail = false;
  assert.equal((await collectAchievements(ctx, ['login-streak-2', 'login-streak-3'])).amount, 1500);
  assert.deepEqual(state.taskClaims, ['login-streak-2', 'login-streak-3']);
});

test('the replacement catalog uses registration, verification, consecutive days and verified play totals', () => {
  const state = { profile: { displayName: 'Loop Player' }, daily: { totalClaims: 0 }, history: [] };
  assert.equal(taskComplete('complete-profile', state), false);
  assert.equal(taskComplete('first-game', state), false);
  assert.equal(taskComplete('daily-check-in', state), false);
  assert.equal(taskComplete('unknown', state), false);
  assert.equal(taskComplete('complete-profile', { profile: { displayName: 'Alex' } }), false);
  assert.equal(taskComplete('first-game', { history: [{ type: 'game' }] }), false);
  assert.equal(taskComplete('welcome-member', { attendance: { bestStreak: 1 } }), true);
  assert.equal(taskComplete('verify-phone', { achievementStats: { phoneVerified: true } }), true);
  assert.equal(taskComplete('daily-check-in', { daily: { totalClaims: 1 } }), false);
  assert.deepEqual(DEMO_TASKS.slice(0, 2).map(item => [item.id, item.rewards]), [
    ['limit-breaker-1', { GC: 2500, SC: 25 }], ['limit-breaker-2', { GC: 7500, SC: 75 }],
  ]);
  assert.ok(Object.isFrozen(DEMO_TASKS) && DEMO_TASKS.every(Object.isFrozen));
});
