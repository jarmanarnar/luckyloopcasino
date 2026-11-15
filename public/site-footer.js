import { parseRoute } from './routes.js';

export function initSiteFooter({ router, openHowToPlay, openStore }) {
  const footer = document.querySelector('#site-footer');
  if (!footer) return;

  footer.querySelector('[data-footer-year]').textContent = String(new Date().getFullYear());
  footer.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#/"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.navigate(parseRoute(link.hash));
  });
  footer.querySelector('[data-footer-help]').addEventListener('click', event => {
    openHowToPlay({ returnFocusTo: event.currentTarget });
  });
  footer.querySelector('[data-footer-store]').addEventListener('click', openStore);
  footer.querySelector('[data-footer-top]').addEventListener('click', () => {
    const reducedMotion = document.body.dataset.reduceMotion === 'true'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.site-logo')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
  });
}
