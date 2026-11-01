import assert from 'node:assert/strict';
import test from 'node:test';
import { HACKSAW_GAMES, HACKSAW_ARTWORK } from '../public/hacksaw-games.js';
import { launchHacksawDemo } from '../public/hacksaw-demo.js';
import { getLaunchUrl } from '../public/game-presentation.js';
import { getGameReleaseDate, getGamesForCategory } from '../public/collections.js';
import { getCatalogPage } from '../public/catalog-page-model.js';

const game = HACKSAW_GAMES.find(game => game.providerGameId === '1309');
const demoUrl = 'https://static-live.hacksawgaming.com/1309/1.26.2/index.html?gameid=1309&mode=2&partner=demo&token=demo';
function harness(device = 'desktop') {
  const frame = { id: 'provider-game' }, loaded = [], errors = [], calls = [];
  let resolve;
  const dispose = launchHacksawDemo({ gameId: game.providerGameId, device, frame,
    sdk: { include(id, options, callback) { calls.push({ id, options }); resolve = callback; } },
    onLoaded: id => loaded.push(id), onError: () => errors.push('error') });
  return { frame, loaded, errors, calls, dispose, resolve: value => resolve(value) };
}

test('all 257 additional games retain unique official IDs, available artwork and source section formats', () => {
  assert.equal(HACKSAW_GAMES.length, 257);
  assert.equal(new Set(HACKSAW_GAMES.map(game => game.providerGameId)).size, 257);
  const expected = { slots: 190, 'instant-win': 14, scratchcards: 52, crash: 1 };
  for (const [format, count] of Object.entries(expected)) {
    const games = HACKSAW_GAMES.filter(game => game.formatId === format);
    assert.equal(games.length, count);
    for (const item of games) {
      assert.ok(getGamesForCategory(format).includes(item));
      assert.equal(item.id, `hacksaw-${item.providerGameId}`);
      assert.ok(HACKSAW_ARTWORK[item.id]);
      assert.equal(new URL(item.url).origin, 'https://www.hacksawgaming.com');
      assert.equal(getGameReleaseDate(item), '', 'software activation and import dates never substitute for release dates');
    }
  }
});

test('provider launch resolves the current version through the public demo SDK on desktop and mobile', () => {
  for (const device of ['desktop', 'mobile']) {
    const h = harness(device);
    assert.equal(h.frame.src, undefined);
    assert.equal(h.calls[0].options.mode, 'demo');
    assert.equal(h.calls[0].options.partner, 'demo');
    assert.equal(h.calls[0].options.channel, device);
    assert.equal(h.calls[0].options.token, undefined);
    assert.equal(h.calls[0].options.iniframe, true);
    h.resolve(demoUrl);
    assert.equal(h.frame.src, demoUrl);
    assert.deepEqual(h.loaded, []);
    h.frame.onload();
    assert.deepEqual(h.loaded, [game.id]);
    assert.equal(h.frame.onload, null);
    assert.equal(getLaunchUrl(game, device), `hacksaw-demo.html?game=1309&device=${device}`);
  }
});

test('unknown games and unexpected or real-money SDK URLs cannot mount a provider game', () => {
  for (const value of [demoUrl.replace('static-live.hacksawgaming.com', 'unrelated.test'),
    demoUrl.replace('mode=2', 'mode=1'), demoUrl.replace('gameid=1309', 'gameid=1067'),
    demoUrl.replace('partner=demo', 'partner=private-operator'), demoUrl.replace('token=demo', 'token=not-a-public-demo')]) {
    const h = harness();
    h.resolve(value);
    assert.equal(h.frame.src, undefined);
    assert.deepEqual(h.errors, ['error']);
    assert.deepEqual(h.loaded, []);
  }
  let calls = 0, errors = 0;
  launchHacksawDemo({ gameId: 'not-in-catalog', device: 'desktop', frame: {}, sdk: { include() { calls++; } },
    onLoaded() { assert.fail('Unknown game cannot load'); }, onError() { errors++; } });
  assert.equal(calls, 0);
  assert.equal(errors, 1);
});

test('leaving before SDK resolution or provider load ignores stale callbacks', () => {
  const h = harness();
  h.dispose(); h.resolve(demoUrl);
  assert.equal(h.frame.src, undefined);
  assert.deepEqual(h.loaded, []);
  const active = harness();
  active.resolve(demoUrl);
  const pendingLoad = active.frame.onload;
  active.dispose(); pendingLoad();
  assert.deepEqual(active.loaded, []);
});

test('unknown release dates sort after verified dates and do not enter New Releases', () => {
  const page = getCatalogPage({ type: 'search', sort: 'newest' });
  const firstUnknown = page.games.findIndex(game => !getGameReleaseDate(game));
  assert.equal(firstUnknown, 823);
  assert.ok(page.games.slice(firstUnknown).every(game => game.providerId === 'hacksaw-gaming'));
  assert.equal(getGamesForCategory('new-releases').some(game => game.providerId === 'hacksaw-gaming'), false);
  const provider = getCatalogPage({ type: 'provider', providerId: 'hacksaw-gaming', sort: 'newest' });
  assert.equal(provider.allowedSorts.includes('newest'), false);
  assert.equal(provider.sort, 'az', 'a completely undated provider does not offer a false newest ranking');
});
