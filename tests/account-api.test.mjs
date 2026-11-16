import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server.mjs';
import { createAccountApi } from '../server/account-api.mjs';
import { openServerAccounts, passwordMatches } from '../server/account-repository.mjs';
import { createVerificationProvider } from '../server/verification-provider.mjs';
import { achievementProgress } from '../public/achievement-catalog.js';

async function fixture(t, options = {}) {
  let api, time = Date.now();
  const secret = 'test-only-game-events-secret-never-production';
  const sent = [], checks = [];
  const verification = options.verification || { channels: ['email', 'phone'],
    async start(channel, destination) { const id = randomUUID(); sent.push({ channel, destination, id }); return id; },
    async check(id, code) { checks.push({ id, code }); return sent.some(item => item.id === id) && code === '123456'; } };
  const server = createAppServer({ accountApi: { handle: (...args) => api.handle(...args) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  api = createAccountApi({ filename: options.filename || ':memory:', origin, gameEventSecret: secret,
    verification, now: () => time, games: [{ id: 'game-a', title: 'Game A', providerName: 'Test' }] });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); api.close(); });
  const client = () => {
    let cookie = '', playerId;
    return {
      async request(route, body, headers = {}) {
        const response = await fetch(`${origin}/luckyloopcasino/api/${route}`, { method: body ? 'POST' : 'GET', headers: {
          ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), Cookie: cookie, ...headers,
        }, body: body ? JSON.stringify({ playerId, ...body }) : undefined });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        const data = await response.json(); if (data.snapshot) playerId = data.snapshot.playerId;
        return { ...data, status: response.status, headers: response.headers };
      },
      get playerId() { return playerId; }, get cookie() { return cookie; },
      register: async function (email = `${randomUUID()}@example.test`) { return this.request('register', { email, password: 'long-test-password', accepted: true }); },
      command: async function (command) { return this.request('command', { command }); },
    };
  };
  async function event(body, headers = {}) {
    const raw = JSON.stringify(body), timestamp = String(Math.floor(time / 1000));
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
    const response = await fetch(`${origin}/luckyloopcasino/api/game-events`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-cop-timestamp': timestamp, 'x-cop-signature': signature, ...headers,
    }, body: raw });
    return { ...await response.json(), status: response.status };
  }
  return { api, origin, client, event, sent, checks, advance: ms => { time += ms; } };
}
const round = (playerId, patch = {}) => ({ type: 'round.settled', provider: 'test-operator', roundId: randomUUID(),
  playerId, currency: 'SC', wagerUnits: 10000, playSCUnits: 7000, loyaltySCUnits: 10000, ...patch });

test('server owns sessions, credentials and commands; untrusted progress, CSRF and stale players cannot mutate it', async t => {
  const f = await fixture(t), a = f.client();
  const config = await fetch(`${f.origin}/luckyloopcasino/account-config.js`);
  assert.match(await config.text(), /SERVER_ACCOUNT = true/);
  const registered = await a.register();
  assert.equal(registered.result.ok, true); assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal(registered.snapshot.serverManaged, true); assert.equal(registered.snapshot.auth, undefined);
  assert.equal(JSON.stringify(registered).includes('long-test-password'), false);
  assert.equal(registered.member.achievementStats.emailVerified, false);
  assert.equal((await a.command({ type: 'profile', patch: { displayName: 'New Player', achievementStats: { emailVerified: true } } })).result.ok, true);
  assert.equal((await a.command({ type: 'game-visit', gameId: 'game-a' })).result.ok, true);
  assert.equal((await a.request('session')).member.achievementStats.playSCUnits, 0);
  assert.equal((await a.command({ type: 'achievement-stats', emailVerified: true, playSCUnits: 999999 })).status, 400);
  assert.equal((await a.command({ type: 'claim-task', taskId: 'verify-email', amount: 999999 })).result.ok, false);
  assert.equal((await a.request('command', { playerId: 'wrong-player', command: { type: 'claim-task', taskId: 'welcome-member' } })).status, 409);
  assert.equal((await a.request('command', { command: { type: 'claim-task', taskId: 'welcome-member' } }, { Origin: 'https://evil.example' })).status, 403);
  const guest = f.client(); assert.equal((await guest.command({ type: 'claim-task', taskId: 'welcome-member' })).status, 401);
  const cookie = a.cookie;
  await a.request('logout', {});
  assert.equal((await a.request('session', undefined, { Cookie: cookie })).snapshot.signedIn, false);
});

