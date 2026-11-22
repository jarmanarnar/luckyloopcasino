import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/mobile-nav.js', import.meta.url), 'utf8'))
  .replace('export function initMobileNav', 'function initMobileNav');
const actions = ['lobby', 'store', 'redeem', 'menu'];

function navPage({ desktop = false, missing = null, routeFromGame = false, animatedMenu = false } = {}) {
  const calls = [], observations = [], observers = [], closeActions = [], lobbyActions = [];
  class Node {
    constructor() { this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.open = false; this.hidden = false; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, details = {}) { for (const listener of this.listeners.get(type) || []) listener({ target: this, ...details }); }
    click() { this.emit('click'); }
  }
  const ids = ['mobile-nav', 'catalog-categories', 'site-menu', 'store-dialog', 'other-dialog',
    ...actions.map(action => `mobile-nav-${action}`)];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  const body = new Node();
  body.dataset.view = 'lobby';
  body.dataset.page = 'home';
  nodes['mobile-nav'].hidden = true;
  nodes['catalog-categories'].dataset.activeMenu = 'lobby';
  const all = new Node();
  all.addEventListener('click', () => {
    calls.push({ action: 'all' });
    nodes['catalog-categories'].dataset.activeMenu = 'lobby';
  });
  nodes['catalog-categories'].querySelector = selector => {
    assert.equal(selector, '[data-category="all"]');
    return all;
  };
  const dialogs = ['site-menu', 'store-dialog', 'other-dialog'];
  const document = Object.assign(new Node(), {
    body,
    querySelector(selector) {
      if (selector === 'dialog[open]:not(#site-menu)') return dialogs.filter(id => id !== 'site-menu' && id !== missing).map(id => nodes[id]).find(node => node.open) || null;
      const id = selector.slice(1);
      return id === missing ? null : nodes[id] || null;
    },
  });
  const media = new Node();
  media.matches = desktop;
  const api = {
    openMenu(options) { calls.push({ action: 'menu', options }); nodes['site-menu'].open = true; },
    closeMenu(action) {
      calls.push({ action: 'menu:close' });
      if (animatedMenu) nodes['site-menu'].inert = true;
      else nodes['site-menu'].open = false;
      closeActions.push(() => {
        nodes['site-menu'].open = false;
        nodes['site-menu'].inert = false;
        action?.();
        nodes['site-menu'].emit('close');
      });
    },
    openHome() { calls.push({ action: 'home' }); nodes['catalog-categories'].dataset.activeMenu = 'lobby'; body.dataset.page = 'home'; body.dataset.view = 'lobby'; },
    openStore() { calls.push({ action: 'store' }); nodes['store-dialog'].open = true; },
    openFeature(pageId) { calls.push({ action: 'feature', pageId }); nodes['catalog-categories'].dataset.activeMenu = pageId; body.dataset.page = 'feature'; body.dataset.view = 'lobby'; },
  };
  if (routeFromGame) api.returnToLobby = action => {
    calls.push({ action: 'lobby:return' });
    lobbyActions.push(() => { body.dataset.view = 'lobby'; action?.(); });
  };
  const context = {
    document, api,
    window: { matchMedia(query) { assert.equal(query, '(width > 1024px)'); return media; } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { observations.push({ target, options }); }
    },
  };
  vm.runInNewContext(`${source}\ninitMobileNav(api);`, context);
  return { nodes, body, document, calls, media, observations, observers,
    initialize() { vm.runInNewContext('initMobileNav(api);', context); },
    flush() { for (const observer of observers) observer.callback(); },
    flushClose() { while (closeActions.length) closeActions.shift()(); },
    flushLobby() { while (lobbyActions.length) lobbyActions.shift()(); },
    button(action) { return nodes[`mobile-nav-${action}`]; },
  };
}

function active(page) {
  return actions.filter(action => page.button(action).dataset.active === 'true');
}

