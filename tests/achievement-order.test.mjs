import assert from 'node:assert/strict';
import test from 'node:test';
import { isAchievementInProgress, sortAchievements } from '../public/achievement-order.js';
import { getAchievements } from '../public/rewards-pages.js';
import { createMemberState } from '../public/member-state.js';

const task = (id, values = {}) => ({
  id, metric: 'streak', goal: 7, progress: 0,
  complete: false, claimed: false, ready: false, ...values,
});
const ids = entries => entries.map(entry => entry.id);

test('In progress requires finite positive partial progress and excludes every completed state', () => {
  assert.equal(isAchievementInProgress(task('started', { progress: 2 })), true);
  for (const values of [
    { progress: 0 }, { progress: -1 }, { progress: 7 }, { progress: 8 },
    { progress: NaN }, { progress: Infinity }, { progress: '2' },
    { progress: 2, goal: Infinity }, { progress: 2, goal: NaN },
    { progress: 2, goal: '7' }, { progress: 2, goal: 0 },
    { progress: 2, complete: true }, { progress: 2, claimed: true },
    { progress: 2, ready: true },
  ]) assert.equal(isAchievementInProgress(task('excluded', values)), false, JSON.stringify(values));
});

test('zero-progress guests discover easy actions mixed with short streaks, play and loyalty milestones', () => {
  const sorted = sortAchievements(getAchievements(createMemberState()));
  assert.deepEqual(ids(sorted.slice(0, 12)), [
    'welcome-member', 'verify-email', 'verify-phone', 'login-streak-2',
    'limit-breaker-1', 'welcome-streak-3', 'login-streak-3', 'loyalty-tier-1',
    'login-streak-4', 'limit-breaker-2', 'login-streak-5', 'loyalty-tier-2',
  ]);
  assert.equal(sorted.some(isAchievementInProgress), false);
});

test('both guests and first-day members retain varied discovery pages instead of a block of future streaks', () => {
  for (const day of [0, 1]) {
    const sorted = sortAchievements(getAchievements(createMemberState({ attendance: { streak: day, bestStreak: day } })));
    const firstPage = sorted.slice(0, 12);
    assert.deepEqual(ids(firstPage.slice(0, 3)), ['welcome-member', 'verify-email', 'verify-phone'],
      `the three welcome rewards stay consecutive after ${day} day(s)`);
    for (const id of ['verify-email', 'verify-phone', 'login-streak-2', 'limit-breaker-1', 'loyalty-tier-1']) {
      assert.ok(firstPage.some(entry => entry.id === id), `${id} remains discoverable after ${day} day(s)`);
    }
    for (let start = 12; start < 48; start += 12) {
      const page = sorted.slice(start, start + 12);
      assert.ok(page.some(entry => entry.metric === 'streak'), `later page ${start / 12 + 1} includes streaks`);
      assert.ok(page.some(entry => ['playSC', 'loyaltySC'].includes(entry.metric)), `later page ${start / 12 + 1} mixes in another goal type`);
    }
  }
});

test('ready rewards lead and collected rewards trail a mixed started and unstarted discovery pool', () => {
  const entries = getAchievements(createMemberState({
    attendance: { streak: 1, bestStreak: 1 }, taskClaims: ['verify-email'],
    achievementStats: { playSCUnits: 7000 },
  }));
  const sorted = sortAchievements(entries);
  const readyCount = entries.filter(entry => entry.ready).length;
  const collectedCount = entries.filter(entry => entry.claimed).length;
  assert.ok(readyCount > 0 && collectedCount > 0);
  assert.ok(sorted.slice(0, readyCount).every(entry => entry.ready));
  assert.ok(sorted.slice(-collectedCount).every(entry => entry.claimed));
  const unfinished = sorted.slice(readyCount, -collectedCount);
  assert.ok(unfinished.every(entry => !entry.ready && !entry.claimed));
  assert.ok(unfinished.some(isAchievementInProgress));
  assert.ok(unfinished.some(entry => entry.progress === 0));
  assert.ok(unfinished.findIndex(entry => entry.id === 'verify-phone')
    < unfinished.findIndex(entry => entry.id === 'login-streak-14'), 'an unstarted easy action must not trail every started streak');
});

test('a nearly completed advanced play target moves forward by at most six discovery positions', () => {
  const entries = getAchievements(createMemberState({ achievementStats: { playSCUnits: 550000 } }));
  const target = entries.find(entry => entry.id === 'limit-breaker-7');
  assert.equal(target.ready, false);
  assert.ok(target.progress / target.goal > .9);
  const base = sortAchievements(entries.map(entry => !entry.ready && !entry.claimed ? { ...entry, progress: 0 } : entry));
  const personalized = sortAchievements(entries);
  const movement = base.findIndex(entry => entry.id === target.id) - personalized.findIndex(entry => entry.id === target.id);
  assert.ok(movement > 0, 'near completion should improve the target position');
  assert.ok(movement <= 6, 'personal progress must not erase the discovery sequence');
  assert.ok(personalized.findIndex(entry => entry.id === 'verify-email') < personalized.findIndex(entry => entry.id === target.id));
});

