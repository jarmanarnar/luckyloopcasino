import { THREE_OAKS_GAMES } from './three-oaks-games.js';

const threeOaksGameIds = new Set(THREE_OAKS_GAMES.map(game => game.providerGameId));

// Stable public demo entrypoints, as published on the providers' game pages.
// Never persist redirected session URLs or add another provider's device hints.
export function getProviderDemoUrl(game, device = 'desktop') {
  if (!['avatarux', '3-oaks', 'relax'].includes(game.providerId)) return undefined;
  const url = new URL(game.url);
  const params = url.searchParams;
  const uniqueParams = new Set(params.keys()).size === [...params.keys()].length;
  const clean = !url.username && !url.password && !url.hash && uniqueParams;
  if (game.providerId === 'relax') {
    if (!clean || url.origin !== 'https://d2drhksbtcqozo.cloudfront.net' ||
        url.pathname !== '/casino/launcher.html' || !/^[a-z0-9]+$/.test(game.providerGameId) ||
        params.size !== 5 || params.get('gameid') !== game.providerGameId ||
        params.get('channel') !== 'web' || params.get('moneymode') !== 'fun' ||
        params.get('jurisdiction') !== 'MT' || params.get('partnerid') !== '1') {
      throw new Error('Invalid Relax public demo URL');
    }
    // Both channels are published by the official product page.
    if (device === 'mobile') { params.set('channel', 'mobile'); return url.href; }
  } else if (game.providerId === 'avatarux') {
    const launcher = url.origin === 'https://demo-eu.avatarux.app' &&
      url.pathname === '/launch/fun' && params.size === 4;
    const direct = url.origin === 'https://cdn-demo-eu.avatarux.app' &&
      url.pathname === `/${game.providerGameId}/index.html` &&
      params.get('server') === 'https://demo-eu.avatarux.app' && params.get('key') === '';
    if (!clean || (!launcher && !direct) ||
        !/^[a-z0-9-]+$/.test(game.providerGameId) ||
        params.get('game') !== game.providerGameId || params.get('wallet') !== 'demo' ||
        params.get('operator') !== 'demo' || params.get('provider') !== 'avatarux') {
      throw new Error('Invalid AvatarUX public demo URL');
    }
  } else {
    if (!clean || url.origin !== 'https://3oaks.com' ||
        !threeOaksGameIds.has(game.providerGameId) ||
        url.pathname !== `/api/v1/games/${game.providerGameId}/play` ||
        params.size !== 1 || params.get('lang') !== 'en') {
      throw new Error('Invalid 3 Oaks public demo URL');
    }
    // The marketing wrapper forbids cross-origin framing. This provider-owned
    // public demo launcher is published for 3 China Pots and other titles.
    // token=test is the literal public demo parameter, never a saved session.
    // All catalog game IDs were matched to the official launcher's game list.
    // Evidence: assets/games/three-oaks-review-2026-11-23.md.
    const demo = new URL('https://betman-demo.head.3oaks.com/betman-demo/game/');
    demo.search = new URLSearchParams({ game: game.providerGameId, ts: '123', token: 'test', wl: 'demo' });
    return demo.href;
  }
  return game.url;
}
