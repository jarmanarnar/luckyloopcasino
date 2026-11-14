export function initPlayerDisplay({ view, document: doc = document, window: win = doc.defaultView, onResize = () => {} }) {
  const theater = doc.querySelector('#game-theater');
  const fullscreen = doc.querySelector('#game-fullscreen');
  const menuFullscreen = doc.querySelector('#profile-game-fullscreen');
  const menuFullscreenLabel = doc.querySelector('#profile-game-fullscreen-label');
  const profileMenu = doc.querySelector('#profile-menu');
  if (!theater || !fullscreen) return { reset() {}, setGame() {} };
  // The page, including its original header and popovers, enters fullscreen together.
  const fullscreenTarget = doc.documentElement;
  const mobileMedia = win?.matchMedia('(max-width: 719px), (max-width: 1024px) and (max-height: 719px)');
  let opened = false, playing = false, wide = false, fallback = false, busy = false, generation = 0;
  let mobileSession = false;
  const nativeFullscreen = () => Boolean(fullscreenTarget) && doc.fullscreenElement === fullscreenTarget;
  const isMobile = () => Boolean(mobileMedia?.matches) || (mobileSession && (nativeFullscreen() || busy));
  const supportsFullscreen = () => Boolean(fullscreenTarget?.requestFullscreen) && doc.fullscreenEnabled !== false;

  function render() {
    const mobile = isMobile(), full = nativeFullscreen() || fallback;
    const immersiveMobile = opened && mobile && playing;
    view.dataset.mobile = String(mobile);
    view.dataset.theater = String(wide);
    view.dataset.fullscreenFallback = String(fallback);
    doc.body.dataset.playerMobile = String(immersiveMobile);
    doc.body.dataset.playerStandalone = String(immersiveMobile && win?.navigator?.standalone === true);
    doc.body.dataset.playerTheater = String(wide);
    doc.body.dataset.playerFullscreen = String(full);
    theater.hidden = mobile || full;
    theater.setAttribute('aria-pressed', String(wide));
    theater.setAttribute('aria-label', wide ? 'Exit theater mode' : 'Theater mode');
    theater.title = wide ? 'Exit theater mode' : 'Theater mode';
    const label = full ? 'Exit fullscreen' : 'Fullscreen';
    fullscreen.hidden = mobile && (!playing || !supportsFullscreen());
    fullscreen.disabled = busy;
    fullscreen.setAttribute('aria-pressed', String(full));
    fullscreen.setAttribute('aria-label', label);
    fullscreen.title = label;
    if (menuFullscreen) {
      menuFullscreen.hidden = !opened || (mobile && (!playing || !supportsFullscreen()));
      menuFullscreen.disabled = busy;
      menuFullscreen.setAttribute('aria-label', label);
      menuFullscreen.setAttribute('aria-pressed', String(full));
    }
    if (menuFullscreenLabel) menuFullscreenLabel.textContent = label;
    onResize();
  }

  async function leaveFullscreen() {
    if (nativeFullscreen()) {
      try { await doc.exitFullscreen?.(); } catch { /* The browser may already have exited. */ }
    }
  }

  async function toggleFullscreen() {
    if (busy || (isMobile() && !playing)) return;
    if (fallback) { fallback = false; render(); return; }
    const requestGeneration = generation;
    mobileSession = isMobile();
    busy = true;
    render();
    try {
      if (nativeFullscreen()) await leaveFullscreen();
      else if (supportsFullscreen()) await fullscreenTarget.requestFullscreen();
      else if (!isMobile()) fallback = true;
    } catch {
      if (requestGeneration === generation && !isMobile()) fallback = true;
    } finally {
      if (requestGeneration !== generation) await leaveFullscreen();
      busy = false;
      if (!nativeFullscreen()) mobileSession = false;
      render();
    }
  }

  function reset() {
    generation++;
    opened = false;
    playing = false;
    wide = false;
    fallback = false;
    void leaveFullscreen();
    render();
  }
  theater.addEventListener('click', () => {
    if (isMobile()) return;
    wide = !wide;
    render();
  });
  fullscreen.addEventListener('click', toggleFullscreen);
  menuFullscreen?.addEventListener('click', () => {
    if (profileMenu?.matches(':popover-open')) profileMenu.hidePopover();
    return toggleFullscreen();
  });
  mobileMedia?.addEventListener('change', () => {
    if (isMobile()) { wide = false; fallback = false; }
    render();
  });
  doc.addEventListener('fullscreenchange', () => {
    if (!nativeFullscreen() && !busy) mobileSession = false;
    render();
  });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!fallback && !wide && !nativeFullscreen())) return;
    event.preventDefault();
    void leaveFullscreen();
    fallback = false;
    wide = false;
    render();
  });
  render();
  return {
    fullscreen: toggleFullscreen, reset,
    setGame() { opened = true; render(); },
    setPlaying(value) {
      playing = value;
      if (!playing && isMobile()) {
        generation++;
        fallback = false;
        void leaveFullscreen();
      }
      render();
    },
  };
}
