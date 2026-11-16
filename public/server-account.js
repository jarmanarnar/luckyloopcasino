import { createDemoAccount, accountMemberState } from './demo-account-state.js';

export async function openServerAccount({ scope = globalThis.window, fetch: request = globalThis.fetch } = {}) {
  let snapshot = { ...createDemoAccount({}, { playerId: 'server-guest' }), serverManaged: true, signedIn: false, identity: null };
  delete snapshot.auth;
  let member = accountMemberState(snapshot), capabilities = {}, closed = false, queue = Promise.resolve();
  const listeners = new Set();
  const channel = scope?.BroadcastChannel ? new scope.BroadcastChannel('cop-server-account') : null;
  async function call(route, body) {
    if (closed) throw new Error('Account is closed.');
    const response = await request(`api/${route}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000), redirect: 'error' });
    const data = await response.json();
    if (data.snapshot && data.member) {
      const changed = snapshot.playerId !== data.snapshot.playerId || snapshot.revision !== data.snapshot.revision || snapshot.signedIn !== data.snapshot.signedIn;
      snapshot = data.snapshot; member = data.member; capabilities = data.capabilities || {};
      if (changed) for (const listener of listeners) { try { listener(); } catch (error) { scope?.console?.error('Unable to refresh account view:', error); } }
    }
    if (!data.result) throw new Error('Invalid account response.');
    return data.result;
  }
  function enqueue(action) {
    const next = queue.then(action); queue = next.catch(() => {}); return next;
  }
  const refresh = () => enqueue(() => call('session'));
  const mutate = (route, data = {}, playerId = snapshot.playerId) => {
    return enqueue(async () => {
      const result = await call(route, { ...data, playerId });
      channel?.postMessage({ changed: true }); return result;
    });
  };
  const command = data => mutate('command', { command: data });
  const quietly = () => { if (!closed) void refresh().catch(() => {}); };
  const onVisibility = () => { if (!scope.document.hidden) quietly(); };
  if (channel) channel.onmessage = quietly;
  scope?.addEventListener('focus', quietly);
  scope?.document?.addEventListener('visibilitychange', onVisibility);
  const timer = scope?.setInterval?.(() => { if (!scope.document?.hidden) quietly(); }, 15000);
  const close = () => {
    closed = true; channel?.close(); listeners.clear(); scope?.clearInterval?.(timer);
    scope?.removeEventListener('focus', quietly); scope?.document?.removeEventListener('visibilitychange', onVisibility);
  };
  try { const result = await refresh(); if (!result.ok) throw new Error(result.reason); }
  catch (error) { close(); throw error; }
  return {
    getSnapshot: () => structuredClone(snapshot), getMemberState: () => structuredClone(member),
    getCapabilities: () => structuredClone(capabilities), isSignedIn: () => snapshot.signedIn,
    getNotificationReadIds: () => structuredClone(snapshot.member.notificationReadIds || []),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, refresh, close,
    register: credentials => mutate('register', credentials), login: credentials => mutate('login', credentials),
    logout: () => mutate('logout'), deleteAccount: playerId => mutate('delete-account', {}, playerId),
    resumeDemo: async () => ({ ok: false, reason: 'Use your email and password to log in.' }),
    claimTask: taskId => command({ type: 'claim-task', taskId }),
    claimDaily: async () => ({ ok: false, reason: 'Visit Achievements to collect your rewards.' }),
    spinWheel: () => command({ type: 'spin-wheel' }), selectCurrency: currency => command({ type: 'currency', currency }),
    saveProfile: patch => command({ type: 'profile', patch }), saveSettings: patch => command({ type: 'settings', patch }),
    markNotificationsRead: ids => command({ type: 'notifications-read', ids }),
    toggleFavorite: gameId => command({ type: 'favorite', gameId }),
    recordGameVisit: game => command({ type: 'game-visit', gameId: game.id }), recordPageVisit: pageId => command({ type: 'page-visit', pageId }),
    startVerification: (channel, destination) => mutate('verification/start', { channel, destination }),
    checkVerification: (channel, challengeId, code) => mutate('verification/check', { channel, challengeId, code }),
  };
}
