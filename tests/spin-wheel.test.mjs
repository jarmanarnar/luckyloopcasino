import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';
import { openAccountStore } from '../public/demo-account-store.js';
import { SPIN_PRIZES, SPIN_COOLDOWN, SPIN_DURATION, spinStatus, spinCountdown, spinClockParts, spinLanding, spinProgress } from '../public/spin-wheel-state.js';

const now = new Date('2026-11-15T12:00:00Z');
function create() {
  const account = createDemoAccount({}, { now, playerId: 'wheel-test' });
  account.auth = { signedIn: true };
  return account;
}

test('every wheel prize credits the correct currency in integer wallet units and records activity', () => {
  for (const [index, prize] of SPIN_PRIZES.entries()) {
    const original = create();
    const { account, result } = applyAccountCommand(original, { type: 'spin-wheel', index }, now);
    assert.equal(result.ok, true);
    assert.equal(result.prizeId, prize.id);
    assert.equal(account.wallet.balances[prize.currency], original.wallet.balances[prize.currency] + prize.amount);
    const other = prize.currency === 'GC' ? 'SC' : 'GC';
    assert.equal(account.wallet.balances[other], original.wallet.balances[other]);
    assert.equal(account.ledger.at(-1).amountUnits, prize.amount);
    assert.equal(account.ledger.at(-1).id, result.transactionId);
    assert.equal(accountMemberState(account).history.at(-1).type, 'reward');
    assert.equal(original.ledger.length, 2);
  }
});

test('wheel rejects guests, invalid prizes and overflowing balances without consuming a spin', () => {
  const guest = create(); guest.auth = null;
  assert.equal(applyAccountCommand(guest, { type: 'spin-wheel', index: 0 }, now).result.ok, false);
  for (const index of [-1, 8, .5, '0', undefined]) {
    const original = create();
    assert.equal(applyAccountCommand(original, { type: 'spin-wheel', index }, now).account, original);
  }
  const full = create(); full.wallet.balances.GC = 999999999;
  assert.equal(applyAccountCommand(full, { type: 'spin-wheel', index: 0 }, now).account, full);
  assert.equal(spinStatus(full, now).available, true);
});

test('cooldown survives reload, blocks clock rollback and expires at exactly 24 hours', () => {
  const { account } = applyAccountCommand(create(), { type: 'spin-wheel', index: 1 }, now);
  const reloaded = structuredClone(account);
  for (const delta of [-3600000, 0, SPIN_COOLDOWN - 1]) {
    const date = new Date(+now + delta);
    assert.equal(spinStatus(reloaded, date).available, false);
    assert.equal(applyAccountCommand(reloaded, { type: 'spin-wheel', index: 2 }, date).account, reloaded);
  }
  const later = new Date(+now + SPIN_COOLDOWN);
  assert.equal(spinStatus(reloaded, later).available, true);
  assert.equal(applyAccountCommand(reloaded, { type: 'spin-wheel', index: 2 }, later).account.ledger.length, 4);
  assert.equal(spinCountdown(SPIN_COOLDOWN), '24:00:00');
  assert.equal(spinCountdown(1), '00:00:01');
  assert.equal(spinCountdown(0), '00:00:00');
});

test('every animated landing puts its awarded segment under the fixed pointer', () => {
  for (const initial of [0, 45, 270, 1890]) {
    for (let index = 0; index < SPIN_PRIZES.length; index++) {
      const angle = spinLanding(index, initial);
      assert.ok(angle - initial >= 1080 && angle - initial < 1440);
      assert.equal((angle + index * 45) % 360, 0);
    }
  }
});

test('display clock splits days and handles countdown boundaries without negative values', () => {
  assert.deepEqual(spinClockParts(86400000), ['01', '00', '00', '00']);
  assert.deepEqual(spinClockParts(86399000), ['00', '23', '59', '59']);
  assert.deepEqual(spinClockParts(3600001), ['00', '01', '00', '01']);
  assert.deepEqual(spinClockParts(-1), ['00', '00', '00', '00']);
});

test('spin stays below two turns per second and coasts to its target without reversal or overshoot', () => {
  assert.equal(spinProgress(0), 0);
  assert.ok(Math.abs(spinProgress(1) - 1) < 1e-12);
  let previous = 0;
  let previousSpeed = Infinity;
  for (let frame = 1; frame <= 1000; frame++) {
    const progress = spinProgress(frame / 1000);
    assert.ok(progress >= previous && progress <= 1 + 1e-12);
    const speed = (progress - previous) * 1440 / (SPIN_DURATION / 1000 / 1000);
    assert.ok(speed < 720);
    if (frame > 250) assert.ok(speed <= previousSpeed + 1e-7);
    previousSpeed = speed;
    previous = progress;
  }
  const startSpeed = spinProgress(.01);
  const cruiseSpeed = spinProgress(.21) - spinProgress(.2);
  const endSpeed = spinProgress(1) - spinProgress(.99);
  assert.ok(startSpeed < cruiseSpeed / 10);
  assert.ok(endSpeed < cruiseSpeed / 10);
});

test('simultaneous spins across independent tabs commit only one reward', async () => {
  const indexedDB = new IDBFactory();
  const a = await openAccountStore({ indexedDB, create });
  const b = await openAccountStore({ indexedDB, create });
  try {
    const outcomes = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? a : b).transact(account => applyAccountCommand(account, { type: 'spin-wheel', index: index % 8 }, now))));
    assert.equal(outcomes.filter(outcome => outcome.result.ok).length, 1);
    const saved = await a.read();
    assert.equal(saved.ledger.filter(entry => entry.source === 'spin-wheel').length, 1);
    for (const currency of ['GC', 'SC']) {
      assert.equal(saved.wallet.balances[currency], saved.ledger.filter(entry => entry.currency === currency).reduce((sum, entry) => sum + entry.amountUnits, 0));
    }
  } finally { a.close(); b.close(); }
});

test('failed persistence rolls back the wheel award and its cooldown together', async () => {
  const store = await openAccountStore({ indexedDB: new IDBFactory(), create });
  try {
    await assert.rejects(store.transact(account => {
      const outcome = applyAccountCommand(account, { type: 'spin-wheel', index: 2 }, now);
      outcome.account.invalid = () => {};
      return outcome;
    }));
    const saved = await store.read();
    assert.equal(saved.wallet.balances.GC, 125000);
    assert.equal(saved.ledger.length, 2);
    assert.equal(spinStatus(saved, now).available, true);
  } finally { store.close(); }
});
