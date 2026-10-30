const NLC_ORIGIN = 'https://demo.nolimitcdn.com';
const OSS_ORIGIN = 'https://fansite.evo-games.com';
const PROBE_INTERVAL = 100;
const PROBE_WINDOW = 30_000;

function catalogTableId(game) {
  try {
    const url = new URL(game.url);
    if (url.origin !== 'https://playin.com' || url.username || url.password) return null;
    return /^\/embed\/v1\/demo\/([A-Za-z0-9]+)$/.exec(url.pathname)?.[1] || null;
  } catch {
    return null;
  }
}

export function watchGameReady(frame, game, onReady) {
  const tableId = catalogTableId(game);
  let disposed = false;
  let channel = null;
  let interval = null;
  let deadline = null;

  function stopProbing() {
    if (interval !== null) window.clearInterval(interval);
    if (deadline !== null) window.clearTimeout(deadline);
    interval = null;
    deadline = null;
  }

  function closeChannel() {
    if (!channel) return;
    channel.port1.onmessage = null;
    channel.port1.close();
    channel.port2.close();
    channel = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopProbing();
    closeChannel();
    window.removeEventListener('message', onWindowMessage);
  }

  function ready(reason) {
    if (disposed) return;
    dispose();
    onReady(reason);
  }

  // The official direct NLC loader forwards api.on('ready') to its parent.
  // https://demo.nolimitcdn.com/loader/game-loader.html
  function onWindowMessage(event) {
    if (!disposed && game.providerId === 'nolimit-city' &&
        event.origin === NLC_ORIGIN && event.source === frame.contentWindow &&
        event.data === 'ready') ready('nlc-ready');
  }

  function validOssEvent(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        typeof data.event !== 'string') return false;
    if ('tableId' in data && (typeof data.tableId !== 'string' || data.tableId !== tableId)) return false;
    if ('context' in data && typeof data.context !== 'string') return false;
    return true;
  }

  function ossWindow() {
    try {
      // Playin -> #ossGameIframe -> actual provider frame. WindowProxy frame
      // indexes/length are public cross-origin APIs; no child DOM/URL is read.
      const root = frame.contentWindow;
      if (!root || root.length < 1) return null;
      const wrapper = root.frames[0];
      return wrapper && wrapper.length > 0 ? wrapper.frames[0] : null;
    } catch {
      return null;
    }
  }

  function probe() {
    if (disposed) return;
    const target = ossWindow();
    if (!target) return;
    closeChannel();
    const attempt = new MessageChannel();
    channel = attempt;
    attempt.port1.onmessage = event => {
      if (disposed || channel !== attempt || !validOssEvent(event.data)) return;
      const data = event.data;
      if (data.event === 'EVO:GAME_LIFECYCLE' && typeof data.interruptAllowed === 'boolean') {
        // Cached lifecycle is a connection ACK, not visual readiness. Stop
        // reconnecting: the vendor ClientApi holds a single message port.
        stopProbing();
      } else if (data.event === 'EVO:APPLICATION_READY') {
        ready('evo-application-ready');
      } else if (data.event === 'EVO:KEEPALIVE') {
        // This stable event's interval starts only after gameLoaded resolves.
        ready('evo-keepalive');
      }
    };
    attempt.port1.start();
    try {
      // Public OSS ClientApi modules 8741/25166 implement CONNECT + port
      // forwarding. Exact-origin transfer authenticates the receiving frame;
      // MessagePort events themselves do not supply an origin/source.
      // https://static.egcdn.com/frontend/evo/r2/js/commons.f867c424.js
      target.postMessage({ command: 'EVO:CONNECT' }, OSS_ORIGIN, [attempt.port2]);
      // Subscribe through Window.postMessage, whose origin is meaningful.
      // The vendor's cached-replay path cannot use a port's empty origin.
      for (const event of ['EVO:GAME_LIFECYCLE', 'EVO:KEEPALIVE']) {
        target.postMessage({ command: 'EVO:EVENT_SUBSCRIBE', event }, OSS_ORIGIN);
      }
    } catch {
      if (channel === attempt) closeChannel();
    }
  }

  window.addEventListener('message', onWindowMessage);
  if (game.providerId !== 'nolimit-city' && tableId && typeof MessageChannel === 'function') {
    interval = window.setInterval(probe, PROBE_INTERVAL);
    deadline = window.setTimeout(() => {
      stopProbing();
      closeChannel();
    }, PROBE_WINDOW);
    probe();
  }
  // Neither timeout nor outer iframe load means the game is ready.
  return dispose;
}
