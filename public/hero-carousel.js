import EmblaCarousel from './vendor/embla-carousel/embla-carousel.esm.js';
import { resizeHeroCarousel } from './hero-resize.js';

let initialized = false;

export function initHeroCarousel({ account, openHome, openCategory, openProviders, openProvider, openFeature, openSpinWheel, openStore } = {}) {
  if (initialized) return;
  const root = document.querySelector('#hero-carousel');
  const viewport = document.querySelector('#hero-viewport');
  const track = document.querySelector('#hero-track');
  const dots = document.querySelector('#hero-dots');
  const status = document.querySelector('#hero-status');
  const controls = document.querySelector('#hero-controls');
  if (![root, viewport, track, dots, status, controls].every(Boolean)) return;
  const allSlides = [...track.querySelectorAll('.hero-carousel__slide')];
  if (!allSlides.length) return;
  initialized = true;

  let signedIn = account?.isSignedIn() === true;
  function audienceSlides() {
    return allSlides.filter(slide => {
      slide.hidden = (signedIn && Object.hasOwn(slide.dataset, 'heroGuest'))
        || (!signedIn && Object.hasOwn(slide.dataset, 'heroMember'));
      return !slide.hidden;
    });
  }
  let slides = audienceSlides();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionReduced = () => reducedMotion.matches || document.body.dataset.reduceMotion === 'true';
  // Disable the native scroll-snap fallback before measuring. Revealing the
  // guest slide can otherwise retain the wheel as the browser's snap target.
  root.dataset.ready = 'true';
  viewport.scrollLeft = 0;
  const carousel = EmblaCarousel(viewport, {
    loop: true, align: 'start', slidesToScroll: 1, containScroll: false, slides,
    // A gentler attraction keeps wide-card moves from feeling like a quick snap.
    duration: 42,
    watchResize: (api, entries) => resizeHeroCarousel(api, entries, { animate: !motionReduced() && !document.hidden }),
  });
  const rotationDuration = 6000;
  let timer = null;
  let resizeTimer = null;
  let resizing = false;
  let remaining = rotationDuration;
  let startedAt = null;
  let progressAnimation = null;
  let progressIndex = -1;
  let progressReduced = motionReduced();
  let hovered = false;
  let focused = root.contains(document.activeElement);
  let dragging = false;
  let dragStart = carousel.selectedScrollSnap();
  let suspended = false;
  let destroyed = false;
  let visible = !('IntersectionObserver' in window);
  let titles = [];
  let dotButtons = [];

  function renderDots() {
    titles = slides.map((slide, index) => slide.dataset.heroTitle || `Promotion ${index + 1}`);
    dots.replaceChildren();
    dotButtons = slides.map((slide, index) => {
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
      const fill = document.createElement('span');
      fill.className = 'hero-carousel__dot-fill';
      mark.append(fill);
      button.append(mark);
      dots.append(button);
      return button;
    });
  }
  renderDots();

  function syncAudience() {
    const next = account.isSignedIn();
    if (destroyed || next === signedIn) return;
    const selectedSlide = slides[carousel.selectedScrollSnap()];
    stopTimer();
    progressAnimation?.cancel();
    progressAnimation = null;
    progressIndex = -1;
    signedIn = next;
    slides = audienceSlides();
    renderDots();
    focused = root.contains(document.activeElement) && !selectedSlide?.hidden;
    dragging = false;
    status.textContent = '';
    // Supply visible nodes explicitly: hidden DOM children must not become empty snaps.
    viewport.scrollLeft = 0;
    carousel.reInit({ slides, startIndex: signedIn ? Math.max(0, slides.indexOf(selectedSlide)) : 0 });
  }
  const unsubscribeAccount = account?.subscribe(syncAudience);

  function stopTimer() {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (startedAt !== null) {
      remaining = Math.max(0, remaining - (window.performance.now() - startedAt));
      startedAt = null;
    }
    if (progressAnimation) {
      progressAnimation.pause();
      progressAnimation.currentTime = rotationDuration - remaining;
    }
  }

  function resetProgress() {
    stopTimer();
    remaining = rotationDuration;
    progressAnimation?.cancel();
    progressAnimation = null;
    progressIndex = carousel.selectedScrollSnap();
    progressReduced = motionReduced();
    if (!progressReduced) {
      const fill = dotButtons[progressIndex].children[0].children[0];
      progressAnimation = fill.animate([
        { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' },
      ], { duration: rotationDuration, easing: 'linear', fill: 'forwards' });
      progressAnimation.pause();
      progressAnimation.currentTime = 0;
    }
  }

  function canRotate() {
    return !root.hidden && !destroyed && !suspended && !motionReduced()
      && !['loading', 'error'].includes(document.body.dataset.appState) && !document.body.dataset.appStarting
      && !hovered && !focused && !dragging && !resizing && visible && !document.hidden
      && document.body.dataset.view !== 'game' && !document.querySelector('dialog[open]')
      && carousel.scrollSnapList().length > 1;
  }

  function scheduleRotation() {
    if (destroyed) return;
    if (progressIndex !== carousel.selectedScrollSnap() || progressReduced !== motionReduced()) resetProgress();
    if (!canRotate()) { stopTimer(); return; }
    // Observers and overlapping pause reasons must not restart the countdown.
    if (timer !== null) return;
    startedAt = window.performance.now();
    if (progressAnimation) {
      progressAnimation.currentTime = rotationDuration - remaining;
      progressAnimation.play();
    }
    timer = window.setTimeout(() => {
      remaining = 0;
      startedAt = null;
      timer = null;
      if (!canRotate()) { stopTimer(); return; }
      carousel.scrollNext();
    }, remaining);
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
    stopTimer();
    const previous = carousel.selectedScrollSnap();
    action(motionReduced());
    if (carousel.selectedScrollSnap() === previous) resetProgress();
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
    const id = button.dataset.heroCategory;
    if (!id) return;
    event.preventDefault();
    if (id === 'spin-wheel') openSpinWheel?.({ returnFocusTo: button });
    else if (id === 'store') openStore?.();
    else if (id === 'achievements') openFeature?.('achievements');
    else if (id === 'nolimit-city') openProvider?.('nolimit-city');
    else if (id === 'all') openHome?.();
    else if (id === 'providers') openProviders?.();
    else openCategory?.(id);
  });

  carousel.on('select', () => { updateSelection(); scheduleRotation(); });
  carousel.on('reInit', () => { updateSelection(); scheduleRotation(); });
  carousel.on('resize', () => {
    // Width transitions remeasure the slides on each frame. Keep their selected
    // anchor aligned and resume the existing countdown only after resizing stops.
    resizing = true;
    scheduleRotation();
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      resizing = false;
      scheduleRotation();
    }, 160);
  });
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
    subtree: true, attributes: true, attributeFilter: ['data-view', 'open', 'data-app-state', 'data-app-starting'],
  });
  stateObserver.observe(root, { attributes: true, attributeFilter: ['hidden'] });
  const visibilityObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.target === root && entry.isIntersecting);
    scheduleRotation();
  }) : null;
  visibilityObserver?.observe(root);
  carousel.on('destroy', () => {
    destroyed = true;
    stopTimer();
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = null;
    progressAnimation?.cancel();
    progressAnimation = null;
    stateObserver.disconnect();
    visibilityObserver?.disconnect();
    unsubscribeAccount?.();
    delete root.dataset.ready;
    controls.hidden = true;
  });
  reducedMotion.addEventListener('change', scheduleRotation);
  document.addEventListener('loop:preferences-change', scheduleRotation);
  document.addEventListener('visibilitychange', scheduleRotation);
  window.addEventListener('pagehide', () => { suspended = true; scheduleRotation(); });
  window.addEventListener('pageshow', () => { suspended = false; scheduleRotation(); });
  updateSelection();
  controls.hidden = false;
  scheduleRotation();
}
