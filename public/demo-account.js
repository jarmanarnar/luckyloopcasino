import { ACCOUNT_DATABASE, createDemoAccount, applyAccountCommand, accountMemberState } from './demo-account-state.js';
import { openAccountStore } from './demo-account-store.js';
import { MEMBER_STORAGE_KEY } from './member-state.js';
import { normalizeDemoEmail, validDemoEmail, createDemoCredential, matchesDemoCredential } from './demo-credentials.js';

const WALLET_KEYS = ['luckyloopcasino-demo-wallet-v1', 'luckyloop-casino-demo-wallet-v1', 'atomic-design-demo-wallet-v1'];
function legacyData(storage) {
  const read = key => {
    try { const value = storage?.getItem(key); return value ? JSON.parse(value) : null; }
    catch { return null; }
  };
  const wallet = WALLET_KEYS.map(read).find(value => value !== null);
  const member = read(MEMBER_STORAGE_KEY);
  return { wallet, member, migrated: Boolean(wallet || member) };
}

export async function openDemoAccount({ indexedDB = globalThis.indexedDB, storage,
  scope = globalThis.window, databaseName = ACCOUNT_DATABASE, catalogIds = [] } = {}) {
  if (storage === undefined) { try { storage = scope?.localStorage; } catch { /* IndexedDB remains authoritative. */ } }
  const store = await openAccountStore({ indexedDB, name: databaseName, create: () => createDemoAccount(legacyData(storage)) });
  let snapshot = (await store.transact(account => applyAccountCommand(account, { type: 'catalog', gameIds: catalogIds }))).account;
  const listeners = new Set();
  let closed = false;
  const channel = scope?.BroadcastChannel ? new scope.BroadcastChannel(databaseName) : null;
  const signalKey = `${databaseName}:changed`;
  function adopt(next) {
    if (closed || next.revision < snapshot.revision) return;
    if (next.revision === snapshot.revision) return;
    snapshot = next;
    for (const listener of listeners) {
      try { listener(); }
      catch (error) { scope?.console?.error('Unable to update the demo account view:', error); }
    }
  }
  async function refresh() { if (!closed) adopt(await store.read()); }
  const refreshQuietly = () => { void refresh().catch(error => scope?.console?.error('Unable to refresh demo account:', error)); };
  const onVisibility = () => { if (!scope.document.hidden) refreshQuietly(); };
  const onStorage = event => { if (event.key === signalKey) refreshQuietly(); };
  if (channel) channel.onmessage = refreshQuietly;
  scope?.addEventListener('storage', onStorage);
  scope?.addEventListener('focus', refreshQuietly);
  scope?.addEventListener('pageshow', refreshQuietly);
  scope?.document?.addEventListener('visibilitychange', onVisibility);
  async function command(action) {
    const outcome = await store.transact(account => {
      if (['claim-daily', 'claim-task', 'profile', 'settings', 'favorite', 'game-visit'].includes(action.type)
        && !account.auth?.signedIn) return { account, result: { ok: false, amount: 0, reason: 'Log in to use your account.' } };
      return applyAccountCommand(account, action);
    });
    adopt(outcome.account);
    // Notification is only a hint. Receivers read the committed database state.
    try {
      if (channel) channel.postMessage({ revision: outcome.account.revision });
      else storage?.setItem(signalKey, `${outcome.account.revision}:${crypto.randomUUID()}`);
    } catch { /* Focus/visibility refresh also reconciles tabs. */ }
    return outcome.result;
  }
  return {
    getSnapshot() {
      const { auth, ...publicAccount } = structuredClone(snapshot);
      return { ...publicAccount, signedIn: auth?.signedIn === true,
        identity: auth ? { email: auth.signedIn ? auth.email : null, registeredAt: auth.registeredAt } : null };
    },
    isSignedIn: () => snapshot.auth?.signedIn === true,
    async register({ email, password, accepted } = {}) {
      email = normalizeDemoEmail(email);
      if (!validDemoEmail(email)) return { ok: false, reason: 'Enter a valid email address.' };
      if (typeof password !== 'string' || password.length < 8 || password.length > 256) return { ok: false, reason: 'Use a password with 8–256 characters.' };
      if (accepted !== true) return { ok: false, reason: 'Please confirm the terms to continue.' };
      return command({ type: 'register', email, credential: await createDemoCredential(password) });
    },
    async login({ email, password } = {}) {
      const saved = await store.read();
      email = normalizeDemoEmail(email);
      if (typeof password !== 'string' || password.length > 256 || saved.auth?.email !== email
        || !await matchesDemoCredential(password, saved.auth?.credential)) {
        return { ok: false, reason: 'Email or password does not match this account.' };
      }
      return command({ type: 'login', email, credential: saved.auth.credential });
    },
    logout: () => command({ type: 'logout' }),
    // Explicit local-demo recovery; this is not a Google identity verification.
    resumeDemo: () => command({ type: 'resume-demo' }),
    getMemberState: () => accountMemberState(snapshot),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh,
    claimDaily: () => command({ type: 'claim-daily' }),
    claimTask: taskId => command({ type: 'claim-task', taskId }),
    selectCurrency: currency => command({ type: 'currency', currency }),
    saveProfile: patch => command({ type: 'profile', patch }),
    saveSettings: patch => command({ type: 'settings', patch }),
    toggleFavorite: gameId => command({ type: 'favorite', gameId, catalogIds }),
    recordGameVisit: game => command({ type: 'game-visit', game }),
    recordPageVisit: pageId => command({ type: 'page-visit', pageId }),
    close() {
      closed = true; channel?.close(); listeners.clear(); store.close();
      scope?.removeEventListener('storage', onStorage);
      scope?.removeEventListener('focus', refreshQuietly);
      scope?.removeEventListener('pageshow', refreshQuietly);
      scope?.document?.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
