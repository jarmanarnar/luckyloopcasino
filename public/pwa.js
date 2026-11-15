// Resolve from the module so the same app works at the local and Pages subpath.
export async function registerPwa(win = window) {
  if (!win.isSecureContext || !win.navigator?.serviceWorker) return null;
  const base = new URL('./', import.meta.url);
  try {
    return await win.navigator.serviceWorker.register(new URL('sw.js', base).href, {
      scope: base.href,
      updateViaCache: 'none',
    });
  } catch (error) {
    // An unavailable worker must never prevent the normal online app from opening.
    win.console?.warn('COP COIN offline support is unavailable.', error);
    return null;
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') void registerPwa();
  else window.addEventListener('load', () => { void registerPwa(); }, { once: true });
}