test('signed settled rounds update independent play and loyalty totals once; claims credit both currencies exactly once', async t => {
  const f = await fixture(t), a = f.client(); await a.register();
  const event = round(a.playerId);
  assert.equal((await f.event(event, { 'x-cop-signature': '0'.repeat(64) })).status, 401);
  assert.equal((await f.event(event, { 'x-cop-timestamp': '1000000000' })).status, 401);
  const outcomes = await Promise.all([f.event(event), f.event(event), f.event(event)]);
  assert.equal(outcomes.filter(item => item.duplicate).length, 2);
  let state = await a.request('session');
  assert.equal(state.member.achievementStats.playSCUnits, 7000);
  assert.equal(state.member.achievementStats.loyaltySCUnits, 10000);
  assert.equal(achievementProgress('limit-breaker-1', state.member).complete, true);
  assert.equal(achievementProgress('loyalty-tier-1', state.member).complete, true);
  const claims = await Promise.all(Array.from({ length: 3 }, () => a.command({ type: 'claim-task', taskId: 'limit-breaker-1', rewards: { GC: 999999999 } })));
  assert.equal(claims.filter(item => item.result.ok).length, 1);
  state = await a.request('session');
  assert.deepEqual(state.snapshot.wallet.balances, { GC: 2500, SC: 25 });
  assert.equal(state.snapshot.ledger.filter(item => item.sourceId === 'limit-breaker-1').length, 2);
  assert.equal((await f.event({ ...event, wagerUnits: 11000 })).status, 409);
  assert.equal((await f.event(round(a.playerId, { currency: 'GC', playSCUnits: 0, loyaltySCUnits: 0 }))).ok, true);
  assert.equal((await f.event(round(a.playerId, { currency: 'GC' }))).status, 400);
  assert.equal((await f.event(round(a.playerId, { playSCUnits: 0.1 }))).status, 400);
  assert.equal((await f.event(round('unknown-player'))).status, 404);
  assert.equal((await a.request('session')).member.achievementStats.playSCUnits, 7000);
});

test('round reversals, out-of-order delivery and cross-player reuse never inflate progress or reissue rewards', async t => {
  const f = await fixture(t), a = f.client(), b = f.client(); await a.register(); await b.register();
  const event = round(a.playerId), reversal = { type: 'round.reversed', provider: event.provider, roundId: event.roundId, playerId: a.playerId };
  await f.event(event); await a.command({ type: 'claim-task', taskId: 'limit-breaker-1' });
  assert.equal((await f.event(reversal)).ok, true);
  assert.equal((await f.event(reversal)).duplicate, true);
  assert.equal((await f.event(event)).duplicate, true);
  assert.equal((await f.event({ ...event, playerId: b.playerId })).status, 409);
  let state = await a.request('session'); assert.equal(state.member.achievementStats.playSCUnits, 0);
  assert.equal((await a.command({ type: 'claim-task', taskId: 'limit-breaker-1' })).result.ok, false);
  const late = round(a.playerId); await f.event({ ...late, type: 'round.reversed' }); await f.event(late);
  state = await a.request('session'); assert.equal(state.member.achievementStats.loyaltySCUnits, 0);
  assert.equal(state.snapshot.wallet.balances.GC, 2500, 'already collected awards are not silently clawed back');
});

test('email and phone count only after provider-approved codes; welcome rewards remain manual one-time claims', async t => {
  const f = await fixture(t), a = f.client(); await a.register('member@example.test');
  for (const channel of ['email', 'phone']) {
    const sent = await a.request('verification/start', { channel, destination: channel === 'email' ? 'attacker@example.test' : '+12025550123' });
    assert.equal(sent.result.ok, true); assert.ok(sent.result.challengeId);
    assert.equal(sent.member.achievementStats[`${channel}Verified`], false);
    if (channel === 'email') assert.equal(f.sent.at(-1).destination, 'member@example.test');
    assert.equal((await a.request('verification/start', { channel, destination: '+12025550123' })).status, 429);
    assert.equal((await a.request('verification/check', { channel, challengeId: sent.result.challengeId, code: '000000' })).result.ok, false);
    const verified = await a.request('verification/check', { channel, challengeId: sent.result.challengeId, code: '123456' });
    assert.equal(verified.result.verified, true); assert.equal(verified.member.achievementStats[`${channel}Verified`], true);
    assert.equal(verified.snapshot.wallet.balances.GC, channel === 'email' ? 0 : 150000, 'verification alone cannot credit a reward');
    assert.equal((await a.command({ type: 'claim-task', taskId: `verify-${channel}` })).result.ok, true);
    assert.equal((await a.command({ type: 'claim-task', taskId: `verify-${channel}` })).result.ok, false);
    assert.equal((await a.request('verification/check', { channel, challengeId: sent.result.challengeId, code: '123456' })).result.ok, false);
  }
  const state = await a.request('session'); assert.deepEqual(state.snapshot.wallet.balances, { GC: 250000, SC: 200 });
});

