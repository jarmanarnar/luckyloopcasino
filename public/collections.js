import { GAMES } from './catalog.js';
import { GAME_TYPES, getGameTypeId, isTableGame } from './game-types.js';
import { GAME_RELEASES } from './game-releases.js';
import { THEME_GAME_IDS, HACKSAW_CARD_GAME_IDS } from './collection-picks.js';
export { GAME_RELEASES, RELEASES_VERIFIED_ON } from './game-releases.js';

// Game format and editorial collections are separate from the studio/provider.
// Format mapping is documented in game-types.js. Shared browse categories power
// the category bar, sidebar and lobby shelves; sparse formats stay in broader groups.
export const CATEGORIES = [
  { id: 'popular', title: 'COP COIN Picks', description: 'Our handpicked mix of slots, card reveals and quick-play games.' },
  { id: 'new-releases', title: 'New Releases', description: 'Recently released titles with verified provider release dates.' },
  { id: 'wild-west', title: 'Wild West', description: 'Outlaws, saloons and frontier adventures.' },
  { id: 'gold-rush', title: 'Gold Rush', description: 'Gold, treasure and mining-themed games.' },
  { id: 'egypt', title: 'Egyptian Treasures', description: 'Pharaohs, pyramids and ancient Egyptian treasures.' },
  { id: 'asian', title: 'Asian Fortune', description: 'Explore games inspired by Asian settings and legends.' },
  { id: 'fruit', title: 'Fruit Games', description: 'Fruit-themed slots and tap games.' },
  { id: 'megaways', title: 'Megaways', description: 'Explore the Megaways collection.' },
  { id: 'scratch-tap', title: 'Scratch & Tap', description: 'Scratchcards, Tapcards and tap-and-reveal games.' },
  { id: 'table', title: 'Table & Cards', description: 'Roulette, blackjack, baccarat, poker and card games.' },
  { id: 'slots', title: 'Slots', description: 'Browse the slot games in the catalog.' },
];

// Keep existing links and exact game formats available without promoting tiny shelves.
export const LEGACY_CATEGORIES = [
  { id: 'picks', title: 'Editor’s Favorites', description: 'A handpicked selection for you to try and review.' },
  { id: 'instant-games', title: 'Instant Games', description: 'Instant and crash games from the provider catalog.' },
  { id: 'adventure', title: 'Adventure', description: 'Explore temples, jungles, pirates and treasure.' },
  { id: 'spooky', title: 'Spooky Spins', description: 'A handpicked collection of ghosts, witches and spooky themes.' },
  { id: 'jackpot', title: 'Jackpot Picks', description: 'Demo titles from the Jackpot collection.' },
  ...GAME_TYPES,
];

const allCategories = [...CATEGORIES, ...LEGACY_CATEGORIES.filter(category => !CATEGORIES.some(item => item.id === category.id))];
export const FILTER_CATEGORIES = CATEGORIES;

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
const themeIds = new Map(Object.entries(THEME_GAME_IDS).map(([id, ids]) => [id, new Set(ids)]));
const cardGameIds = new Set(HACKSAW_CARD_GAME_IDS);

// Jackpot membership is based only on the official title naming Jackpot,
// not on a claim that a public demo participates in a funded jackpot pool.
const rules = {
  ...Object.fromEntries(GAME_TYPES.map(type => [type.id, game => getGameTypeId(game) === type.id])),
  ...Object.fromEntries([...themeIds].map(([id, ids]) => [id, game => ids.has(game.id)])),
  table: game => isTableGame(game) || getGameTypeId(game) === 'video-poker' || cardGameIds.has(game.id),
  'scratch-tap': game => ['scratchcards', 'tap'].includes(getGameTypeId(game)),
  'instant-games': game => ['instant-win', 'crash'].includes(getGameTypeId(game)),
  popular: game => popular.has(game.id),
  'new-releases': game => latestReleaseIds.has(game.id),
  picks: game => picks.has(game.id),
  megaways: game => /\bmegaways\b/i.test(game.title),
  jackpot: game => /\bjackpots?\b/i.test(game.title),
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
  ...Object.entries(THEME_GAME_IDS),
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
