import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleaseData, releaseModule } from '../scripts/import-release-calendar.mjs';
import { ALL_GAMES, GAMES } from '../public/catalog.js';
import { CATEGORIES, GAME_FAMILIES, FILTER_CATEGORIES, getGameCategoryIds, getGamesForCategory } from '../public/collections.js';
import { GAME_TYPES, getGameTypeId } from '../public/game-types.js';

const game = { id: 'stable-id', title: 'Example Game' };
const calendar = { source: 'https://games.nolimitcity.com/', observedOn: '2026-11-01',
  games: [{ title: 'Example Game', date: '23rd January 2012', url: 'https://nolimitcity.com/games/example-game' }] };

test('release import preserves the original release day and stable game ID with source provenance', () => {
  const rows = buildReleaseData([game], calendar);
  assert.deepEqual(rows, [['stable-id', '2012-01-23', 'https://nolimitcity.com/games/example-game']]);
  const output = releaseModule(rows, calendar);
  assert.match(output, /RELEASES_VERIFIED_ON = "2026-11-01"/);
  assert.match(output, /source: "https:\/\/games.nolimitcity.com\/"/);
  assert.match(output, /Object.freeze/);
  for (const [constant, filename] of [
    ['GAMZIX_RELEASES', 'gamzix-games'], ['AVATARUX_RELEASES', 'avatarux-games'],
    ['THREE_OAKS_RELEASES', 'three-oaks-games'],
  ]) {
    assert.ok(output.includes(`import { ${constant} } from './${filename}.js'`));
    assert.ok(output.includes(`...${constant}`));
  }
});

test('release import refuses missing or ambiguous matches instead of inventing a date', () => {
  assert.throws(() => buildReleaseData([{ ...game, title: 'Missing' }], calendar), /No unique official release/);
  assert.throws(() => buildReleaseData([game], { ...calendar,
    games: [...calendar.games, { ...calendar.games[0], title: 'EXAMPLE GAME' }] }), /Ambiguous/);
  assert.throws(() => buildReleaseData([game, game], calendar), /Duplicate catalog ID/);
  assert.throws(() => buildReleaseData([game, { ...game, id: 'different-provider-same-title' }], calendar), /Ambiguous catalog title/);
  assert.throws(() => buildReleaseData([game], { ...calendar, source: 'https://unrelated.test/' }), /official release calendar/);
});

test('release import rejects invalid dates, future releases and unverified page origins', () => {
  for (const date of ['37th April 2026', '31st February 2026', '', '2026-10-01']) {
    assert.throws(() => buildReleaseData([game], { ...calendar,
      games: [{ ...calendar.games[0], date }] }), /release date|release day/);
  }
  assert.throws(() => buildReleaseData([game], { ...calendar,
    games: [{ ...calendar.games[0], date: '2nd November 2026' }] }), /Unreleased/);
  assert.throws(() => buildReleaseData([game], { ...calendar,
    games: [{ ...calendar.games[0], url: 'https://unrelated.test/games/example' }] }), /Unexpected official game page/);
});

test('Table Games groups eighteen visible table and card games without changing their exact formats', () => {
  const cases = { blackjack3ne0000: 'blackjack', ameriroulette3ne: 'roulette', roulette2advne00: 'roulette',
    roulettesne00000: 'roulette', baccarat2ne00000: 'baccarat', casinoholdemne00: 'poker', jacksmultihandn1: 'video-poker',
    'bgaming-american-roulette': 'roulette', 'bgaming-european-roulette': 'roulette',
    'bgaming-multihand-blackjack': 'blackjack',
    'bgaming-classic-baccarat': 'baccarat', 'bgaming-classic-multihand-blackjack': 'blackjack',
    'bgaming-french-roulette': 'roulette', 'bgaming-multihand-blackjack-pro': 'blackjack',
    'bgaming-multihand-blackjack-pro-2': 'blackjack', 'bgaming-royal-roulette-500x': 'roulette',
    'bgaming-speed-blackjack-pro': 'blackjack', 'bgaming-surrender-multihand-blackjack': 'blackjack' };
  const slots = new Set(getGamesForCategory('slots').map(game => game.id));
  for (const [id, type] of Object.entries(cases)) {
    const game = GAMES.find(game => game.id === id);
    assert.equal(getGameTypeId(game), type);
    assert.ok(getGamesForCategory(type).includes(game));
    assert.ok(getGameCategoryIds(game).includes(type));
    assert.ok(getGameCategoryIds(game).includes('table'));
    assert.equal(slots.has(id), false);
  }
  assert.equal(GAME_FAMILIES.find(category => category.id === 'table').title, 'Table Games');
  assert.deepEqual(new Set(getGamesForCategory('table').map(game => game.id)), new Set(Object.keys(cases)));
  for (const id of ['hacksaw-1590', 'hacksaw-1321', 'hacksaw-2491']) {
    assert.equal(getGamesForCategory('table').some(game => game.id === id), false, id);
  }
  assert.equal(getGamesForCategory('video-poker').length, 1);
  assert.equal(getGameTypeId({ id: 'blackjack3ne0000', vertical: 'live' }), 'blackjack');
  assert.equal(GAME_TYPES.some(type => type.id === 'live'), false);
  assert.equal(new Set(FILTER_CATEGORIES.map(category => category.id)).size, FILTER_CATEGORIES.length);
});

