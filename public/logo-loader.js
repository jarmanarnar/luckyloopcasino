export const LOGO_MOTION = Object.freeze({ duration: 1800, cycles: 2 });

export function initLogoLoader({ document: doc = document, window: scope = window } = {}) {
  const brand = doc.querySelector('#app-loader-brand');
  const motion = scope.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motion.matches || doc.body.dataset.reduceMotion === 'true';
  const now = () => scope.performance.now();
  let remaining = LOGO_MOTION.duration * LOGO_MOTION.cycles;
  let since = null, timer = null, frame = null, stopped = false, complete = false;
  let resolveMinimum;
  const minimum = new Promise(resolve => { resolveMinimum = resolve; });
  brand?.style?.setProperty('--app-loader-duration', `${LOGO_MOTION.duration}ms`);

  function pause() {
    if (frame !== null) scope.cancelAnimationFrame(frame);
    if (timer !== null) scope.clearTimeout(timer);
    if (since !== null) remaining = Math.max(0, remaining - (now() - since));
    frame = timer = since = null;
    if (brand) brand.dataset.paused = 'true';
  }

  function syncMotion() {
    pause();
    if (stopped) return;
    if (brand) brand.dataset.reduced = String(reduced());
    if (doc.hidden) return;
    // Start counting on the same paint that starts the inline SVG animation.
    frame = scope.requestAnimationFrame(() => {
      frame = null;
      if (stopped || doc.hidden) return;
      if (brand) brand.dataset.paused = String(reduced());
      if (complete) return;
      since = now();
      timer = scope.setTimeout(() => {
        timer = since = null;
        remaining = 0;
        complete = true;
        resolveMinimum();
      }, remaining);
    });
  }

  motion.addEventListener('change', syncMotion);
  doc.addEventListener('visibilitychange', syncMotion);
  doc.addEventListener('loop:preferences-change', syncMotion);
  syncMotion();
  return {
    minimum,
    stop() {
      stopped = true;
      pause();
      motion.removeEventListener('change', syncMotion);
      doc.removeEventListener('visibilitychange', syncMotion);
      doc.removeEventListener('loop:preferences-change', syncMotion);
      resolveMinimum();
    },
  };
}
