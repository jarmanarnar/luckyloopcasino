import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';
import { openAccountStore } from '../public/demo-account-store.js';
import { openDemoAccount } from '../public/demo-account.js';
import { MEMBER_STORAGE_KEY } from '../public/member-state.js';

const now = new Date(2026, 10, 1, 12);
const create = () => createDemoAccount({}, { now, playerId: 'demo-test' });
const command = (store, action, date = now) => store.transact(account => applyAccountCommand(account, action, date));
const options = indexedDB => ({ indexedDB, create });
function reconcile(account) {
  for (const currency of ['GC', 'SC']) {
    const entries = account.ledger.filter(entry => entry.currency === currency);
    let balance = 0;
    for (const entry of entries) {
      balance += entry.amountUnits;
      assert.equal(entry.balanceAfterUnits, balance);
      assert.equal(entry.playerId, account.playerId);
      assert.equal(entry.status, 'posted');
    }
    assert.equal(account.wallet.balances[currency], balance);
  }
  assert.equal(new Set(account.ledger.map(entry => entry.id)).size, account.ledger.length);
}

test('concurrent first opens create one stable account and two opening records', async () => {
  const indexedDB = new IDBFactory();
  const stores = await Promise.all([openAccountStore(options(indexedDB)), openAccountStore(options(indexedDB))]);
  try {
    const [a, b] = await Promise.all(stores.map(store => store.read()));
    assert.equal(a.playerId, b.playerId);
    assert.equal(a.ledger.length, 2);
    assert.deepEqual(a.wallet.balances, { GC: 125000, SC: 1500 });
    reconcile(a);
  } finally { stores.forEach(store => store.close()); }
});

test('simultaneous daily claims from independent connections commit one credit and record', async () => {
  const indexedDB = new IDBFactory();
  const a = await openAccountStore(options(indexedDB));
  const b = await openAccountStore(options(indexedDB));
  try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => command(i % 2 ? a : b, { type: 'claim-daily' })));
    assert.equal(results.filter(result => result.result.ok).length, 1);
    const saved = await a.read();
    assert.equal(saved.wallet.balances.GC, 126000);
    assert.equal(saved.wallet.balances.SC, 1500);
    assert.equal(saved.member.daily.totalClaims, 1);
    assert.equal(saved.ledger.filter(entry => entry.type === 'bonus').length, 1);
    assert.equal(accountMemberState(saved).history.filter(entry => entry.type === 'reward').length, 1);
    reconcile(saved);
    a.close(); b.close();
    const reopened = await openAccountStore(options(indexedDB));
    try {
      assert.equal((await command(reopened, { type: 'claim-daily' })).result.ok, false);
      assert.equal((await reopened.read()).wallet.balances.GC, 126000);
    } finally { reopened.close(); }
  } finally { a.close(); b.close(); }
});

test('failed persistence rolls back balance, reward eligibility and journal together', async () => {
  const store = await openAccountStore(options(new IDBFactory()));
  try {
    await assert.rejects(store.transact(account => {
      const outcome = applyAccountCommand(account, { type: 'claim-daily' }, now);
      // An uncloneable value forces the actual IndexedDB put to fail.
      outcome.account.unsavable = () => {};
      return outcome;
    }), { name: 'DataCloneError' });
    const unchanged = await store.read();
    assert.equal(unchanged.wallet.balances.GC, 125000);
    assert.equal(unchanged.member.daily.totalClaims, 0);
    assert.equal(unchanged.ledger.length, 2);
    assert.equal((await command(store, { type: 'claim-daily' })).result.ok, true);
    reconcile(await store.read());
  } finally { store.close(); }
});