test('expired codes, too many attempts, provider failure and unavailable providers never verify a contact', async t => {
  const f = await fixture(t), a = f.client(); await a.register();
  const first = await a.request('verification/start', { channel: 'email' });
  for (let i = 0; i < 5; i++) assert.equal((await a.request('verification/check', { channel: 'email', challengeId: first.result.challengeId, code: '000000' })).result.ok, false);
  assert.equal((await a.request('verification/check', { channel: 'email', challengeId: first.result.challengeId, code: '123456' })).result.ok, false);
  f.advance(60001);
  const second = await a.request('verification/start', { channel: 'email' }); f.advance(600001);
  assert.equal((await a.request('verification/check', { channel: 'email', challengeId: second.result.challengeId, code: '123456' })).result.ok, false);
  assert.equal((await a.request('session')).member.achievementStats.emailVerified, false);
  const g = await fixture(t, { verification: { channels: ['email'], start: async () => { throw Error('private provider error'); } } }), b = g.client(); await b.register();
  assert.equal((await b.request('verification/start', { channel: 'phone', destination: '+12025550123' })).status, 503);
  const failed = await b.request('verification/start', { channel: 'email' }); assert.equal(failed.status, 502);
  assert.equal(JSON.stringify(failed).includes('private provider error'), false);
});

test('pending external approval cannot verify a logged-out account or a replaced challenge', async t => {
  let approve, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, { verification: { channels: ['email'], start: async () => randomUUID(), check: () => { entered(); return new Promise(resolve => { approve = resolve; }); } } });
  const a = f.client(); await a.register(); const player = a.playerId;
  const send = await a.request('verification/start', { channel: 'email' });
  const pending = a.request('verification/check', { channel: 'email', challengeId: send.result.challengeId, code: '123456' });
  await started; await a.request('logout', {}); approve(true);
  assert.equal((await pending).status, 401);
  assert.equal(f.api.store.read(player).member.achievementStats.emailVerified, false);
});

test('account credentials, progress, claims and ledger survive a database reopen', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cop-account-test-')), filename = path.join(directory, 'accounts.sqlite');
  const f = await fixture(t, { filename }), a = f.client(); await a.register('saved@example.test');
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('cop-account-test-'));
    return rm(directory, { recursive: true, force: true });
  });
  await f.event(round(a.playerId)); await a.command({ type: 'claim-task', taskId: 'limit-breaker-1' });
  const other = openServerAccounts(filename);
  try {
    const saved = other.findEmail('saved@example.test'); assert.equal(await passwordMatches('long-test-password', saved.credential), true);
    assert.equal(await passwordMatches('wrong-password', saved.credential), false);
    const state = other.read(saved.id); assert.equal(state.member.achievementStats.playSCUnits, 7000);
    assert.equal(state.member.taskClaims.includes('limit-breaker-1'), true); assert.deepEqual(state.wallet.balances, { GC: 2500, SC: 25 });
  } finally { other.close(); }
});

test('Twilio adapter uses provider verification IDs and approved status, and stays disabled without credentials', async () => {
  const calls = [], providerId = `VE${'a'.repeat(32)}`;
  let status = 'pending';
  const provider = createVerificationProvider({ accountSid: `AC${'a'.repeat(32)}`, authToken: 'test-token', serviceSid: `VA${'b'.repeat(32)}`, channels: ['email', 'phone'],
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ sid: providerId, status }) }; } });
  assert.equal(await provider.start('phone', '+12025550123'), providerId);
  assert.equal(calls[0].options.body.get('Channel'), 'sms'); assert.match(calls[0].url, /\/Verifications$/);
  assert.equal(await provider.check(providerId, '123456'), false);
  status = 'approved'; assert.equal(await provider.check(providerId, '123456'), true);
  assert.equal(calls.at(-1).options.body.get('VerificationSid'), providerId); assert.match(calls.at(-1).url, /\/VerificationCheck$/);
  assert.deepEqual(createVerificationProvider({ channels: ['email', 'phone'] }).channels, []);
});
