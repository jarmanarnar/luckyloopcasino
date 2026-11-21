import { POPUP_MOTION, closePopovers } from './popover-motion.js';

const controllers = new WeakMap();
const dialogs = '#store-dialog, #redeem-dialog, #auth-dialog, #profile-summary, #how-to-play-dialog, #phone-verification-dialog, #identity-verification-dialog, #notifications-drawer, #spin-wheel-dialog, #spin-win-dialog, #achievement-dialog, .chat-sheet';
const steps = '#redeem-methods, #redeem-details, #auth-form, #auth-recovery, #profile-summary-overview, #profile-editor, .spin-wheel__play, .spin-wheel__prizes';
const easing = POPUP_MOTION.easing;
const nativeClose = (dialog, value) => value === undefined ? dialog.close() : dialog.close(value);

// Only user dismissals use this path. Native close() stays synchronous for
// navigation, sign-out and dialog-to-dialog handoffs.
export function requestDialogClose(dialog, options = {}) {
  const controller = controllers.get(dialog?.ownerDocument);
  if (controller) return controller.dismiss(dialog, options);
  if (dialog?.open) nativeClose(dialog, options.returnValue);
  options.onClosed?.();
}

export function initDialogMotion({ window: scope = window, document: doc = document } = {}) {
  if (controllers.has(doc)) return controllers.get(doc);
  const reduced = scope.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map(), stepAnimations = new Map(), restorers = [], cancelTargets = new Set();
  const later = scope.setTimeout?.bind(scope) || setTimeout;
  const clear = scope.clearTimeout?.bind(scope) || clearTimeout;
  let destroyed = false;
  const eligible = dialog => dialog?.matches?.(dialogs) === true;
  const enabled = dialog => !destroyed && !reduced.matches
    && doc.body?.dataset.reduceMotion !== 'true' && !doc.hidden && typeof dialog.animate === 'function';

  function stop(dialog) {
    const state = running.get(dialog);
    if (!state) return;
    running.delete(dialog);
    clear(state.timer);
    state.animation?.cancel();
    if (state.closing) dialog.inert = state.wasInert;
    delete dialog.dataset.dialogMotion;
  }
  function finish(dialog, state) {
    if (running.get(dialog) !== state) return;
    const closing = state.closing;
    stop(dialog);
    if (closing) {
      if (dialog.open) nativeClose(dialog, state.returnValue);
      for (const callback of state.callbacks) callback();
    }
  }
  function animate(dialog, frames, duration, options = {}) {
    stop(dialog);
    const state = { closing: Boolean(options.closing), returnValue: options.returnValue,
      callbacks: options.onClosed ? [options.onClosed] : [], animation: null, timer: null, wasInert: Boolean(dialog.inert) };
    running.set(dialog, state);
    dialog.dataset.dialogMotion = state.closing ? 'closing' : 'opening';
    if (state.closing) dialog.inert = true;
    try {
      state.animation = dialog.animate(frames, { duration, easing, fill: 'both' });
      // The timer also completes the lifecycle if a host never settles finished.
      state.timer = later(() => finish(dialog, state), duration + 80);
      state.animation.finished?.then(() => finish(dialog, state), () => finish(dialog, state));
    } catch { finish(dialog, state); }
  }
  function enter(dialog) {
    if (!eligible(dialog) || !enabled(dialog)) return;
    const style = running.has(dialog) ? scope.getComputedStyle?.(dialog) : null;
    const from = style ? { opacity: style.opacity || '1', translate: style.translate && style.translate !== 'none' ? style.translate : '0 0' }
      : { opacity: 0, translate: `0 ${POPUP_MOTION.offset}px` };
    animate(dialog, [from, { opacity: 1, translate: '0 0' }], POPUP_MOTION.duration);
  }
  function dismiss(dialog, options = {}) {
    closePopovers(doc);
    if (!eligible(dialog) || !dialog.open || !enabled(dialog)) {
      stop(dialog);
      if (dialog?.open) nativeClose(dialog, options.returnValue);
      options.onClosed?.();
      return;
    }
    const previous = running.get(dialog);
    if (previous?.closing) {
      if (options.onClosed) previous.callbacks.push(options.onClosed);
      return;
    }
    const current = scope.getComputedStyle?.(dialog);
    const opacity = current?.opacity || '1';
    const translate = current?.translate && current.translate !== 'none' ? current.translate : '0 0';
    for (const [element, animation] of stepAnimations) {
      if (dialog.contains(element)) { animation.cancel(); stepAnimations.delete(element); }
    }
    animate(dialog, [{ opacity, translate }, { opacity: 0, translate: `0 ${POPUP_MOTION.offset}px` }], POPUP_MOTION.duration,
      { ...options, closing: true });
  }

  // Opening is synchronous, so existing guards, focus and popup-history logic
  // retain their semantics. Only the newly visible shell receives motion.
  const prototype = scope.HTMLDialogElement?.prototype;
  if (prototype) for (const method of ['showModal', 'show']) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
    if (typeof descriptor?.value !== 'function') continue;
    const original = descriptor.value;
    const wrapped = function (...args) {
      const wasOpen = this.open;
      closePopovers(doc);
      const result = original.apply(this, args);
      if (eligible(this) && !cancelTargets.has(this)) {
        this.addEventListener('cancel', onCancel);
        cancelTargets.add(this);
      }
      if (this.open && (!wasOpen || running.get(this)?.closing)) enter(this);
      return result;
    };
    Object.defineProperty(prototype, method, { ...descriptor, value: wrapped });
    restorers.push(() => {
      if (prototype[method] === wrapped) Object.defineProperty(prototype, method, descriptor);
    });
  }

  function onCancel(event) {
    const dialog = event.target;
    if (!eligible(dialog) || !enabled(dialog)) return;
    // Installed after the feature handlers: auth can clear pending intent and
    // validation can prevent cancellation before the shared dismissal runs.
    if (event.defaultPrevented) return;
    event.preventDefault();
    dismiss(dialog);
  }
  function onSubmit(event) {
    const form = event.target;
    const submitter = event.submitter;
    const method = submitter?.getAttribute?.('formmethod') || form?.getAttribute?.('method');
    const dialog = form?.closest?.('dialog');
    if (event.defaultPrevented || method?.toLowerCase() !== 'dialog'
      || !eligible(dialog) || !enabled(dialog)) return;
    event.preventDefault();
    dismiss(dialog, { returnValue: submitter?.value });
  }
  function onClosed(event) { if (!event.target.open) stop(event.target); }
  function settle() {
    for (const [dialog, state] of running) if (!enabled(dialog)) finish(dialog, state);
    if (reduced.matches || doc.hidden || doc.body?.dataset.reduceMotion === 'true') {
      for (const animation of stepAnimations.values()) animation.cancel();
      stepAnimations.clear();
    }
  }
  function animateStep(element) {
    const dialog = element.closest?.('dialog');
    if (element.hidden || !eligible(dialog) || !dialog.open || running.has(dialog) || !enabled(element)) return;
    stepAnimations.get(element)?.cancel();
    try {
      const animation = element.animate([{ opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing });
      stepAnimations.set(element, animation);
      const clearStep = () => { if (stepAnimations.get(element) === animation) stepAnimations.delete(element); };
      animation.finished?.then(clearStep, clearStep);
    } catch { stepAnimations.delete(element); }
  }
  const observer = scope.MutationObserver ? new scope.MutationObserver(records => {
    for (const record of records) {
      if (record.attributeName === 'data-reduce-motion') settle();
      else if (record.attributeName === 'hidden' && record.target.matches?.(steps)) animateStep(record.target);
    }
  }) : null;
  observer?.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-reduce-motion'] });
  // Bubble after feature form handlers: prevented validation/preview submits
  // are never mistaken for the plain method=dialog close forms.
  doc.addEventListener('submit', onSubmit);
  doc.addEventListener('close', onClosed, true);
  doc.addEventListener('visibilitychange', settle);
  reduced.addEventListener?.('change', settle);
  const controller = { dismiss, destroy() {
    destroyed = true;
    settle();
    observer?.disconnect();
    for (const animation of stepAnimations.values()) animation.cancel();
    stepAnimations.clear();
    for (const dialog of cancelTargets) dialog.removeEventListener('cancel', onCancel);
    doc.removeEventListener('submit', onSubmit);
    doc.removeEventListener('close', onClosed, true);
    doc.removeEventListener('visibilitychange', settle);
    reduced.removeEventListener?.('change', settle);
    for (const restore of restorers.reverse()) restore();
    controllers.delete(doc);
  } };
  controllers.set(doc, controller);
  return controller;
}
