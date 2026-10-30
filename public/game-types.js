// Local editorial type mapping: the public Playin JSON has studio/title data,
// but no game-type taxonomy. Explicit non-slot exceptions stay separate from
// the default slot collection. This does not add popularity/live/release claims.
export const GAME_TYPES = [
  { id: 'slots', title: 'Slots' },
  { id: 'tap', title: 'Tap Games' },
  { id: 'table', title: 'Table Games' },
  { id: 'video-poker', title: 'Video Poker' },
];

// BTG describes Tapcards as tap-and-reveal, scratch-card-style instant games:
// https://www.bigtimegaming.com/news/tapcards
// https://www.bigtimegaming.com/games/category/Tapcards
// Tap-A-Roo is grouped here by its tap-based prize mechanics, not its studio:
// https://playin.com/games/blood-suckers-tap-a-roo
// https://playin.com/games/gonzo-s-quest-tap-a-roo
// https://playin.com/games/cash-volt-tap-a-roo
const TAP_IDS = new Set([
  'monopolytsgen3v1',
  'extrachilrdsv186',
  'millionaicardsv1',
  'bigbuckstcardsv1',
  'bonanzatacardsv1',
  'gonzosquesttapar',
  'bloodsuckerstapa',
  'starbursttaparoo',
  'cashvolttaparoo0',
  'greatpyramidtapa',
  'rainbowjackpotst',
  'dragonslucktapar',
  'mysteryfruittapa',
]);

// Previously reviewed table games are permanently excluded. Keep this format
// available for future approved titles, separate from the default slot category.
const TABLE_IDS = new Set([
]);

// Explicitly described as single-player video poker, not a reel slot:
// https://netent.com/games/jacks-or-better-double-up
const VIDEO_POKER_IDS = new Set([
]);

export function getGameTypeId(game) {
  if (TAP_IDS.has(game.id)) return 'tap';
  if (TABLE_IDS.has(game.id)) return 'table';
  if (VIDEO_POKER_IDS.has(game.id)) return 'video-poker';
  return 'slots';
}