test('mobile actions reuse canonical destinations and preserve the originating dialog button', () => {
  const page = navPage();
  assert.equal(page.nodes['mobile-nav'].hidden, false);
  assert.equal(page.body.dataset.mobileNav, 'true');
  assert.deepEqual(active(page), ['lobby']);

  page.document.emit('pointerdown', { pointerType: 'touch' });
  page.button('menu').click();
  assert.equal(page.calls.at(-1).action, 'menu');
  assert.equal(page.calls.at(-1).options.returnFocusTo, page.button('menu'));
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(active(page), ['menu']);
  page.button('menu').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.deepEqual(page.calls.map(call => call.action), ['menu', 'menu:close']);
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(active(page), ['lobby']);
  assert.equal(page.nodes['mobile-nav'].dataset.input, 'touch', 'restored focus cannot enable the keyboard highlight after a tap');
  page.document.emit('keydown', { key: 'Shift' });
  assert.equal(page.nodes['mobile-nav'].dataset.input, 'touch');
  page.document.emit('keydown', { key: 'Tab' });
  assert.equal(page.nodes['mobile-nav'].dataset.input, 'keyboard', 'keyboard navigation retains its focus cue');
  assert.deepEqual(active(page), ['lobby'], 'focus modality never changes the selected destination');
  page.document.emit('pointerdown', { pointerType: 'mouse' });
  assert.equal(page.nodes['mobile-nav'].dataset.input, 'mouse');
  page.document.emit('pointerdown', { pointerType: 'touch' });
  assert.equal(page.nodes['mobile-nav'].dataset.input, 'touch', 'touch resets keyboard and mouse feedback on hybrid devices');

  page.button('lobby').click();
  assert.equal(page.calls.at(-1).action, 'home');
  assert.equal(page.button('lobby').getAttribute('aria-current'), 'page');

  page.button('store').click();
  assert.equal(page.calls.at(-1).action, 'store');
  assert.deepEqual(active(page), ['store']);
  assert.equal(page.button('store').getAttribute('aria-current'), null);
  assert.equal(page.button('store').getAttribute('aria-expanded'), 'true');
  assert.equal(page.body.dataset.page, 'home', 'opening Store preserves the current page');
  page.nodes['store-dialog'].open = false;
  page.flush();
  assert.deepEqual(active(page), ['lobby']);

  page.button('redeem').click();
  assert.deepEqual(page.calls.at(-1), { action: 'feature', pageId: 'redeem' });
  assert.deepEqual(active(page), ['redeem']);
  assert.equal(page.button('redeem').getAttribute('aria-current'), 'page');
  assert.equal(page.button('redeem').getAttribute('aria-expanded'), null);
  assert.equal(page.body.dataset.page, 'feature');

});

test('menu destinations select immediately while their surfaces wait for the animated close handoff', () => {
  const expected = { lobby: 'home', store: 'store', redeem: 'feature' };
  for (const action of Object.keys(expected)) {
    const page = navPage({ animatedMenu: true });
    page.body.dataset.page = 'search';
    page.button('menu').click();
    page.button(action).click();
    assert.equal(page.nodes['site-menu'].open, true, 'the drawer is still animating');
    assert.deepEqual(active(page), [action], 'selection responds before the animation completes');
    page.flush();
    assert.deepEqual(active(page), [action], 'animation mutations cannot restore the Menu highlight');
    for (const other of actions) page.button(other).click();
    assert.deepEqual(page.calls.map(call => call.action), ['menu', 'menu:close'], action);
    assert.equal(page.nodes['other-dialog'].open, false);
    page.nodes['site-menu'].open = false;
    page.flush();
    for (const other of actions) page.button(other).click();
    assert.deepEqual(active(page), [action], 'pending selection survives the native close-event gap');
    assert.deepEqual(page.calls.map(call => call.action), ['menu', 'menu:close']);
    page.flushClose();
    assert.equal(page.calls.at(-1).action, expected[action]);
    assert.deepEqual(active(page), [action]);
    if (expected[action] === 'feature') assert.equal(page.calls.at(-1).pageId, action);
  }

  const dismissed = navPage({ animatedMenu: true });
  dismissed.button('menu').click();
  dismissed.button('menu').click();
  assert.equal(dismissed.nodes['site-menu'].open, true);
  assert.deepEqual(active(dismissed), ['lobby'], 'closing Menu immediately restores the underlying page');
  dismissed.flushClose();
  assert.deepEqual(active(dismissed), ['lobby']);

  for (const cancellation of ['close', 'breakpoint']) {
    const page = navPage({ animatedMenu: true });
    page.body.dataset.page = 'search';
    page.button('menu').click();
    page.button('lobby').click();
    page.nodes['site-menu'].open = false;
    page.nodes['site-menu'].inert = false;
    if (cancellation === 'close') page.nodes['site-menu'].emit('close');
    else { page.media.matches = true; page.media.emit('change'); }
    assert.deepEqual(active(page), [], 'cancelled handoffs never leave a stale destination selected');
  }
});

