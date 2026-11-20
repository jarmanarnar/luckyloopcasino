import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { GAMES, PROVIDERS } from '../public/catalog.js';
import { CATEGORIES, GAME_FAMILIES, DISCOVERY_CATEGORIES, SLOT_THEMES, GAME_RELEASES, getGameReleaseDate, getGamesForCategory } from '../public/collections.js';
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

test('expanded catalog retains 1080 unique active games across seven providers', () => {
  assert.equal(GAMES.length, 1080);
  assert.equal(new Set(GAMES.map(game => game.id)).size, GAMES.length);
  const expectedCounts = {
    netent: 236,
    'red-tiger': 355,
    'nolimit-city': 141,
    'big-time-gaming': 80,
    taparoo: 8,
    'sneaky-slots': 3,
    'hacksaw-gaming': 257,
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

test('five primary game families cover the complete catalog exactly once without duplicating providers', () => {
  assert.deepEqual(GAME_FAMILIES.map(category => category.id), [
    'slots', 'table', 'scratchcards', 'tap', 'arcade',
  ]);
  const expectedCounts = { slots: 993, table: 10, scratchcards: 52, tap: 13, arcade: 12 };
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
    { categoryId: 'wild-west', count: 17,
      included: ['TombstoneBegins', 'DeadwoodRip', 'hacksaw-1620'],
      excluded: ['EastVsWest', 'hacksaw-1309', 'hacksaw-1197'] },
    { categoryId: 'gold-rush', count: 18,
      included: ['hacksaw-1020', 'gonzosgoldr30000'],
      excluded: ['GoldenShower', 'rome000000000000'] },
    { categoryId: 'egypt', count: 20,
      included: ['TombOfAkhenaten', 'hacksaw-1612'],
      excluded: ['BookOfShadows', 'extrachillliv396'] },
    { categoryId: 'asian', count: 12,
      included: ['hacksaw-1348', 'dragonslckstacks'],
      excluded: ['divinegoldr96f10', 'finndragontr96f1'] },
    { categoryId: 'fruit', count: 30,
      included: ['fruitshopgrr96f1', 'hacksaw-1693', 'hacksaw-1081', 'hacksaw-1031', 'happyapples00000'],
      excluded: ['PearlHarbor', 'hacksaw-1938'] },
  ];
  for (const { categoryId, count, included, excluded } of cases) {
    const members = new Set(getGamesForCategory(categoryId).map(game => game.id));
    assert.equal(members.size, count, categoryId);
    for (const id of [...included, ...excluded]) assert.ok(GAMES.some(game => game.id === id), id);
    for (const id of included) assert.equal(members.has(id), true, `${categoryId}: ${id}`);
    for (const id of excluded) assert.equal(members.has(id), false, `${categoryId}: ${id}`);
  }
  assert.equal(SLOT_THEMES.find(category => category.id === 'fruit').title, 'Fruit Games');
  assert.equal(getGamesForCategory('megaways').length, 56);
});

test('provider pages retain their complete catalogs separately from editorial choices', () => {
  for (const [providerId, count] of [['nolimit-city', 141], ['hacksaw-gaming', 257]]) {
    assert.deepEqual(getGamesForCategory(providerId), []);
    const page = getCatalogPage({ type: 'provider', providerId });
    assert.equal(page.activeMenu, 'providers');
    const highlighted = page.games;
    assert.equal(highlighted.length, count, providerId);
    assert.deepEqual(new Set(highlighted.map(game => game.id)),
      new Set(GAMES.filter(game => game.providerId === providerId).map(game => game.id)), providerId);
  }
  assert.equal(DISCOVERY_CATEGORIES.find(category => category.id === 'popular').title, 'Top Picks');
  assert.equal(getGamesForCategory('popular').length, 40);
  assert.equal(new Set(getGamesForCategory('popular').map(game => game.id)).size, 40);
  assert.equal(getGamesForCategory('picks')[0].id, 'niptuck000000000');
});

test('discovery collections stay outside primary formats and preserve their editorial opening', () => {
  assert.deepEqual(DISCOVERY_CATEGORIES.map(category => category.id), ['popular', 'new-releases']);
  assert.deepEqual(SLOT_THEMES.map(theme => theme.id), ['wild-west', 'gold-rush', 'egypt', 'asian', 'fruit']);
  const primaryIds = new Set(GAME_FAMILIES.map(category => category.id));
  for (const collection of [...DISCOVERY_CATEGORIES, ...SLOT_THEMES]) assert.equal(primaryIds.has(collection.id), false);
  assert.deepEqual(getGamesForCategory('popular').slice(0, 8).map(game => game.id), [
    'SanQuentin', 'niptuck000000000', 'gonzosqumegaways', 'bonanzatacardsv1',
    'gopnik0000000000', 'TombstoneBegins', 'fruitshopgrr96f1', 'bloodsuckerstapa',
  ]);
  assert.deepEqual(getGamesForCategory('new-releases').slice(0, 3).map(game => game.id), [
    'nunchucksr96f100', 'monopolymneyv196', 'ouija00000000000',
  ]);
});

test('the shared collection registry owns real multi-game memberships without duplicate families or studios', () => {
  assert.deepEqual(CATEGORIES.map(category => category.id), [
    'popular', 'new-releases', 'megaways', 'wild-west', 'gold-rush', 'egypt', 'asian', 'fruit',
  ]);
  const excluded = new Set([...GAME_FAMILIES, ...PROVIDERS].map(item => item.id));
  for (const category of CATEGORIES) {
    assert.equal(excluded.has(category.id), false);
    assert.ok(category.games.length > 1, category.id);
    assert.equal(getGamesForCategory(category.id), category.games, 'membership belongs to the central registry record');
    assert.equal(new Set(category.games.map(game => game.id)).size, category.games.length);
    assert.ok(category.games.every(game => GAMES.includes(game)));
  }
  for (const alias of [...DISCOVERY_CATEGORIES, ...SLOT_THEMES]) assert.ok(CATEGORIES.includes(alias));
});

test('new releases contain only active, dated games in descending release order', () => {
  const releases = getGamesForCategory('new-releases');
  assert.equal(releases.length, 100);
  assert.equal(new Set(releases.map(game => game.id)).size, 100);
  assert.equal(releases[0].id, 'nunchucksr96f100');
  assert.equal(getGameReleaseDate(releases[0]), '2026-10-29');
  assert.equal(getGameReleaseDate('unknown'), '');
  for (const [index, game] of releases.entries()) {
    assert.ok(GAMES.includes(game));
    const release = GAME_RELEASES[game.id];
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(release.date <= '2026-10-31');
    assert.equal(new URL(release.source).hostname, 'games.nolimitcity.com');
    if (index > 0) assert.ok(getGameReleaseDate(releases[index - 1]) >= release.date);
  }
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

test('all 823 original games retain verified release dates; unknown new-provider dates stay unknown', () => {
  const original = GAMES.filter(game => game.providerId !== 'hacksaw-gaming');
  assert.equal(Object.keys(GAME_RELEASES).length, original.length);
  for (const game of original) {
    const release = GAME_RELEASES[game.id];
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${release.date}T00:00:00Z`).toISOString().slice(0, 10), release.date);
    assert.equal(release.verifiedOn, '2026-11-01');
    assert.equal(new URL(release.source).origin, 'https://games.nolimitcity.com');
    assert.equal(new URL(release.page).origin, 'https://nolimitcity.com');
  }
  assert.equal(getGameReleaseDate('starburst'), '2012-01-23');
  assert.equal(getGameReleaseDate('bloodsuckersj0r2'), '2009-11-10');
  assert.equal(getGameReleaseDate('arabian000000000'), '2006-11-10');
  for (const game of GAMES.filter(game => game.providerId === 'hacksaw-gaming')) assert.equal(getGameReleaseDate(game), '');
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

test('standalone page, module imports and all seven provider logos resolve within public', async () => {
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
  assert.equal(Object.keys(PROVIDER_LOGOS).length, 7);
  for (const provider of PROVIDERS) {
    const asset = new URL(PROVIDER_LOGOS[provider.id].src, publicRoot);
    assert.ok(asset.href.startsWith(publicRoot.href), provider.id);
    assert.match(await readFile(asset, 'utf8'), /<svg\b/, provider.id);
  }
});