test('partial streak, play and tier progress never separates unfinished onboarding rewards', () => {
  for (const [day, playSCUnits, loyaltySCUnits, taskClaims] of [
    [1, 6000, 9000, []],
    [4, 13000, 99000, []],
    [4, 13000, 99000, ['verify-email', 'login-streak-2']],
  ]) {
    const entries = getAchievements(createMemberState({
      attendance: { streak: day, bestStreak: day },
      achievementStats: { playSCUnits, loyaltySCUnits }, taskClaims,
    }));
    const sorted = sortAchievements(entries);
    const ready = entries.filter(entry => entry.ready);
    const collected = entries.filter(entry => entry.claimed);
    const unfinished = sorted.filter(entry => !entry.ready && !entry.claimed);
    assert.ok(sorted.slice(0, ready.length).every(entry => entry.ready), 'ready rewards retain first priority');
    if (collected.length) assert.ok(sorted.slice(-collected.length).every(entry => entry.claimed), 'collected rewards remain last');
    const expectedOnboarding = taskClaims.includes('verify-email') ? ['verify-phone'] : ['verify-email', 'verify-phone'];
    assert.deepEqual(ids(unfinished.slice(0, expectedOnboarding.length)), expectedOnboarding);
    for (const metric of ['streak', 'playSC', 'loyaltySC']) {
      assert.ok(unfinished.some(entry => entry.metric === metric && isAchievementInProgress(entry)),
        `${metric} has real progress to exercise the bounded boost`);
    }
    assert.equal(sorted.length, 55);
    assert.equal(new Set(ids(sorted)).size, 55);
  }
});

test('unfinished goals stay ascending within each natural series across guest and progressed accounts', () => {
  for (const [streak, playSCUnits, loyaltySCUnits] of [[0, 0, 0], [1, 0, 0], [7, 550000, 99000], [20, 1600000, 2100000]]) {
    const sorted = sortAchievements(getAchievements(createMemberState({
      attendance: { streak, bestStreak: streak }, achievementStats: { playSCUnits, loyaltySCUnits },
    }))).filter(entry => !entry.ready && !entry.claimed);
    for (const metric of ['streak', 'playSC', 'loyaltySC']) {
      const goals = sorted.filter(entry => entry.metric === metric).map(entry => entry.goal);
      assert.deepEqual(goals, [...goals].sort((a, b) => a - b), `${metric} remains in progression order at streak ${streak}`);
    }
  }
});

test('same-day welcome and standard streak rewards retain their input order within a status', () => {
  for (const progress of [0, 1]) {
    const standard = task('standard-streak', { goal: 3, progress, group: 'streak' });
    const welcome = task('welcome-streak', { goal: 3, progress, group: 'welcome' });
    assert.deepEqual(ids(sortAchievements([standard, welcome])), ['standard-streak', 'welcome-streak']);
    assert.deepEqual(ids(sortAchievements([welcome, standard])), ['welcome-streak', 'standard-streak']);
  }
});

test('reset streaks use current computed progress while earned and claimed milestones stay completed', () => {
  const entries = getAchievements(createMemberState({
    attendance: { streak: 0, bestStreak: 3 }, taskClaims: ['login-streak-2'],
  }));
  const claimed = entries.find(entry => entry.id === 'login-streak-2');
  const earned = entries.find(entry => entry.id === 'login-streak-3');
  const future = entries.find(entry => entry.id === 'login-streak-7');
  assert.equal(claimed.claimed, true);
  assert.equal(earned.ready, true);
  assert.equal(future.progress, 0);
  assert.ok([claimed, earned, future].every(entry => !isAchievementInProgress(entry)));
  assert.deepEqual(ids(sortAchievements([claimed, future, earned])), ['login-streak-3', 'login-streak-7', 'login-streak-2']);
  const restarted = getAchievements(createMemberState({ attendance: { streak: 1, bestStreak: 3 } }))
    .find(entry => entry.id === 'login-streak-7');
  assert.equal(restarted.progress, 1);
  assert.equal(isAchievementInProgress(restarted), true);
});

test('all 55 catalog entries, identities, progress and rewards survive deterministic non-mutating sorting', () => {
  const entries = Object.freeze(getAchievements(createMemberState({
    attendance: { streak: 1, bestStreak: 1 }, taskClaims: ['verify-email'],
    achievementStats: { playSCUnits: 550000 },
  })).map(entry => Object.freeze({ ...entry, rewards: Object.freeze({ ...entry.rewards }) })));
  const before = structuredClone(entries);
  const sorted = sortAchievements(entries);
  assert.notEqual(sorted, entries);
  assert.equal(sorted.length, 55);
  assert.equal(new Set(ids(sorted)).size, 55);
  assert.deepEqual([...ids(sorted)].sort(), [...ids(entries)].sort());
  assert.ok(sorted.every(entry => entries.includes(entry)), 'sorting retains the original entry objects');
  assert.deepEqual(entries, before);
  assert.deepEqual(sortAchievements(entries), sorted);
});

test('unknown tied entries retain their input order without mutation', () => {
  const entries = Object.freeze([
    Object.freeze(task('second', { goal: 3, rewards: Object.freeze({ GC: 1500, SC: 15 }) })),
    Object.freeze(task('first', { goal: 3, rewards: Object.freeze({ GC: 150000, SC: 150 }) })),
  ]);
  const before = structuredClone(entries);
  const sorted = sortAchievements(entries);
  assert.notEqual(sorted, entries);
  assert.deepEqual(ids(sorted), ['second', 'first']);
  assert.equal(sorted[0], entries[0]);
  assert.equal(sorted[1], entries[1]);
  assert.deepEqual(entries, before);
  assert.deepEqual(sortAchievements(entries), sorted);
});