test('desktop and other open dialogs prevent hidden or overlapping actions', () => {
  for (const mode of ['desktop', 'other-dialog', 'store-dialog']) {
    const page = navPage({ desktop: mode === 'desktop' });
    if (page.nodes[mode]) page.nodes[mode].open = true;
    for (const action of actions) page.button(action).click();
    assert.equal(page.calls.length, 0, mode);
  }
  for (const otherDialog of ['other-dialog']) {
    const page = navPage();
    page.nodes['site-menu'].open = true;
    page.nodes[otherDialog].open = true;
    for (const action of actions) page.button(action).click();
    assert.equal(page.calls.length, 0, `menu plus ${otherDialog}`);
  }
  const page = navPage({ desktop: true });
  page.media.matches = false;
  page.media.emit('change');
  page.button('redeem').click();
  assert.equal(page.calls.at(-1).action, 'feature', 'mobile actions resume after the breakpoint changes');
});

test('overlays preserve the current game while page destinations use their router entry point', () => {
  for (const action of ['menu', 'store']) {
    const page = navPage({ routeFromGame: true });
    page.body.dataset.view = 'game';
    page.button(action).click();
    assert.equal(page.calls.at(-1).action, action);
    assert.equal(page.calls.some(call => call.action === 'lobby:return'), false);
    assert.equal(page.body.dataset.view, 'game');
    assert.deepEqual(active(page), [action]);
    assert.equal(page.button(action).getAttribute('aria-current'), null);
  }
  for (const [action, destination] of [['lobby', 'home'], ['redeem', 'feature']]) {
    const page = navPage({ routeFromGame: true });
    page.body.dataset.view = 'game';
    page.button(action).click();
    assert.equal(page.calls.some(call => call.action === 'lobby:return'), false);
    assert.equal(page.body.dataset.view, 'lobby');
    assert.equal(page.calls.at(-1).action, destination);
    if (destination === 'feature') assert.equal(page.calls.at(-1).pageId, action);
  }
});

test('game details and active games clear every bottom destination even when the previous page has its own selection', () => {
  for (const gamePage of ['game-details', 'game']) {
    // Store and Redeem are the two prior destinations with their own selection.
    // Neutral game pages are also covered by the Menu-over-game scenario below.
    for (const previous of ['store', 'redeem']) {
      const page = navPage();
      page.nodes['catalog-categories'].dataset.activeMenu = previous;
      page.body.dataset.page = ['redeem', 'profile', 'achievements'].includes(previous) ? 'feature' : previous;
      page.flush();
      assert.deepEqual(active(page), ['store', 'redeem'].includes(previous) ? [previous] : []);

      if (gamePage === 'game-details') page.body.dataset.page = 'game-details';
      else page.body.dataset.view = 'game';
      page.flush();
      assert.deepEqual(active(page), [], `${gamePage} from ${previous}`);
      for (const action of actions) {
        assert.equal(page.button(action).getAttribute('aria-current'), null, `${action} cannot claim to be the game page`);
      }
    }
  }
});

test('Menu opens over either game page and closing it restores no selection until Lobby is explicitly opened', () => {
  for (const gamePage of ['game-details', 'game']) {
    const page = navPage();
    page.body.dataset.page = 'game-details';
    page.body.dataset.view = gamePage === 'game' ? 'game' : 'lobby';
    page.flush();
    assert.deepEqual(active(page), []);

    page.button('menu').click();
    assert.deepEqual(active(page), ['menu']);
    assert.equal(page.button('menu').getAttribute('aria-expanded'), 'true');
    assert.equal(page.button('lobby').getAttribute('aria-current'), null);
    page.button('menu').click();
    assert.deepEqual(active(page), []);
    assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
    for (const action of actions) assert.equal(page.button(action).getAttribute('aria-current'), null);

    page.button('lobby').click();
    assert.equal(page.calls.at(-1).action, 'home');
    assert.deepEqual(active(page), ['lobby']);
    assert.equal(page.button('lobby').getAttribute('aria-current'), 'page');
    assert.equal(page.body.dataset.page, 'home');
    assert.equal(page.body.dataset.view, 'lobby');
  }
});

test('Store popup selects Store, blocks actions, and restores the underlying destination on dismissal', () => {
  for (const [destination, pageId, selection] of [['providers', 'providers', null], ['redeem', 'feature', 'redeem']]) {
    const page = navPage();
    page.body.dataset.page = pageId;
    page.nodes['catalog-categories'].dataset.activeMenu = destination;
    page.nodes['store-dialog'].open = true;
    page.flush();
    assert.deepEqual(active(page), ['store']);
    assert.equal(page.button('store').getAttribute('aria-current'), null);
    assert.equal(page.button('store').getAttribute('aria-expanded'), 'true');
    for (const action of actions) page.button(action).click();
    assert.equal(page.calls.length, 0);
    assert.equal(page.body.dataset.page, pageId);
    page.nodes['store-dialog'].open = false;
    page.flush();
    assert.deepEqual(active(page), selection ? [selection] : []);
    assert.equal(page.button('store').getAttribute('aria-expanded'), 'false');
    page.button('lobby').click();
    assert.equal(page.calls.at(-1).action, 'home');
    assert.deepEqual(active(page), ['lobby']);
  }
});

