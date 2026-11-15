import assert from 'node:assert/strict';
import test from 'node:test';
import { FEATURE_PAGES } from '../public/feature-pages.js';
import { formatRoute, parseRoute } from '../public/routes.js';

test('old Free Money links resolve to the canonical Achievements page', () => {
  assert.deepEqual(parseRoute('#/free-money'), { type: 'feature', pageId: 'achievements' });
  assert.deepEqual(parseRoute('#/free-money/?q=old'), { type: 'feature', pageId: 'achievements' });
  assert.equal(formatRoute({ type: 'feature', pageId: 'free-money' }), '#/achievements');
});

test('each member area has its own refresh-safe route without catalog filters leaking in', () => {
  for (const pageId of Object.keys(FEATURE_PAGES)) {
    const route = { type: 'feature', pageId };
    const hash = formatRoute(route);
    assert.equal(hash, `#/${pageId}`);
    assert.deepEqual(parseRoute(hash), route);
    assert.deepEqual(parseRoute(`${hash}?q=gold&provider=netent&category=slots&sort=az`), route);
  }
});

test('removed CoinBack, notifications and redeem pages resolve to the lobby', () => {
  for (const pageId of ['coinback', 'notifications', 'redeem']) {
    assert.deepEqual(parseRoute(`#/${pageId}`), { type: 'home' });
    assert.deepEqual(parseRoute(`#/${pageId}/?q=old`), { type: 'home' });
    assert.equal(formatRoute({ type: 'feature', pageId }), '#/');
  }
});

test('unknown member URLs cannot turn into arbitrary pages and game links retain a member origin', () => {
  for (const hash of ['#/not-a-member-page', '#/bonus-hub', '#/missions', '#/promotions', '#/crypto-earn', '#/lounge', '#/lounge/unknown', '#/vip-club', '#/rank-system', '#/daily-bonus', '#/invite-friends', '#/affiliate-program', '#/partners', '#/blog', '#/profile/../../settings']) {
    assert.deepEqual(parseRoute(hash), { type: 'home' });
  }
  const origin = formatRoute({ type: 'feature', pageId: 'history' });
  const game = { type: 'game', gameId: 'niptuck000000000', from: origin };
  assert.deepEqual(parseRoute(formatRoute(game)), game);
  assert.deepEqual(parseRoute(parseRoute(formatRoute(game)).from), { type: 'feature', pageId: 'history' });
});
