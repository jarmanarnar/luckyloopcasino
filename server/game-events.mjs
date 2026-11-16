import { createHmac, timingSafeEqual } from 'node:crypto';

export function validGameSignature(raw, timestamp, signature, secret, now = Date.now()) {
  if (!secret || !/^\d{10}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/.test(signature || '')
    || Math.abs(now - Number(timestamp) * 1000) > 300000) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

const validId = value => typeof value === 'string' && /^[\w:.-]{1,160}$/.test(value);
const units = value => Number.isSafeInteger(value) && value >= 0 && value <= 999999999;
export function applyGameEvent(store, event, now = new Date()) {
  if (!event || !validId(event.provider) || !validId(event.roundId) || !validId(event.playerId)
    || !['round.settled', 'round.reversed'].includes(event.type)) return { ok: false, status: 400, reason: 'Invalid round event.' };
  let payload = null;
  if (event.type === 'round.settled') {
    if (!['GC', 'SC'].includes(event.currency) || !units(event.wagerUnits) || !units(event.playSCUnits)
      || !units(event.loyaltySCUnits) || event.playSCUnits > event.wagerUnits || event.loyaltySCUnits > event.wagerUnits
      || (event.currency === 'GC' && (event.playSCUnits !== 0 || event.loyaltySCUnits !== 0))) {
      return { ok: false, status: 400, reason: 'Invalid qualifying amounts.' };
    }
    // The trusted operator adapter supplies independently qualified play and loyalty amounts.
    // Neither a browser event nor a game launch can reach this reducer.
    payload = JSON.stringify({ currency: event.currency, wagerUnits: event.wagerUnits,
      playSCUnits: event.playSCUnits, loyaltySCUnits: event.loyaltySCUnits });
  }
  return store.transaction(() => {
    const account = store.read(event.playerId);
    if (!account) return { ok: false, status: 404, reason: 'Unknown player.' };
    const saved = store.one('SELECT * FROM rounds WHERE provider = ? AND round_id = ?', event.provider, event.roundId);
    if (saved && saved.player_id !== event.playerId) return { ok: false, status: 409, reason: 'Round belongs to another player.' };
    if (event.type === 'round.settled' && saved) {
      if (saved.payload && saved.payload !== payload) return { ok: false, status: 409, reason: 'Round data conflicts with the original event.' };
      return { ok: true, duplicate: true };
    }
    if (event.type === 'round.reversed' && saved?.status === 'reversed') return { ok: true, duplicate: true };
    const previous = saved?.payload ? JSON.parse(saved.payload) : { playSCUnits: 0, loyaltySCUnits: 0 };
    const stats = account.member.achievementStats;
    for (const key of ['playSCUnits', 'loyaltySCUnits']) {
      const delta = event.type === 'round.settled' ? event[key] : -previous[key];
      if (!Number.isSafeInteger(stats[key] + delta) || stats[key] + delta < 0) return { ok: false, status: 409, reason: 'Progress total is invalid.' };
    }
    if (event.type === 'round.settled') {
      store.run('INSERT INTO rounds VALUES (?, ?, ?, ?, ?)', event.provider, event.roundId, event.playerId, 'settled', payload);
    } else if (saved) {
      store.run("UPDATE rounds SET status = 'reversed' WHERE provider = ? AND round_id = ?", event.provider, event.roundId);
    } else {
      // A reversal may arrive before its settlement. Keep a tombstone to reject the late credit.
      store.run('INSERT INTO rounds VALUES (?, ?, ?, ?, NULL)', event.provider, event.roundId, event.playerId, 'reversed');
    }
    for (const key of ['playSCUnits', 'loyaltySCUnits']) stats[key] += event.type === 'round.settled' ? event[key] : -previous[key];
    account.revision++; account.updatedAt = new Date(now).toISOString(); store.save(account);
    return { ok: true };
  });
}
