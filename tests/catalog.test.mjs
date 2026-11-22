import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { ALL_GAMES, GAMES, PROVIDERS } from '../public/catalog.js';
import { GAME_ARTWORK } from '../public/game-artwork.js';
import { CATEGORIES, GAME_FAMILIES, SLOT_THEMES, GAME_RELEASES, getGameReleaseDate, getGamesForCategory } from '../public/collections.js';
import { PROVIDER_LOGOS } from '../public/provider-assets.js';
import { getGameTypeId } from '../public/game-types.js';
import { getCatalogPage } from '../public/catalog-page-model.js';
import { getProviderDetails } from '../public/provider-details.js';

// The user explicitly restored every prior exclusion on 2026-11-01.
const restoredGames = [
  'demonbeatsr96f10', 'bloodsuckersj0r2', 'bloodsuckers2000',
  'ghostpirates0000', 'halloweenjack000', 'whatsupwitcr96f1',
  'BloodAndShadow2', 'BloodAndShadow', 'alohaxmas0000000',
  'gonzo', 'starburst', 'BarbarianFury', 'bonanza', 'Mental',
  'fruitshop0000000', 'baccarat2ne00000', 'jacksmultihandn1',
  'blackjack3ne0000', 'gonzosquestr96f1', 'doublestacks0000',
  'divinemegaways00', 'divinefortur96f1', 'godsoffortune000',
  'discodanny000000', 'deadwestr96f1000', 'deadalive3r96f10',
  'deadoralive2fb00', 'deadoralive00000',
  'ameriroulette3ne', 'casinoholdemne00', 'roulette2advne00', 'roulettesne00000',
  'dragonsluck00000',
];
const vendorAliases = {
  gonzo: 'eldorado00000000',
  starburst: 'starburstr000000',
  bonanza: 'bonanzav60000000',
};
const publicRoot = new URL('../public/', import.meta.url);

function vendorCode(game) {
  return new URL(game.url).pathname.split('/').filter(Boolean).at(-1).toLowerCase();
}

test('public catalog contains only the 1108 approved covers across seven populated providers', () => {
  assert.equal(ALL_GAMES.length, 1369, 'hiding titles preserves imported records');
  assert.equal(GAMES.length, 1108);
  assert.deepEqual(GAMES, ALL_GAMES.filter(game => Object.hasOwn(GAME_ARTWORK, game.id)));
  assert.equal(new Set(GAMES.map(game => game.id)).size, GAMES.length);
  const expectedCounts = {
    netent: 233,
    'red-tiger': 351,
    'nolimit-city': 141,
    'big-time-gaming': 80,
    taparoo: 8,
    'sneaky-slots': 3,
    bgaming: 292,
  };
  assert.equal(PROVIDERS.length, 7);
  assert.deepEqual(PROVIDERS.map(provider => provider.id).sort(), Object.keys(expectedCounts).sort());
  for (const provider of PROVIDERS) {
    const games = GAMES.filter(game => game.providerId === provider.id);
    assert.equal(games.length, expectedCounts[provider.id], provider.id);
    assert.equal(provider.count, games.length, provider.id);
    assert.ok(games.every(game => game.providerName === provider.name), provider.id);
  }
});

test('Our Picks retains 14 unique active choices with Nip Tuck first', () => {
  const picks = getGamesForCategory('picks');
  assert.equal(picks.length, 14);
  assert.equal(picks[0].id, 'niptuck000000000');
  assert.equal(new Set(picks.map(game => game.id)).size, picks.length);
  assert.ok(picks.every(game => GAMES.includes(game)));
});

test('all 33 previously excluded games are restored once with their original demo codes', () => {
  assert.equal(restoredGames.length, 33);
  for (const id of restoredGames) {
    const matches = GAMES.filter(game => game.id.toLowerCase() === id.toLowerCase());
    assert.equal(matches.length, 1, id);
    assert.equal(vendorCode(matches[0]), (vendorAliases[id] || id).toLowerCase());
    assert.ok(getGamesForCategory(getGameTypeId(matches[0])).includes(matches[0]), id);
  }
});

