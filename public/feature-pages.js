// Stable page identities shared by routing and the member-area shell.
export const FEATURE_PAGES = Object.freeze(Object.fromEntries([
  ['achievements', 'Achievements', false],
  ['profile', 'My Profile', false],
  ['history', 'Activity History', false],
  ['support', 'Live Support'],
  ['settings', 'Settings'],
].map(([id, title, showHeader = true]) => [id, Object.freeze({ id, title, showHeader })])));

export const isFeaturePage = id => Object.hasOwn(FEATURE_PAGES, id);
