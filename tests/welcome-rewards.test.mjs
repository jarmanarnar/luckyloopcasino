import assert from 'node:assert/strict';
import test from 'node:test';
import { ACHIEVEMENTS } from '../public/achievement-catalog.js';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';
import { getAchievements } from '../public/rewards-pages.js';

const earnedWelcome = {
  attendance: { streak: 7, bestStreak: 7 },
  achievementStats: { emailVerified: true, phoneVerified: true },
};
const welcomeIds = ['welcome-member', 'verify-email', 'verify-phone', 'welcome-streak-3', 'welcome-streak-7'];

test('claiming all five welcome rewards grants exactly 500,000 GC and 5 SC once', () => {
  let account = createDemoAccount({ member: earnedWelcome });
  const welcome = ACHIEVEMENTS.filter(entry => entry.group === 'welcome');
  assert.deepEqual(welcome.map(entry => entry.id), welcomeIds);
  for (const id of welcomeIds) {
    const outcome = applyAccountCommand(account, { type: 'claim-task', taskId: id });
    assert.equal(outcome.result.ok, true, id);
    account = outcome.account;
  }
  assert.deepEqual(account.wallet.balances, { GC: 500000, SC: 500 });
  assert.deepEqual(account.member.taskClaims, welcomeIds);
  const credits = account.ledger.filter(entry => entry.source === 'task');
  assert.equal(credits.length, 9, 'one GC-only welcome claim and four dual-currency claims');
  assert.equal(credits.filter(entry => entry.currency === 'GC').reduce((sum, entry) => sum + entry.amountUnits, 0), 500000);
  assert.equal(credits.filter(entry => entry.currency === 'SC').reduce((sum, entry) => sum + entry.amountUnits, 0), 500);
  const before = structuredClone(account);
  for (const id of welcomeIds) {
    const duplicate = applyAccountCommand(account, { type: 'claim-task', taskId: id });
    assert.equal(duplicate.result.ok, false, id);
    assert.strictEqual(duplicate.account, account);
  }
  assert.deepEqual(account, before, 'repeat claims cannot change the wallet, ledger, or claim flags');
});

test('regular day-three and day-seven streak rewards stay separate at 1,500 GC plus 0.15 SC', () => {
  let account = createDemoAccount({ member: earnedWelcome });
  for (const goal of [3, 7]) {
    const id = `login-streak-${goal}`;
    assert.deepEqual(ACHIEVEMENTS.find(entry => entry.id === id).rewards, { GC: 1500, SC: 15 });
    const outcome = applyAccountCommand(account, { type: 'claim-task', taskId: id });
    assert.equal(outcome.result.ok, true, id);
    assert.deepEqual(outcome.result.rewards, { GC: 1500, SC: 15 });
    account = outcome.account;
  }
  assert.deepEqual(account.wallet.balances, { GC: 3000, SC: 30 });
  assert.deepEqual(account.member.taskClaims, ['login-streak-3', 'login-streak-7']);
  assert.ok(getAchievements(accountMemberState(account))
    .filter(entry => ['welcome-streak-3', 'welcome-streak-7'].includes(entry.id))
    .every(entry => entry.ready && !entry.claimed), 'regular claims do not consume the separate welcome milestones');
});

test('unclaimed welcome streaks show and pay the new 100,000 GC plus 1.5 SC amount', () => {
  const account = createDemoAccount({ member: earnedWelcome });
  const entries = getAchievements(accountMemberState(account));
  for (const goal of [3, 7]) {
    const id = `welcome-streak-${goal}`;
    const entry = entries.find(task => task.id === id);
    assert.deepEqual(entry.rewards, { GC: 100000, SC: 150 });
    assert.equal(entry.ready, true);
    assert.equal(entry.claimed, false);
    for (const description of [entry.description, ACHIEVEMENTS.find(task => task.id === id).description]) {
      assert.match(description, /100,000\s+GC/);
      assert.match(description, /1\.5\s+SC/);
      assert.doesNotMatch(description, /150,000/);
    }
    const outcome = applyAccountCommand(account, { type: 'claim-task', taskId: id });
    assert.equal(outcome.result.ok, true);
    assert.deepEqual(outcome.result.rewards, { GC: 100000, SC: 150 });
  }
});

test('recorded 150,000 GC welcome streak claims retain historical rewards and descriptions without changing balances', () => {
  const claimedIds = ['welcome-streak-3', 'welcome-streak-7'];
  const account = createDemoAccount({
    wallet: { balances: { GC: 300000, SC: 300 } },
    member: { ...earnedWelcome, taskClaims: claimedIds },
  });
  const at = new Date(2026, 10, 18, 12).toISOString();
  for (const id of claimedIds) {
    for (const [currency, amountUnits] of Object.entries({ GC: 150000, SC: 150 })) {
      account.ledger.push({
        id: `historical:${id}:${currency}`, operationKey: `task:${id}`,
        source: 'task', sourceId: id, type: 'bonus', currency, amountUnits,
        title: ACHIEVEMENTS.find(entry => entry.id === id).title, at,
      });
    }
  }
  const before = structuredClone(account);
  const entries = getAchievements(accountMemberState(account));
  for (const id of claimedIds) {
    const entry = entries.find(task => task.id === id);
    assert.deepEqual(entry.rewards, { GC: 150000, SC: 150 });
    assert.equal(entry.amount, 150000);
    assert.equal(entry.claimed, true);
    assert.equal(entry.complete, true);
    assert.equal(entry.ready, false);
    assert.match(entry.description, /150,000\s+GC/);
    assert.match(entry.description, /1\.5\s+SC/);
    assert.doesNotMatch(entry.description, /100,000/);
    const duplicate = applyAccountCommand(account, { type: 'claim-task', taskId: id });
    assert.equal(duplicate.result.ok, false);
    assert.strictEqual(duplicate.account, account);
  }
  assert.deepEqual(account.wallet.balances, { GC: 300000, SC: 300 });
  assert.deepEqual(account.member.taskClaims, claimedIds);
  assert.deepEqual(account, before, 'displaying or retrying old claims must not migrate balances or rewrite history');
});
