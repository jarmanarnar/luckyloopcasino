import assert from 'node:assert/strict';
import test from 'node:test';
import { GAMES } from '../public/catalog.js';
import { createMemberState, dailyStatus, claimDailyReward, claimTaskReward, recordGameVisit, taskEligible, MEMBER_STORAGE_KEY } from '../public/member-state.js';
import { getDemoRank } from '../public/rewards-pages.js';
import { initFeatureView } from '../public/feature-view.js';

const localDay = (day, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute);

test('Daily Bonus can be claimed once per local calendar day and records exactly one reward', () => {
  const start = createMemberState();
  const first = claimDailyReward(start, localDay(20, 23, 59));
  assert.deepEqual(first.result, { ok: true, amount: 1000 });
  assert.equal(start.daily.totalClaims, 0, 'claim calculations do not mutate the input state');
  assert.equal(first.state.history.length, 1);
  assert.equal(first.state.history[0].type, 'reward');
  assert.equal(first.state.daily.streak, 1);
  assert.equal(first.state.daily.totalClaims, 1);
  const duplicate = claimDailyReward(first.state, localDay(20, 23, 59));
  assert.equal(duplicate.result.ok, false);
  assert.equal(duplicate.result.amount, 0);
  assert.equal(duplicate.state, first.state);
  assert.equal(duplicate.state.history.length, 1);
  const next = claimDailyReward(first.state, localDay(21, 0, 1));
  assert.deepEqual(next.result, { ok: true, amount: 2000 }, 'local midnight unlocks the next day without waiting 24 hours');
  assert.equal(next.state.daily.streak, 2);
  assert.equal(next.state.daily.totalClaims, 2);
});

test('missing a calendar day restarts the daily cycle; completing day seven starts a fresh cycle', () => {
  let state = createMemberState();
  for (let day = 1; day <= 7; day++) {
    const outcome = claimDailyReward(state, localDay(day));
    assert.equal(outcome.result.amount, day * 1000);
    assert.equal(outcome.state.daily.streak, day);
    state = outcome.state;
  }
  assert.equal(dailyStatus(state, localDay(7, 20)).available, false);
  const reset = claimDailyReward(state, localDay(8));
  assert.equal(reset.result.amount, 1000);
  assert.equal(reset.state.daily.streak, 1);
  assert.equal(reset.state.daily.totalClaims, 8);
  const missed = claimDailyReward(reset.state, localDay(10));
  assert.equal(missed.result.amount, 1000);
  assert.equal(missed.state.daily.streak, 1);
  assert.equal(dailyStatus(reset.state, localDay(10)).streak, 0);
  const status = dailyStatus(missed.state, localDay(10));
  const midnight = new Date(status.nextAt);
  assert.equal(midnight.getDate(), 11);
  assert.equal(midnight.getHours(), 0);
  assert.equal(midnight.getMinutes(), 0);
});

test('mission rewards require actual local eligibility and each mission settles once', () => {
  const empty = createMemberState();
  for (const id of ['complete-profile', 'first-game', 'daily-check-in', 'unknown', '__proto__']) {
    const outcome = claimTaskReward(empty, id, localDay(20));
    assert.equal(outcome.result.ok, false);
    assert.equal(outcome.state, empty);
  }
  let state = createMemberState({ profile: { displayName: 'Ari', avatar: '∞' } });
  state = recordGameVisit(state, GAMES[0], localDay(20));
  state = claimDailyReward(state, localDay(20)).state;
  const expected = { 'complete-profile': 500, 'first-game': 500, 'daily-check-in': 250 };
  for (const [id, amount] of Object.entries(expected)) {
    assert.equal(taskEligible(id, state), true);
    const result = claimTaskReward(state, id, localDay(20));
    assert.deepEqual(result.result, { ok: true, amount });
    state = result.state;
    const afterRefresh = createMemberState(JSON.parse(JSON.stringify(state)));
    const duplicate = claimTaskReward(afterRefresh, id, localDay(21));
    assert.equal(duplicate.result.ok, false, `${id} stays collected after reload and on another day`);
    assert.equal(duplicate.state.history.length, state.history.length);
  }
  assert.equal(state.taskClaims.length, 3);
  assert.equal(state.history.filter(entry => entry.type === 'reward').length, 4);
});