test('stale navigation, currency, favorites and profile patches preserve unrelated newer data', async () => {
  const indexedDB = new IDBFactory();
  const a = await openAccountStore(options(indexedDB)), b = await openAccountStore(options(indexedDB));
  try {
    await b.read(); // The old tab saw the original account.
    await command(a, { type: 'profile', patch: { displayName: 'Alice' } });
    await Promise.all([
      command(a, { type: 'claim-daily' }),
      command(b, { type: 'page-visit', pageId: 'history' }),
      command(b, { type: 'currency', currency: 'SC' }),
      command(b, { type: 'favorite', gameId: 'alpha', catalogIds: ['alpha'] }),
      command(b, { type: 'profile', patch: { avatar: '★' } }),
      command(a, { type: 'settings', patch: { hideBalance: true } }),
      command(b, { type: 'settings', patch: { reducedMotion: true } }),
    ]);
    const saved = await a.read();
    assert.deepEqual(saved.member.profile, { displayName: 'Alice', avatar: '★' });
    assert.deepEqual(saved.member.favorites, ['alpha']);
    assert.deepEqual(saved.member.settings, { hideBalance: true, reducedMotion: true });
    assert.ok(saved.member.visited.includes('history'));
    assert.equal(saved.wallet.currency, 'SC');
    assert.equal(saved.wallet.balances.GC, 126000);
    reconcile(saved);
  } finally { a.close(); b.close(); }
});

test('task and daily retries keep independent operation keys and cannot over-credit', async () => {
  const store = await openAccountStore(options(new IDBFactory()));
  try {
    assert.equal((await command(store, { type: 'claim-task', taskId: 'complete-profile' })).result.ok, false);
    await command(store, { type: 'profile', patch: { displayName: 'Alice' } });
    const results = await Promise.all([
      command(store, { type: 'claim-task', taskId: 'complete-profile' }),
      command(store, { type: 'claim-task', taskId: 'complete-profile' }),
      command(store, { type: 'claim-daily' }),
    ]);
    assert.equal(results.filter(result => result.result.ok).length, 2);
    const saved = await store.read();
    assert.equal(saved.wallet.balances.GC, 126500);
    assert.equal(saved.ledger.filter(entry => entry.type === 'bonus').length, 2);
    // Even if eligibility metadata is damaged, the committed operation stays unique.
    const damaged = structuredClone(saved);
    damaged.member.daily = { lastClaim: null, streak: 0, totalClaims: 0 };
    assert.equal(applyAccountCommand(damaged, { type: 'claim-daily' }, now).result.ok, false);
    reconcile(saved);
  } finally { store.close(); }
});

test('migration carries balances and member data once without inventing historical credits', async () => {
  const indexedDB = new IDBFactory();
  const values = new Map([
    ['luckyloopcasino-demo-wallet-v1', JSON.stringify({ currency: 'SC', balances: { GC: 131000, SC: 2505 } })],
    [MEMBER_STORAGE_KEY, JSON.stringify({ profile: { displayName: 'Existing Player', avatar: '★' }, favorites: ['alpha'],
      daily: { lastClaim: now.toISOString(), streak: 2, totalClaims: 4 },
      history: [{ type: 'reward', title: 'Old reward', detail: '+1,000 demo GC', at: now.toISOString() }] })],
  ]);
  const config = { indexedDB, storage: { getItem: key => values.get(key) ?? null }, scope: undefined, catalogIds: ['alpha'] };
  let account = await openDemoAccount(config);
  const original = account.getSnapshot();
  assert.equal(original.member.profile.displayName, 'Existing Player');
  assert.deepEqual(original.member.favorites, ['alpha']);
  assert.equal(original.wallet.currency, 'SC');
  assert.deepEqual(original.wallet.balances, { GC: 131000, SC: 2505 });
  assert.equal(original.ledger.length, 2);
  assert.ok(original.ledger.every(entry => entry.source === 'migration'));
  assert.equal(account.getMemberState().history.filter(entry => entry.type === 'reward').length, 1);
  reconcile(original);
  account.close();
  values.set('luckyloopcasino-demo-wallet-v1', JSON.stringify({ balances: { GC: 1, SC: 1 } }));
  account = await openDemoAccount(config);
  try {
    assert.equal(account.getSnapshot().playerId, original.playerId);
    assert.deepEqual(account.getSnapshot().wallet.balances, original.wallet.balances);
    const snapshot = account.getSnapshot(); snapshot.ledger.length = 0; snapshot.wallet.balances.GC = 0;
    assert.deepEqual(account.getSnapshot().wallet.balances, original.wallet.balances);
    assert.equal(account.getSnapshot().ledger.length, 2);
  } finally { account.close(); }
});

