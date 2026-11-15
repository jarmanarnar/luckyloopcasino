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

test('achievement completion persists after a profile change and excludes retired rewards', () => {
  const entries = getAchievements({ profile: { displayName: 'Loop Player' }, taskClaims: ['complete-profile', 'daily-check-in'] });
  assert.deepEqual(entries.map(({ id, complete, claimed, ready }) => ({ id, complete, claimed, ready })), [
    { id: 'complete-profile', complete: true, claimed: true, ready: false },
    { id: 'first-game', complete: false, claimed: false, ready: false },
  ]);
  assert.equal(getAchievements({ discoveredGameIds: ['a'] })[1].ready, true);
});

function rewardContext(state, claim) {
  const notices = [], refreshes = [];
  return { state: () => state, ui: {}, notices, refreshes,
    refresh: (...args) => { refreshes.push(args); return true; },
    notify: message => notices.push(message), claimTask: claim };
}

test('claim all serializes eligible rewards, ignores stale and duplicate IDs, and blocks duplicate clicks', async () => {
  const state = { profile: { displayName: 'Alice' }, discoveredGameIds: ['a'], taskClaims: [] };
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const ctx = rewardContext(state, async id => {
    calls.push(id);
    await gate;
    state.taskClaims.push(id);
    return { ok: true, amount: 500 };
  });
  const first = collectAchievements(ctx, ['complete-profile', 'complete-profile', 'daily-check-in', 'unknown', 'first-game']);
  assert.equal(ctx.ui.achievementsCollecting, true);
  assert.deepEqual(await collectAchievements(ctx, ['first-game']), { count: 0, amount: 0 });
  release();
  assert.deepEqual(await first, { count: 2, amount: 1000, reason: '' });
  assert.deepEqual(calls, ['complete-profile', 'first-game']);
  assert.equal(ctx.ui.achievementsCollecting, false);
  assert.match(ctx.notices[0], /1,000 GC collected/);
  await collectAchievements(ctx, ['complete-profile', 'first-game']);
  assert.equal(calls.length, 2, 'collected rewards cannot be submitted again');
});

test('claim all preserves a partial success, reports a failure, and can be retried', async () => {
  const state = { profile: { displayName: 'Alice' }, discoveredGameIds: ['a'], taskClaims: [] };
  let fail = true;
  const ctx = rewardContext(state, async id => {
    if (id === 'first-game' && fail) throw new Error('Storage unavailable');
    state.taskClaims.push(id);
    return { ok: true, amount: 500 };
  });
  const result = await collectAchievements(ctx, ['complete-profile', 'first-game']);
  assert.equal(result.amount, 500);
  assert.match(ctx.notices[0], /500 GC collected.*could not be collected/);
  assert.equal(ctx.ui.achievementsCollecting, false);
  fail = false;
  assert.equal((await collectAchievements(ctx, ['complete-profile', 'first-game'])).amount, 500);
  assert.deepEqual(state.taskClaims, ['complete-profile', 'first-game']);
});

test('mission eligibility comes from local profile and game activity', () => {
  const state = { profile: { displayName: 'Loop Player' }, daily: { totalClaims: 0 }, history: [] };
  assert.equal(taskComplete('complete-profile', state), false);
  assert.equal(taskComplete('first-game', state), false);
  assert.equal(taskComplete('daily-check-in', state), false);
  assert.equal(taskComplete('unknown', state), false);
  assert.equal(taskComplete('complete-profile', { profile: { displayName: 'Alex' } }), true);
  assert.equal(taskComplete('first-game', { history: [{ type: 'game' }] }), true);
  assert.equal(taskComplete('first-game', { discoveredGameIds: ['a'], history: [] }), true);
  assert.equal(taskComplete('daily-check-in', { daily: { totalClaims: 1 } }), false);
  assert.deepEqual(DEMO_TASKS.map(item => [item.id, item.amount]), [
    ['complete-profile', 500], ['first-game', 500],
  ]);
  assert.ok(Object.isFrozen(DEMO_TASKS) && DEMO_TASKS.every(Object.isFrozen));
});
