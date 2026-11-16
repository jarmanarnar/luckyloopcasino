// Sample rewards for the local demo. No purchase or real-money prize is involved.
const DAY_MS = 24 * 60 * 60 * 1000;
export const SPIN_DURATION = 5200;
export const SPIN_PRIZES = Object.freeze([
  { id: 'gold-100k', currency: 'GC', amount: 100000, label: '100K', name: 'Gold Coins' },
  { id: 'super-3', currency: 'SC', amount: 300, label: '3', name: 'Super Coins' },
  { id: 'gold-400k', currency: 'GC', amount: 400000, label: '400K', name: 'Gold Coins' },
  { id: 'super-5', currency: 'SC', amount: 500, label: '5', name: 'Super Coins' },
  { id: 'super-2', currency: 'SC', amount: 200, label: '2', name: 'Super Coins' },
  { id: 'gold-200k', currency: 'GC', amount: 200000, label: '200K', name: 'Gold Coins' },
  { id: 'super-1', currency: 'SC', amount: 100, label: '1', name: 'Super Coins' },
  { id: 'super-4', currency: 'SC', amount: 400, label: '4', name: 'Super Coins' },
].map(Object.freeze));

export function spinStatus(account, now = Date.now()) {
  const spins = account.ledger.filter(item => item.source === 'spin-wheel');
  const registered = new Date(account.auth?.registeredAt ?? account.identity?.registeredAt ?? account.createdAt);
  const current = new Date(now);
  // Grant one on registration, then one at each local midnight. Count calendar
  // dates rather than elapsed 24-hour periods so DST days still grant only one.
  const calendarDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
  const days = Math.max(0, calendarDay(current) - calendarDay(registered));
  const spinsAvailable = Math.max(0, 1 + days - spins.length);
  const nextAt = +new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
  const remaining = Math.max(0, nextAt - current.getTime());
  return { available: spinsAvailable > 0, spinsAvailable, remaining, nextAt, last: spins.at(-1) };
}

export function spinCountdown(remaining) {
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function spinClockParts(remaining) {
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0'));
}

// A gentle push, a brief steady turn, then a long coast. Integrating velocity
// avoids a sudden stop, reversal, or a high-speed burst at the start.
export function spinProgress(value) {
  const t = Math.max(0, Math.min(1, value)), acceleration = .06, cruiseEnd = .13;
  const coastDuration = 1 - cruiseEnd;
  const area = acceleration / 2 + cruiseEnd - acceleration + coastDuration / 2;
  if (t < acceleration) return (t - acceleration / Math.PI * Math.sin(Math.PI * t / acceleration)) / 2 / area;
  if (t < cruiseEnd) return (acceleration / 2 + t - acceleration) / area;
  const coast = t - cruiseEnd;
  return (acceleration / 2 + cruiseEnd - acceleration + (coast + coastDuration / Math.PI * Math.sin(Math.PI * coast / coastDuration)) / 2) / area;
}

// Each segment is centered on its index * 45 degrees; the pointer stays at 12 o'clock.
export function spinLanding(index, current = 0) {
  const target = (360 - index * 360 / SPIN_PRIZES.length) % 360;
  const angle = ((current % 360) + 360) % 360;
  return current + 360 * 3 + (target - angle + 360) % 360;
}