test('member feature pages select Menu only while its drawer is open', () => {
  const page = navPage();
  page.body.dataset.page = 'feature';
  page.nodes['catalog-categories'].dataset.activeMenu = 'settings';
  page.flush();
  assert.deepEqual(active(page), []);
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
  assert.equal(page.button('menu').getAttribute('aria-current'), null, 'Menu remains a dialog action, not a page link');
  assert.equal(page.button('lobby').getAttribute('aria-current'), null);

  page.button('menu').click();
  assert.equal(page.nodes['site-menu'].open, true);
  assert.deepEqual(active(page), ['menu']);
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'true');
  page.button('menu').click();
  assert.equal(page.nodes['site-menu'].open, false);
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(active(page), [], 'dismissing the drawer removes Menu selection on a feature page');
  page.button('lobby').click();
  assert.deepEqual(active(page), ['lobby']);
});

test('equivalent filtered Search and category pages share bottom navigation state', () => {
  const page = navPage();
  for (const destination of ['slots', 'popular', 'fruit']) {
    for (const routeType of ['category', 'search']) {
      page.body.dataset.page = routeType;
      page.nodes['catalog-categories'].dataset.activeMenu = destination;
      page.flush();
      assert.deepEqual(active(page), [], `${routeType} scoped to ${destination}`);
      assert.equal(page.button('lobby').getAttribute('aria-current'), null);
      page.button('menu').click();
      assert.deepEqual(active(page), ['menu']);
      page.button('menu').click();
      assert.deepEqual(active(page), [], 'closing Menu restores the effective catalog scope');
    }
  }
  page.body.dataset.page = 'search';
  page.nodes['catalog-categories'].dataset.activeMenu = 'search';
  page.flush();
  assert.deepEqual(active(page), [], 'global Search is not the Menu drawer');
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
});

test('Search, Menu dismissal and returning to Lobby never leave Menu selected alongside a page', () => {
  const page = navPage();
  page.button('menu').click();
  assert.deepEqual(active(page), ['menu']);
  assert.equal(page.button('lobby').getAttribute('aria-current'), null);

  // Search can be entered through the drawer or another navigation surface.
  page.nodes['site-menu'].open = false;
  page.body.dataset.page = 'search';
  page.nodes['catalog-categories'].dataset.activeMenu = 'search';
  page.flush();
  assert.deepEqual(active(page), []);
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');

  page.button('menu').click();
  assert.deepEqual(active(page), ['menu']);
  page.button('menu').click();
  assert.deepEqual(active(page), []);

  page.button('menu').click();
  page.button('lobby').click();
  assert.deepEqual(active(page), ['lobby'], 'Lobby responds immediately while the drawer closes');
  page.flushClose();
  assert.deepEqual(active(page), ['lobby']);
  assert.equal(page.button('lobby').getAttribute('aria-current'), 'page');
  assert.equal(page.button('menu').dataset.active, 'false');
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
  assert.equal(page.button('menu').getAttribute('aria-current'), null);

  page.button('menu').click();
  assert.deepEqual(active(page), ['menu'], 'an open Menu temporarily replaces Lobby selection');
  page.button('menu').click();
  assert.deepEqual(active(page), ['lobby']);
});