test('populated game families cover the visible catalog exactly once without duplicating providers', () => {
  assert.deepEqual(GAME_FAMILIES.map(category => category.id), [
    'slots', 'table', 'scratchcards', 'tap', 'arcade',
  ]);
  const expectedCounts = { slots: 1020, table: 18, scratchcards: 12, tap: 13, arcade: 45 };
  const covered = new Set();
  for (const category of GAME_FAMILIES) {
    const games = getGamesForCategory(category.id);
    assert.equal(games.length, expectedCounts[category.id], category.id);
    assert.equal(new Set(games.map(game => game.id)).size, games.length, category.id);
    assert.ok(games.every(game => GAMES.includes(game)), category.id);
    for (const game of games) {
      assert.equal(covered.has(game.id), false, `${game.id} belongs to only one primary family`);
      covered.add(game.id);
    }
  }
  assert.deepEqual(covered, new Set(GAMES.map(game => game.id)));
  const providerIds = new Set(PROVIDERS.map(provider => provider.id));
  assert.ok(GAME_FAMILIES.every(category => !providerIds.has(category.id)));
  assert.deepEqual(new Set(getCatalogPage({ type: 'search' }).games.map(game => game.id)), new Set(GAMES.map(game => game.id)));
});

test('theme collections use relevant settings and fruit titles without ambiguous keyword matches', () => {
  const cases = [
    { categoryId: 'wild-west', count: 14,
      included: ['TombstoneBegins', 'DeadwoodRip'],
      excluded: ['EastVsWest', 'hacksaw-1620', 'hacksaw-1309', 'hacksaw-1197'] },
    { categoryId: 'gold-rush', count: 15,
      included: ['gonzosgoldr30000'],
      excluded: ['GoldenShower', 'rome000000000000'] },
    { categoryId: 'egypt', count: 17,
      included: ['TombOfAkhenaten'],
      excluded: ['BookOfShadows', 'extrachillliv396'] },
    { categoryId: 'asian', count: 9,
      included: ['dragonslckstacks'],
      excluded: ['divinegoldr96f10', 'finndragontr96f1'] },
    { categoryId: 'fruit', count: 26,
      included: ['fruitshopgrr96f1', 'happyapples00000'],
      excluded: ['PearlHarbor', 'hacksaw-1938'] },
  ];
  for (const { categoryId, count, included, excluded } of cases) {
    const members = new Set(getGamesForCategory(categoryId).map(game => game.id));
    assert.equal(members.size, count, categoryId);
    for (const id of [...included, ...excluded]) assert.ok(ALL_GAMES.some(game => game.id === id), id);
    for (const id of included) assert.equal(members.has(id), true, `${categoryId}: ${id}`);
    for (const id of excluded) assert.equal(members.has(id), false, `${categoryId}: ${id}`);
  }
  assert.equal(SLOT_THEMES.find(category => category.id === 'fruit').title, 'Fruit Games');
  assert.equal(getGamesForCategory('megaways').length, 60);
});

test('provider pages retain their complete catalogs separately from editorial choices', () => {
  for (const [providerId, count] of [['nolimit-city', 141], ['red-tiger', 351], ['bgaming', 292]]) {
    assert.deepEqual(getGamesForCategory(providerId), []);
    const page = getCatalogPage({ type: 'provider', providerId });
    assert.equal(page.activeMenu, 'providers');
    const highlighted = page.games;
    assert.equal(highlighted.length, count, providerId);
    assert.deepEqual(new Set(highlighted.map(game => game.id)),
      new Set(GAMES.filter(game => game.providerId === providerId).map(game => game.id)), providerId);
  }
  assert.equal(getGamesForCategory('picks')[0].id, 'niptuck000000000');
  assert.equal(getCatalogPage({ type: 'provider', providerId: 'hacksaw-gaming' }).type, 'not-found');
});

test('the shared collection registry owns real multi-game memberships without duplicate families or studios', () => {
  assert.deepEqual(CATEGORIES.map(category => category.id), [
    'megaways', 'wild-west', 'gold-rush', 'egypt', 'asian', 'fruit',
  ]);
  const excluded = new Set([...GAME_FAMILIES, ...PROVIDERS].map(item => item.id));
  for (const category of CATEGORIES) {
    assert.equal(excluded.has(category.id), false);
    assert.ok(category.games.length > 1, category.id);
    assert.equal(getGamesForCategory(category.id), category.games, 'membership belongs to the central registry record');
    assert.equal(new Set(category.games.map(game => game.id)).size, category.games.length);
    assert.ok(category.games.every(game => GAMES.includes(game)));
  }
  for (const alias of SLOT_THEMES) assert.ok(CATEGORIES.includes(alias));
});

