// Stable page identities shared by routing and the member-area shell.
export const FEATURE_PAGES = Object.freeze(Object.fromEntries([
  ['daily-bonus', 'Daily Bonus', false],
  ['vip-club', 'VIP Club', false],
  ['rank-system', 'Rank System', false],
  ['free-money', 'Free Money', false],
  ['invite-friends', 'Invite Friends', false],
  ['coinback', 'CoinBack'],
  ['partners', 'Partners'],
  ['affiliate-program', 'Affiliate Program', false],
  ['profile', 'My Profile', false],
  ['history', 'Activity History', false],
  ['notifications', 'Notifications', true, false],
  ['support', 'Live Support'],
  ['blog', 'Blog'],
  ['settings', 'Settings'],
  ['redeem', 'Redeem'],
].map(([id, title, showHeader = true, showBack = showHeader]) => [id, Object.freeze({ id, title, showHeader, showBack })])));

export const isFeaturePage = id => Object.hasOwn(FEATURE_PAGES, id);
