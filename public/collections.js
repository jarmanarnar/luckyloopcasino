import { GAMES } from './catalog.js';
import { GAME_TYPES, getGameTypeId } from './game-types.js';

// Game format and editorial collections are separate from the studio/provider.
// Format mapping is documented in game-types.js. The lobby navigation is a
// deliberately small set; existing editorial collections remain addressable.
export const CATEGORIES = [
  { id: 'popular', title: 'Popular', description: 'A curated selection from the current demo catalog.' },
  { id: 'slots', title: 'Slots', description: 'Browse the slot games in the catalog.' },
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

// The latest 100 active titles by general-release date, checked against the
// provider's shared official game calendar on 2026-10-31. Removed games are
// excluded before selecting this snapshot; dates are not inferred from IDs.
// https://games.nolimitcity.com/
export const GAME_RELEASES = Object.freeze(Object.fromEntries([
  ['nunchucksr96f100', '2026-10-29'],
  ['monopolymneyv196', '2026-10-28'],
  ['ouija00000000000', '2026-10-27'],
  ['stevelarryandgog', '2026-10-22'],
  ['SixFeetUnder', '2026-10-20'],
  ['powerpuff0000000', '2026-10-13'],
  ['cocksandrobbers0', '2026-10-07'],
  ['GatorHunters2', '2026-10-06'],
  ['bloodsuckerstapa', '2026-10-01'],
  ['gonzosquesttapar', '2026-10-01'],
  ['stormfire0000000', '2026-09-30'],
  ['thorsrage2000000', '2026-09-24'],
  ['extrachillliv396', '2026-09-23'],
  ['DingDongDeath', '2026-09-22'],
  ['jackbeanstar96f1', '2026-09-17'],
  ['discoinferno0000', '2026-09-15'],
  ['DuckHunters2', '2026-09-10'],
  ['aftermathr96f100', '2026-09-03'],
  ['bountycove000000', '2026-09-01'],
  ['777moneystrike00', '2026-08-25'],
  ['happycappy000000', '2026-08-20'],
  ['Outsourced2', '2026-08-18'],
  ['judgementalr96f1', '2026-08-13'],
  ['golddiggercluste', '2026-07-30'],
  ['spicer96f1000000', '2026-07-23'],
  ['diamondblitz3000', '2026-07-16'],
  ['hitthejungle0000', '2026-07-09'],
  ['AirportSecurity', '2026-07-07'],
  ['fruitshopgrr96f1', '2026-07-02'],
  ['pandagoesboom000', '2026-06-25'],
  ['monsterquestv496', '2026-06-24'],
  ['SoakedBySeamen', '2026-06-23'],
  ['inandoutr96f1000', '2026-06-18'],
  ['dynamiterichesth', '2026-06-16'],
  ['Tanked3', '2026-06-09'],
  ['worldfootballfor', '2026-05-28'],
  ['fruitmergotsv496', '2026-05-27'],
  ['TrueGrit2', '2026-05-26'],
  ['jackpottrain0000', '2026-05-21'],
  ['TombstoneBegins', '2026-05-12'],
  ['lokisdescendants', '2026-05-07'],
  ['divinegoldr96f10', '2026-04-30'],
  ['SanQuentinManhunt', '2026-04-21'],
  ['aztectribute0000', '2026-04-16'],
  ['monopolymapotsv1', '2026-04-09'],
  ['PunkRocker3', '2026-04-07'],
  ['sharkboss0000000', '2026-04-02'],
  ['archdragonking00', '2026-03-24'],
  ['CatfishHunters', '2026-03-17'],
  ['godbreakerr96f10', '2026-03-12'],
  ['monopolymoneymag', '2026-03-10'],
  ['millionaiapotsv1', '2026-03-04'],
  ['TheCrypt2', '2026-03-03'],
  ['monopolyrentrush', '2026-02-26'],
  ['dragonboyz000000', '2026-02-19'],
  ['rabidrandygr96f1', '2026-02-17'],
  ['Supersized', '2026-02-10'],
  ['diggingforwilds0', '2026-02-05'],
  ['monopolyrhhourv1', '2026-02-03'],
  ['monopolycashiski', '2026-01-29'],
  ['GoldenShower', '2026-01-27'],
  ['monopolymonr96f1', '2026-01-15'],
  ['DuckHuntersHappyHour', '2026-01-13'],
  ['revolvero0000000', '2026-01-08'],
  ['monopolydeluxev1', '2026-01-06'],
  ['monopolytsgen3v1', '2026-01-06'],
  ['DasxBoot2', '2025-12-16'],
  ['piggyrichesbegin', '2025-12-11'],
  ['warlocksv1000000', '2025-12-10'],
  ['piratesplentytre', '2025-12-09'],
  ['jinglebellsbona2', '2025-12-04'],
  ['CrazyExGirlfriend', '2025-12-02'],
  ['christmasapotsv1', '2025-12-01'],
  ['gopnik0000000000', '2025-11-26'],
  ['whiterabbit2v100', '2025-11-25'],
  ['flockmer96f10000', '2025-11-20'],
  ['Bizarre', '2025-11-18'],
  ['biggestvault0000', '2025-11-13'],
  ['bigrichturkeys00', '2025-11-06'],
  ['Disorder', '2025-11-04'],
  ['cashvoltsupercha', '2025-10-30'],
  ['freakshowrevelat', '2025-10-29'],
  ['BangkokHilton', '2025-10-28'],
  ['dragonduo0000000', '2025-10-23'],
  ['bloodymurder0000', '2025-10-16'],
  ['castleoftrror2v1', '2025-10-15'],
  ['Breakout', '2025-10-14'],
  ['rabidrandydr96f1', '2025-10-14'],
  ['cashvolttaparoo0', '2025-09-25'],
  ['starbursttaparoo', '2025-09-25'],
  ['niptuck000000000', '2025-09-24'],
  ['landofriches0000', '2025-09-18'],
  ['cashlamps0000000', '2025-09-11'],
  ['DeadMenWalking', '2025-09-09'],
  ['takethemoney0000', '2025-09-04'],
  ['dragonslucktapar', '2025-09-01'],
  ['greatpyramidtapa', '2025-09-01'],
  ['rainbowjackpotst', '2025-09-01'],
  ['piggyriche3r96f1', '2025-08-26'],
  ['playwiththedevmw', '2025-08-21'],
].map(([id, date]) => [id, Object.freeze({ date, source: 'https://games.nolimitcity.com/' })])));

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
  popular: game => popular.has(game.id),
  'new-releases': game => Boolean(getGameReleaseDate(game)),
  picks: game => picks.has(game.id),
  megaways: game => /\bmegaways\b/i.test(game.title),
  jackpot: game => /\bjackpots?\b/i.test(game.title),
  fruit: game => /fruit|berryburst|go bananas/i.test(game.title),
  adventure: game => /gonzo|gonzita|pirate|treasure|jungle|temple|pyramid|aztec|atlantis|tomb of|dungeon quest/i.test(game.title),
  spooky: game => SPOOKY_IDS.has(game.id),
};

const gamesById = new Map(GAMES.map(game => [game.id, game]));
const orderedCollections = new Map([
  ['popular', POPULAR_IDS], ['picks', PICK_IDS],
  ['new-releases', Object.keys(GAME_RELEASES).sort((a, b) => getGameReleaseDate(b).localeCompare(getGameReleaseDate(a)))],
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
