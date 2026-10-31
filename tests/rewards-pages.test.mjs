import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TASKS, DEMO_RANKS, getDemoRank, taskComplete } from '../public/rewards-pages.js';

test('demo ranks count distinct game launches rather than wagers or repeat opens', () => {
  const state = { history: [{ type: 'game', gameId: 'a' }, { type: 'game', gameId: 'a' },
    { type: 'reward', gameId: 'b' }, { type: 'game', gameId: 'b' }, { type: 'game', gameId: 'c' }] };
  assert.equal(getDemoRank(state).games, 3);
  assert.equal(getDemoRank(state).current.name, 'Explorer');
  assert.equal(getDemoRank(state).next.name, 'Regular');
  assert.equal(getDemoRank(state).progress, 0);
  assert.equal(getDemoRank({}).current.name, 'Starter');
  assert.equal(getDemoRank({ history: Array.from({ length: 100 }, (_, i) => ({ type: 'game', gameId: String(i) })) }).next, null);
  const discoveredGameIds = Array.from({ length: 25 }, (_, i) => String(i));
  assert.equal(getDemoRank({ discoveredGameIds, history: [] }).current.name, 'Insider');
  assert.equal(getDemoRank({ discoveredGameIds: ['a', 'a'], history: [] }).games, 1);
});

test('mission eligibility comes from local profile, game and daily activity', () => {
  const state = { profile: { displayName: 'Loop Player' }, daily: { totalClaims: 0 }, history: [] };
  assert.equal(taskComplete('complete-profile', state), false);
  assert.equal(taskComplete('first-game', state), false);
  assert.equal(taskComplete('daily-check-in', state), false);
  assert.equal(taskComplete('unknown', state), false);
  assert.equal(taskComplete('complete-profile', { profile: { displayName: 'Alex' } }), true);
  assert.equal(taskComplete('first-game', { history: [{ type: 'game' }] }), true);
  assert.equal(taskComplete('first-game', { discoveredGameIds: ['a'], history: [] }), true);
  assert.equal(taskComplete('daily-check-in', { daily: { totalClaims: 1 } }), true);
  assert.deepEqual(DEMO_TASKS.map(item => [item.id, item.amount]), [
    ['complete-profile', 500], ['first-game', 500], ['daily-check-in', 250],
  ]);
  assert.ok(Object.isFrozen(DEMO_TASKS) && DEMO_TASKS.every(Object.isFrozen));
  assert.ok(Object.isFrozen(DEMO_RANKS) && DEMO_RANKS.every(Object.isFrozen));
});