test('Casual Games groups quick mechanics and keeps reel and table games in their own families', () => {
  const instant = getGamesForCategory('instant-win');
  const crash = getGamesForCategory('crash');
  const combined = [...instant, ...crash];
  assert.equal(instant.length, 41);
  assert.deepEqual(crash.map(game => game.id), [
    'bgaming-space-xy', 'bgaming-gift-x', 'bgaming-lucky-birds', 'bgaming-top-eagle',
  ]);
  assert.equal(combined.length, 45);
  assert.ok(instant.every(game => getGameTypeId(game) === 'instant-win'));
  assert.ok(crash.every(game => getGameTypeId(game) === 'crash'));
  const speedCrash = ALL_GAMES.find(game => game.id === 'hacksaw-1632');
  assert.equal(getGameTypeId(speedCrash), 'instant-win', 'title wording must not override the provider format');
  const arcade = getGamesForCategory('arcade');
  assert.equal(arcade.length, 45);
  assert.equal(GAME_FAMILIES.find(category => category.id === 'arcade').title, 'Casual Games');
  const reelGame = GAMES.find(game => game.id === 'bgaming-elements-of-power');
  assert.ok(getGamesForCategory('slots').includes(reelGame));
  assert.equal(arcade.includes(reelGame), false);
  const cardIds = new Set(['hacksaw-1446', 'hacksaw-1416', 'hacksaw-1328']);
  assert.deepEqual(new Set(arcade.map(game => game.id)),
    new Set(combined.filter(game => !cardIds.has(game.id)).map(game => game.id)));
  assert.equal(arcade.includes(speedCrash), false, 'unreviewed artwork keeps the game out of visible collections');
  assert.ok(arcade.includes(crash[0]));
  for (const game of combined) {
    const categories = getGameCategoryIds(game);
    assert.equal(categories.includes('arcade'), !cardIds.has(game.id), game.id);
    assert.equal(categories.includes('table'), cardIds.has(game.id), game.id);
    assert.equal(categories.includes('hacksaw-gaming'), false, game.id);
    assert.equal(game.providerId, 'bgaming');
    assert.ok(categories.includes(getGameTypeId(game)), game.id);
    assert.equal(categories.includes('slots'), false, game.id);
    assert.equal(categories.includes('scratchcards'), false, game.id);
    assert.equal(categories.includes('scratch-tap'), false, game.id);
    assert.equal(new Set(categories).size, categories.length, game.id);
  }
  for (const id of ['instant-games', 'instant-win', 'crash', 'blackjack', 'roulette', 'baccarat', 'poker', 'video-poker']) {
    assert.equal(CATEGORIES.some(category => category.id === id), false, id);
    assert.equal(FILTER_CATEGORIES.some(category => category.id === id), false, `${id} remains a detail format`);
  }
});

test('reviewed Scratchcards retain exact membership while the old combined link includes visible Tap Games', () => {
  const tap = getGamesForCategory('tap');
  const scratch = getGamesForCategory('scratchcards');
  const combined = getGamesForCategory('scratch-tap');
  assert.equal(combined.length, 25);
  assert.deepEqual(scratch.map(game => game.id), [
    'bgaming-scratch-dice', 'bgaming-3-kings-scratch', 'bgaming-capymania-green',
    'bgaming-capymania-orange', 'bgaming-capymania-yellow', 'bgaming-ice-scratch',
    'bgaming-ice-scratch-gold', 'bgaming-ice-scratch-silver', 'bgaming-luck-magic-scratch',
    'bgaming-scratch-alpaca', 'bgaming-scratch-alpaca-gold', 'bgaming-scratch-alpaca-silver',
  ]);
  assert.equal(GAME_FAMILIES.some(family => family.id === 'scratchcards'), true);
  assert.equal(CATEGORIES.some(category => category.id === 'scratch-tap'), false);
  assert.equal(FILTER_CATEGORIES, CATEGORIES);
  assert.deepEqual(new Set(combined.map(game => game.id)), new Set([...tap, ...scratch].map(game => game.id)));
  for (const game of combined) {
    const type = getGameTypeId(game);
    assert.ok(['tap', 'scratchcards'].includes(type), game.id);
    assert.ok(getGameCategoryIds(game).includes(type), game.id);
    assert.ok(getGameCategoryIds(game).includes('scratch-tap'), game.id);
  }
});
