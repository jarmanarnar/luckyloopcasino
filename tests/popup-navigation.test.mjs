import assert from 'node:assert/strict';
import test from 'node:test';
import { initPopupNavigation } from '../public/popup-navigation.js';
import { initRouter } from '../public/routes.js';

function browser({ desktop = false, snapshot, deferRouter = false, dismissDialog } = {}) {
  const listeners = new Map(), documentListeners = new Map(), frames = new Map();
  const microtasks = [], tasks = [], dialogs = [];
  let frameId = 0, index = snapshot?.index || 0;
  const entries = snapshot ? structuredClone(snapshot.entries)
    : [{ url: 'https://example.com/#/', state: null }];
  const emit = (name, event = {}) => { for (const fn of listeners.get(name) || []) fn(event); };
  const listen = (map, name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  const doc = {
    addEventListener: (name, fn) => listen(documentListeners, name, fn),
    removeEventListener(name, fn) { documentListeners.set(name, (documentListeners.get(name) || []).filter(item => item !== fn)); },
    querySelectorAll: () => dialogs.filter(dialog => dialog.open),
  };
  function closeEvent(dialog) {
    tasks.push(() => {
      for (const fn of documentListeners.get('close') || []) fn({ target: dialog });
      for (const fn of dialog.listeners.get('close') || []) fn({ target: dialog });
    });
  }
  class Dialog {
    constructor(id) { this.id = id; this.open = false; this.listeners = new Map(); dialogs.push(this); }
    showModal() { if (this.failOpen) throw new Error('Cannot open'); this.open = true; }
    show() { this.open = true; }
    close() { if (!this.open) return; this.open = false; closeEvent(this); }
    addEventListener(name, fn) { listen(this.listeners, name, fn); }
  }
  const scope = {
    document: doc, HTMLDialogElement: Dialog, scrollX: 0, scrollY: 0,
    matchMedia: () => ({ matches: !desktop }),
    location: { get href() { return entries[index].url; }, get hash() { return new URL(entries[index].url).hash; } },
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      replaceState(state, title, url) { entries[index] = { state: structuredClone(state), url: new URL(url, entries[index].url).href }; },
      pushState(state, title, url) {
        entries.splice(index + 1);
        entries.push({ state: structuredClone(state), url: new URL(url, entries[index].url).href }); index++;
      },
      go(delta) {
        const target = index + delta;
        if (target < 0 || target >= entries.length) return;
        tasks.push(() => {
          const previous = entries[index].url;
          index = target; emit('popstate');
          if (previous !== entries[index].url) emit('hashchange');
        });
      },
      back() { this.go(-1); },
    },
    addEventListener: (name, fn) => listen(listeners, name, fn),
    queueMicrotask: fn => microtasks.push(fn),
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollTo({ left, top }) { scope.scrollX = left; scope.scrollY = top; emit('scroll'); },
  };
  function flushMicrotasks() { while (microtasks.length) microtasks.shift()(); }
  const page = {
    scope, doc, entries, Dialog, flushMicrotasks,
    get index() { return index; },
    runTask() { flushMicrotasks(); tasks.shift()?.(); flushMicrotasks(); },
    settle() {
      let rounds = 0;
      while (microtasks.length || tasks.length || frames.size) {
        assert.ok(++rounds < 100, 'popup/history work must settle');
        flushMicrotasks();
        if (tasks.length) tasks.shift()();
        else { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); }
      }
    },
    scroll(y) { scope.scrollY = y; emit('scroll'); },
    back() { scope.history.back(); page.settle(); },
    manualHash(hash) {
      scope.history.pushState(null, '', hash);
      emit('hashchange'); page.settle();
    },
    nativeClose(dialog) { dialog.open = false; closeEvent(dialog); },
    snapshot: () => structuredClone({ entries, index }),
  };
  page.navigation = initPopupNavigation({ window: scope, dismissDialog });
  page.attachRouter = () => { page.router = initRouter({ window: scope, popupNavigation: page.navigation }); };
  if (!deferRouter) page.attachRouter();
  return page;
}

