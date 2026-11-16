import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { ACHIEVEMENTS, achievementProgress, recordAttendance } from '../public/achievement-catalog.js';
import { createMemberState, claimTaskReward } from '../public/member-state.js';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';
import { openAccountStore } from '../public/demo-account-store.js';
import { getAchievements } from '../public/rewards-pages.js';
import { renderAchievements } from '../public/achievements-view.js';

const day = n => new Date(2026, 10, n, 12);

test('all 55 achievement targets have unique IDs and a supported one-time demo reward', () => {
  assert.equal(ACHIEVEMENTS.length, 55);
  assert.equal(new Set(ACHIEVEMENTS.map(task => task.id)).size, 55);
  assert.deepEqual(['welcome', 'play', 'tier', 'streak'].map(group => ACHIEVEMENTS.filter(task => task.group === group).length), [5, 10, 11, 29]);
  const state = createMemberState({ profile: { displayName: 'Alex', avatar: '★' },
    favorites: Array.from({ length: 75 }, (_, i) => `game-${i}`),
    discoveredGameIds: Array.from({ length: 150 }, (_, i) => `game-${i}`),
    attendance: { lastVisit: day(30).toISOString(), streak: 30, bestStreak: 30 },
    achievementStats: { playSCUnits: 3150000, loyaltySCUnits: 130000000, emailVerified: true, phoneVerified: true } });
  for (const task of ACHIEVEMENTS) {
    assert.equal(achievementProgress(task.id, state).complete, true, task.id);
    const claim = claimTaskReward(state, task.id);
    assert.equal(claim.result.amount, task.amount, task.id);
    assert.deepEqual(claim.result.rewards, task.rewards);
    assert.ok(Object.values(task.rewards).every(units => Number.isSafeInteger(units) && units > 0));
    assert.equal(claimTaskReward(claim.state, task.id).result.ok, false, task.id);
  }
});

test('daily streaks ignore repeats, survive missed days as earned milestones, and reject backwards clocks', () => {
  let state = recordAttendance(createMemberState(), day(1));
  assert.equal(state.attendance.streak, 1);
  assert.strictEqual(recordAttendance(state, new Date(2026, 10, 1, 23, 59)), state);
  for (let i = 2; i <= 7; i++) state = recordAttendance(state, day(i));
  assert.equal(state.attendance.bestStreak, 7);
  assert.equal(achievementProgress('login-streak-7', state).complete, true);
  state = recordAttendance(state, day(9));
  assert.equal(state.attendance.streak, 1);
  assert.equal(state.attendance.bestStreak, 7);
  assert.equal(achievementProgress('login-streak-7', state).complete, true);
  assert.equal(achievementProgress('login-streak-8', state).complete, false);
  assert.equal(achievementProgress('login-streak-14', state).value, 1, 'unfinished progress follows the current streak, not the best');
  assert.strictEqual(recordAttendance(state, day(8)), state);
  assert.strictEqual(recordAttendance(state, 'invalid'), state);
  const midnight = recordAttendance(recordAttendance(createMemberState(), new Date(2026, 10, 1, 23, 59)), new Date(2026, 10, 2, 0, 1));
  assert.equal(midnight.attendance.streak, 2, 'calendar days, not rolling 24-hour periods');
});

test('guest visits do not unlock welcome or streaks; older signed-in accounts start without invented history', () => {
  let account = createDemoAccount({}, { now: day(1) });
  assert.strictEqual(applyAccountCommand(account, { type: 'session-visit' }, day(4)).account, account);
  account.auth = { signedIn: true };
  delete account.member.attendance;
  account = applyAccountCommand(account, { type: 'session-visit' }, day(4)).account;
  assert.equal(account.member.attendance.streak, 1);
  assert.equal(getAchievements(account.member).find(task => task.id === 'welcome-member').ready, true);
  assert.equal(getAchievements(account.member).find(task => task.id === 'login-streak-2').ready, false);
  assert.strictEqual(applyAccountCommand(account, { type: 'session-visit' }, day(4)).account, account);
});

test('opening games or changing a profile never creates play, loyalty or verification progress', () => {
  const state = createMemberState({ profile: { displayName: 'Alex' }, favorites: ['a', 'b'], discoveredGameIds: ['a', 'b'], history: [{ type: 'game' }] });
  for (const id of ['limit-breaker-1', 'loyalty-tier-1', 'verify-email', 'verify-phone']) {
    assert.equal(achievementProgress(id, state).value, 0);
    assert.equal(claimTaskReward(state, id).result.ok, false);
  }
  const tracked = createMemberState({ achievementStats: { playSCUnits: 560, loyaltySCUnits: 7000 } });
  assert.deepEqual(achievementProgress('limit-breaker-1', tracked), { value: 5.6, goal: 70, complete: false });
  assert.deepEqual(achievementProgress('loyalty-tier-1', tracked), { value: 70, goal: 100, complete: false });
});

