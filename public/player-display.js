export function initPlayerDisplay({ view, document: doc = document, onResize = () => {} }) {
  const theater = doc.querySelector('#game-theater');
  const fullscreen = doc.querySelector('#game-fullscreen');
  if (!theater || !fullscreen) return { reset() {} };
  let wide = false, fallback = false;
  const sidebar = doc.querySelector('.site-sidebar');
  let priorSidebar = null;
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
    }
    wide = value;
  }
  function render() {
    view.dataset.theater = String(wide);
    view.dataset.fullscreenFallback = String(fallback);
    doc.body.dataset.playerTheater = String(wide);
    const full = doc.fullscreenElement === view || fallback;
    theater.setAttribute('aria-pressed', String(wide));
    theater.setAttribute('aria-label', wide ? 'Exit theater mode' : 'Theater mode');
    theater.title = wide ? 'Exit theater mode' : 'Theater mode';
    fullscreen.setAttribute('aria-pressed', String(full));
    fullscreen.setAttribute('aria-label', full ? 'Exit fullscreen' : 'Fullscreen');
    fullscreen.title = full ? 'Exit fullscreen' : 'Fullscreen';
    onResize();
  }
  theater.addEventListener('click', () => { setWide(!wide); render(); });
  async function toggleFullscreen() {
    if (fallback) { fallback = false; render(); return; }
    try {
      if (doc.fullscreenElement === view) await doc.exitFullscreen();
      else if (view.requestFullscreen) await view.requestFullscreen();
      else fallback = true;
    } catch { fallback = true; }
    render();
  }
  fullscreen.addEventListener('click', toggleFullscreen);
  doc.addEventListener('fullscreenchange', render);
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!fallback && !wide && doc.fullscreenElement !== view)) return;
    event.preventDefault();
    if (doc.fullscreenElement === view) doc.exitFullscreen?.().catch(() => {});
    fallback = false; setWide(false); render();
  });
  render();
  return { fullscreen: toggleFullscreen, reset() {
    setWide(false); fallback = false;
    if (doc.fullscreenElement === view) doc.exitFullscreen?.().catch(() => {});
    render();
  } };
}
