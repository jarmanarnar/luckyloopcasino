import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { openDemoAccount } from '../public/demo-account.js';
import { createAuthRouter, requiresAccount } from '../public/auth-routing.js';
import { openAccountStore } from '../public/demo-account-store.js';

const credentials = { email: 'demo@example.test', password: 'LocalDemo37!', accepted: true };

test('registration, logout and login keep one player, one wallet and the original ledger', async () => {
  const indexedDB = new IDBFactory();
  let account = await openDemoAccount({ indexedDB, scope: undefined, catalogIds: ['alpha'] });
  try {
    const before = account.getSnapshot();
    assert.equal(account.isSignedIn(), false);
    assert.equal((await account.claimDaily()).ok, false, 'guests cannot credit the wallet');
    assert.equal((await account.register({ ...credentials, accepted: false })).ok, false);
    assert.equal((await account.register({ ...credentials, password: 'short' })).ok, false);
    assert.equal((await account.register({ ...credentials, email: ' DEMO@example.test ' })).ok, true);
    assert.equal(account.isSignedIn(), true);
    assert.equal(account.getSnapshot().identity.email, 'demo@example.test');
    assert.equal(account.getSnapshot().auth, undefined, 'credentials are never returned to UI snapshots');
    const persisted = await openAccountStore({ indexedDB, create: () => { throw new Error('Account already exists'); } });
    try {
      const saved = await persisted.read();
      assert.equal(saved.auth.credential.hash.length, 32);
      assert.equal(saved.auth.credential.salt.length, 16);
      assert.equal(JSON.stringify(saved).includes(credentials.password), false, 'the database never stores the password as text');
    } finally { persisted.close(); }
    assert.deepEqual(account.getSnapshot().ledger, before.ledger);
    await account.claimDaily();
    const credited = account.getSnapshot();
    await account.logout();
    assert.equal(account.isSignedIn(), false);
    assert.equal(account.getSnapshot().identity.email, null);
    assert.equal((await account.toggleFavorite('alpha')).ok, false);
    assert.equal((await account.register(credentials)).ok, false, 'registering again never replaces an existing account');
    assert.equal((await account.login({ email: credentials.email, password: 'WrongPassword37!' })).ok, false);
    assert.equal((await account.login({ email: 'other@example.test', password: credentials.password })).ok, false);
    assert.equal((await account.login(credentials)).ok, true);
    assert.equal(account.getSnapshot().playerId, before.playerId);
    assert.deepEqual(account.getSnapshot().wallet, credited.wallet);
    assert.deepEqual(account.getSnapshot().ledger, credited.ledger);
    assert.equal((await account.claimDaily()).ok, false);
    account.close();
    account = await openDemoAccount({ indexedDB, scope: undefined, catalogIds: ['alpha'] });
    assert.equal(account.isSignedIn(), true);
    assert.equal(account.getSnapshot().playerId, before.playerId);
    assert.equal(JSON.stringify(account.getSnapshot()).includes(credentials.password), false);
  } finally { account.close(); }
});

test('concurrent registrations cannot bind two identities or recreate balances', async () => {
  const indexedDB = new IDBFactory();
  const a = await openDemoAccount({ indexedDB, scope: undefined });
  const b = await openDemoAccount({ indexedDB, scope: undefined });
  try {
    const attempts = await Promise.all([a.register(credentials),b.register({ ...credentials, email: 'other@example.test' })]);
    assert.equal(attempts.filter(result => result.ok).length, 1);
    await a.refresh(); await b.refresh();
    assert.equal(a.getSnapshot().playerId, b.getSnapshot().playerId);
    assert.equal(a.getSnapshot().ledger.length, 2);
    await a.logout(); await b.refresh();
    assert.equal(b.isSignedIn(), false);
    assert.equal((await b.claimDaily()).ok, false, 'authorization reads the committed session in the same transaction');
  } finally { a.close(); b.close(); }
});