test('simultaneous claims across tabs commit one credit and one ledger entry for a new achievement', async () => {
  const store = await openAccountStore({ indexedDB: new IDBFactory(), create: () => {
    const account = createDemoAccount({}, { now: day(1) });
    account.member.attendance = { lastVisit: day(3).toISOString(), streak: 3, bestStreak: 3 };
    return account;
  } });
  try {
    const claims = await Promise.all(Array.from({ length: 4 }, () => store.transact(account => applyAccountCommand(account, { type: 'claim-task', taskId: 'login-streak-3' }, day(3)))));
    assert.equal(claims.filter(result => result.result.ok).length, 1);
    const saved = await store.read();
    assert.equal(saved.wallet.balances.GC, 1500);
    assert.equal(saved.wallet.balances.SC, 15);
    assert.equal(saved.ledger.filter(item => item.sourceId === 'login-streak-3').length, 2);
    assert.equal(saved.ledger.filter(item => item.operationKey === 'task:login-streak-3').length, 1);
    assert.equal(saved.member.taskClaims.filter(id => id === 'login-streak-3').length, 1);
  } finally { store.close(); }
});

class Element {
  constructor(tag, className = '', text = '') { this.tag = tag; this.className = className; this.text = text; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this.events[event] = callback; }
}
const descendants = node => [node, ...node.children.flatMap(descendants)];

test('status filters, card and medal details, pagination and claim-all use the same achievement state', () => {
  const entries = getAchievements(createMemberState({ discoveredGameIds: ['a', 'b'], attendance: { bestStreak: 4, streak: 4, lastVisit: day(4).toISOString() } }));
  let root, claimed, opened;
  const ctx = { ui: {}, node: (tag, css, text) => new Element(tag, css, text), icon: () => new Element('svg'),
    openAchievement: id => { opened = id; }, refresh: () => render() };
  const render = () => { root = renderAchievements(ctx, entries, ids => { claimed = ids; }); };
  const find = id => descendants(root).find(node => node.id === id);
  const cards = () => descendants(root).filter(node => node.className.split(' ').includes('achievement-card'));
  render();
  assert.equal(cards().length, 12);
  descendants(root).find(node => node.text === 'Show more').events.click();
  assert.equal(cards().length, 24);
  assert.equal(descendants(root).some(node => node.className === 'achievement-groups'), false);
  find('achievement-limit-breaker-1').events.click(); assert.equal(opened, 'limit-breaker-1');
  const medal = descendants(root).find(node => node.className === 'achievement-award');
  medal.events.click(); assert.equal(opened, medal.dataset.achievementId);
  find('achievement-filter-completed').events.click();
  assert.equal(cards().length, 5);
  find('achievement-claim-all').events.click();
  assert.deepEqual(claimed, entries.filter(entry => entry.ready).map(entry => entry.id));
  find('achievement-filter-in-progress').events.click();
  assert.ok(cards().every(node => !['achievement-login-streak-2', 'achievement-login-streak-3', 'achievement-login-streak-4'].includes(node.id)));
});

test('both currencies roll back together when either balance cannot accept the reward', () => {
  const account = createDemoAccount({ wallet: { balances: { GC: 20, SC: 999999990 } }, member: { attendance: { streak: 4, bestStreak: 4 } } });
  const result = applyAccountCommand(account, { type: 'claim-task', taskId: 'login-streak-4' });
  assert.equal(result.result.ok, false); assert.strictEqual(result.account, account);
  assert.equal(account.wallet.balances.GC, 20); assert.equal(account.member.taskClaims.length, 0);
});

test('collected rewards keep their actual historical amounts and do not unlock a second credit after catalog changes', () => {
  const account = createDemoAccount({ member: { taskClaims: ['welcome-member'], attendance: { bestStreak: 1, streak: 1 } } });
  account.ledger.push({ source: 'task', sourceId: 'welcome-member', currency: 'GC', amountUnits: 1000, at: day(1).toISOString() });
  const welcome = getAchievements(accountMemberState(account)).find(item => item.id === 'welcome-member');
  assert.deepEqual(welcome.rewards, { GC: 1000 }); assert.equal(welcome.complete, true); assert.equal(welcome.ready, false);
  assert.equal(applyAccountCommand(account, { type: 'claim-task', taskId: 'welcome-member' }).result.ok, false);
});
