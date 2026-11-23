import test from 'node:test';
import assert from 'node:assert/strict';
import { getFrameLayout, getLaunchUrl, needsLandscapeViewport } from '../public/game-presentation.js';
import { BGAMING_GAMES } from '../public/bgaming-games.js';
import { GAMZIX_GAMES } from '../public/gamzix-games.js';
import { AVATARUX_GAMES } from '../public/avatarux-games.js';
import { THREE_OAKS_GAMES } from '../public/three-oaks-games.js';

const nunchucks = { id: 'nunchucksr96f100', providerId: 'netent' };

test('reviewed provider demos preserve their published launch URLs on desktop and mobile', () => {
  for (const game of [...BGAMING_GAMES, ...GAMZIX_GAMES, ...AVATARUX_GAMES, ...THREE_OAKS_GAMES,
    { providerId: 'bgaming', providerGameId: 'Adventures',
    url: 'https://bgaming-network.com/play/Adventures/FUN?server=demo' }]) {
    for (const device of ['desktop', 'mobile']) assert.equal(getLaunchUrl(game, device), game.url);
  }
});

test('BGaming rejects non-demo URLs and mismatched game identifiers', () => {
  const game = { providerId: 'bgaming', providerGameId: 'BookOfCats' };
  for (const url of [
    'https://unrelated.test/play/BookOfCats/FUN?server=demo',
    'https://bgaming-network.com.unrelated.test/play/BookOfCats/FUN?server=demo',
    'https://demo.bgaming-network.com/play/BookOfCats/USD?server=demo',
    'https://demo.bgaming-network.com/play/Plinko/FUN?server=demo',
    'https://demo.bgaming-network.com/play/BookOfCats/FUN?server=real',
    'https://user@demo.bgaming-network.com/play/BookOfCats/FUN?server=demo',
  ]) assert.throws(() => getLaunchUrl({ ...game, url }, 'mobile'), /Invalid BGaming public demo URL/);
});

test('Gamzix rejects unrelated hosts, direct session URLs and modified shortlinks', () => {
  const game = GAMZIX_GAMES[0];
  for (const url of [
    'http://link.gamzix.com/Solar-Strike-Hold-The-Spin',
    'https://link.gamzix.com.unrelated.test/Solar-Strike-Hold-The-Spin',
    'https://user:password@link.gamzix.com/Solar-Strike-Hold-The-Spin',
    'https://cdn-v2.fmk0.com/solar-strike-hold-the-spin/v1.0.3/?sid=demo_2051',
    'https://link.gamzix.com/',
    'https://link.gamzix.com/nested/Solar-Strike-Hold-The-Spin',
    'https://link.gamzix.com/Solar-Strike-Hold-The-Spin?device=mobile',
    'https://link.gamzix.com/Solar-Strike-Hold-The-Spin#session',
  ]) assert.throws(() => getLaunchUrl({ ...game, url }, 'mobile'), /Invalid Gamzix public demo URL/);
});

test('AvatarUX and 3 Oaks reject altered origins, game identities and non-demo parameters', () => {
  const avatarDirect = AVATARUX_GAMES.find(game => new URL(game.url).hostname === 'cdn-demo-eu.avatarux.app');
  const avatarLauncher = AVATARUX_GAMES.find(game => new URL(game.url).pathname === '/launch/fun');
  assert.ok(avatarDirect);
  assert.ok(avatarLauncher);
  const change = (game, edit) => { const url = new URL(game.url); edit(url); return url.href; };
  for (const game of [avatarDirect, avatarLauncher, THREE_OAKS_GAMES[0]]) {
    const invalid = [
      change(game, url => { url.protocol = 'http:'; }),
      change(game, url => { url.hostname += '.unrelated.test'; }),
      change(game, url => { url.username = 'user'; }),
      change(game, url => { url.hash = 'session'; }),
      change(game, url => { url.pathname += '/extra'; }),
      change(game, url => { const [key, value] = url.searchParams.entries().next().value; url.searchParams.append(key, value); }),
    ];
    if (game.providerId === 'avatarux') {
      for (const [key, value] of [['game', 'different-game'], ['wallet', 'real'], ['operator', 'real'], ['provider', 'other']]) {
        invalid.push(change(game, url => { url.searchParams.set(key, value); }));
      }
      if (game === avatarDirect) {
        invalid.push(change(game, url => { url.searchParams.set('server', 'https://unrelated.test'); }));
        invalid.push(change(game, url => { url.searchParams.set('key', 'session-key'); }));
      } else invalid.push(change(game, url => { url.searchParams.set('key', 'session-key'); }));
    } else {
      invalid.push(change(game, url => { url.searchParams.set('lang', ''); }));
      invalid.push(change(game, url => { url.searchParams.set('mode', 'real'); }));
      invalid.push(change(game, url => { url.pathname = url.pathname.replace(game.providerGameId, 'different_game'); }));
    }
    for (const url of invalid) for (const device of ['desktop', 'mobile']) {
      assert.throws(() => getLaunchUrl({ ...game, url }, device), /Invalid (AvatarUX|3 Oaks) public demo URL/, url);
    }
    assert.throws(() => getLaunchUrl({ ...game, providerGameId: '../invalid' }, 'desktop'), /Invalid (AvatarUX|3 Oaks) public demo URL/);
  }
});

test('Nunchucks compatibility recognizes both iPad identities without changing phones or other games', () => {
  const ipad = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' };
  const desktopIPad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 };
  assert.equal(needsLandscapeViewport(nunchucks, ipad), true);
  assert.equal(needsLandscapeViewport(nunchucks, desktopIPad), true);
  assert.equal(needsLandscapeViewport(nunchucks, { ...desktopIPad, maxTouchPoints: 0 }), false);
  assert.equal(needsLandscapeViewport(nunchucks, { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 }), false);
  assert.equal(needsLandscapeViewport(nunchucks, { userAgent: 'Android', maxTouchPoints: 5 }), false);
  assert.equal(needsLandscapeViewport({ ...nunchucks, id: 'another-netent-game' }, ipad), false);
  assert.equal(needsLandscapeViewport({ ...nunchucks, providerId: 'red-tiger' }, ipad), false);
});

test('portrait iPads get a centered, uncropped landscape document, including narrow Split View', () => {
  for (const [width, height] of [[768, 960], [820, 1116], [834, 1130], [1024, 1302], [375, 960], [820, 820]]) {
    const layout = getFrameLayout(nunchucks, 'mobile', width, height, true);
    assert.ok(layout.width > layout.height, 'the provider media query must see landscape');
    assert.equal(layout.width, width, 'use all available horizontal space');
    assert.equal(layout.scale, 1, 'do not rotate or shrink the controls with CSS transforms');
    assert.equal(layout.top * 2 + layout.height, height, 'center vertically');
    assert.ok(layout.top >= 0 && layout.top + layout.height <= height, 'all controls stay inside the viewport');
  }
});

test('landscape rotation, ordinary devices and existing desktop fitting retain their normal layout', () => {
  assert.equal(getFrameLayout(nunchucks, 'mobile', 1180, 756, true), null);
  assert.equal(getFrameLayout(nunchucks, 'mobile', 390, 780, false), null);
  assert.equal(getFrameLayout(nunchucks, 'desktop', 820, 1116, false), null);
  assert.equal(getFrameLayout(nunchucks, 'mobile', 0, 1116, true), null);
  const redTiger = getFrameLayout({ providerId: 'red-tiger' }, 'desktop', 640, 388);
  assert.equal(redTiger.width, 1280);
  assert.equal(redTiger.height, 776);
  assert.equal(redTiger.scale, 0.5);
});
