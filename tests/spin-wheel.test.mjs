import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { IDBFactory } from 'fake-indexeddb';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';
import { openAccountStore } from '../public/demo-account-store.js';
import { SPIN_PRIZES, SPIN_DURATION, spinStatus, spinCountdown, spinClockParts, spinLanding, spinProgress } from '../public/spin-wheel-state.js';

const DAY_MS = 86400000;
const now = new Date(2026, 10, 15, 12);
const day = (offset, hour = 0, minute = 0) => new Date(2026, 10, 15 + offset, hour, minute);
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

test('spent spins survive reload and clock rollback, with the next grant at local midnight', () => {
  const { account } = applyAccountCommand(create(), { type: 'spin-wheel', index: 1 }, now);
  const reloaded = structuredClone(account);
  for (const date of [day(0, 11), now, new Date(+day(1) - 1)]) {
    assert.equal(spinStatus(reloaded, date).available, false);
    assert.equal(applyAccountCommand(reloaded, { type: 'spin-wheel', index: 2 }, date).account, reloaded);
  }
  const later = day(1);
  assert.equal(spinStatus(reloaded, later).available, true);
  assert.equal(applyAccountCommand(reloaded, { type: 'spin-wheel', index: 2 }, later).account.ledger.length, 4);
  assert.equal(spinCountdown(DAY_MS), '24:00:00');
  assert.equal(spinCountdown(1), '00:00:01');
  assert.equal(spinCountdown(0), '00:00:00');
});

test('the next-spin clock runs while a spin is available and spending does not restart it', () => {
  const original = create();
  const later = day(0, 18);
  const ready = spinStatus(original, later);
  assert.equal(ready.spinsAvailable, 1);
  assert.equal(ready.remaining, 6 * 3600000);
  assert.equal(ready.nextAt, +day(1));
  const { account, result } = applyAccountCommand(original, { type: 'spin-wheel', index: 0 }, later);
  assert.equal(result.ok, true);
  const spent = spinStatus(account, later);
  assert.equal(spent.spinsAvailable, 0);
  assert.equal(spent.nextAt, ready.nextAt);
  assert.equal(spent.remaining, ready.remaining);
  assert.equal(spinStatus(account, day(1)).spinsAvailable, 1);
});

test('a new player can spin before midnight and receive another spin minutes later', () => {
  const registration = day(0, 23, 50);
  const original = createDemoAccount({}, { now: registration });
  original.auth = { signedIn: true, registeredAt: registration.toISOString() };
  assert.equal(spinStatus(original, registration).remaining, 10 * 60000);
  const { account } = applyAccountCommand(original, { type: 'spin-wheel', index: 1 }, registration);
  assert.equal(spinStatus(account, new Date(+day(1) - 1)).spinsAvailable, 0);
  const atMidnight = spinStatus(account, day(1));
  assert.equal(atMidnight.spinsAvailable, 1);
  assert.equal(atMidnight.nextAt, +day(2));
  assert.equal(applyAccountCommand(account, { type: 'spin-wheel', index: 2 }, day(1)).result.ok, true);
});

test('unused daily spins accumulate across offline days and can be spent individually', () => {
  let account = create();
  const later = day(3, 13);
  assert.equal(spinStatus(account, later).spinsAvailable, 4);
  const ids = new Set();
  for (let remaining = 3; remaining >= 0; remaining--) {
    const outcome = applyAccountCommand(account, { type: 'spin-wheel', index: 1 }, later);
    assert.equal(outcome.result.ok, true);
    ids.add(outcome.result.transactionId);
    account = structuredClone(outcome.account);
    const status = spinStatus(account, later);
    assert.equal(status.spinsAvailable, remaining);
    assert.equal(status.available, remaining > 0);
    assert.equal(status.remaining, 11 * 3600000);
  }
  assert.equal(ids.size, 4, 'spins at the same timestamp have distinct ledger IDs');
  assert.equal(applyAccountCommand(account, { type: 'spin-wheel', index: 0 }, later).account, account);
  assert.equal(spinStatus(account, now).spinsAvailable, 0, 'rolling time back cannot restore spent spins');
  assert.equal(spinStatus(account, new Date(+day(4) - 1)).spinsAvailable, 0);
  const boundary = spinStatus(account, day(4));
  assert.equal(boundary.spinsAvailable, 1);
  assert.equal(boundary.remaining, +day(5) - day(4));
});

test('a daily boundary adds a spin even if a previous one is still unused', () => {
  const original = create();
  assert.equal(spinStatus(original, new Date(+day(1) - 1)).spinsAvailable, 1);
  const status = spinStatus(original, day(1));
  assert.equal(status.spinsAvailable, 2);
  assert.equal(status.remaining, +day(2) - day(1));
});

