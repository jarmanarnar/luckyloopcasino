import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleaseData, releaseModule } from '../scripts/import-release-calendar.mjs';
import { GAMES } from '../public/catalog.js';
import { CATEGORIES, FILTER_CATEGORIES, getGameCategoryIds, getGamesForCategory } from '../public/collections.js';
import { GAME_TYPES, getGameTypeId } from '../public/game-types.js';
import { formatRoute, parseRoute } from '../public/routes.js';

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

test('Table & Cards groups ten table and card games without changing their exact formats', () => {
  const cases = { blackjack3ne0000: 'blackjack', ameriroulette3ne: 'roulette', roulette2advne00: 'roulette',
    roulettesne00000: 'roulette', baccarat2ne00000: 'baccarat', casinoholdemne00: 'poker', jacksmultihandn1: 'video-poker',
    'hacksaw-1446': 'instant-win', 'hacksaw-1416': 'instant-win', 'hacksaw-1328': 'instant-win' };
  const slots = new Set(getGamesForCategory('slots').map(game => game.id));
  for (const [id, type] of Object.entries(cases)) {
    const game = GAMES.find(game => game.id === id);
    assert.equal(getGameTypeId(game), type);
    assert.ok(getGamesForCategory(type).includes(game));
    assert.ok(getGameCategoryIds(game).includes(type));
    assert.ok(getGameCategoryIds(game).includes('table'));
    assert.equal(slots.has(id), false);
    const route = { type: 'category', categoryId: type };
    assert.deepEqual(parseRoute(formatRoute(route)), route);
  }
  assert.equal(CATEGORIES.find(category => category.id === 'table').title, 'Table & Cards');
  assert.deepEqual(new Set(getGamesForCategory('table').map(game => game.id)), new Set(Object.keys(cases)));
  for (const id of ['hacksaw-1590', 'hacksaw-1321', 'hacksaw-2491']) {
    assert.equal(getGamesForCategory('table').some(game => game.id === id), false, id);
  }
  assert.equal(getGamesForCategory('video-poker').length, 1);
  assert.equal(getGamesForCategory('tap').length, 13);
  assert.equal(getGamesForCategory('slots').length, 993);
  assert.equal(getGameTypeId({ id: 'blackjack3ne0000', vertical: 'live' }), 'blackjack');
  assert.equal(GAME_TYPES.some(type => type.id === 'live'), false);
  assert.equal(new Set(FILTER_CATEGORIES.map(category => category.id)).size, FILTER_CATEGORIES.length);
});

test('Arcade & Crash groups quick mechanics but leaves card games in Table & Cards', () => {
  const instant = getGamesForCategory('instant-win');
  const crash = getGamesForCategory('crash');
  const combined = [...instant, ...crash];
  assert.equal(instant.length, 14);
  assert.deepEqual(crash.map(game => game.id), ['hacksaw-2491']);
  assert.equal(combined.length, 15);
  assert.ok(instant.every(game => getGameTypeId(game) === 'instant-win'));
  assert.ok(crash.every(game => getGameTypeId(game) === 'crash'));
  const speedCrash = GAMES.find(game => game.id === 'hacksaw-1632');
  assert.equal(getGameTypeId(speedCrash), 'instant-win', 'title wording must not override the provider format');
  const arcade = getGamesForCategory('arcade');
  assert.equal(arcade.length, 12);
  const cardIds = new Set(['hacksaw-1446', 'hacksaw-1416', 'hacksaw-1328']);
  assert.deepEqual(new Set(arcade.map(game => game.id)),
    new Set(combined.filter(game => !cardIds.has(game.id)).map(game => game.id)));
  assert.ok(arcade.includes(speedCrash));
  assert.ok(arcade.includes(crash[0]));
  for (const game of combined) {
    const categories = getGameCategoryIds(game);
    assert.equal(categories.includes('arcade'), !cardIds.has(game.id), game.id);
    assert.equal(categories.includes('table'), cardIds.has(game.id), game.id);
    assert.equal(categories.includes('hacksaw-gaming'), false, game.id);
    assert.equal(game.providerId, 'hacksaw-gaming');
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

test('Scratchcards and Tap Games are distinct primary families while their old combined link remains available', () => {
  const tap = getGamesForCategory('tap');
  const scratch = getGamesForCategory('scratchcards');
  const combined = getGamesForCategory('scratch-tap');
  assert.equal(tap.length, 13);
  assert.equal(scratch.length, 52);
  assert.equal(combined.length, 65);
  assert.ok(CATEGORIES.some(category => category.id === 'scratchcards'));
  assert.ok(CATEGORIES.some(category => category.id === 'tap'));
  assert.equal(CATEGORIES.some(category => category.id === 'scratch-tap'), false);
  assert.deepEqual(FILTER_CATEGORIES.map(category => category.id), ['slots', 'table', 'scratchcards', 'tap', 'arcade']);
  assert.deepEqual(new Set(combined.map(game => game.id)), new Set([...tap, ...scratch].map(game => game.id)));
  for (const game of combined) {
    const type = getGameTypeId(game);
    assert.ok(['tap', 'scratchcards'].includes(type), game.id);
    assert.ok(getGameCategoryIds(game).includes(type), game.id);
    assert.ok(getGameCategoryIds(game).includes('scratch-tap'), game.id);
  }
});
