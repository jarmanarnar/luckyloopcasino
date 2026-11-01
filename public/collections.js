import { GAMES } from './catalog.js';
import { GAME_TYPES, getGameTypeId, isTableGame } from './game-types.js';
import { GAME_RELEASES } from './game-releases.js';
export { GAME_RELEASES, RELEASES_VERIFIED_ON } from './game-releases.js';

// Game format and editorial collections are separate from the studio/provider.
// Format mapping is documented in game-types.js. The lobby navigation is a
// deliberately small set; existing editorial collections remain addressable.
export const CATEGORIES = [
  { id: 'popular', title: 'Popular', description: 'A curated selection from the current demo catalog.' },
  { id: 'slots', title: 'Slots', description: 'Browse the slot games in the catalog.' },
  { id: 'tap', title: 'Tap Games', description: 'Tap-and-reveal games and Tapcards.' },
  { id: 'instant-win', title: 'Instant Win', description: 'Instant games from the provider catalog.' },
  { id: 'scratchcards', title: 'Scratchcards', description: 'Reveal-and-scratch games.' },
  { id: 'crash', title: 'Crash', description: 'Crash games from the provider catalog.' },
  { id: 'table', title: 'Table Games', description: 'Blackjack, roulette, baccarat and casino poker.' },
  { id: 'video-poker', title: 'Video Poker', description: 'Single-player video poker games.' },
  { id: 'new-releases', title: 'New Releases', description: 'Recently released titles with verified provider release dates.' },
];

export const LEGACY_CATEGORIES = [
  { id: 'spooky', title: 'Spooky Spins', description: 'A handpicked collection of ghosts, witches and spooky themes.' },
  { id: 'picks', title: 'Editor’s Favorites', description: 'A handpicked selection for you to try and review.' },
  ...GAME_TYPES,
  { id: 'megaways', title: 'Megaways', description: 'Explore the Megaways collection.' },
  { id: 'jackpot', title: 'Jackpot Picks', description: 'Demo titles from the Jackpot collection.' },
  { id: 'fruit', title: 'Fruit Slots', description: 'Fruit-themed titles and collections.' },
  { id: 'adventure', title: 'Adventure', description: 'Explore temples, jungles, pirates and treasure.' },
];

const allCategories = [...CATEGORIES, ...LEGACY_CATEGORIES.filter(category => !CATEGORIES.some(item => item.id === category.id))];
export const FILTER_CATEGORIES = [...CATEGORIES, ...GAME_TYPES.filter(type => !CATEGORIES.some(category => category.id === type.id))];

// General release dates cover the entire active catalog, with per-game source provenance.
export function getGameReleaseDate(gameOrId) {
  return GAME_RELEASES[typeof gameOrId === 'string' ? gameOrId : gameOrId?.id]?.date || '';
}

// Editorial starter selection for the prototype, not a usage-based ranking.
const POPULAR_IDS = [
  'nunchucksr96f100',
  'SanQuentin',
  'monopolymneyv196',
  'niptuck000000000',
  'bloodsuckerstapa',
  'gonzosqumegaways',
  'bonanzatacardsv1',
  'ouija00000000000',
  'starbursttaparoo',
  'SixFeetUnder',
  'gopnik0000000000',
  'freakshowrevelat',
  'cashvolttaparoo0',
  'extrachilrdsv186',
  'gonzosquesttapar',
  'GatorHunters2',
  'jackbeanstar96f1',
  'fruitshopgrr96f1',
  'divinegoldr96f10',
  'TombstoneBegins',
  'GatorHunters',
  'starburstgar96f1',
  'FireInTheHole3',
  'sanctuaryv100000',
  'DeadwoodRip',
  'fruitshopfrenzy0',
  'jackandbeanr96f1',
  'DeadCanary',
  'gonzosgoldr30000',
  'starbursttremef1',
  'TombstoneRip',
  'fruitshopawaysr1',
  'steamtowerj0r100',
  'jackandbeanstalk',
  'divineways000000',
  'stevelarryandgog',
  'powerpuff0000000',
];
const popular = new Set(POPULAR_IDS);

// Candidate picks for the user's own review, not a responsiveness whitelist.
// Nip Tuck stays first as the previously confirmed choice.
const PICK_IDS = [
  'niptuck000000000',
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
  table: isTableGame,
  popular: game => popular.has(game.id),
  'new-releases': game => latestReleaseIds.has(game.id),
  picks: game => picks.has(game.id),
  megaways: game => /\bmegaways\b/i.test(game.title),
  jackpot: game => /\bjackpots?\b/i.test(game.title),
  fruit: game => /fruit|berryburst|go bananas/i.test(game.title),
  adventure: game => /gonzo|gonzita|pirate|treasure|jungle|temple|pyramid|aztec|atlantis|tomb of|dungeon quest/i.test(game.title),
  spooky: game => SPOOKY_IDS.has(game.id),
};

const gamesById = new Map(GAMES.map(game => [game.id, game]));
const today = new Date().toISOString().slice(0, 10);
const latestReleases = GAMES.filter(game => getGameReleaseDate(game) && getGameReleaseDate(game) <= today)
  .sort((a, b) => getGameReleaseDate(b).localeCompare(getGameReleaseDate(a))).slice(0, 100);
const latestReleaseIds = new Set(latestReleases.map(game => game.id));
const orderedCollections = new Map([
  ['popular', POPULAR_IDS], ['picks', PICK_IDS],
  ['new-releases', latestReleases.map(game => game.id)],
]);
const collections = new Map(allCategories.map(category => [category.id,
  orderedCollections.has(category.id) ? orderedCollections.get(category.id).map(id => gamesById.get(id)).filter(Boolean)
    : GAMES.filter(rules[category.id]),
]));

export function getGameCategoryIds(game) {
  return allCategories.filter(category => rules[category.id](game)).map(category => category.id);
}

export function getGamesForCategory(id) {
  return collections.get(id) || [];
}
