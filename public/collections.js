import { GAMES } from './catalog.js';
import { GAME_TYPES, getGameTypeId } from './game-types.js';

// Game format and editorial collections are separate from the studio/provider.
// Format mapping is documented in game-types.js. The themed collections make
// no popularity or release-date claims; a game can belong to several of them.
export const CATEGORIES = [
  { id: 'all', title: 'All Games', description: 'Browse every game type.' },
  { id: 'picks', title: 'Our Picks', description: 'A handpicked selection for you to try and review.' },
  ...GAME_TYPES,
  { id: 'megaways', title: 'Megaways', description: 'Explore the Megaways collection.' },
  { id: 'jackpot', title: 'Jackpot Picks', description: 'Demo titles from the Jackpot collection.' },
  { id: 'fruit', title: 'Fruit Slots', description: 'Fruit-themed titles and collections.' },
  { id: 'adventure', title: 'Adventure', description: 'Explore temples, jungles, pirates and treasure.' },
  { id: 'spooky', title: 'Spooky Spins', description: 'A handpicked collection of ghosts, witches and spooky themes.' },
];

// Candidate picks for the user's own review, not a responsiveness whitelist.
// Nip Tuck stays first as the previously confirmed choice.
const PICK_IDS = [
  'niptuck000000000',
  'dragonsluck00000',
  'bloodsuckerstapa',
  'freakshowrevelat',
  'ouija00000000000',
  'SanQuentin',
  'bonanzatacardsv1',
  'starbursttaparoo',
  'gopnik0000000000',
  'gonzosqumegaways',
  'monopolymneyv196',
  'cashvolttaparoo0',
  'SixFeetUnder',
  'extrachilrdsv186',
  'gonzosquesttapar',
];
const picks = new Set(PICK_IDS);

// Keep this list explicit: a title containing "blood" alone is not enough
// to infer a Halloween theme (e.g. Blood Diamond and Tanked are excluded).
const SPOOKY_IDS = new Set([
  'ouija00000000000', 'bloodsuckerstapa',
  'spookycarnival00', 'transylvanianigh', 'bloodsuckersmega',
  'draculaawakening', 'luckyhalloween00',
  'freakshowrevelat', 'BookOfShadows',
]);

// Jackpot membership is based only on the official title naming Jackpot,
// not on a claim that a public demo participates in a funded jackpot pool.
const rules = {
  ...Object.fromEntries(GAME_TYPES.map(type => [type.id, game => getGameTypeId(game) === type.id])),
  picks: game => picks.has(game.id),
  megaways: game => /\bmegaways\b/i.test(game.title),
  jackpot: game => /\bjackpots?\b/i.test(game.title),
  fruit: game => /fruit|berryburst|go bananas/i.test(game.title),
  adventure: game => /gonzo|gonzita|pirate|treasure|jungle|temple|pyramid|aztec|atlantis|tomb of|dungeon quest/i.test(game.title),
  spooky: game => SPOOKY_IDS.has(game.id),
};

const gamesById = new Map(GAMES.map(game => [game.id, game]));
const collections = new Map(CATEGORIES.map(category => [category.id,
  category.id === 'all' ? GAMES
    : category.id === 'picks' ? PICK_IDS.map(id => gamesById.get(id)).filter(Boolean)
      : GAMES.filter(rules[category.id]),
]));

export function getGameCategoryIds(game) {
  return ['all', ...CATEGORIES.filter(category => category.id !== 'all' && rules[category.id](game)).map(category => category.id)];
}

export function getGamesForCategory(id) {
  return collections.get(id) || [];
}
