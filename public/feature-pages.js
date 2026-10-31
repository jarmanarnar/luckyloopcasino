// Stable page identities shared by routing and the member-area shell.
export const FEATURE_PAGES = Object.freeze(Object.fromEntries([
  ['lounge', 'Lounge', 'Your rewards, membership and community in one place.'],
  ['bonus-hub', 'Bonus Hub', 'Keep track of your rewards and what is available next.'],
  ['daily-bonus', 'Daily Bonus', 'A daily check-in for your local demo account.'],
  ['vip-club', 'VIP Club', 'Explore the proposed membership experience.'],
  ['rank-system', 'Rank System', 'Your discovery journey, one game at a time.'],
  ['free-money', 'Free Money', 'Try simple tasks and collect demo Gold Coins.'],
  ['missions', 'Missions', 'A few things to try around the platform.'],
  ['invite-friends', 'Invite Friends', 'A preview of your referral area.'],
  ['coinback', 'CoinBack', 'Your proposed rewards balance and activity.'],
  ['promotions', 'Promotions', 'Discover the places to find rewards.'],
  ['partners', 'Partners', 'Referrals and partnerships, together.'],
  ['affiliate-program', 'Affiliate Program', 'A place for future creators and partners.'],
  ['crypto-earn', 'Crypto & Earn', 'Explore the proposed earn area.'],
  ['profile', 'My Profile', 'Make this local account your own.'],
  ['history', 'Activity History', 'Games opened and demo rewards collected in this browser.'],
  ['favorites', 'Favorites', 'Keep your favorite games close.'],
  ['notifications', 'Notifications', 'Updates from your local account.'],
  ['support', 'Live Support', 'Quick answers and a preview of the support experience.'],
  ['blog', 'Blog', 'Guides to help you explore the platform.'],
  ['settings', 'Settings', 'Your display preferences, saved in this browser.'],
  ['redeem', 'Redeem', 'A preview of the redemption area.'],
].map(([id, title, description]) => [id, Object.freeze({ id, title, description })])));

export const isFeaturePage = id => Object.hasOwn(FEATURE_PAGES, id);
