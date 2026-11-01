import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleaseData, releaseModule } from '../scripts/import-release-calendar.mjs';
import { GAMES } from '../public/catalog.js';
import { FILTER_CATEGORIES, getGamesForCategory } from '../public/collections.js';
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

test('table and video poker formats remain separate from slots, tap games and live-dealer claims', () => {
  const cases = { blackjack3ne0000: 'blackjack', ameriroulette3ne: 'roulette', roulette2advne00: 'roulette',
    roulettesne00000: 'roulette', baccarat2ne00000: 'baccarat', casinoholdemne00: 'poker', jacksmultihandn1: 'video-poker' };
  const slots = new Set(getGamesForCategory('slots').map(game => game.id));
  for (const [id, type] of Object.entries(cases)) {
    const game = GAMES.find(game => game.id === id);
    assert.equal(getGameTypeId(game), type);
    assert.ok(getGamesForCategory(type).includes(game));
    assert.equal(slots.has(id), false);
    const route = { type: 'category', categoryId: type };
    assert.deepEqual(parseRoute(formatRoute(route)), route);
  }
  assert.equal(getGamesForCategory('table').length, 6);
  assert.equal(getGamesForCategory('video-poker').length, 1);
  assert.equal(getGamesForCategory('tap').length, 13);
  assert.equal(getGamesForCategory('slots').length, 993);
  assert.equal(getGameTypeId({ id: 'blackjack3ne0000', vertical: 'live' }), 'blackjack');
  assert.equal(GAME_TYPES.some(type => type.id === 'live'), false);
  assert.equal(new Set(FILTER_CATEGORIES.map(category => category.id)).size, FILTER_CATEGORIES.length);
});
