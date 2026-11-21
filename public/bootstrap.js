import { waitForAppStyles, waitForPageAssets, waitForStableLayout } from './app-readiness.js';
import { initLogoLoader } from './logo-loader.js';

function revealPage(loader, doc, scope) {
  const motion = scope.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (doc.hidden || motion?.matches || doc.body.dataset.reduceMotion === 'true' || typeof loader.animate !== 'function') {
    loader.hidden = true;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let animation, timer, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      scope.clearTimeout(timer);
      doc.removeEventListener('visibilitychange', settle);
      doc.removeEventListener('loop:preferences-change', settle);
      motion?.removeEventListener('change', settle);
      loader.hidden = true;
      animation?.cancel();
      resolve();
    };
    const settle = () => { if (doc.hidden || motion?.matches || doc.body.dataset.reduceMotion === 'true') finish(); };
    doc.addEventListener('visibilitychange', settle);
    doc.addEventListener('loop:preferences-change', settle);
    motion?.addEventListener('change', settle);
    try {
      animation = loader.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'both' });
      timer = scope.setTimeout(finish, 240);
      animation.finished.then(finish, finish);
    } catch { finish(); }
  });
}

export async function bootApplication({ document: doc = document, window: scope = window,
  load = () => import('./app.js'), createLogo = initLogoLoader } = {}) {
  const loader = doc.querySelector('#app-loader');
  const status = doc.querySelector('#app-load-status');
  const retry = doc.querySelector('#app-load-retry');
  let logo, slowTimer;
  const frame = () => doc.hidden ? Promise.resolve()
    : new Promise(resolve => scope.requestAnimationFrame(resolve));
  retry.onclick = () => scope.location.reload();
  try {
    logo = createLogo({ document: doc, window: scope });
    // Slow downloads may still succeed. Offer a retry without abandoning them.
    slowTimer = scope.setTimeout(() => {
      status.className = 'app-loader__message';
      status.textContent = 'Taking longer than usual. Still loading…';
      retry.hidden = false;
    }, 15_000);
    const [application] = await Promise.all([load(), waitForAppStyles(doc)]);
    const router = await application.initApplication();
    await waitForPageAssets(doc, scope);
    router.prepareLayout();
    router.restoreInitialScroll();
    await waitForStableLayout(doc, scope);
    doc.body.dataset.appState = 'ready';
    retry.hidden = true;
    scope.clearTimeout(slowTimer);
    logo.stop();
    await revealPage(loader, doc, scope);
    // Reveal the completed layout without animating its initial values.
    await frame();
    await frame();
    delete doc.body.dataset.appStarting;
    return true;
  } catch (error) {
    logo?.stop();
    doc.body.dataset.appState = 'error';
    status.className = 'app-loader__message';
    status.textContent = 'Unable to load the site. Please try again.';
    retry.hidden = false;
    scope.console.error('LuckyLoop could not start:', error);
    return false;
  } finally {
    scope.clearTimeout(slowTimer);
  }
}

if (typeof window !== 'undefined') void bootApplication();
