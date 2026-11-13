import { initCoinChooser } from './coin-chooser.js';
import { createGameArt } from './game-artwork-view.js';
import { initPlayerDisplay } from './player-display.js';
import { GAMES } from './catalog.js';
import { getLaunchDevice, getLaunchUrl, getFrameScale } from './game-presentation.js';
import { watchGameReady } from './game-ready.js';
import { formatRoute, parseRoute } from './routes.js';

const games = new Map(GAMES.map(game => [game.id, game]));

let initialized = false;
let gameController = null;

export function initGameView({ router, account, verifyPhone } = {}) {
  if (initialized) return gameController;

  const lobby = document.querySelector('#lobby-view');
  const view = document.querySelector('#game-view');
  const host = document.querySelector('#game-frame-host');
  const status = document.querySelector('#game-load-status');
  const loading = document.querySelector('#game-loading');
  const reveal = document.querySelector('#game-loading-reveal');
  const shelves = document.querySelector('#catalog-shelves');
  if (![lobby, view, host, status, loading, reveal, shelves].every(Boolean)) return;
  initialized = true;

  const preplay = document.querySelector('#game-preplay');
  let chooser;
  let awaitingPlay = false;
  let pendingReady = null;
  function activePlayer(value) {
    document.body.dataset.playerActive = String(value);
    if (document.dispatchEvent) document.dispatchEvent(new CustomEvent('player:active-change'));
  }
  let blockedTimer = 0;
  let currentGame = null;
  let hasRendered = false;
  let currentFrame = null;
  let lastLauncher = null;
  let lobbyScroll = { x: 0, y: 0 };
  let restoreFrame = 0;
  let stopReadiness = () => {};
  let slowTimer = 0;
  let revealFrame = 0;
  let revealPaintFrame = 0;

  function stopLoadingWatch() {
    stopReadiness();
    stopReadiness = () => {};
    window.clearTimeout(slowTimer);
    window.cancelAnimationFrame(revealFrame);
    window.cancelAnimationFrame(revealPaintFrame);
  }

  function revealGame(frame, reason) {
    if (frame !== currentFrame || loading.hidden) return;
    if (awaitingPlay) { pendingReady = { frame, reason }; return; }
    stopLoadingWatch();
    view.dataset.loadState = reason === 'manual' ? 'revealed'
      : ['nlc-loader', 'hacksaw-loader'].includes(reason) ? 'provider' : 'ready';
    view.dataset.readySource = reason;
    host.removeAttribute('aria-busy');
    frame.inert = false;
    frame.removeAttribute('aria-hidden');
    frame.removeAttribute('tabindex');
    if (loading.contains(document.activeElement)) view.focus({ preventScroll: true });
    loading.hidden = true;
    status.textContent = '';
  }

  function gameReady(frame, reason) {
    if (frame !== currentFrame || loading.hidden) return;
    // Two paint frames let the provider draw before revealing it. Elapsed
    // time alone never marks a game ready.
    revealFrame = window.requestAnimationFrame(() => {
      revealPaintFrame = window.requestAnimationFrame(() => revealGame(frame, reason));
    });
  }

  function fitFrame() {
    if (!currentFrame || currentGame === null) return;
    const bounds = host.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    // Red Tiger's desktop demo caps its game stage at 1280 CSS pixels.
    // Keep its minimum stage visible on shallow windows too. The launch hint
    // is separate: a narrow desktop window can still receive a desktop engine.
    const scale = getFrameScale(games.get(currentGame).providerId,
      currentFrame.dataset.presentationDevice, bounds.width, bounds.height);
    if (scale !== 1) {
      currentFrame.style.width = `${bounds.width / scale}px`;
      currentFrame.style.height = `${bounds.height / scale}px`;
      currentFrame.style.transformOrigin = '0 0';
      currentFrame.style.transform = `scale(${scale})`;
      view.dataset.presentation = 'scaled';
    } else {
      for (const property of ['width', 'height', 'transform-origin', 'transform']) {
        currentFrame.style.removeProperty(property);
      }
      view.dataset.presentation = 'native';
    }
  }

  const frameResizeObserver = new ResizeObserver(fitFrame);
  frameResizeObserver.observe(host);

  const display = initPlayerDisplay({ view, onResize: fitFrame,
    onClose: () => router ? router.navigate({ type: 'home' }) : returnToLobby(),
    onChooseCurrency: () => {
      if (!currentGame || !preplay) return;
      chooser?.reset(account?.getSnapshot().wallet.currency);
      awaitingPlay = true;
      preplay.hidden = false;
      document.querySelector('#game-play-confirm')?.focus({ preventScroll: true });
    },
  });

  function renderPreplayMetadata(game) {
    display.setGame?.({ title: game.title, currency: account?.getSnapshot().wallet.currency });
    if (preplay) {
      let meta = preplay.querySelector('.game-preplay__meta');
      if (!meta) {
        meta = document.createElement('div');
        meta.className = 'game-preplay__meta';
        preplay.querySelector('.game-preplay__card').prepend(meta);
      }
      const title = document.createElement('h2'); title.textContent = game.title;
      const provider = document.createElement('p'); provider.textContent = game.providerName;
      meta.replaceChildren(createGameArt(game), title, provider);
    }
  }

  function mountFrame(key) {
    if (account?.isSignedIn?.() === false) return;
    // This integration supports public demos only. SC never reaches a launcher.
    if (account?.getSnapshot().wallet.currency === 'SC') return;
    stopLoadingWatch();
    currentFrame = null;
    host.replaceChildren();
    view.dataset.mode = 'GC';
    view.dataset.sessionKind = 'public-demo';
    activePlayer(false);
    awaitingPlay = Boolean(preplay);
    pendingReady = null;
    if (preplay) preplay.hidden = false;
    chooser?.reset(account?.getSnapshot().wallet.currency);
    const game = games.get(key);
    renderPreplayMetadata(game);
    const frame = document.createElement('iframe');
    const touchCapable = window.matchMedia('(any-pointer: coarse)').matches
      || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    const device = getLaunchDevice(window.innerWidth, touchCapable);
    const launchUrl = getLaunchUrl(game, device);
    frame.dataset.device = device;
    frame.dataset.presentationDevice = touchCapable ? 'mobile' : 'desktop';
    view.dataset.device = device;
    frame.title = `${game.title} demo`;
    frame.allow = 'autoplay; fullscreen';
    frame.allowFullscreen = true;
    frame.inert = true;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    if (game.providerId === 'nolimit-city' &&
        new URL(launchUrl).origin === 'https://demo.nolimitcdn.com') {
      // This direct launcher has its own full-screen loading/intro scene and
      // none of Playin's spinner/skeleton. NLC's 'ready' can wait until the
      // user presses Continue, so never keep its intro behind our mask.
      frame.addEventListener('load', () => gameReady(frame, 'nlc-loader'));
    }
    const failed = () => {
      if (frame !== currentFrame || loading.hidden) return;
      stopLoadingWatch();
      host.removeAttribute('aria-busy');
      status.textContent = 'The game could not be loaded.';
      reveal.hidden = false;
      view.dataset.loadState = 'error';
    };
    frame.addEventListener('error', failed);
    status.textContent = 'Loading game…';
    loading.hidden = false;
    reveal.hidden = true;
    view.dataset.loadState = 'loading';
    delete view.dataset.readySource;
    host.setAttribute('aria-busy', 'true');
    // Device selection is fixed for this session. Orientation changes resize the
    // existing frame; they must not silently restart a round or game session.
    currentFrame = frame;
    frame.src = launchUrl;
    host.replaceChildren(frame);
    stopReadiness = watchGameReady(frame, game, reason => gameReady(frame, reason), failed);
    fitFrame();
    slowTimer = window.setTimeout(() => {
      if (frame !== currentFrame || loading.hidden) return;
      // A blocked/first-visit wrapper may be asking for age confirmation.
      // Offer a manual reveal; a timeout is never treated as successful load.
      status.textContent = 'Still loading…';
      reveal.hidden = false;
    }, 10000);
  }

  function showFromHash({ restoreLobby = true } = {}) {
    const route = router?.getRoute();
    const requested = router ? ['game', 'game-details'].includes(route.type) ? route.gameId : null
      : new URLSearchParams(window.location.hash.slice(1)).get('game');
    const key = account?.isSignedIn?.() === false ? null : games.has(requested) ? requested : null;
    if (router && route.type === 'game' && key === null) {
      router.navigate({ type: 'home' }, { replace: true });
      return;
    }
    window.clearTimeout(blockedTimer);
    if (key !== null && account?.getSnapshot().wallet.currency === 'SC' && route?.type !== 'game-details') {
      stopLoadingWatch();
      display.reset();
      if (preplay) preplay.hidden = true;
      currentGame = null;
      currentFrame = null;
      host.replaceChildren();
      view.hidden = true;
      lobby.hidden = false;
      document.body.dataset.view = 'lobby';
      hasRendered = false;
      // Defer until the current route notification finishes, then show the gate.
      blockedTimer = window.setTimeout(() => {
        if (router) router.navigate({ type: 'game-details', gameId: key, ...(route.from ? { from: route.from } : {}) }, { replace: true });
        else window.location.hash = '';
        verifyPhone?.();
      }, 0);
      return;
    }
    if (key !== null && account?.getSnapshot().wallet.currency === 'SC' && route?.type === 'game-details') {
      stopLoadingWatch();
      view.dataset.mode = 'SC';
      view.dataset.sessionKind = 'verification-preview';
      delete view.dataset.loadState;
      delete view.dataset.readySource;
      renderPreplayMetadata(games.get(key));
      activePlayer(false);
      currentFrame = null;
      pendingReady = null;
      host.removeAttribute('aria-busy');
      status.textContent = '';
      currentGame = key;
      host.replaceChildren();
      view.hidden = false;
      loading.hidden = true;
      if (preplay) preplay.hidden = false;
      awaitingPlay = true;
      chooser?.reset('SC');
      return;
    }
    if (hasRendered && key === currentGame) return;
    hasRendered = true;

    window.cancelAnimationFrame(restoreFrame);
    const wasGame = currentGame !== null;
    if (key !== null) {
      if (!wasGame) {
        lobbyScroll = { x: window.scrollX, y: window.scrollY };
        if (!lastLauncher && lobby.contains(document.activeElement)) {
          lastLauncher = document.activeElement;
        }
      }
      currentGame = key;
      document.body.dataset.view = 'game';
      lobby.hidden = true;
      view.hidden = false;
      mountFrame(key);
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      view.focus({ preventScroll: true });
      return;
    }

    stopLoadingWatch();
    display.reset();
    activePlayer(false);
    if (preplay) preplay.hidden = true;
    currentGame = null;
    currentFrame = null;
    host.replaceChildren();
    host.removeAttribute('aria-busy');
    loading.hidden = true;
    delete view.dataset.loadState;
    delete view.dataset.readySource;
    document.body.dataset.view = 'lobby';
    lobby.hidden = false;
    view.hidden = true;
    status.textContent = '';
    if (wasGame && restoreLobby && !router) {
      restoreFrame = window.requestAnimationFrame(() => {
        if (currentGame !== null) return;
        window.scrollTo({ left: lobbyScroll.x, top: lobbyScroll.y, behavior: 'instant' });
        if (lastLauncher?.isConnected) lastLauncher.focus({ preventScroll: true });
      });
    }
  }

  function returnToLobby(action = null) {
    if (router) {
      const route = router.getRoute();
      if (action) {
        router.navigate({ type: 'home' });
        action();
      } else {
        router.back(route.type === 'game' && route.from ? parseRoute(route.from) : { type: 'home' });
      }
      return;
    }
    // Shell destinations need the lobby visible before they render and focus
    // results. Their focus must not be overwritten by ordinary Back restoration.
    if (action) window.cancelAnimationFrame(restoreFrame);
    if (currentGame !== null || window.location.hash) {
      window.location.hash = '';
      showFromHash({ restoreLobby: !action });
    }
    if (action) action();
  }

  shelves.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.game-launch[data-game]');
    if (!button || !shelves.contains(button)) return;
    const key = button.dataset.game;
    if (!games.has(key)) return;
    lastLauncher = button;
    if (router) {
      const route = router.getRoute();
      const from = route.type === 'game' ? route.from : formatRoute(route);
      router.navigate({ type: 'game-details', gameId: key, from });
    } else window.location.hash = `game=${key}`;
  });

  chooser = initCoinChooser({ document, onSelect: async currency => {
    const result = await account?.selectCurrency(currency);
    if (result?.ok === false) throw new Error('Currency change failed');
  }, onPlay: async currency => {
    if (account?.isSignedIn?.() === false) return;
    if (currency === 'SC') {
      if (account) await account.selectCurrency('SC');
      verifyPhone?.();
      return;
    }
    if (account?.getSnapshot().wallet.currency === 'SC') await account.selectCurrency('GC');
    if (!currentFrame && currentGame) mountFrame(currentGame);
    awaitingPlay = false;
    activePlayer(true);
    if (preplay) preplay.hidden = true;
    if (pendingReady) revealGame(pendingReady.frame, pendingReady.reason);
  } });
  reveal.addEventListener('click', () => {
    if (currentFrame) revealGame(currentFrame, 'manual');
  });
  if (router) router.subscribe(() => showFromHash({ restoreLobby: false }), { priority: -100 });
  else window.addEventListener('hashchange', showFromHash);
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.key !== 'Escape' || currentGame === null) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    returnToLobby();
  });
  let observedCurrency = account?.getSnapshot().wallet.currency;
  account?.subscribe(() => {
    if (account.isSignedIn?.() === false) { showFromHash(); return; }
    const currency = account.getSnapshot().wallet.currency;
    const changed = currency !== observedCurrency;
    observedCurrency = currency;
    if (currentGame === null || !changed) return;
    if (currency === 'SC') showFromHash();
    else { hasRendered = true; mountFrame(currentGame); chooser?.reset('GC'); }
  });
  showFromHash();
  gameController = { returnToLobby };
  return gameController;
}
