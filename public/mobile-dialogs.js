import { initDialogMotion } from './dialog-motion.js';

// Keep fullscreen mobile dialogs inside the visible area when a keyboard opens.
// Shared motion retains native focus/modal behavior through each dismissal.
export function initMobileDialogs({ window: scope = window, document: doc = document } = {}) {
  const motion = initDialogMotion({ window: scope, document: doc });
  const mobile = scope.matchMedia('(width <= 599px)');
  const viewport = scope.visualViewport;
  const style = doc.documentElement.style;
  let frame = null;
  function update() {
    frame = null;
    if (!mobile.matches || (viewport && viewport.scale !== 1)) {
      style.removeProperty('--popup-viewport-height');
      style.removeProperty('--popup-viewport-top');
      return;
    }
    const height = viewport && Number.isFinite(viewport.height) ? Math.min(scope.innerHeight, viewport.height) : scope.innerHeight;
    const top = viewport && Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
    style.setProperty('--popup-viewport-height', `${height}px`);
    style.setProperty('--popup-viewport-top', `${top}px`);
  }
  function schedule() {
    if (frame !== null) return;
    frame = scope.requestAnimationFrame(update);
  }
  mobile.addEventListener('change', schedule);
  scope.addEventListener('resize', schedule);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  update();
  return { destroy() {
    motion.destroy();
    if (frame !== null) scope.cancelAnimationFrame(frame);
    mobile.removeEventListener('change', schedule);
    scope.removeEventListener('resize', schedule);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    style.removeProperty('--popup-viewport-height');
    style.removeProperty('--popup-viewport-top');
  } };
}

