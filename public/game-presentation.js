import { GAMES } from './catalog.js';

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
