import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { GAMES, PROVIDERS } from '../public/catalog.js';
import { CATEGORIES, LEGACY_CATEGORIES, GAME_RELEASES, getGameReleaseDate, getGamesForCategory } from '../public/collections.js';
import { PROVIDER_LOGOS } from '../public/provider-assets.js';
import { isRemovedGame } from '../public/removed-games.js';
import { getProviderDetails } from '../public/provider-details.js';

// User-reviewed exclusions are deliberate product decisions, independent of
// the production exclusion implementation and the original catalog snapshot.
const removedGames = [
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
];
const vendorAliases = {
  gonzo: 'eldorado00000000',
  starburst: 'starburstr000000',
  bonanza: 'bonanzav60000000',
};
const blockedCodes = new Set([
  ...removedGames, ...Object.values(vendorAliases),
].map(code => code.toLowerCase()));
const publicRoot = new URL('../public/', import.meta.url);

function vendorCode(game) {
  return new URL(game.url).pathname.split('/').filter(Boolean).at(-1).toLowerCase();
}

test('reviewed catalog retains 791 unique active games across six providers', () => {
  assert.equal(GAMES.length, 791);
  assert.equal(new Set(GAMES.map(game => game.id)).size, GAMES.length);
  const expectedCounts = {
    netent: 209,
    'red-tiger': 355,
    'nolimit-city': 137,
    'big-time-gaming': 79,
    taparoo: 8,
    'sneaky-slots': 3,
  };
  assert.equal(PROVIDERS.length, 6);
  assert.deepEqual(PROVIDERS.map(provider => provider.id).sort(), Object.keys(expectedCounts).sort());
  for (const provider of PROVIDERS) {
    const games = GAMES.filter(game => game.providerId === provider.id);
    assert.equal(games.length, expectedCounts[provider.id], provider.id);
    assert.equal(provider.count, games.length, provider.id);
    assert.ok(games.every(game => game.providerName === provider.name), provider.id);
  }
});

test('Our Picks retains 15 unique active choices with Nip Tuck first', () => {
  const picks = getGamesForCategory('picks');
  assert.equal(picks.length, 15);
  assert.equal(picks[0].id, 'niptuck000000000');
  assert.equal(new Set(picks.map(game => game.id)).size, picks.length);
  assert.ok(picks.every(game => GAMES.includes(game)));
});

test('all 32 removed games and vendor aliases stay out of every collection and launch catalog', () => {
  assert.equal(removedGames.length, 32);
  const lists = [['launch catalog', GAMES], ...[...CATEGORIES, ...LEGACY_CATEGORIES].map(category => [category.id, getGamesForCategory(category.id)])];
  for (const [name, games] of lists) {
    for (const game of games) {
      assert.equal(blockedCodes.has(game.id.toLowerCase()), false, `${name}: ${game.id}`);
      assert.equal(blockedCodes.has(vendorCode(game)), false, `${name}: ${game.url}`);
    }
  }
});

test('lobby categories stay focused while existing editorial choices remain available', () => {
  assert.deepEqual(CATEGORIES.map(category => category.id), ['popular', 'slots', 'new-releases']);
  assert.ok(getGamesForCategory('spooky').length > 0);
  assert.equal(getGamesForCategory('picks')[0].id, 'niptuck000000000');
});

test('new releases contain only active, dated games in descending release order', () => {
  const releases = getGamesForCategory('new-releases');
  assert.equal(releases.length, 11);
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

test('permanent exclusions reject removed local IDs and renamed entries using old vendor URLs', () => {
  for (const id of removedGames) {
    assert.equal(isRemovedGame({ id, url: 'https://playin.com/embed/v1/demo/unrelated' }), true, id);
    const code = vendorAliases[id] || id;
    assert.equal(isRemovedGame({
      id: `renamed-${id}`,
      url: `https://playin.com/embed/v1/demo/${code}`,
    }), true, code);
  }
});

test('separate Tap-A-Roo, Megaways and sequel variants remain available', () => {
  for (const id of [
    'bloodsuckerstapa', 'bloodsuckersmega',
    'gonzosquesttapar', 'gonzosqumegaways', 'gonzosgoldr30000',
    'starbursttaparoo', 'starburstgar96f1', 'starbursttremef1',
    'bonanzatacardsv1', 'bonanzafallsv100', 'Mental2',
    'fruitshopgrr96f1', 'fruitshopfrenzy0', 'fruitshopawaysr1',
  ]) {
    const game = GAMES.find(candidate => candidate.id === id);
    assert.ok(game, id);
    assert.equal(isRemovedGame(game), false, id);
  }
});

test('standalone page, module imports and all six provider logos resolve within public', async () => {
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
  assert.equal(Object.keys(PROVIDER_LOGOS).length, 6);
  for (const provider of PROVIDERS) {
    const asset = new URL(PROVIDER_LOGOS[provider.id].src, publicRoot);
    assert.ok(asset.href.startsWith(publicRoot.href), provider.id);
    assert.match(await readFile(asset, 'utf8'), /<svg\b/, provider.id);
  }
});
