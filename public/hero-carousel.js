import EmblaCarousel from './vendor/embla-carousel/embla-carousel.esm.js';

let initialized = false;

export function initHeroCarousel() {
  if (initialized) return;
  const root = document.querySelector('#hero-carousel');
  const viewport = document.querySelector('#hero-viewport');
  const track = document.querySelector('#hero-track');
  const dots = document.querySelector('#hero-dots');
  const status = document.querySelector('#hero-status');
  const controls = document.querySelector('#hero-controls');
  if (![root, viewport, track, dots, status, controls].every(Boolean)) return;
  const slides = [...track.querySelectorAll('.hero-carousel__slide')];
  if (!slides.length) return;
  initialized = true;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const carousel = EmblaCarousel(viewport, {
    loop: true, align: 'start', slidesToScroll: 1, containScroll: false,
  });
  root.dataset.ready = 'true';
  let timer = null;
  let hovered = false;
  let focused = root.contains(document.activeElement);
  let dragging = false;
  let dragStart = carousel.selectedScrollSnap();
  let suspended = false;
  let destroyed = false;
  let visible = !('IntersectionObserver' in window);
  const titles = slides.map((slide, index) => slide.dataset.heroTitle || `Promotion ${index + 1}`);

  dots.replaceChildren();
  const dotButtons = slides.map((slide, index) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${index + 1} of ${slides.length}: ${titles[index]}`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hero-carousel__dot';
    button.dataset.heroIndex = String(index);
    button.setAttribute('aria-label', `Show promotion ${index + 1}: ${titles[index]}`);
    button.setAttribute('aria-controls', 'hero-viewport');
    const mark = document.createElement('span');
    mark.className = 'hero-carousel__dot-mark';
    mark.setAttribute('aria-hidden', 'true');
    button.append(mark);
    dots.append(button);
    return button;
  });

  function stopTimer() {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
  }

  function canRotate() {
    return !destroyed && !suspended && !reducedMotion.matches
      && !hovered && !focused && !dragging && visible && !document.hidden
      && document.body.dataset.view !== 'game' && !document.querySelector('dialog[open]')
      && carousel.scrollSnapList().length > 1;
  }

  function scheduleRotation() {
    stopTimer();
    if (!canRotate()) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (!canRotate()) return;
      carousel.scrollNext();
      scheduleRotation();
    }, 6000);
  }

  function updateSelection() {
    const selected = carousel.selectedScrollSnap();
    dotButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === selected)));
  }

  function announceSelection() {
    const selected = carousel.selectedScrollSnap();
    status.textContent = `Promotion ${selected + 1} of ${slides.length}: ${titles[selected]}`;
  }

  function move(action) {
    action(reducedMotion.matches);
    announceSelection();
    scheduleRotation();
  }

  dots.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-hero-index]');
    if (!button || !dots.contains(button)) return;
    const index = Number(button.dataset.heroIndex);
    if (Number.isInteger(index) && index >= 0 && index < slides.length) move(jump => carousel.scrollTo(index, jump));
  });
  viewport.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(jump => event.key === 'ArrowRight' ? carousel.scrollNext(jump) : carousel.scrollPrev(jump));
  });
  root.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    scheduleRotation();
  });
  root.addEventListener('pointerleave', () => { hovered = false; scheduleRotation(); });
  root.addEventListener('focusin', () => { focused = true; scheduleRotation(); });
  root.addEventListener('focusout', event => {
    focused = root.contains(event.relatedTarget);
    scheduleRotation();
  });

  root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-hero-category]');
    if (!button || !root.contains(button)) return;
    const categories = document.querySelector('#catalog-categories');
    const id = button.dataset.heroCategory;
    if (!['picks', 'providers', 'tap', 'slots'].includes(id)) return;
    const target = categories?.querySelector(`[data-category="${id}"]`);
    const all = categories?.querySelector('[data-category="all"]');
    if (!target || !all) return;
    // Category buttons preserve provider filters; a banner starts a fresh collection.
    all.click();
    target.click();
    const shelves = document.querySelector('#catalog-shelves');
    shelves?.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    const firstShelf = shelves?.querySelector('.game-shelf');
    if (firstShelf) {
      firstShelf.tabIndex = -1;
      firstShelf.focus({ preventScroll: true });
    }
  });

  carousel.on('select', () => { updateSelection(); scheduleRotation(); });
  carousel.on('reInit', () => { updateSelection(); scheduleRotation(); });
  carousel.on('pointerDown', () => {
    dragging = true;
    dragStart = carousel.selectedScrollSnap();
    scheduleRotation();
  });
  carousel.on('pointerUp', () => {
    dragging = false;
    if (carousel.selectedScrollSnap() !== dragStart) announceSelection();
    scheduleRotation();
  });
  carousel.on('slideFocus', announceSelection);

  const stateObserver = new MutationObserver(scheduleRotation);
  stateObserver.observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ['data-view', 'open'],
  });
  const visibilityObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.target === root && entry.isIntersecting);
    scheduleRotation();
  }) : null;
  visibilityObserver?.observe(root);
  carousel.on('destroy', () => {
    destroyed = true;
    stopTimer();
    stateObserver.disconnect();
    visibilityObserver?.disconnect();
    delete root.dataset.ready;
    controls.hidden = true;
  });
  reducedMotion.addEventListener('change', scheduleRotation);
  document.addEventListener('visibilitychange', scheduleRotation);
  window.addEventListener('pagehide', () => { suspended = true; scheduleRotation(); });
  window.addEventListener('pageshow', () => { suspended = false; scheduleRotation(); });
  updateSelection();
  controls.hidden = false;
  scheduleRotation();
}
