import { requestDialogClose } from './dialog-motion.js';

const HISTORY_KEY = 'loopPopup';
const instances = new WeakMap();
let nextSession = 0;

function withoutPopup(state) {
  const { [HISTORY_KEY]: ignored, ...rest } = state || {};
  return rest;
}

function readPopup(state) {
  const value = state?.[HISTORY_KEY];
  return value && typeof value.session === 'string' && typeof value.url === 'string'
    && Array.isArray(value.keys) && value.keys.length > 0 && value.keys.length <= 128
    && value.keys.every(key => typeof key === 'string')
    && Number.isFinite(value.scroll?.x) && Number.isFinite(value.scroll?.y) ? value : null;
}

// Popup entries retain the page URL and route ID. The router delegates history
// events here before deciding whether a real page navigation has occurred.
export function initPopupNavigation({ window: scope = window, document: doc = scope.document,
  dismissDialog = requestDialogClose,
  enabled = () => scope.matchMedia?.('(width <= 1024px)').matches ?? true } = {}) {
  if (instances.has(scope)) return instances.get(scope);
  const { history, location } = scope;
  const session = `popup-${Date.now()}-${++nextSession}`;
  const records = new Map();
  const dismissing = new Set();
  const restorers = [];
  let layers = [], sequence = 0, scheduled = false, traversing = false;
  let pendingNavigation = null, navigating = false, disposed = false, routerReady = false;
  let baseUrl = location.href, baseRouteId = history.state?.loopRoute?.id;
  let baseScroll = readPopup(history.state)?.scroll || position();
  let restoreFrame = 0, lastSignature = null, lastResult = false;
  const enqueue = scope.queueMicrotask?.bind(scope) || queueMicrotask;

  function position() { return { x: scope.scrollX || 0, y: scope.scrollY || 0 }; }
  function commonLength(left, right) {
    let count = 0;
    while (count < left.length && count < right.length && left[count] === right[count]) count++;
    return count;
  }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    enqueue(() => { scheduled = false; if (!disposed) reconcile(); });
  }
  function restoreScroll() {
    scope.cancelAnimationFrame?.(restoreFrame);
    if (pendingNavigation) return;
    const saved = { ...baseScroll }, url = baseUrl;
    const restore = () => {
      if (!pendingNavigation && location.href === url) scope.scrollTo?.({ left: saved.x, top: saved.y, behavior: 'instant' });
    };
    if (scope.requestAnimationFrame) restoreFrame = scope.requestAnimationFrame(restore);
    else restore();
  }
  function write(keys, replace = false) {
    const state = withoutPopup(history.state);
    if (state.loopRoute) state.loopRoute = { ...state.loopRoute, scroll: { ...baseScroll } };
    if (keys.length) state[HISTORY_KEY] = { session, keys, url: baseUrl, scroll: { ...baseScroll } };
    history[replace ? 'replaceState' : 'pushState'](state, '', location.href);
    lastSignature = null;
  }
  function traverse(count) {
    if (!count || traversing) return;
    traversing = true;
    // Real browsers provide go(). A back-only host can still consume entries
    // one at a time, reconciling the remaining depth after each popstate.
    if (typeof history.go === 'function') history.go(-count);
    else history.back();
  }
  function removeFrom(index, invoke = true, alreadyClosed = null, animated = false) {
    const removed = layers.splice(index);
    for (const layer of removed.reverse()) {
      if (!invoke || layer.owner === alreadyClosed) continue;
      if (layer.kind === 'step') layer.onBack();
      else if (layer.record.isOpen()) {
        if (animated && layer.record.dismiss) {
          dismissing.add(layer.record);
          layer.record.dismiss({ onClosed: () => dismissing.delete(layer.record) });
        } else layer.record.close();
      }
    }
  }
  function reconcile() {
    if (!routerReady || traversing) return;
    if (pendingNavigation && layers.length) removeFrom(0);
    const marker = readPopup(history.state);
    const current = marker?.session === session ? marker.keys : [];
    const desired = layers.map(layer => layer.key);
    if (marker && (marker.session !== session || marker.url !== location.href)) {
      baseUrl = location.href;
      baseRouteId = history.state?.loopRoute?.id;
      baseScroll = marker.scroll;
      traverse(marker.keys.length);
      return;
    }
    const common = commonLength(current, desired);
    if (common < current.length) {
      // A same-turn close/open handoff replaces the top popup entry. Deeper
      // replacements first return to their shared parent so Back stays linear.
      if (common === current.length - 1 && desired.length >= current.length) {
        write(desired.slice(0, current.length), true);
      } else {
        traverse(current.length - common);
        return;
      }
    }
    for (let depth = current.length; depth < desired.length; depth++) write(desired.slice(0, depth + 1));
    if (!desired.length && pendingNavigation) {
      const action = pendingNavigation;
      pendingNavigation = null;
      scope.cancelAnimationFrame?.(restoreFrame);
      scope.scrollTo?.({ left: baseScroll.x, top: baseScroll.y, behavior: 'instant' });
      navigating = true;
      try { action(); } finally { navigating = false; lastSignature = null; }
    }
  }
  function opened(record, scroll = position()) {
    dismissing.delete(record);
    if (!record.isOpen() || layers.some(layer => layer.kind === 'popup' && layer.owner === record.owner)) return;
    if (!enabled() && !layers.length && !traversing && !readPopup(history.state)) return;
    if (!layers.length && !readPopup(history.state) && !traversing) {
      baseUrl = location.href;
      baseRouteId = history.state?.loopRoute?.id;
      baseScroll = scroll;
      // Save the underlying position before the first overlay is pushed.
      write([], true);
    }
    layers.push({ key: `${session}:${++sequence}`, kind: 'popup', owner: record.owner, record });
    schedule();
  }
  function closed(owner) {
    const index = layers.findIndex(layer => layer.kind === 'popup' && layer.owner === owner);
    if (index < 0) return;
    // Closing a parent closes any child popup, but its own internal steps do
    // not run Back callbacks: the component owns its whole-dialog reset.
    const descendants = layers.splice(index);
    for (const layer of descendants.reverse()) {
      if (layer.kind === 'popup' && layer.owner !== owner && layer.record.isOpen()) layer.record.close();
    }
    schedule();
  }
  function register({ id, element, isOpen, close, dismiss }) {
    const owner = element || {};
    const record = { id, owner, isOpen, close, dismiss };
    records.set(owner, record);
    const handle = {
      opened: () => opened(record),
      closed: () => closed(owner),
      dispose() { closed(owner); records.delete(owner); },
    };
    return handle;
  }
  function nativeRecord(dialog) {
    if (!dialog || dialog.id === 'site-menu') return null;
    if (!records.has(dialog)) records.set(dialog, {
      id: dialog.id || 'dialog', owner: dialog, isOpen: () => dialog.open,
      close: () => dialog.close(),
      dismiss: options => dismissDialog(dialog, options),
    });
    return records.get(dialog);
  }
  const prototype = scope.HTMLDialogElement?.prototype;
  if (prototype) {
    for (const method of ['showModal', 'show', 'close']) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      if (typeof descriptor?.value !== 'function') continue;
      const original = descriptor.value;
      Object.defineProperty(prototype, method, { ...descriptor, value: function (...args) {
        const scroll = position();
        const result = original.apply(this, args);
        const record = nativeRecord(this);
        if (record) {
          if (method === 'close') { if (!this.open) closed(this); }
          else opened(record, scroll);
        }
        return result;
      } });
      restorers.push(() => Object.defineProperty(prototype, method, descriptor));
    }
  }
  // Native Escape, form[method=dialog], and platform close requests do not
  // necessarily invoke the JavaScript close() method.
  function nativeClosed(event) {
    if (!event.target.open) { dismissing.delete(records.get(event.target)); closed(event.target); }
  }
  doc?.addEventListener('close', nativeClosed, true);
  for (const dialog of doc?.querySelectorAll('dialog[open]') || []) {
    const record = nativeRecord(dialog);
    if (record) opened(record);
  }

  const controller = {
    register,
    attachRouter() {
      routerReady = true;
      if (baseRouteId === undefined && baseUrl === location.href) baseRouteId = history.state?.loopRoute?.id;
      schedule();
    },
    pushStep(owner, { id, onBack }) {
      if (typeof onBack !== 'function' || !layers.some(layer => layer.kind === 'popup' && layer.owner === owner)) return false;
      if (layers.some(layer => layer.kind === 'step' && layer.owner === owner && layer.id === id)) return false;
      layers.push({ key: `${session}:${++sequence}`, kind: 'step', owner, id, onBack });
      schedule();
      return true;
    },
    backStep(owner, id) {
      const index = layers.findIndex(layer => layer.kind === 'step' && layer.owner === owner && layer.id === id);
      if (index < 0) return false;
      removeFrom(index);
      schedule();
      return true;
    },
    clearSteps(owner) {
      if (!layers.some(layer => layer.kind === 'step' && layer.owner === owner)) return false;
      layers = layers.filter(layer => layer.kind !== 'step' || layer.owner !== owner);
      schedule();
      return true;
    },
    beforeNavigate(action) {
      // Browser Back may already have consumed an entry while its visual exit
      // is finishing. A real navigation must still close that shell immediately.
      for (const record of dismissing) if (record.isOpen()) record.close();
      dismissing.clear();
      if (navigating || (!layers.length && !traversing && !readPopup(history.state))) return false;
      pendingNavigation = action;
      if (layers.length) removeFrom(0);
      schedule();
      return true;
    },
    back() {
      if (traversing) return true;
      if (!layers.length) return false;
      removeFrom(layers.length - 1, true, null, true);
      schedule();
      return true;
    },
    handleHistory(page = {}) {
      const marker = readPopup(history.state);
      const signature = JSON.stringify([location.href, history.state?.loopRoute?.id, marker?.session, marker?.keys]);
      if (signature === lastSignature) return lastResult;
      lastSignature = signature;
      const wasTraversing = traversing;
      traversing = false;
      const samePage = location.href === baseUrl && history.state?.loopRoute?.id === baseRouteId;
      if (wasTraversing && samePage) {
        restoreScroll(); schedule();
        // A stale popup can belong to a different page (for example after a
        // manual hash link). Once it is skipped, let the router mount that page.
        return (lastResult = page.url === undefined || (page.url === location.href && page.routeId === baseRouteId));
      }
      if (marker && (marker.session !== session || !samePage)) {
        if (layers.length) removeFrom(0);
        baseUrl = location.href; baseRouteId = history.state?.loopRoute?.id; baseScroll = marker.scroll;
        traverse(marker.keys.length);
        return (lastResult = true);
      }
      if (samePage && (layers.length || marker)) {
        const target = marker?.keys || [];
        const common = commonLength(layers.map(layer => layer.key), target);
        if (common < layers.length) removeFrom(common, true, null, true);
        // A Forward entry whose popup has already been dismissed is stale.
        // Never resurrect forms, wins, or authentication from history state.
        if (target.length > common) traverse(target.length - common);
        else { restoreScroll(); schedule(); }
        return (lastResult = true);
      }
      if (layers.length) removeFrom(0);
      pendingNavigation = null;
      return (lastResult = false);
    },
    dispose() {
      disposed = true;
      scope.cancelAnimationFrame?.(restoreFrame);
      doc?.removeEventListener('close', nativeClosed, true);
      for (const restore of restorers.reverse()) restore();
      instances.delete(scope);
    },
  };
  instances.set(scope, controller);
  // Reloading a popup URL must return to its real page entry, without opening
  // stale UI or leaving an extra same-page Back step.
  if (readPopup(history.state)) schedule();
  return controller;
}

