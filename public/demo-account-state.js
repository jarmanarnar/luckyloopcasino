import { createMemberState, claimDailyReward, claimTaskReward, recordGameVisit, normalizeNotificationReadIds } from './member-state.js';
import { createWalletState, formatBalance } from './wallet-state.js';
import { isProfilePhoto } from './profile-photo.js';
import { SPIN_PRIZES, spinStatus } from './spin-wheel-state.js';
import { recordAttendance } from './achievement-catalog.js';

export const ACCOUNT_DATABASE = 'luckyloopcasino-demo-account-v1';
export const ACCOUNT_KEY = 'primary';
const MAX_BALANCE = 999999999;
const copy = value => structuredClone(value);
const failed = reason => ({ ok: false, reason, amount: 0 });

function entry(account, { key, type, source, sourceId, title, currency, amount, at }) {
  return { id: `${account.playerId}:${key}`, playerId: account.playerId, operationKey: key,
    type, source, sourceId, title, currency, amountUnits: amount,
    balanceAfterUnits: account.wallet.balances[currency], status: 'posted', at };
}

export function createDemoAccount({ wallet, member, migrated = false } = {},
  { now = new Date(), playerId = `demo-${crypto.randomUUID()}` } = {}) {
  const at = new Date(now).toISOString();
  const account = { id: ACCOUNT_KEY, version: 1, playerId, isTest: true, createdAt: at, updatedAt: at,
    revision: 0, auth: null, wallet: createWalletState(wallet), member: createMemberState(member), ledger: [] };
  account.ledger = ['GC', 'SC'].map(currency => entry(account, {
    key: `opening:${currency}`, type: 'opening', source: migrated ? 'migration' : 'initial',
    sourceId: 'opening', title: migrated ? 'Balance carried over' : 'Starting demo balance',
    currency, amount: account.wallet.balances[currency], at,
  }));
  return account;
}