test('ledger survives browsing history retention and balance-limit rejection changes nothing', () => {
  let saved = create();
  for (let index = 0; index < 210; index++) {
    saved = applyAccountCommand(saved, { type: 'claim-daily' }, new Date(2026, 0, index + 1, 12)).account;
    saved = applyAccountCommand(saved, { type: 'game-visit', game: { id: 'alpha', title: 'Alpha', providerName: 'Studio' } }, new Date(2026, 0, index + 1, 13)).account;
  }
  assert.equal(saved.member.history.length, 200);
  assert.equal(saved.ledger.length, 212);
  reconcile(saved);
  const full = createDemoAccount({ wallet: { balances: { GC: 999999999, SC: 1500 } } }, { now, playerId: 'full' });
  const result = applyAccountCommand(full, { type: 'claim-daily' }, now);
  assert.equal(result.result.ok, false);
  assert.equal(result.account, full);
  assert.equal(full.member.daily.totalClaims, 0);
  assert.equal(full.ledger.length, 2);
});

test('a view listener failure cannot turn a committed credit into a failed account action', async () => {
  const account = await openDemoAccount({ indexedDB: new IDBFactory(), scope: undefined });
  await account.register({ email: 'listener-test@example.test', password: 'ListenerDemo37!', accepted: true });
  let refreshed = 0;
  account.subscribe(() => { throw new Error('Broken view'); });
  account.subscribe(() => refreshed++);
  try {
    const result = await account.claimDaily();
    assert.equal(result.ok, true);
    assert.equal(refreshed, 1);
    assert.equal(account.getSnapshot().wallet.balances.GC, 126000);
    assert.equal((await account.claimDaily()).ok, false);
    reconcile(account.getSnapshot());
  } finally { account.close(); }
});

test('marking notifications read merges across tabs and persists without changing rewards or balances', async () => {
  const indexedDB = new IDBFactory();
  const oldStore = await openAccountStore({ indexedDB, create() {
    const saved = createDemoAccount({}, { now, playerId: `demo-${'x'.repeat(120)}` });
    delete saved.member.notificationReadIds;
    return saved;
  } });
  oldStore.close();
  const config = { indexedDB, scope: undefined };
  const first = await openDemoAccount(config);
  let second;
  try {
    assert.deepEqual(first.getNotificationReadIds(), []);
    assert.equal((await first.markNotificationsRead(['platform:welcome'])).ok, false);
    await first.register({ email: 'notifications@example.test', password: 'NotificationDemo37!', accepted: true });
    const reward = await first.claimDaily();
    assert.equal(reward.ok, true);
    const personal = `personal:${reward.transactionId}`;
    const before = first.getSnapshot();
    const memberBefore = first.getMemberState();
    second = await openDemoAccount(config);
    const results = await Promise.all([
      first.markNotificationsRead([personal, 'personal:', null, `personal:${'x'.repeat(256)}`]),
      second.markNotificationsRead(['platform:welcome', 'platform:welcome', 'unknown:notice']),
    ]);
    assert.ok(results.every(result => result.ok));
    await second.refresh();
    const expected = new Set([personal, 'platform:welcome']);
    assert.deepEqual(new Set(second.getNotificationReadIds()), expected);
    assert.deepEqual(second.getMemberState(), memberBefore);
    const after = second.getSnapshot();
    assert.deepEqual(after.wallet, before.wallet);
    assert.deepEqual(after.ledger, before.ledger);

    await first.logout();
    assert.equal((await second.markNotificationsRead(['platform:after-logout'])).ok, false);
    const reopened = await openDemoAccount(config);
    try { assert.deepEqual(new Set(reopened.getNotificationReadIds()), expected); }
    finally { reopened.close(); }
  } finally { first.close(); second?.close(); }
});
