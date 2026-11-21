export const POPUP_MOTION = Object.freeze({ duration: 280, easing: 'cubic-bezier(.4, 0, .2, 1)', offset: 20 });
const groups = new WeakMap();

export function closePopovers(document) {
  for (const record of groups.get(document)?.records || []) record.close();
}

function groupFor(doc, scope) {
  if (groups.has(doc)) return groups.get(doc);
  const records = new Set();
  const reduced = scope.matchMedia('(prefers-reduced-motion: reduce)');
  const group = { records, reduced };
  groups.set(doc, group);
  doc.addEventListener('pointerdown', event => {
    for (const record of records) {
      if (record.isOpen() && !record.panel.contains(event.target) && !record.trigger?.contains(event.target)) record.dismiss();
    }
  });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const record = [...records].reverse().find(item => item.isOpen());
    if (!record) return;
    event.preventDefault();
    record.dismiss({ restoreFocus: true });
  });
  const settle = () => { for (const record of records) record.settle(); };
  reduced.addEventListener?.('change', settle);
  doc.addEventListener('visibilitychange', settle);
  if (scope.MutationObserver) {
    const observer = new scope.MutationObserver(settle);
    observer.observe(doc.body, { attributes: true, attributeFilter: ['data-reduce-motion'] });
  }
  return group;
}

// Native popovers stay in the top layer. Only their user dismissal is delayed;
// the feature's direct hidePopover()/close() still completes synchronously.
export function initPopoverMotion(panel, { trigger, document: doc = panel?.ownerDocument,
  window: scope = doc?.defaultView, native = true, bindTrigger = true,
  isOpen = () => panel.matches(':popover-open'), show = () => {}, hide = () => {},
  onClosed = () => {} } = {}) {
  const nativeShow = native ? panel.showPopover?.bind(panel) : show;
  const nativeHide = native ? panel.hidePopover?.bind(panel) : hide;
  // Leave native behavior intact on non-browser hosts and unsupported popovers.
  if (!scope?.matchMedia || !doc?.addEventListener || !nativeShow || !nativeHide) {
    const close = ({ restoreFocus = false } = {}) => {
      if (isOpen()) nativeHide?.();
      onClosed();
      if (restoreFocus) trigger?.focus({ preventScroll: true });
    };
    return { open: () => nativeShow?.(), close, dismiss: close, isClosing: () => false,
      toggle() { if (isOpen()) close({ restoreFocus: true }); else nativeShow?.(); } };
  }
  const group = groupFor(doc, scope);
  const later = scope.setTimeout?.bind(scope) || setTimeout;
  const clear = scope.clearTimeout?.bind(scope) || clearTimeout;
  let state = null;
  const enabled = () => !group.reduced.matches && doc.body?.dataset.reduceMotion !== 'true'
    && !doc.hidden && typeof panel.animate === 'function';
  function stop() {
    if (!state) return;
    const previous = state; state = null;
    clear(previous.timer);
    previous.animation?.cancel();
    panel.inert = previous.wasInert;
    delete panel.dataset.popoverMotion;
  }
  function close({ restoreFocus = false } = {}) {
    const wasOpen = isOpen();
    stop();
    if (wasOpen) nativeHide();
    trigger?.setAttribute('aria-expanded', 'false');
    if (wasOpen) onClosed();
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }
  function complete(current) {
    if (state !== current) return;
    if (current.closing) close({ restoreFocus: current.restoreFocus });
    else stop();
  }
  function animate(closing, from, restoreFocus = false) {
    stop();
    if (!enabled()) { if (closing) close({ restoreFocus }); return; }
    const current = { closing, restoreFocus, wasInert: Boolean(panel.inert), animation: null, timer: null };
    state = current;
    panel.dataset.popoverMotion = closing ? 'closing' : 'opening';
    if (closing) panel.inert = true;
    const to = closing ? { opacity: 0, translate: `0 ${POPUP_MOTION.offset}px` }
      : { opacity: 1, translate: '0 0' };
    try {
      current.animation = panel.animate([from, to], { duration: POPUP_MOTION.duration, easing: POPUP_MOTION.easing, fill: 'both' });
      current.timer = later(() => complete(current), POPUP_MOTION.duration + 80);
      current.animation.finished?.then(() => complete(current), () => complete(current));
    } catch { complete(current); }
  }
  function visibleFrame() {
    const style = scope.getComputedStyle?.(panel);
    return { opacity: style?.opacity || '1', translate: style?.translate && style.translate !== 'none' ? style.translate : '0 0' };
  }
  function open(...args) {
    const reversing = Boolean(state?.closing);
    const from = reversing ? visibleFrame() : { opacity: 0, translate: `0 ${POPUP_MOTION.offset}px` };
    if (isOpen() && !reversing) return;
    for (const other of group.records) if (other !== record) other.close();
    stop();
    if (!isOpen()) nativeShow(...args);
    if (!isOpen()) return; // A feature's beforetoggle guard may reject opening.
    trigger?.setAttribute('aria-expanded', 'true');
    animate(false, from);
  }
  function dismiss({ restoreFocus = false } = {}) {
    if (!isOpen()) { close(); return; }
    if (state?.closing) { state.restoreFocus ||= restoreFocus; return; }
    const from = visibleFrame();
    trigger?.setAttribute('aria-expanded', 'false');
    animate(true, from, restoreFocus);
  }
  function toggle() {
    if (state?.closing || !isOpen()) open();
    else dismiss({ restoreFocus: true });
  }
  const record = { panel, trigger, isOpen, open, close, dismiss, toggle, isClosing: () => Boolean(state?.closing),
    settle() { if (state && !enabled()) complete(state); } };
  group.records.add(record);
  if (native) {
    panel.setAttribute('popover', 'manual');
    // These are per-panel wrappers, never a global delayed native API override.
    panel.showPopover = open;
    panel.hidePopover = () => close();
    panel.togglePopover = force => {
      const showNext = typeof force === 'boolean' ? force : !isOpen();
      if (showNext) open(); else close();
      return isOpen();
    };
  }
  if (bindTrigger) trigger?.addEventListener('click', event => {
    if (event.defaultPrevented || trigger.disabled) return;
    event.preventDefault(); toggle();
  });
  if (native) panel.addEventListener('click', event => {
    const button = event.target.closest?.('[popovertargetaction="hide"]');
    if (event.defaultPrevented || button?.getAttribute('popovertarget') !== panel.id) return;
    event.preventDefault(); dismiss({ restoreFocus: true });
  });
  return record;
}
