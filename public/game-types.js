// Formats are distinct from provider, theme and delivery mode (live dealer/RNG).
// Explicit card/roulette types are verified against their official game pages.
// A source "vertical" flag alone is not evidence of a live-dealer stream.
export const GAME_TYPES = [
  { id: 'slots', title: 'Slots' },
  { id: 'tap', title: 'Tap Games' },
  { id: 'instant-win', title: 'Instant Win' },
  { id: 'scratchcards', title: 'Scratchcards' },
  { id: 'crash', title: 'Crash' },
  { id: 'blackjack', title: 'Blackjack' },
  { id: 'roulette', title: 'Roulette' },
  { id: 'baccarat', title: 'Baccarat' },
  { id: 'poker', title: 'Casino Poker' },
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

const CARD_AND_TABLE_TYPES = new Map([
  ['blackjack3ne0000', 'blackjack'],
  ['ameriroulette3ne', 'roulette'],
  ['roulette2advne00', 'roulette'],
  ['roulettesne00000', 'roulette'],
  ['baccarat2ne00000', 'baccarat'],
  ['casinoholdemne00', 'poker'],
  ['jacksmultihandn1', 'video-poker'],
]);

// https://playin.com/games/blackjack
// https://playin.com/games/american-roulette
// https://playin.com/games/roulette-advanced
// https://playin.com/games/roulette-touch
// https://playin.com/games/baccarat-professional-series-1
// https://playin.com/games/casino-hold-em-poker
// https://playin.com/games/jacks-or-better-double-up
export function getGameTypeId(game) {
  if (game.providerId === 'hacksaw-gaming' && ['slots', 'instant-win', 'scratchcards', 'crash'].includes(game.formatId)) return game.formatId;
  if (TAP_IDS.has(game.id)) return 'tap';
  return CARD_AND_TABLE_TYPES.get(game.id) || 'slots';
}

export function isTableGame(game) {
  return ['blackjack', 'roulette', 'baccarat', 'poker'].includes(getGameTypeId(game));
}