test('corrupt storage falls back safely and cannot invent transactions or unrestricted reward claims', () => {
  assert.deepEqual(createMemberState(null), createMemberState());
  for (const history of ['corrupt', {}, 3, false]) {
    const parsed = createMemberState({ history, favorites: {}, discoveredGameIds: null });
    assert.deepEqual(parsed.history, []);
    assert.deepEqual(parsed.favorites, []);
    assert.deepEqual(parsed.discoveredGameIds, []);
  }
  const state = createMemberState({
    profile: { displayName: ' x ', avatar: 'not-an-avatar' },
    settings: { hideBalance: 'true', reducedMotion: 1 },
    daily: { lastClaim: 'not-a-date', streak: 500, totalClaims: -1 },
    taskClaims: ['unknown', 'first-game', 'first-game', 9],
    favorites: ['one', 'one', null, 'x'.repeat(101)],
    history: [null, { type: 'transaction', title: 'Fake purchase', at: localDay(20).toISOString() },
      { type: 'game', title: 'Bad timestamp', at: 'bad' },
      { type: 'reward', title: 'Accepted local record', detail: 'x'.repeat(500), at: localDay(20).toISOString() }],
  });
  assert.equal(state.profile.displayName, 'Loop Player');
  assert.equal(state.profile.avatar, 'L');
  assert.deepEqual(state.settings, { hideBalance: false, reducedMotion: false });
  assert.deepEqual(state.daily, { lastClaim: null, streak: 0, totalClaims: 0 });
  assert.deepEqual(state.taskClaims, ['first-game']);
  assert.deepEqual(state.favorites, ['one']);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].detail.length, 300);
});

test('game history reflects actual opens and demo ranks count distinct games, excluding reward events', () => {
  let state = createMemberState();
  assert.equal(getDemoRank(state).current.name, 'Starter');
  state = recordGameVisit(state, GAMES[0], localDay(20));
  state = recordGameVisit(state, GAMES[0], localDay(20, 13));
  state = claimDailyReward(state, localDay(20)).state;
  assert.equal(state.history.length, 3);
  assert.equal(state.history[0].title, GAMES[0].title);
  assert.equal(state.history[0].gameId, GAMES[0].id);
  assert.equal(getDemoRank(state).games, 1);
  for (const game of GAMES.slice(1, 3)) state = recordGameVisit(state, game, localDay(20, 14));
  const rank = getDemoRank(state);
  assert.equal(rank.games, 3);
  assert.equal(rank.current.name, 'Explorer');
  assert.equal(rank.next.name, 'Regular');
  assert.equal(rank.progress, 0);
  assert.equal(recordGameVisit(state, null), state);
});

test('achieved discovery rank survives the activity history retention limit and reload', () => {
  let state = createMemberState();
  for (const game of GAMES.slice(0, 10)) state = recordGameVisit(state, game, localDay(20));
  assert.equal(getDemoRank(state).current.name, 'Regular');
  for (let index = 0; index < 205; index++) state = recordGameVisit(state, GAMES[0], localDay(21));
  assert.equal(state.history.length, 200);
  assert.equal(new Set(state.history.map(entry => entry.gameId)).size, 1);
  state = createMemberState(JSON.parse(JSON.stringify(state)));
  assert.equal(getDemoRank(state).games, 10);
  assert.equal(getDemoRank(state).current.name, 'Regular');
  assert.equal(taskEligible('first-game', { ...state, history: [] }), true, 'discovery survives a truncated activity log');
});

test('member view removes retired games from persisted history and favorites before recording a new visit', () => {
  const oldDocument = globalThis.document;
  const oldStorage = globalThis.localStorage;
  const nodes = new Map();
  const getNode = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: false, dataset: {}, addEventListener() {} });
    return nodes.get(selector);
  };
  let stored = JSON.stringify(createMemberState({
    favorites: ['gonzo', GAMES[0].id, 'not-in-catalog'],
    discoveredGameIds: ['gonzo', GAMES[0].id, 'not-in-catalog'],
    history: [
      { id: 'retired', type: 'game', gameId: 'gonzo', title: 'Retired game', at: localDay(20).toISOString() },
      { id: 'allowed', type: 'game', gameId: GAMES[0].id, title: GAMES[0].title, at: localDay(20).toISOString() },
      { id: 'reward', type: 'reward', title: 'Daily bonus', at: localDay(20).toISOString() },
    ],
  }));
  globalThis.document = { querySelector: getNode, body: { dataset: {} }, dispatchEvent() {}, addEventListener() {} };
  globalThis.localStorage = {
    getItem: key => key === MEMBER_STORAGE_KEY ? stored : null,
    setItem(key, value) { if (key === MEMBER_STORAGE_KEY) stored = value; },
  };
  try {
    initFeatureView({ router: { getRoute: () => ({ type: 'game', gameId: GAMES[1].id }), subscribe() {} },
      wallet: { setPreferences() {} } });
    const saved = JSON.parse(stored);
    assert.deepEqual(saved.favorites, [GAMES[0].id]);
    assert.deepEqual(saved.discoveredGameIds, [GAMES[0].id, GAMES[1].id]);
    assert.equal(saved.history.some(entry => entry.gameId === 'gonzo'), false);
    assert.equal(saved.history.some(entry => entry.type === 'reward'), true);
    assert.equal(saved.history.at(-1).gameId, GAMES[1].id);
    assert.equal(getDemoRank(saved).games, 2);
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
  }
});