test('registration anchors the same schedule in stored accounts and public snapshots', () => {
  const original = create();
  const registration = day(5, 21);
  original.auth.registeredAt = registration.toISOString();
  const { auth, ...publicAccount } = original;
  const snapshot = { ...publicAccount, identity: { registeredAt: auth.registeredAt } };
  for (const [date, expected] of [[registration, 1], [new Date(+day(6) - 1), 1], [day(6), 2], [day(7), 3]]) {
    const stored = spinStatus(original, date);
    assert.deepEqual(spinStatus(snapshot, date), stored);
    assert.equal(stored.spinsAvailable, expected);
  }
});

test('calendar grants cross month, leap-day and year boundaries without losing unused spins', () => {
  for (const [registered, current, expected] of [
    [new Date(2026, 11, 31, 23, 59), new Date(2027, 0, 1), 2],
    [new Date(2028, 1, 28, 23, 59), new Date(2028, 1, 29), 2],
    [new Date(2028, 1, 28, 23, 59), new Date(2028, 2, 1), 3],
  ]) {
    const account = createDemoAccount({}, { now: registered });
    assert.equal(spinStatus(account, current).spinsAvailable, expected);
    const next = new Date(current); next.setDate(next.getDate() + 1);
    assert.equal(spinStatus(account, current).nextAt, +next);
  }
});

test('23-hour and 25-hour DST days grant once at midnight, including the repeated hour', () => {
  const moduleUrl = new URL('../public/spin-wheel-state.js', import.meta.url).href;
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { spinStatus } from ${JSON.stringify(moduleUrl)};
    for (const [month, date, hours] of [[2, 8, 23], [10, 1, 25]]) {
      const registered = new Date(2026, month, date - 1, 23, 50);
      const midnight = new Date(2026, month, date);
      const next = new Date(2026, month, date + 1);
      const account = { createdAt: registered.toISOString(), ledger: [] };
      const status = spinStatus(account, midnight);
      assert.equal(status.spinsAvailable, 2);
      assert.equal(status.remaining, hours * 3600000);
      assert.equal(status.nextAt, +next);
      assert.equal(spinStatus(account, new Date(+next - 1)).spinsAvailable, 2);
      assert.equal(spinStatus(account, next).spinsAvailable, 3);
    }
    const account = { createdAt: new Date(2026, 9, 31, 23, 50).toISOString(), ledger: [] };
    for (const repeatedHour of ['2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00']) {
      const status = spinStatus(account, repeatedHour);
      assert.equal(status.spinsAvailable, 2);
      assert.equal(status.nextAt, +new Date(2026, 10, 2));
    }
  `], { env: { ...process.env, TZ: 'America/New_York' }, stdio: 'pipe' });
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

test('concurrent tabs cannot spend more accumulated spins than the account earned', async () => {
  const indexedDB = new IDBFactory();
  const a = await openAccountStore({ indexedDB, create });
  const b = await openAccountStore({ indexedDB, create });
  const later = day(3);
  try {
    const outcomes = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? a : b).transact(account => applyAccountCommand(account, { type: 'spin-wheel', index: index % 8 }, later))));
    assert.equal(outcomes.filter(outcome => outcome.result.ok).length, 4);
    const saved = await b.read();
    const spins = saved.ledger.filter(item => item.source === 'spin-wheel');
    assert.equal(spins.length, 4);
    assert.equal(new Set(spins.map(item => item.id)).size, 4);
    assert.equal(spinStatus(saved, later).spinsAvailable, 0);
    for (const currency of ['GC', 'SC']) {
      assert.equal(saved.wallet.balances[currency], saved.ledger.filter(entry => entry.currency === currency).reduce((sum, entry) => sum + entry.amountUnits, 0));
    }
  } finally { a.close(); b.close(); }
});

test('failed persistence rolls back the wheel award without consuming accumulated spins', async () => {
  const store = await openAccountStore({ indexedDB: new IDBFactory(), create });
  const later = day(2);
  try {
    await assert.rejects(store.transact(account => {
      const outcome = applyAccountCommand(account, { type: 'spin-wheel', index: 2 }, later);
      outcome.account.invalid = () => {};
      return outcome;
    }));
    const saved = await store.read();
    assert.equal(saved.wallet.balances.GC, 0);
    assert.equal(saved.ledger.length, 2);
    assert.equal(spinStatus(saved, later).spinsAvailable, 3);
  } finally { store.close(); }
});