test('saved demo entry needs no remembered credentials and never replaces the account or repeats credits', async () => {
  const indexedDB = new IDBFactory();
  const account = await openDemoAccount({ indexedDB, scope: undefined, catalogIds: ['alpha'] });
  try {
    const empty = account.getSnapshot();
    assert.equal((await account.resumeDemo()).ok, false, 'a visitor must register first');
    assert.deepEqual(account.getSnapshot(), empty);
    await account.register(credentials);
    await account.saveProfile({ displayName: 'Saved Player', avatar: '★' });
    await account.toggleFavorite('alpha');
    await account.claimDaily();
    await account.logout();
    const saved = account.getSnapshot();
    const results = await Promise.all([account.resumeDemo(), account.resumeDemo()]);
    assert.ok(results.every(result => result.ok));
    assert.equal(account.isSignedIn(), true);
    assert.equal(account.getSnapshot().playerId, saved.playerId);
    assert.deepEqual(account.getSnapshot().wallet, saved.wallet);
    assert.deepEqual(account.getSnapshot().ledger, saved.ledger);
    assert.deepEqual(account.getSnapshot().member, saved.member);
    assert.equal((await account.claimDaily()).ok, false);
    await account.logout();
    assert.equal((await account.login(credentials)).ok, true, 'the original password remains valid');
  } finally { account.close(); }
});

test('credential-free demo entry is refused for a non-test account', async () => {
  const indexedDB = new IDBFactory();
  const account = await openDemoAccount({ indexedDB, scope: undefined });
  const persisted = await openAccountStore({ indexedDB, create: () => { throw new Error('Existing account'); } });
  try {
    await account.register(credentials);
    await account.logout();
    await persisted.transact(current => ({ account: { ...current, isTest: false, revision: current.revision + 1 }, result: { ok: true } }));
    assert.equal((await account.resumeDemo()).ok, false);
    assert.equal(account.isSignedIn(), false);
  } finally { persisted.close(); account.close(); }
});

test('public browsing stays open while account, purchase and game actions require login', () => {
  for (const route of [{ type: 'home' },{ type: 'category', categoryId: 'popular' },{ type: 'providers' },
    { type: 'search' },{ type: 'game-details', gameId: 'alpha' },{ type: 'feature', pageId: 'support' }]) {
    assert.equal(requiresAccount(route), false);
  }
  for (const route of [{ type: 'game', gameId: 'alpha' },{ type: 'favorites' },{ type: 'store' },
    ...['profile','history','daily-bonus','free-money','redeem','notifications'].map(pageId=>({type:'feature',pageId}))]) {
    assert.equal(requiresAccount(route), true);
  }
});

test('guest deep links and browser navigation are guarded before views; successful login resumes the requested game', () => {
  let route = { type: 'game', gameId: 'alpha' }, signedIn = false;
  const listeners = [], prompts = [], mounted = [];
  const raw = {
    getRoute: () => route,
    subscribe(fn, { priority = 0 } = {}) { listeners.push({ fn, priority }); },
    navigate(next) { route = next; for (const listener of [...listeners].sort((a,b)=>a.priority-b.priority)) listener.fn(route); },
  };
  const router = createAuthRouter(raw, { isSignedIn: () => signedIn }, request => prompts.push(request));
  assert.equal(router.getRoute().type, 'home');
  assert.equal(prompts.length, 1);
  router.subscribe(next=>mounted.push(next.type));
  raw.navigate({ type: 'feature', pageId: 'history' });
  assert.ok(mounted.every(type=>type==='home'));
  router.navigate({ type: 'game', gameId: 'alpha' });
  assert.equal(router.getRoute().type, 'home');
  signedIn = true;
  router.navigate(prompts.at(-1));
  assert.equal(router.getRoute().gameId, 'alpha');
  assert.equal(mounted.at(-1), 'game');
});
