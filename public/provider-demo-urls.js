// Stable public demo entrypoints, as published on the providers' game pages.
// Never persist redirected session URLs or add another provider's device hints.
export function getProviderDemoUrl(game) {
  if (!['avatarux', '3-oaks'].includes(game.providerId)) return undefined;
  const url = new URL(game.url);
  const params = url.searchParams;
  const uniqueParams = new Set(params.keys()).size === [...params.keys()].length;
  const clean = !url.username && !url.password && !url.hash && uniqueParams;
  if (game.providerId === 'avatarux') {
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
  } else if (!clean || url.origin !== 'https://3oaks.com' ||
      !/^[a-z0-9_]+$/.test(game.providerGameId) ||
      url.pathname !== `/api/v1/games/${game.providerGameId}/play` ||
      params.size !== 1 || params.get('lang') !== 'en') {
    throw new Error('Invalid 3 Oaks public demo URL');
  }
  return game.url;
}
