import { HACKSAW_GAMES } from './hacksaw-games.js';

const games = new Map(HACKSAW_GAMES.map(game => [game.providerGameId, game]));
const SDK_URL = 'https://static-live.hacksawgaming.com/launcher/hacksaw-launcher.min.js';

export function launchHacksawDemo({ gameId, device, frame, sdk, onLoaded, onError }) {
  const game = games.get(gameId);
  let disposed = false;
  const dispose = () => { disposed = true; frame.onload = null; frame.onerror = null; };
  const fail = () => { if (!disposed) { dispose(); onError(); } };
  if (!game || !['desktop', 'mobile'].includes(device) || typeof sdk?.include !== 'function') {
    fail();
    return dispose;
  }
  try {
    // Official public demo configuration. The SDK supplies its public "demo"
    // session marker and resolves the current game version; no operator key,
    // real-money launch, cached player token or pinned game version is used.
    sdk.include(frame.id, { gameid: gameId, channel: device, language: 'en', currency: 'EUR',
      partner: 'demo', mode: 'demo', iniframe: true }, value => {
      if (disposed) return;
      try {
        const url = new URL(value);
        if (url.origin !== 'https://static-live.hacksawgaming.com' || url.username || url.password ||
            !new RegExp(`^/${gameId}/[0-9]+\\.[0-9]+(?:\\.[0-9]+)?/index\\.html$`).test(url.pathname) ||
            url.searchParams.get('gameid') !== gameId || url.searchParams.get('mode') !== '2' ||
            url.searchParams.get('partner') !== 'demo' || url.searchParams.get('token') !== 'demo') throw new Error('Unexpected demo launcher response');
        frame.title = game.title;
        frame.onload = () => {
          if (disposed) return;
          dispose();
          onLoaded(game.id);
        };
        frame.onerror = fail;
        frame.src = url.href;
      } catch { fail(); }
    });
  } catch { fail(); }
  return dispose;
}

function initDemo() {
  const frame = document.querySelector('#provider-game');
  const status = document.querySelector('#status');
  const copy = document.querySelector('#status-copy');
  const retry = document.querySelector('#retry');
  const params = new URLSearchParams(location.search);
  const gameId = params.get('game');
  const game = games.get(gameId);
  const notify = event => parent.postMessage({ event, gameId: game?.id || '' }, location.origin);
  const fail = () => {
    copy.textContent = 'The game could not be loaded.';
    retry.hidden = false;
    notify('LOOP:HACKSAW_ERROR');
  };
  retry.addEventListener('click', () => location.reload());
  if (!game) { fail(); return; }
  const script = document.createElement('script');
  script.src = SDK_URL;
  script.addEventListener('error', fail, { once: true });
  script.addEventListener('load', () => {
    const dispose = launchHacksawDemo({ gameId, device: params.get('device') || 'desktop', frame, sdk: window.hacksaw,
      onLoaded: () => {
        status.hidden = true;
        // Hand the screen to the provider's own loading/intro scene. This is
        // not a claim that its renderer, assets or game round are ready.
        notify('LOOP:HACKSAW_DOCUMENT_LOADED');
      }, onError: fail });
    addEventListener('pagehide', dispose, { once: true });
  }, { once: true });
  document.head.append(script);
}

if (typeof window !== 'undefined') initDemo();
