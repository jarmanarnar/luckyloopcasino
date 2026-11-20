import { GAMES } from './catalog.js';
import { GAME_TYPES, getGameTypeId, isTableGame } from './game-types.js';
import { GAME_RELEASES } from './game-releases.js';
import { THEME_GAME_IDS, HACKSAW_CARD_GAME_IDS } from './collection-picks.js';
export { GAME_RELEASES, RELEASES_VERIFIED_ON } from './game-releases.js';

// Fixed game formats are independent from the editorial collections below.
export const GAME_FAMILIES = [
  { id: 'slots', title: 'Slots', description: 'Browse the slot games in the catalog.' },
  { id: 'table', title: 'Table & Cards', description: 'Roulette, blackjack, baccarat, poker and card games.' },
  { id: 'scratchcards', title: 'Scratchcards', description: 'Scratch and reveal games from the catalog.' },
  { id: 'tap', title: 'Tap Games', description: 'Tapcards and tap-and-reveal games.' },
  { id: 'arcade', title: 'Arcade & Crash', description: 'Plinko, Mines, Dice, Wheel, Crash and other quick-play games.' },
];

// Keep old links and exact formats available without adding sparse collections
// to the shared lobby/category selector registry.
export const LEGACY_CATEGORIES = [
  { id: 'scratch-tap', title: 'Scratch & Tap', description: 'Scratchcards, Tapcards and tap-and-reveal games.' },
  { id: 'picks', title: 'Editor’s Favorites', description: 'A handpicked selection for you to try and review.' },
  { id: 'instant-games', title: 'Instant Games', description: 'Instant and crash games from the provider catalog.' },
  { id: 'adventure', title: 'Adventure', description: 'Explore temples, jungles, pirates and treasure.' },
  { id: 'spooky', title: 'Spooky Spins', description: 'A handpicked collection of ghosts, witches and spooky themes.' },
  { id: 'jackpot', title: 'Jackpot Picks', description: 'Demo titles from the Jackpot collection.' },
  ...GAME_TYPES,
];

// General release dates cover the entire active catalog, with per-game source provenance.
export function getGameReleaseDate(gameOrId) {
  return GAME_RELEASES[typeof gameOrId === 'string' ? gameOrId : gameOrId?.id]?.date || '';
}

// Editorial starter selection, deliberately distinct from chronological New Releases.
// This is not a usage-based ranking.
const POPULAR_IDS = [
  'SanQuentin',
  'niptuck000000000',
  'gonzosqumegaways',
  'bonanzatacardsv1',
  'gopnik0000000000',
  'TombstoneBegins',
  'fruitshopgrr96f1',
  'bloodsuckerstapa',
  'nunchucksr96f100',
  'monopolymneyv196',
  'hacksaw-1294',
  'ouija00000000000',
  'starbursttaparoo',
  'SixFeetUnder',
  'hacksaw-1321',
  'freakshowrevelat',
  'cashvolttaparoo0',
  'extrachilrdsv186',
  'gonzosquesttapar',
  'GatorHunters2',
  'jackbeanstar96f1',
  'divinegoldr96f10',
  'hacksaw-2491',
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
const cardGameIds = new Set(HACKSAW_CARD_GAME_IDS);

// Jackpot membership is based only on the official title naming Jackpot,
// not on a claim that a public demo participates in a funded jackpot pool.
const rules = {
  ...Object.fromEntries(GAME_TYPES.map(type => [type.id, game => getGameTypeId(game) === type.id])),
  table: game => isTableGame(game) || getGameTypeId(game) === 'video-poker' || cardGameIds.has(game.id),
  arcade: game => ['instant-win', 'crash'].includes(getGameTypeId(game)) && !cardGameIds.has(game.id),
  'scratch-tap': game => ['scratchcards', 'tap'].includes(getGameTypeId(game)),
  'instant-games': game => ['instant-win', 'crash'].includes(getGameTypeId(game)),
  picks: game => picks.has(game.id),
  jackpot: game => /\bjackpots?\b/i.test(game.title),
  adventure: game => /gonzo|gonzita|pirate|treasure|jungle|temple|pyramid|aztec|atlantis|tomb of|dungeon quest/i.test(game.title),
  spooky: game => SPOOKY_IDS.has(game.id),
};

const gamesById = new Map(GAMES.map(game => [game.id, game]));
const today = new Date().toISOString().slice(0, 10);
const latestReleases = GAMES.filter(game => getGameReleaseDate(game) && getGameReleaseDate(game) <= today)
  .sort((a, b) => getGameReleaseDate(b).localeCompare(getGameReleaseDate(a))).slice(0, 100);
const gamesForIds = ids => ids.map(id => gamesById.get(id)).filter(Boolean);

// Collection metadata also keeps existing direct links available. The lobby
// chooses its featured collections separately from the fixed game types.
export const CATEGORIES = [
  { id: 'popular', title: 'Top Picks', description: 'Our handpicked mix of slots, card reveals and quick-play games.', games: gamesForIds(POPULAR_IDS) },
  { id: 'new-releases', title: 'New Releases', description: 'Recently released titles with verified provider release dates.', games: latestReleases },
  { id: 'megaways', title: 'Megaways', description: 'Explore the Megaways collection.', games: GAMES.filter(game => /\bmegaways\b/i.test(game.title)) },
  { id: 'wild-west', title: 'Wild West', description: 'Outlaws, saloons and frontier adventures.', games: gamesForIds(THEME_GAME_IDS['wild-west']) },
  { id: 'gold-rush', title: 'Gold Rush', description: 'Gold, treasure and mining-themed games.', games: gamesForIds(THEME_GAME_IDS['gold-rush']) },
  { id: 'egypt', title: 'Egyptian Treasures', description: 'Pharaohs, pyramids and ancient Egyptian treasures.', games: gamesForIds(THEME_GAME_IDS.egypt) },
  { id: 'asian', title: 'Asian Fortune', description: 'Explore games inspired by Asian settings and legends.', games: gamesForIds(THEME_GAME_IDS.asian) },
  { id: 'fruit', title: 'Fruit Games', description: 'Fruit-themed slots and tap games.', games: gamesForIds(THEME_GAME_IDS.fruit) },
];
export const FILTER_CATEGORIES = CATEGORIES;
// Compatibility exports for existing imports; these do not define a second
// taxonomy or separate copies of collection metadata.
export const DISCOVERY_CATEGORIES = CATEGORIES.filter(category => ['popular', 'new-releases'].includes(category.id));
export const SLOT_THEMES = CATEGORIES.filter(category => Object.hasOwn(THEME_GAME_IDS, category.id));
// Lobby navigation and shelves share this order. Add future featured collections
// here without making search depend on a growing list of themes.
export const LOBBY_SECTIONS = [...DISCOVERY_CATEGORIES, ...GAME_FAMILIES];

const allCategories = [...GAME_FAMILIES, ...CATEGORIES,
  ...LEGACY_CATEGORIES.filter(category => ![...GAME_FAMILIES, ...CATEGORIES].some(item => item.id === category.id))];
const collections = new Map(allCategories.map(category => [category.id,
  category.games || (category.id === 'picks' ? gamesForIds(PICK_IDS) : GAMES.filter(rules[category.id])),
]));
const memberships = new Map([...collections].map(([id, games]) => [id, new Set(games.map(game => game.id))]));

export function getGameCategoryIds(game) {
  return allCategories.filter(category => memberships.get(category.id).has(game.id)).map(category => category.id);
}

export function getGamesForCategory(id) {
  return collections.get(id) || [];
}