function onAchievements(options) {
  const page = browser(options);
  page.router.navigate({ type: 'feature', pageId: 'achievements' }); page.settle(); page.scroll(420);
  return page;
}
const marker = page => page.scope.history.state?.loopPopup;
const assertAchievements = page => assert.deepEqual(page.router.getRoute(), { type: 'feature', pageId: 'achievements' });

test('browser Back consumes its history entry while the modal waits for its animated dismissal', () => {
  let finish;
  const page = onAchievements({ dismissDialog(dialog, { onClosed }) { finish = () => { dialog.close(); onClosed(); }; } });
  const dialog = new page.Dialog('store-dialog'); dialog.showModal(); page.settle();
  page.back();
  assert.equal(dialog.open, true, 'the shell keeps native modal state until its exit ends');
  assert.equal(marker(page), undefined); assertAchievements(page);
  const index = page.index;
  finish(); page.settle();
  assert.equal(dialog.open, false); assert.equal(page.index, index);
  assert.equal(page.scope.scrollY, 420);
});

test('navigation closes an in-flight Back dismissal synchronously instead of leaving a modal on the new page', () => {
  let dismissals = 0;
  const page = onAchievements({ dismissDialog() { dismissals++; } });
  const dialog = new page.Dialog('store-dialog'); dialog.showModal(); page.settle();
  page.back(); assert.equal(dialog.open, true); assert.equal(dismissals, 1);
  page.router.navigate({ type: 'search', query: '' }); page.settle();
  assert.equal(dialog.open, false); assert.equal(page.router.getRoute().type, 'search');
  assert.equal(dismissals, 1, 'route changes never start another delayed dismissal');
});

