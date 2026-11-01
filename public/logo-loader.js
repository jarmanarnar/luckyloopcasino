export const LOGO_MOTION = Object.freeze({ duration: 1800 });

export function initLogoLoader({ document: doc = document, window: scope = window } = {}) {
  const brand = doc.querySelector('#app-loader-brand');
  const motion = scope.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motion.matches || doc.body.dataset.reduceMotion === 'true';
  let frame = null, stopped = false;
  brand?.style?.setProperty('--app-loader-duration', `${LOGO_MOTION.duration}ms`);

  function pause() {
    if (frame !== null) scope.cancelAnimationFrame(frame);
    frame = null;
    if (brand) brand.dataset.paused = 'true';
  }

  function syncMotion() {
    pause();
    if (stopped) return;
    if (brand) brand.dataset.reduced = String(reduced());
    if (doc.hidden) return;
    // Motion is decorative and never delays application readiness.
    frame = scope.requestAnimationFrame(() => {
      frame = null;
      if (stopped || doc.hidden) return;
      if (brand) brand.dataset.paused = String(reduced());
    });
  }

  motion.addEventListener('change', syncMotion);
  doc.addEventListener('visibilitychange', syncMotion);
  doc.addEventListener('loop:preferences-change', syncMotion);
  syncMotion();
  return {
    stop() {
      stopped = true;
      pause();
      motion.removeEventListener('change', syncMotion);
      doc.removeEventListener('visibilitychange', syncMotion);
      doc.removeEventListener('loop:preferences-change', syncMotion);
    },
  };
}
