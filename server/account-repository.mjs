import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createDemoAccount, applyAccountCommand } from '../public/demo-account-state.js';

const derive = promisify(scrypt);
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export async function passwordCredential(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}
export async function passwordMatches(password, credential) {
  const [salt, hash] = (credential || '').split(':');
  // A missing account still performs the expensive derivation.
  const actual = await derive(password, salt || 'missing-account', 64);
  return Boolean(hash && hash.length === 128 && timingSafeEqual(actual, Buffer.from(hash, 'hex')));
}

export function openServerAccounts(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, credential TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rounds (provider TEXT NOT NULL, round_id TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, status TEXT NOT NULL, payload TEXT, PRIMARY KEY(provider, round_id));
    CREATE TABLE IF NOT EXISTS challenges (player_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, channel TEXT NOT NULL, id TEXT NOT NULL, destination TEXT NOT NULL, provider_id TEXT, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(player_id, channel));
    CREATE TABLE IF NOT EXISTS verified_contacts (channel TEXT NOT NULL, destination TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, PRIMARY KEY(channel, destination));
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const read = id => { const row = one('SELECT state FROM accounts WHERE id = ?', id); return row ? JSON.parse(row.state) : null; };
  const save = account => run('UPDATE accounts SET state = ? WHERE id = ?', JSON.stringify(account), account.playerId);
  return { db, one, run, transaction, read, save,
    create(email, credential, now = new Date()) {
      return transaction(() => {
        const initial = createDemoAccount({}, { now, playerId: `member-${randomUUID()}` });
        const { account } = applyAccountCommand(initial, { type: 'register', email, credential: null }, now);
        run('INSERT INTO accounts VALUES (?, ?, ?, ?)', account.playerId, email, credential, JSON.stringify(account));
        return account;
      });
    },
    findEmail: email => one('SELECT id, credential FROM accounts WHERE email = ?', email),
    issueSession(playerId, now) {
      const token = randomBytes(32).toString('base64url');
      run('DELETE FROM sessions WHERE expires <= ?', now);
      run('INSERT INTO sessions VALUES (?, ?, ?)', tokenHash(token), playerId, now + 7 * 86400000);
      return token;
    },
    session(token, now) { return token ? one('SELECT player_id FROM sessions WHERE hash = ? AND expires > ?', tokenHash(token), now)?.player_id : null; },
    revoke: token => { if (token) run('DELETE FROM sessions WHERE hash = ?', tokenHash(token)); },
    change(id, fn) {
      return transaction(() => {
        const account = read(id);
        if (!account) return null;
        const outcome = fn(account);
        if (outcome.account !== account) save(outcome.account);
        return outcome;
      });
    },
    allow(key, limit, windowMs, now) {
      return transaction(() => {
        run('DELETE FROM rate_limits WHERE expires <= ?', now);
        const saved = one('SELECT count FROM rate_limits WHERE key = ?', key);
        if (saved?.count >= limit) return false;
        if (saved) run('UPDATE rate_limits SET count = count + 1 WHERE key = ?', key);
        else run('INSERT INTO rate_limits VALUES (?, 1, ?)', key, now + windowMs);
        return true;
      });
    },
    close: () => db.close(),
  };
}