test('browser Back closes a popup without navigating its page or losing scroll', () => {
  const page = onAchievements(), store = new page.Dialog('store-dialog'), routes = [];
  page.router.subscribe(route => routes.push(route));
  store.showModal(); page.settle();
  assert.equal(marker(page).keys.length, 1);
  assert.equal(page.scope.location.hash, '#/achievements');
  page.scroll(0); // Focus/layout changes under the overlay cannot replace its origin.
  page.back();
  assert.equal(store.open, false); assertAchievements(page);
  assert.equal(page.scope.scrollY, 420); assert.equal(routes.length, 0);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('X, native Escape and form-dialog dismissal consume their entries without an extra Back stop', () => {
  for (const native of [false, true]) {
    const page = onAchievements(), dialog = new page.Dialog('redeem-dialog');
    dialog.showModal(); page.settle();
    if (native) page.nativeClose(dialog); else dialog.close();
    page.settle(); assert.equal(marker(page), undefined); assert.equal(page.index, 1);
    page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
  }
});

test('nested popups and inner steps unwind one level at a time', () => {
  const page = onAchievements(), parent = new page.Dialog('wheel'), child = new page.Dialog('win');
  const calls = [];
  parent.showModal();
  page.navigation.pushStep(parent, { id: 'prizes', onBack: () => calls.push('wheel') });
  child.showModal();
  page.navigation.pushStep(child, { id: 'wallet', onBack: () => calls.push('win') });
  page.settle(); assert.equal(marker(page).keys.length, 4);
  page.back(); assert.deepEqual(calls, ['win']); assert.equal(child.open, true);
  page.back(); assert.equal(child.open, false); assert.equal(parent.open, true);
  page.back(); assert.deepEqual(calls, ['win', 'wheel']); assert.equal(parent.open, true);
  page.back(); assert.equal(parent.open, false); assertAchievements(page); assert.equal(page.scope.scrollY, 420);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('closing an entire dialog removes its steps and child dialogs without running step Back callbacks', () => {
  const page = onAchievements(), parent = new page.Dialog('store'), child = new page.Dialog('verification');
  let backs = 0;
  parent.showModal(); page.navigation.pushStep(parent, { id: 'amount', onBack: () => backs++ });
  child.showModal(); page.navigation.pushStep(child, { id: 'code', onBack: () => backs++ });
  page.settle(); parent.close(); page.settle();
  assert.equal(child.open, false); assert.equal(backs, 0); assert.equal(marker(page), undefined);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('same-turn close/open handoff replaces the popup entry', () => {
  const page = onAchievements(), first = new page.Dialog('achievement'), next = new page.Dialog('auth');
  first.showModal(); page.settle(); const length = page.entries.length;
  first.close(); next.showModal(); page.settle();
  assert.equal(page.entries.length, length); assert.equal(marker(page).keys.length, 1);
  page.back(); assert.equal(next.open, false); assertAchievements(page);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('a close-event handoff survives an already scheduled history traversal', () => {
  const page = onAchievements(), first = new page.Dialog('achievement'), next = new page.Dialog('auth');
  first.addEventListener('close', () => next.showModal());
  first.showModal(); page.settle(); first.close(); page.flushMicrotasks();
  page.settle();
  assert.equal(next.open, true); assert.equal(marker(page).keys.length, 1); assertAchievements(page);
  page.back(); assert.equal(next.open, false); assertAchievements(page);
});

test('close then navigate waits for popup history to drain and preserves the previous page position', () => {
  const page = onAchievements(), dialog = new page.Dialog('auth');
  dialog.showModal(); page.navigation.pushStep(dialog, { id: 'recovery', onBack() {} }); page.settle();
  dialog.close(); page.scroll(0);
  page.router.navigate({ type: 'category', categoryId: 'fruit' }); page.settle();
  assert.equal(page.scope.location.hash, '#/fruit'); assert.equal(marker(page), undefined);
  assert.equal(page.scope.scrollY, 0);
  page.back(); assertAchievements(page); assert.equal(page.scope.scrollY, 420);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('navigation while a nested popup is open closes it before committing the new page', () => {
  const page = onAchievements(), first = new page.Dialog('wheel'), child = new page.Dialog('win');
  first.showModal(); child.showModal(); page.settle();
  page.router.navigate({ type: 'store' }); page.settle();
  assert.equal(first.open, false); assert.equal(child.open, false); assert.equal(marker(page), undefined);
  assert.deepEqual(page.router.getRoute(), { type: 'store' });
  page.back(); assertAchievements(page);
});

test('Back over multiple popup entries preserves the underlying page and closes the whole stack', () => {
  const page = onAchievements(), first = new page.Dialog('wheel'), child = new page.Dialog('win');
  first.showModal(); child.showModal(); page.settle();
  page.scope.history.go(-2); page.settle();
  assert.equal(first.open, false); assert.equal(child.open, false); assertAchievements(page);
  assert.equal(page.scope.scrollY, 420);
});

test('Forward does not resurrect a dismissed form or leave a phantom Back entry', () => {
  const page = onAchievements(), dialog = new page.Dialog('auth');
  dialog.showModal(); page.settle(); page.back();
  page.scope.history.go(1); page.settle();
  assert.equal(dialog.open, false); assert.equal(marker(page), undefined); assert.equal(page.index, 1);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('manual hash navigation and Back across its stale popup restore the correct underlying route', () => {
  const page = onAchievements(), dialog = new page.Dialog('store');
  dialog.showModal(); page.settle();
  page.manualHash('#/fruit');
  assert.equal(dialog.open, false);
  assert.deepEqual(page.router.getRoute(), { type: 'category', categoryId: 'fruit' });
  page.back();
  assertAchievements(page); assert.equal(marker(page), undefined); assert.equal(page.scope.scrollY, 420);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('reload discards stale popup entries and restores the real page position', () => {
  const before = onAchievements(), dialog = new before.Dialog('auth');
  dialog.showModal(); before.navigation.pushStep(dialog, { id: 'recovery', onBack() {} }); before.settle();
  const page = browser({ snapshot: before.snapshot() }); page.settle();
  assertAchievements(page); assert.equal(marker(page), undefined); assert.equal(page.index, 1);
  assert.equal(page.scope.scrollY, 420);
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('reload cleanup waits for router listeners when account startup is asynchronous', () => {
  const before = onAchievements(), dialog = new before.Dialog('auth');
  dialog.showModal(); before.settle();
  const page = browser({ snapshot: before.snapshot(), deferRouter: true });
  page.settle();
  assert.equal(page.index, 2, 'initialization must not traverse before a router can receive popstate');
  page.attachRouter(); page.settle();
  assertAchievements(page); assert.equal(marker(page), undefined); assert.equal(page.index, 1);
  const next = new page.Dialog('store'); next.showModal(); page.settle(); page.back();
  assert.equal(next.open, false); assertAchievements(page);
});

test('custom panels can participate in Back and contain native child dialogs', () => {
  const page = onAchievements(), panel = {}, child = new page.Dialog('chat-rules');
  let open = false;
  const popup = page.navigation.register({ id: 'chat', element: panel, isOpen: () => open,
    close() { open = false; popup.closed(); } });
  open = true; popup.opened(); child.showModal(); page.settle();
  page.back(); assert.equal(child.open, false); assert.equal(open, true);
  page.back(); assert.equal(open, false); assertAchievements(page);
  open = true; popup.opened(); page.settle(); open = false; popup.closed(); page.settle();
  page.back(); assert.deepEqual(page.router.getRoute(), { type: 'home' });
});

test('explicit Back and step-reset APIs do not leave extra entries', () => {
  const page = onAchievements(), dialog = new page.Dialog('redeem'); let backs = 0;
  dialog.showModal(); page.navigation.pushStep(dialog, { id: 'method', onBack: () => backs++ }); page.settle();
  assert.equal(page.navigation.backStep(dialog, 'method'), true); page.settle();
  assert.equal(backs, 1); assert.equal(dialog.open, true); assert.equal(marker(page).keys.length, 1);
  assert.equal(page.navigation.backStep(dialog, 'method'), false);
  page.navigation.pushStep(dialog, { id: 'method', onBack: () => backs++ }); page.settle();
  page.navigation.clearSteps(dialog); page.settle(); assert.equal(backs, 1);
  page.router.back(); page.settle(); assert.equal(dialog.open, false); assertAchievements(page);
});

test('desktop and the nonmodal navigation menu retain their existing history behavior', () => {
  const desktop = onAchievements({ desktop: true }), dialog = new desktop.Dialog('store');
  dialog.showModal(); desktop.settle(); assert.equal(desktop.entries.length, 2);
  assert.equal(desktop.navigation.pushStep(dialog, { id: 'step', onBack() {} }), false);
  dialog.close(); desktop.settle(); assert.equal(desktop.index, 1);
  const page = onAchievements(), menu = new page.Dialog('site-menu');
  menu.show(); page.settle(); assert.equal(page.entries.length, 2);
  menu.close(); page.settle(); assert.equal(page.index, 1);
});

test('failed opens, repeated opens, and delayed old close events cannot corrupt popup history', () => {
  const page = onAchievements(), dialog = new page.Dialog('store');
  dialog.failOpen = true;
  assert.throws(() => dialog.showModal()); page.settle(); assert.equal(marker(page), undefined);
  dialog.failOpen = false; dialog.showModal(); dialog.showModal(); page.settle();
  assert.equal(marker(page).keys.length, 1);
  dialog.close(); dialog.showModal(); page.settle();
  assert.equal(dialog.open, true); assert.equal(marker(page).keys.length, 1);
  page.back(); assert.equal(dialog.open, false); assertAchievements(page);
});
