let initialized = false;

export function initCatalogToolbar() {
  if (initialized) return;
  const nav = document.querySelector('#catalog-categories');
  const previous = document.querySelector('#catalog-category-previous');
  const next = document.querySelector('#catalog-category-next');
  const rail = nav?.closest('.catalog-category-rail');
  if (!nav || !previous || !next || !rail) return;
  initialized = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const behavior = () => reducedMotion.matches ? 'instant' : 'smooth';
  const maximum = () => Math.max(0, nav.scrollWidth - nav.clientWidth);

  function update() {
    const max = maximum();
    const atStart = nav.scrollLeft <= 1;
    const atEnd = nav.scrollLeft >= max - 1;
    previous.hidden = next.hidden = max <= 1;
    previous.disabled = atStart;
    next.disabled = atEnd;
    rail.dataset.overflow = String(max > 1);
    rail.dataset.atStart = String(atStart);
    rail.dataset.atEnd = String(atEnd);
  }

  function revealActive() {
    const active = nav.querySelector('[data-category][aria-pressed="true"]');
    if (!active) return;
    const viewport = nav.getBoundingClientRect();
    const bounds = active.getBoundingClientRect();
    const leftInset = !previous.hidden && !previous.disabled ? previous.getBoundingClientRect().width + 8 : 8;
    const rightInset = !next.hidden && !next.disabled ? next.getBoundingClientRect().width + 8 : 8;
    let left = nav.scrollLeft;
    if (bounds.left < viewport.left + leftInset) left += bounds.left - viewport.left - leftInset;
    else if (bounds.right > viewport.right - rightInset) left += bounds.right - viewport.right + rightInset;
    left = Math.max(0, Math.min(maximum(), left));
    if (Math.abs(left - nav.scrollLeft) > 1) nav.scrollTo({ left, behavior: behavior() });
  }

  function page(direction) {
    nav.scrollBy({ left: direction * Math.max(1, nav.clientWidth * .75), behavior: behavior() });
  }

  previous.addEventListener('click', () => page(-1));
  next.addEventListener('click', () => page(1));
  nav.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(() => { update(); revealActive(); }).observe(nav);
  new MutationObserver(records => {
    if (!records.some(record => record.oldValue !== record.target.getAttribute('aria-pressed'))) return;
    update();
    revealActive();
  }).observe(nav, {
    subtree: true, attributes: true, attributeFilter: ['aria-pressed'], attributeOldValue: true,
  });
  update();
  revealActive();
}