test('state follows navigation from other surfaces and distinguishes destinations from dialog actions', () => {
  const page = navPage();
  page.body.dataset.page = 'category';
  page.nodes['catalog-categories'].dataset.activeMenu = 'new-releases';
  page.flush();
  assert.deepEqual(active(page), []);
  assert.equal(page.button('lobby').getAttribute('aria-current'), null);
  page.button('menu').click();
  page.button('menu').click();
  assert.deepEqual(active(page), [], 'closing Menu must not select Lobby over a category');
  page.button('store').click();
  page.nodes['store-dialog'].open = false;
  page.flush();
  assert.deepEqual(active(page), [], 'closing Store must not select Lobby over a category');
  for (const destination of ['provider', 'favorites', 'recent-games']) {
    page.body.dataset.page = destination;
    page.nodes['catalog-categories'].dataset.activeMenu = 'lobby';
    page.flush();
    assert.deepEqual(active(page), [], 'only the actual home page selects Lobby');
  }
  for (const destination of ['providers', 'search']) {
    page.nodes['catalog-categories'].dataset.activeMenu = destination;
    page.body.dataset.page = destination;
    page.flush();
    assert.deepEqual(active(page), []);
    assert.equal(page.button('menu').getAttribute('aria-current'), null);
    assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
  }

  page.nodes['catalog-categories'].dataset.activeMenu = 'store';
  page.body.dataset.page = 'store';
  page.flush();
  assert.deepEqual(active(page), ['store']);
  assert.equal(page.button('store').getAttribute('aria-current'), null);
  assert.equal(page.button('store').getAttribute('aria-expanded'), 'false');

  for (const destination of ['redeem']) {
    page.nodes['catalog-categories'].dataset.activeMenu = destination;
    page.body.dataset.page = 'feature';
    page.flush();
    assert.deepEqual(active(page), [destination]);
    assert.equal(page.button(destination).getAttribute('aria-current'), 'page');
    assert.equal(page.button(destination).getAttribute('aria-expanded'), null);
    assert.equal(page.button('menu').getAttribute('aria-current'), null);
    assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
  }
  page.nodes['catalog-categories'].dataset.activeMenu = 'profile';
  page.flush();
  assert.deepEqual(active(page), []);
  page.nodes['catalog-categories'].dataset.activeMenu = 'achievements';
  page.flush();
  assert.deepEqual(active(page), []);
  page.body.dataset.page = 'home';
  page.flush();
  assert.deepEqual(active(page), ['lobby'], 'a stale achievements category alone does not claim the current page');
});

test('header chat leaves the bottom destination intact while dialogs still take precedence', () => {
  const page = navPage();
  page.nodes['catalog-categories'].dataset.activeMenu = 'redeem';
  page.body.dataset.page = 'feature';
  page.body.dataset.chat = 'open';
  page.flush();
  assert.deepEqual(active(page), ['redeem']);
  assert.equal(page.button('redeem').getAttribute('aria-current'), 'page');
  page.nodes['store-dialog'].open = true;
  page.flush();
  assert.deepEqual(active(page), ['store']);
  page.nodes['site-menu'].open = true;
  page.flush();
  assert.deepEqual(active(page), ['menu']);
  assert.equal(page.button('redeem').getAttribute('aria-current'), null);
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'true');
  page.nodes['site-menu'].open = false;
  page.flush();
  assert.deepEqual(active(page), ['store']);
  assert.equal(page.button('menu').getAttribute('aria-expanded'), 'false');
  assert.equal(page.button('menu').getAttribute('aria-current'), null);
  page.nodes['store-dialog'].open = false;
  page.flush();
  assert.deepEqual(active(page), ['redeem']);
  assert.equal(page.button('store').getAttribute('aria-expanded'), 'false');
  page.body.dataset.chat = 'closed';
  page.flush();
  assert.deepEqual(active(page), ['redeem']);
  assert.equal(page.button('redeem').getAttribute('aria-current'), 'page');
});

test('initialization is idempotent, requires a complete shell and watches only relevant attributes', () => {
  for (const missing of [...actions.map(action => `mobile-nav-${action}`), 'store-dialog']) {
    const incomplete = navPage({ missing });
    assert.equal(incomplete.nodes['mobile-nav'].hidden, true);
    assert.equal(incomplete.observers.length, 0);
  }

  const page = navPage();
  assert.equal(page.nodes['mobile-nav-achievements'], undefined);
  assert.equal(page.nodes['mobile-nav-chat'], undefined);
  assert.equal(page.nodes['mobile-nav'].hidden, false, 'the four navigation buttons initialize without a Chat button');
  page.initialize();
  assert.equal(page.observers.length, 1);
  assert.equal(page.observations.length, 4);
  for (const observation of page.observations) {
    assert.equal(observation.options.attributes, true);
    assert.equal(observation.options.childList, undefined);
    assert.equal(observation.options.subtree, undefined);
    const expected = observation.target === page.body ? ['data-view', 'data-page']
      : observation.target === page.nodes['catalog-categories'] ? ['data-active-menu']
        : observation.target === page.nodes['site-menu'] ? ['open', 'inert'] : ['open'];
    assert.deepEqual(Array.from(observation.options.attributeFilter), expected);
  }
  page.button('redeem').click();
  assert.equal(page.calls.length, 1, 'no duplicate click handlers are added');
});