test('provider details describe the active catalog and real available game formats', () => {
  assert.equal(getProviderDetails('unknown'), null);
  for (const provider of PROVIDERS) {
    const details = getProviderDetails(provider.id);
    assert.equal(details.gameCount, provider.count);
    assert.equal(details.formats.reduce((total, type) => total + type.count, 0), provider.count);
    assert.ok(details.formats.every(type => type.count > 0));
  }
  assert.deepEqual(getProviderDetails('taparoo').formats, [{ id: 'tap', title: 'Tap Games', count: 8 }]);
});

test('verified release dates retain their provider sources; unknown dates stay unknown', () => {
  const datedGames = ALL_GAMES.filter(game => game.providerId !== 'hacksaw-gaming');
  assert.equal(Object.keys(GAME_RELEASES).length, datedGames.length);
  for (const game of datedGames) {
    const release = GAME_RELEASES[game.id];
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${release.date}T00:00:00Z`).toISOString().slice(0, 10), release.date);
    const bgaming = game.providerId === 'bgaming';
    assert.equal(release.verifiedOn, bgaming ? '2026-11-22' : '2026-11-01');
    assert.equal(new URL(release.source).origin, bgaming ? 'https://bgaming.com' : 'https://games.nolimitcity.com');
    assert.equal(new URL(release.page).origin, bgaming ? 'https://bgaming.com' : 'https://nolimitcity.com');
  }
  assert.equal(getGameReleaseDate('starburst'), '2012-01-23');
  assert.equal(getGameReleaseDate('bloodsuckersj0r2'), '2009-11-10');
  assert.equal(getGameReleaseDate('arabian000000000'), '2006-11-10');
  for (const game of ALL_GAMES.filter(game => game.providerId === 'hacksaw-gaming')) assert.equal(getGameReleaseDate(game), '');
});

test('separate Tap-A-Roo, Megaways and sequel variants remain available', () => {
  for (const id of [
    'dragonslucktapar', 'dragonslckstacks', 'dragonslckdeluxe', 'dragonsluckmegaw',
    'bloodsuckerstapa', 'bloodsuckersmega',
    'gonzosquesttapar', 'gonzosqumegaways', 'gonzosgoldr30000',
    'starbursttaparoo', 'starburstgar96f1', 'starbursttremef1',
    'bonanzatacardsv1', 'bonanzafallsv100', 'Mental2',
    'fruitshopgrr96f1', 'fruitshopfrenzy0', 'fruitshopawaysr1',
  ]) {
    const game = GAMES.find(candidate => candidate.id === id);
    assert.ok(game, id);
  }
});

test('standalone page, module imports and all eight provider logos resolve within public', async () => {
  const indexUrl = new URL('index.html', publicRoot);
  const html = await readFile(indexUrl, 'utf8');
  for (const [, specifier] of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(specifier)) continue;
    const asset = new URL(specifier, indexUrl);
    assert.ok(asset.href.startsWith(publicRoot.href), specifier);
    await access(asset);
  }
  for (const file of (await readdir(publicRoot)).filter(name => name.endsWith('.js'))) {
    const moduleUrl = new URL(file, publicRoot);
    const source = await readFile(moduleUrl, 'utf8');
    for (const [, specifier] of source.matchAll(/\bimport\s+(?:[^'";\n]*?\sfrom\s*)?['"]([^'"]+)['"]/g)) {
      assert.ok(specifier.startsWith('.'), `${file}: ${specifier}`);
      const dependency = new URL(specifier, moduleUrl);
      assert.ok(dependency.href.startsWith(publicRoot.href), `${file}: ${specifier}`);
      await access(dependency);
    }
  }
  assert.equal(Object.keys(PROVIDER_LOGOS).length, 8);
  for (const provider of PROVIDERS) {
    const asset = new URL(PROVIDER_LOGOS[provider.id].src, publicRoot);
    assert.ok(asset.href.startsWith(publicRoot.href), provider.id);
    assert.match(await readFile(asset, 'utf8'), /<svg\b/, provider.id);
  }
});

test('retired discovery collections are absent from metadata and memberships', () => {
  for (const id of ['popular', 'new-releases']) {
    assert.equal(CATEGORIES.some(category => category.id === id), false);
    assert.deepEqual(getGamesForCategory(id), []);
  }
});
