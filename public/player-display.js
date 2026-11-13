export function initPlayerDisplay({ view, document: doc = document, window: win = doc.defaultView,
  onResize = () => {}, onClose = () => {}, onChooseCurrency = () => {} }) {
  const theater = doc.querySelector('#game-theater');
  const fullscreen = doc.querySelector('#game-fullscreen');
  if (!theater || !fullscreen) return { reset() {}, setGame() {} };
  const close = doc.querySelector('#game-close');
  const title = doc.querySelector('#game-player-title');
  const currency = doc.querySelector('#game-change-currency');
  const currencyLabel = doc.querySelector('#game-player-currency');
  const currencyArt = doc.querySelector('#game-player-coin');
  const sidebar = doc.querySelector('.site-sidebar');
  // Keep the mobile player when a phone rotates beyond the desktop width breakpoint.
  const mobileMedia = win?.matchMedia('(max-width: 719px), (max-width: 1024px) and (max-height: 719px)');
  let opened = false, wide = false, fallback = false, busy = false, generation = 0;
  let priorSidebar = null;
  const isMobile = () => Boolean(mobileMedia?.matches);
  const supportsFullscreen = () => Boolean(view.requestFullscreen) && doc.fullscreenEnabled !== false;

  function setWide(value) {
    if (value && !wide) {
      priorSidebar = { body: doc.body.dataset.sidebar, expanded: sidebar?.dataset.expanded };
      doc.body.dataset.sidebar = 'collapsed';
      if (sidebar) sidebar.dataset.expanded = 'false';
    } else if (!value && wide && priorSidebar) {
      if (priorSidebar.body === undefined) delete doc.body.dataset.sidebar;
      else doc.body.dataset.sidebar = priorSidebar.body;
      if (sidebar) {
        if (priorSidebar.expanded === undefined) delete sidebar.dataset.expanded;
        else sidebar.dataset.expanded = priorSidebar.expanded;
      }
      priorSidebar = null;
    }
    wide = value;
  }

  function render() {
    const mobile = isMobile();
    const full = doc.fullscreenElement === view || fallback;
    view.dataset.mobile = String(mobile);
    view.dataset.theater = String(wide);
    view.dataset.fullscreenFallback = String(fallback);
    doc.body.dataset.playerMobile = String(opened && mobile);
    doc.body.dataset.playerTheater = String(wide);
    doc.body.dataset.playerFullscreen = String(full);
    theater.hidden = mobile || full;
    theater.setAttribute('aria-pressed', String(wide));
    theater.setAttribute('aria-label', wide ? 'Exit theater mode' : 'Theater mode');
    theater.title = wide ? 'Exit theater mode' : 'Theater mode';
    // Mobile fills the viewport already. Offer browser fullscreen only when supported.
    fullscreen.hidden = mobile && !supportsFullscreen();
    fullscreen.disabled = busy;
    fullscreen.setAttribute('aria-pressed', String(full));
    fullscreen.setAttribute('aria-label', full ? 'Exit fullscreen' : 'Fullscreen');
    fullscreen.title = full ? 'Exit fullscreen' : 'Fullscreen';
    onResize();
  }

  async function leaveFullscreen() {
    if (doc.fullscreenElement === view) {
      try { await doc.exitFullscreen?.(); } catch { /* The browser may already have exited. */ }
    }
  }

  async function toggleFullscreen() {
    if (busy) return;
    if (fallback) { fallback = false; render(); return; }
    const requestGeneration = generation;
    busy = true;
    render();
    try {
      if (doc.fullscreenElement === view) await leaveFullscreen();
      else if (supportsFullscreen()) await view.requestFullscreen();
      else if (!isMobile()) fallback = true;
    } catch {
      if (requestGeneration === generation && !isMobile()) fallback = true;
    } finally {
      if (requestGeneration !== generation) await leaveFullscreen();
      busy = false;
      render();
    }
  }

  function reset() {
    generation++;
    opened = false;
    setWide(false);
    fallback = false;
    void leaveFullscreen();
    render();
  }

  theater.addEventListener('click', () => {
    if (isMobile()) return;
    setWide(!wide);
    render();
  });
  fullscreen.addEventListener('click', toggleFullscreen);
  close?.addEventListener('click', () => { reset(); onClose(); });
  currency?.addEventListener('click', onChooseCurrency);
  mobileMedia?.addEventListener('change', () => {
    if (isMobile()) { setWide(false); fallback = false; }
    render();
  });
  doc.addEventListener('fullscreenchange', render);
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!fallback && !wide && doc.fullscreenElement !== view)) return;
    event.preventDefault();
    void leaveFullscreen();
    fallback = false;
    setWide(false);
    render();
  });
  render();
  return { fullscreen: toggleFullscreen, reset, setGame(game) {
    opened = true;
    if (title) { title.textContent = game.title; title.title = game.title; }
    const code = game.currency === 'SC' ? 'SC' : 'GC';
    if (currencyLabel) currencyLabel.textContent = code;
    if (currencyArt) currencyArt.src = code === 'SC' ? 'assets/coins/sweeps-coin.svg' : 'assets/coins/gold-coin.svg';
    currency?.setAttribute('aria-label', 'Change play currency, ' + code + ' selected');
    render();
  } };
}
