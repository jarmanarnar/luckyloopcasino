import { randomUUID, randomInt } from 'node:crypto';
import { openServerAccounts, passwordCredential, passwordMatches, tokenHash } from './account-repository.mjs';
import { createVerificationProvider } from './verification-provider.mjs';
import { applyGameEvent, validGameSignature } from './game-events.mjs';
import { applyAccountCommand, accountMemberState, createDemoAccount } from '../public/demo-account-state.js';
import { normalizeDemoEmail, validDemoEmail } from '../public/demo-credentials.js';
import { SPIN_PRIZES } from '../public/spin-wheel-state.js';
import { ACHIEVEMENTS } from '../public/achievement-catalog.js';

const prefix = '/luckyloopcasino/api/';
const cookieName = 'cop_session';
const failure = (reason, status = 400) => ({ ok: false, reason, status });
const verifiedKey = channel => `${channel}Verified`;
const validChannel = channel => ['email', 'phone'].includes(channel);

export function createAccountApi({ filename, origin, gameEventSecret = '', verification = createVerificationProvider(),
  games = [], now = () => Date.now() }) {
  const address = new URL(origin);
  if (address.origin !== origin || (address.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname))) {
    throw new Error('ACCOUNT_ORIGIN must be an exact HTTPS origin, or loopback for local development.');
  }
  if (gameEventSecret && gameEventSecret.length < 32) throw new Error('GAME_EVENT_SECRET must contain at least 32 characters.');
  const store = openServerAccounts(filename);
  const catalog = new Map(games.map(game => [game.id, game]));
  const taskIds = new Set(ACHIEVEMENTS.map(task => task.id));
  const capabilities = { server: true, verification: Object.fromEntries(['email', 'phone'].map(channel => [channel, verification.channels.includes(channel)])), gameEvents: Boolean(gameEventSecret) };
  const guest = createDemoAccount({}, { playerId: 'server-guest', now: new Date(0) });
  const cookies = token => `${cookieName}=${token}; Path=/luckyloopcasino/; HttpOnly; SameSite=Strict; Max-Age=${token ? 604800 : 0}${address.protocol === 'https:' ? '; Secure' : ''}`;
  const sessionToken = request => (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
  function project(account) {
    const { auth, ...snapshot } = account || guest;
    return { ...structuredClone(snapshot), serverManaged: true, signedIn: Boolean(account),
      identity: account ? { email: auth.email, registeredAt: auth.registeredAt } : null };
  }
  const payload = (account, result = { ok: true }) => ({ snapshot: project(account), member: accountMemberState(account || guest), capabilities, result });
  const send = (response, status, body, headers = {}) => response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers,
  }).end(JSON.stringify(body));
  async function readBody(request) {
    if (!(request.headers['content-type'] || '').startsWith('application/json')) throw failure('Use JSON for account requests.', 415);
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 1024 * 1024) throw failure('Request is too large.', 413); chunks.push(chunk); }
    const raw = Buffer.concat(chunks);
    let body; try { body = JSON.parse(raw.toString('utf8')); } catch { throw failure('Invalid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure('Invalid request.');
    return { raw, body };
  }
  function limit(key, count, duration) {
    if (!store.allow(key, count, duration, now())) throw failure('Too many attempts. Please try again later.', 429);
  }
  function command(body) {
    const args = body.command || {};
    switch (args.type) {
      case 'claim-task': return taskIds.has(args.taskId) ? { type: args.type, taskId: args.taskId } : null;
      case 'spin-wheel': return { type: args.type, index: randomInt(SPIN_PRIZES.length) };
      case 'currency': return { type: args.type, currency: args.currency };
      case 'profile': case 'settings': return { type: args.type, patch: args.patch };
      case 'notifications-read': return { type: args.type, ids: args.ids };
      case 'favorite': return { type: args.type, gameId: args.gameId, catalogIds: [...catalog.keys()] };
      case 'game-visit': return catalog.has(args.gameId) ? { type: args.type, game: catalog.get(args.gameId) } : null;
      case 'page-visit': return typeof args.pageId === 'string' && /^[a-z-]{1,64}$/.test(args.pageId) ? { type: args.type, pageId: args.pageId } : null;
      default: return null;
    }
  }
  async function startVerification(account, body) {
    const channel = body.channel;
    if (!validChannel(channel) || !capabilities.verification[channel]) return failure('This verification service is not connected yet.', 503);
    if (account.member.achievementStats[verifiedKey(channel)]) return { ok: true, verified: true };
    const destination = channel === 'email' ? account.auth.email : typeof body.destination === 'string' ? body.destination.trim() : '';
    if (channel === 'phone' && !/^\+[1-9]\d{7,14}$/.test(destination)) return failure('Enter your phone number with its country code.');
    limit(`send:${account.playerId}:${channel}`, 1, 60000);
    limit(`send-account:${account.playerId}`, 10, 3600000);
    limit(`send-contact:${channel}:${tokenHash(destination)}`, 5, 3600000);
    const id = randomUUID(), expires = now() + 600000;
    store.run('INSERT OR REPLACE INTO challenges VALUES (?, ?, ?, ?, NULL, ?, 0)', account.playerId, channel, id, destination, expires);
    try {
      const providerId = await verification.start(channel, destination);
      const updated = store.run('UPDATE challenges SET provider_id = ? WHERE player_id = ? AND channel = ? AND id = ?', providerId, account.playerId, channel, id);
      return updated.changes ? { ok: true, challengeId: id, expiresAt: new Date(expires).toISOString() } : failure('Verification changed. Please request a new code.', 409);
    } catch {
      store.run('DELETE FROM challenges WHERE player_id = ? AND channel = ? AND id = ?', account.playerId, channel, id);
      return failure('The code could not be sent. Please try again later.', 502);
    }
  }
  async function checkVerification(account, body, token) {
    const channel = body.channel;
    if (!validChannel(channel) || !capabilities.verification[channel]) return failure('This verification service is not connected yet.', 503);
    if (!/^\d{4,10}$/.test(body.code || '') || typeof body.challengeId !== 'string') return failure('Enter the code you received.');
    limit(`check:${account.playerId}`, 15, 600000);
    const challenge = store.transaction(() => {
      const item = store.one('SELECT * FROM challenges WHERE player_id = ? AND channel = ?', account.playerId, channel);
      if (!item || item.id !== body.challengeId || !item.provider_id || item.expires <= now() || item.attempts >= 5) return null;
      store.run('UPDATE challenges SET attempts = attempts + 1 WHERE player_id = ? AND channel = ?', account.playerId, channel);
      return item;
    });
    if (!challenge) return failure('The code expired or too many attempts were made. Request a new code.');
    let approved;
    try { approved = await verification.check(challenge.provider_id, body.code); }
    catch { return failure('Verification could not be checked. Please try again later.', 502); }
    if (!approved) return failure('The code is incorrect or expired.');
    return store.transaction(() => {
      if (store.session(token, now()) !== account.playerId) return failure('Log in again to finish verification.', 401);
      const current = store.one('SELECT * FROM challenges WHERE player_id = ? AND channel = ?', account.playerId, channel);
      if (!current || current.id !== challenge.id || current.expires <= now()) return failure('Verification changed or expired. Request a new code.', 409);
      const contact = store.one('SELECT player_id FROM verified_contacts WHERE channel = ? AND destination = ?', channel, challenge.destination);
      if (contact && contact.player_id !== account.playerId) return failure('This contact is already associated with an account.', 409);
      const next = store.read(account.playerId);
      if (!next || (channel === 'email' && next.auth.email !== challenge.destination)) return failure('Your account changed. Please start again.', 409);
      store.run('INSERT OR IGNORE INTO verified_contacts VALUES (?, ?, ?)', channel, challenge.destination, account.playerId);
      next.member.achievementStats[verifiedKey(channel)] = true;
      next.revision++; next.updatedAt = new Date(now()).toISOString(); store.save(next);
      store.run('DELETE FROM challenges WHERE player_id = ? AND channel = ?', account.playerId, channel);
      return { ok: true, verified: true };
    });
  }
  return { store, capabilities, close: () => store.close(),
    async handle(request, response, pathname) {
      if (!pathname.startsWith(prefix)) return false;
      try {
        const route = pathname.slice(prefix.length), token = sessionToken(request);
        if (request.headers.host !== address.host) throw failure('Invalid host.', 403);
        if (request.method === 'POST' && route !== 'game-events' && request.headers.origin !== origin) throw failure('Invalid request origin.', 403);
        if (!['GET', 'POST'].includes(request.method)) throw failure('Method not allowed.', 405);
        const playerId = store.session(token, now());
        if (route === 'session' && request.method === 'GET') {
          const outcome = playerId ? store.change(playerId, account => applyAccountCommand(account, { type: 'session-visit' }, new Date(now()))) : null;
          send(response, 200, payload(outcome?.account)); return true;
        }
        if (request.method !== 'POST') throw failure('Not found.', 404);
        const { raw, body } = await readBody(request);
        if (route === 'game-events') {
          if (!gameEventSecret) throw failure('Game events are not configured.', 503);
          if (!validGameSignature(raw, request.headers['x-cop-timestamp'], request.headers['x-cop-signature'], gameEventSecret, now())) throw failure('Invalid event signature.', 401);
          const result = applyGameEvent(store, body, new Date(now()));
          send(response, result.status || 200, result); return true;
        }
        if (route === 'register' || route === 'login') {
          const email = normalizeDemoEmail(body.email), password = body.password;
          limit(`auth-ip:${request.socket.remoteAddress}`, 30, 900000);
          if (!validDemoEmail(email) || typeof password !== 'string' || password.length < 8 || password.length > 256) throw failure('Enter a valid email and a password with 8–256 characters.');
          limit(`auth-email:${tokenHash(email)}`, 10, 900000);
          let account;
          if (route === 'register') {
            if (body.accepted !== true) throw failure('Please confirm the terms to continue.');
            if (store.findEmail(email)) throw failure('Unable to register this account. Try logging in.', 409);
            const credential = await passwordCredential(password);
            try { account = store.create(email, credential, new Date(now())); }
            catch { throw failure('Unable to register this account. Try logging in.', 409); }
          } else {
            const saved = store.findEmail(email);
            if (!await passwordMatches(password, saved?.credential)) throw failure('Email or password does not match this account.', 401);
            account = store.change(saved.id, current => applyAccountCommand(current, { type: 'session-visit' }, new Date(now())))?.account;
            if (!account) throw failure('Email or password does not match this account.', 401);
          }
          store.revoke(token);
          send(response, 200, payload(account), { 'Set-Cookie': cookies(store.issueSession(account.playerId, now())) }); return true;
        }
        if (!playerId) { send(response, 401, payload(null, failure('Log in to continue.', 401))); return true; }
        let account = store.read(playerId);
        if (body.playerId !== playerId) { send(response, 409, payload(account, failure('Your account changed. Please try again.', 409))); return true; }
        limit(`action:${playerId}`, 120, 60000);
        let result;
        if (route === 'logout') {
          store.revoke(token); send(response, 200, payload(null), { 'Set-Cookie': cookies('') }); return true;
        } else if (route === 'delete-account') {
          store.run('DELETE FROM accounts WHERE id = ?', playerId); send(response, 200, payload(null), { 'Set-Cookie': cookies('') }); return true;
        } else if (route === 'command') {
          const intent = command(body);
          if (!intent) throw failure('Unknown account action.');
          result = store.change(playerId, current => applyAccountCommand(current, intent, new Date(now())))?.result || failure('Your account changed.', 409);
        } else if (route === 'verification/start') result = await startVerification(account, body);
        else if (route === 'verification/check') result = await checkVerification(account, body, token);
        else throw failure('Not found.', 404);
        // A request awaiting an external provider cannot resurrect a logged-out session.
        account = store.session(token, now()) === playerId ? store.read(playerId) : null;
        send(response, result.status || 200, payload(account, result));
      } catch (error) {
        send(response, error.status || 500, { result: { ok: false, reason: error.status ? error.reason : 'The account service could not complete the request.' } });
      }
      return true;
    },
  };
}