function calendarKey(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Called only inside the repository's serialized read/write transaction.
// Commands describe intent; they never replace data with a caller's stale snapshot.
export function applyAccountCommand(current, command, now = new Date()) {
  const at = new Date(now).toISOString();
  let next = copy(current);
  let result = { ok: true };
  const unchanged = value => ({ account: current, result: value });
  if (command.type === 'register') {
    if (current.auth?.email) return unchanged(failed('An account already exists in this browser. Please log in.'));
    next.auth = { email: command.email, credential: command.credential, registeredAt: at, signedIn: true };
  } else if (command.type === 'login') {
    if (!current.auth || current.auth.email !== command.email
      || JSON.stringify(current.auth.credential) !== JSON.stringify(command.credential)) {
      return unchanged(failed('Email or password does not match this account.'));
    }
    next.auth.signedIn = true;
  } else if (command.type === 'resume-demo') {
    if (current.isTest !== true || !current.auth?.email) {
      return unchanged(failed('Register an account first.'));
    }
    next.auth.signedIn = true;
  } else if (command.type === 'session-visit') {
    if (!current.auth?.signedIn) return unchanged(result);
    next.member = recordAttendance(current.member, now);
  } else if (command.type === 'logout') {
    if (!current.auth?.signedIn) return unchanged(result);
    next.auth.signedIn = false;
  } else if (command.type === 'delete-account') {
    if (current.isTest !== true || !current.auth?.signedIn) {
      return unchanged(failed('Log in to your demo account to delete it.'));
    }
    // Replace all account-owned data atomically, including the credential and
    // spin ledger. The revision below must keep increasing so open tabs adopt it.
    next = createDemoAccount({}, { now });
  } else if (command.type === 'claim-daily' || command.type === 'claim-task') {
    const daily = command.type === 'claim-daily';
    const key = daily ? `daily:${calendarKey(now)}` : `task:${command.taskId}`;
    if (current.ledger.some(item => item.operationKey === key)) {
      return unchanged(failed(daily ? 'Already collected today. Come back tomorrow.' : 'This reward has already been collected.'));
    }
    const outcome = daily ? claimDailyReward(current.member, now) : claimTaskReward(current.member, command.taskId, now);
    if (!outcome.result.ok) return unchanged(outcome.result);
    const rewards = outcome.result.rewards || { GC: outcome.result.amount };
    const credits = Object.entries(rewards);
    // Validate the whole bundle before committing either currency or the claim flag.
    if (!credits.length || credits.some(([currency, amount]) => !['GC', 'SC'].includes(currency)
      || !Number.isSafeInteger(amount) || amount <= 0 || current.wallet.balances[currency] + amount > MAX_BALANCE)) {
      return unchanged(failed('The demo balance could not be updated.'));
    }
    next.member = { ...outcome.state, history: current.member.history };
    const title = outcome.state.history.at(-1).title;
    const transactionIds = [];
    for (const [i, [currency, amount]] of credits.entries()) {
      next.wallet.balances[currency] += amount;
      const credit = entry(next, { key: i === 0 ? key : `${key}:${currency}`, type: 'bonus', source: daily ? 'daily-bonus' : 'task',
        sourceId: daily ? calendarKey(now) : command.taskId, title, currency, amount, at });
      next.ledger.push(credit); transactionIds.push(credit.id);
    }
    result = { ...outcome.result, rewards, transactionId: transactionIds[0], transactionIds };
  } else if (command.type === 'spin-wheel') {
    if (!current.auth?.signedIn) return unchanged(failed('Log in to spin the wheel.'));
    if (!spinStatus(current, now).available) return unchanged(failed('Your next free spin is not ready yet.'));
    const prize = Number.isInteger(command.index) && SPIN_PRIZES[command.index];
    if (!prize || current.wallet.balances[prize.currency] + prize.amount > MAX_BALANCE) {
      return unchanged(failed('The demo reward could not be added. Please try again later.'));
    }
    next.wallet.balances[prize.currency] += prize.amount;
    next.ledger.push(entry(next, { key: `wheel:${at}:${current.ledger.length}`, type: 'bonus', source: 'spin-wheel', sourceId: prize.id,
      title: 'Spin & Win', currency: prize.currency, amount: prize.amount, at }));
    result = { ok: true, prizeId: prize.id, index: command.index, transactionId: next.ledger.at(-1).id };
  } else if (command.type === 'currency') {
    if (!['GC', 'SC'].includes(command.currency)) return unchanged(failed('Unknown currency.'));
    if (current.wallet.currency === command.currency) return unchanged(result);
    next.wallet.currency = command.currency;
  } else if (command.type === 'profile') {
    const patch = command.patch || {};
    if (Object.hasOwn(patch, 'displayName') && (typeof patch.displayName !== 'string'
      || patch.displayName.trim().length < 2 || patch.displayName.trim().length > 24)) {
      return unchanged(failed('Use a display name with 2–24 characters.'));
    }
    if (Object.hasOwn(patch, 'avatar') && !['L', '∞', '★', '7', 'G', 'S'].includes(patch.avatar)) {
      return unchanged(failed('Choose one of the available avatars.'));
    }
    if (Object.hasOwn(patch, 'photo') && patch.photo !== null && !isProfilePhoto(patch.photo)) {
      return unchanged(failed('Choose a valid profile photo.'));
    }
    next.member.profile = { ...current.member.profile,
      ...(Object.hasOwn(patch, 'displayName') ? { displayName: patch.displayName.trim() } : {}),
      ...(Object.hasOwn(patch, 'avatar') ? { avatar: patch.avatar } : {}) };
    if (Object.hasOwn(patch, 'photo')) {
      if (patch.photo === null) delete next.member.profile.photo;
      else next.member.profile.photo = patch.photo;
    }
  } else if (command.type === 'settings') {
    for (const key of ['hideBalance', 'reducedMotion']) {
      if (Object.hasOwn(command.patch || {}, key)) next.member.settings[key] = command.patch[key] === true;
    }
  } else if (command.type === 'notifications-read') {
    const ids = normalizeNotificationReadIds(command.ids);
    if (!ids.length) return unchanged(result);
    next.member.notificationReadIds = normalizeNotificationReadIds([
      ...normalizeNotificationReadIds(current.member.notificationReadIds), ...ids,
    ]);
  } else if (command.type === 'favorite') {
    const id = command.gameId;
    if (typeof id !== 'string' || !command.catalogIds.includes(id)) return unchanged(failed('This game is unavailable.'));
    next.member.favorites = current.member.favorites.includes(id)
      ? current.member.favorites.filter(value => value !== id) : [...current.member.favorites, id];
  } else if (command.type === 'game-visit') {
    if (!command.game?.id) return unchanged(failed('This game is unavailable.'));
    next.member = recordGameVisit(current.member, command.game, now);
  } else if (command.type === 'page-visit') {
    if (current.member.visited.includes(command.pageId)) return unchanged(result);
    next.member.visited = [...current.member.visited, command.pageId];
  } else if (command.type === 'catalog') {
    const allowed = new Set(command.gameIds);
    next.member.favorites = current.member.favorites.filter(id => allowed.has(id));
    next.member.discoveredGameIds = current.member.discoveredGameIds.filter(id => allowed.has(id));
    next.member.history = current.member.history.filter(item => item.type !== 'game' || allowed.has(item.gameId));
    if (JSON.stringify(next.member) === JSON.stringify(current.member)) return unchanged(result);
  } else return unchanged(failed('Unknown account action.'));
  if (['register', 'login', 'resume-demo'].includes(command.type)) next.member = recordAttendance(next.member, now);
  if (JSON.stringify(next) === JSON.stringify(current)) return unchanged(result);
  next.revision = current.revision + 1;
  next.updatedAt = at;
  return { account: next, result };
}

// UI activity is a projection. The structured ledger is retained independently
// of the 200-entry legacy browsing history and is never parsed from display text.
export function accountMemberState(account) {
  const member = copy(account.member);
  delete member.notificationReadIds;
  const transactions = account.ledger.map(item => ({ ...copy(item),
    type: item.type === 'bonus' ? 'reward' : 'transaction', transactionId: item.id,
    detail: `+${formatBalance(item.currency, item.amountUnits)} ${item.currency} · Balance after: ${formatBalance(item.currency, item.balanceAfterUnits)} ${item.currency}` }));
  return { ...member, playerId: account.playerId, createdAt: account.createdAt,
    history: [...member.history, ...transactions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) };
}
