import { GAMES } from './catalog.js';
import { getProviderDemoUrl } from './provider-demo-urls.js';

function getNolimitCatalogCode(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.origin !== 'https://playin.com' || url.username || url.password) return null;
    const code = /^\/embed\/v1\/demo\/([A-Z][A-Za-z0-9]*)$/.exec(url.pathname)?.[1];
    // The public NLC loader requires a mixed-case PascalCase game name.
    return code && code !== code.toUpperCase() ? code : null;
  } catch {
    return null;
  }
}

const nolimitCatalogCodes = new Set(GAMES
  .filter(game => game.providerId === 'nolimit-city')
  .map(game => getNolimitCatalogCode(game.url))
  .filter(Boolean));

export function getLaunchDevice(width, touchCapable = false) {
  return width <= 1024 || touchCapable ? 'mobile' : 'desktop';
}

export function getDemoUrl(baseUrl, device) {
  const url = new URL(baseUrl);
  // Public mobile launcher documented at https://playin.com/affiliates-info.
  // This is a wrapper hint, not a mobile UA override. Playin's NLC page also
  // checks UA/touch; its separate OSS renderer does not forward this option.
  if (device === 'mobile') url.searchParams.set('device', 'mobile');
  else url.searchParams.delete('device');
  return url.href;
}

export function getLaunchUrl(game, device) {
  const providerDemoUrl = getProviderDemoUrl(game);
  if (providerDemoUrl) return providerDemoUrl;
  if (game.providerId === 'gamzix') {
    const url = new URL(game.url);
    if (url.origin !== 'https://link.gamzix.com' || url.username || url.password || url.search || url.hash ||
        !/^\/[A-Za-z0-9-]+$/.test(url.pathname) || !/^\d+$/.test(game.providerGameId)) {
      throw new Error('Invalid Gamzix public demo URL');
    }
    // The published shortlink selects a current demo build/session. Preserve
    // it on both devices; temporary CDN redirects and Playin hints are not stable launch URLs.
    return game.url;
  }
  if (game.providerId === 'bgaming') {
    const url = new URL(game.url);
    // Official pages publish both hosts (for example Adventures uses the root host).
    if (!['https://demo.bgaming-network.com', 'https://bgaming-network.com'].includes(url.origin) || url.username || url.password ||
        typeof game.providerGameId !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(game.providerGameId) ||
        url.pathname !== `/play/${game.providerGameId}/FUN` ||
        (url.searchParams.has('server') && url.searchParams.get('server') !== 'demo')) {
      throw new Error('Invalid BGaming public demo URL');
    }
    // Official /play links create a fresh FUN demo session. BGaming selects
    // its mobile UI from the browser's UA/touch capabilities; Playin's device
    // query is not part of this launcher. Preserve the reviewed public URL.
    return game.url;
  }
  if (game.providerId === 'hacksaw-gaming') {
    if (!/^\d+$/.test(game.providerGameId)) throw new Error('Invalid Hacksaw demo game ID');
    return `hacksaw-demo.html?${new URLSearchParams({ game: game.providerGameId, device })}`;
  }
  if (game.providerId === 'nolimit-city') {
    const code = getNolimitCatalogCode(game.url);
    if (code && nolimitCatalogCodes.has(code)) {
      // Source: https://nolimitjs.nolimitcdn.com/dist/nolimit-latest.js
      // Loader: https://demo.nolimitcdn.com/loader/game-loader.html
      // nolimit.url() generates this public loader; its HTML forwards the
      // game's ready event and honors the explicit device mode. Demo only,
      // using the same public FANPAGE_DEMO operator as Playin's NLC renderer.
      // This applies to NLC PascalCase catalog codes, not the other studios'
      // OSS table IDs. It does not force a mobile UA/build for NetEnt or OSS.
      const url = new URL('https://demo.nolimitcdn.com/loader/game-loader.html');
      url.searchParams.set('environment', 'demo');
      url.searchParams.set('operator', 'FANPAGE_DEMO');
      url.searchParams.set('game', code);
      url.searchParams.set('device', device);
      url.searchParams.set('language', 'en');
      return url.href;
    }
  }
  return getDemoUrl(game.url, device);
}

export function getFrameScale(providerId, device, width, height) {
  // Verified Red Tiger desktop stage: 1280×720 plus its 56px help toolbar.
  // Leave the full logical height available before scaling to a short window.
  return providerId === 'red-tiger' && device === 'desktop'
    ? Math.min(width / 1280, height / 776) : 1;
}

export function needsLandscapeViewport(game, { userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  // iPadOS can use either the iPad UA or Safari's desktop Mac identity.
  const isIPad = /iPad/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return isIPad && game.providerId === 'netent' && game.id === 'nunchucksr96f100';
}

export function getFrameLayout(game, device, width, height, landscapeViewport = false) {
  if (width <= 0 || height <= 0) return null;
  if (landscapeViewport && height >= width) {
    // The tablet player blocks portrait viewports. Give the embedded document
    // a genuine landscape viewport, upright and fully visible inside the iPad.
    // CSS rotation or changing the launch hint does not change its media queries.
    // Keep the same iframe/session when the available space changes.
    const frameHeight = width * 9 / 16;
    return { width, height: frameHeight, top: (height - frameHeight) / 2,
      scale: 1, presentation: 'landscape-contained' };
  }
  const scale = getFrameScale(game.providerId, device, width, height);
  return scale === 1 ? null : { width: width / scale, height: height / scale,
    top: 0, scale, presentation: 'scaled' };
}
