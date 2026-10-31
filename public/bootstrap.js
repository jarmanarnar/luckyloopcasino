import { waitForPageAssets, waitForStableLayout } from './app-readiness.js';
import { initLogoLoader } from './logo-loader.js';

export async function bootApplication({ document: doc = document, window: scope = window,
  load = () => import('./app.js') } = {}) {
  const loader = doc.querySelector('#app-loader');
  const status = doc.querySelector('#app-load-status');
  const retry = doc.querySelector('#app-load-retry');
  let timer, logo;
  const deadline = (promise, milliseconds) => Promise.race([promise, new Promise((_, reject) => {
    timer = scope.setTimeout(() => reject(new Error('Application loading timed out')), milliseconds);
  })]).finally(() => scope.clearTimeout(timer));
  const frame = () => new Promise(resolve => scope.requestAnimationFrame(resolve));
  retry.addEventListener('click', () => scope.location.reload());
  try {
    logo = initLogoLoader({ document: doc, window: scope });
    const [application] = await deadline(Promise.all([
      load(), doc.fonts?.load('700 16px Arimo'), logo.ready,
    ]), 15_000);
    const router = application.initApplication();
    await deadline(waitForPageAssets(doc), 15_000);
    router.prepareLayout();
    router.restoreInitialScroll();
    await waitForStableLayout(doc, scope);
    doc.body.dataset.appState = 'ready';
    loader.hidden = true;
    logo.stop();
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
  }
}

if (typeof window !== 'undefined') void bootApplication();
