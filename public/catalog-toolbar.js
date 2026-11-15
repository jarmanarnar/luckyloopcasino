let initialized = false;

export function initCatalogToolbar() {
  if (initialized) return;
  const nav = document.querySelector('#catalog-categories');
  const rail = nav?.closest('.catalog-category-rail');
  if (!nav || !rail) return;
  initialized = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const behavior = () => reducedMotion.matches || document.body.dataset.reduceMotion === 'true' ? 'instant' : 'smooth';
  const maximum = () => Math.max(0, nav.scrollWidth - nav.clientWidth);
  let drag = null;
  let suppressClickUntil = 0;

  function update() {
    if (!rail.clientWidth) return;
    const max = maximum();
    const atStart = nav.scrollLeft <= 1;
    const atEnd = nav.scrollLeft >= max - 1;
    rail.dataset.overflow = String(max > 1);
    rail.dataset.atStart = String(atStart);
    rail.dataset.atEnd = String(atEnd);
  }

  function revealActive() {
    const active = nav.querySelector('[data-category][aria-pressed="true"]');
    if (!active) return;
    const viewport = nav.getBoundingClientRect();
    const bounds = active.getBoundingClientRect();
    const leftInset = 0;
    const rightInset = 0;
    let left = nav.scrollLeft;
    if (bounds.left < viewport.left + leftInset) left += bounds.left - viewport.left - leftInset;
    else if (bounds.right > viewport.right - rightInset) left += bounds.right - viewport.right + rightInset;
    left = Math.max(0, Math.min(maximum(), left));
    if (Math.abs(left - nav.scrollLeft) > 1) nav.scrollTo({ left, behavior: behavior() });
  }

  nav.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || maximum() <= 1) return;
    suppressClickUntil = 0;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: nav.scrollLeft, moved: false };
  });
  nav.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const distance = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(distance) < 6 || Math.abs(distance) < Math.abs(event.clientY - drag.y)) return;
      drag.moved = true;
      nav.setPointerCapture(event.pointerId);
      nav.dataset.dragging = 'true';
    }
    event.preventDefault();
    nav.scrollLeft = drag.left - distance;
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved) suppressClickUntil = window.performance.now() + 300;
    drag = null;
    delete nav.dataset.dragging;
    if (nav.hasPointerCapture(event.pointerId)) nav.releasePointerCapture(event.pointerId);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) nav.addEventListener(type, endDrag);
  nav.addEventListener('pointerleave', event => {
    if (drag && !drag.moved) endDrag(event);
  });
  // A mouse drag must never activate the category beneath its release point.
  nav.addEventListener('click', event => {
    if (event.detail === 0 || window.performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
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
