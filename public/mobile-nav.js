let initialized = false;

export function initMobileNav({ openMenu, closeMenu, openHome, openStore, openFeature } = {}) {
  if (initialized) return;
  const nav = document.querySelector('#mobile-nav');
  const categories = document.querySelector('#catalog-categories');
  const dialogs = {
    menu: document.querySelector('#site-menu'),
    store: document.querySelector('#store-dialog'),
  };
  const buttons = new Map(['lobby', 'store', 'redeem', 'menu']
    .map(action => [action, document.querySelector(`#mobile-nav-${action}`)]));
  if (![nav, categories, ...Object.values(dialogs), ...buttons.values()].every(Boolean)) return;
  initialized = true;

  const desktopMedia = window.matchMedia('(width > 1024px)');
  let pendingDestination = null;

  // Restoring the Menu opener's focus must not look like a second selection
  // after touch dismissal. Keep the focus cue for actual keyboard navigation.
  nav.dataset.input = 'pointer';
  document.addEventListener('pointerdown', event => {
    nav.dataset.input = event.pointerType === 'mouse' ? 'mouse' : 'touch';
  }, { capture: true });
  document.addEventListener('keydown', event => {
    if (['Tab', 'Enter', ' ', 'Escape', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
      || event.key.startsWith('Arrow')) nav.dataset.input = 'keyboard';
  }, { capture: true });

  function sync() {
    const selected = pendingDestination ?? (dialogs.menu.open && !dialogs.menu.inert ? 'menu'
      : dialogs.store.open ? 'store'
      : document.body.dataset.view === 'game' || document.body.dataset.page === 'game-details' ? null
        : categories.dataset.activeMenu === 'redeem' ? 'redeem'
        : document.body.dataset.page === 'store' || categories.dataset.activeMenu === 'store' ? 'store'
        : document.body.dataset.page === 'home' ? 'lobby' : null);
    for (const [action, button] of buttons) {
      const active = action === selected;
      button.dataset.active = String(active);
      if (active && !['menu', 'store'].includes(action)) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      if (dialogs[action]) button.setAttribute('aria-expanded', String(dialogs[action].open));
    }
  }

  function performAction(action, button) {
    switch (action) {
      case 'menu':
        openMenu?.({ returnFocusTo: button });
        break;
      case 'lobby':
        openHome?.();
        break;
      case 'store':
        openStore?.();
        break;
      case 'redeem':
        openFeature?.(action);
        break;
    }
    sync();
  }

  function activate(action, button) {
    if (desktopMedia.matches || pendingDestination || dialogs.menu.inert || document.querySelector('dialog[open]:not(#site-menu)')) return;
    if (dialogs.menu.open) {
      if (!closeMenu) return;
      if (action === 'menu') closeMenu();
      else {
        // Acknowledge the accepted destination now; opening the next surface
        // still waits until the drawer has released its focus and inert state.
        pendingDestination = action;
        closeMenu(() => {
          pendingDestination = null;
          performAction(action, button);
        });
      }
      sync();
      return;
    }
    performAction(action, button);
  }

  for (const [action, button] of buttons) button.addEventListener('click', () => activate(action, button));

  const observer = new MutationObserver(sync);
  observer.observe(categories, { attributes: true, attributeFilter: ['data-active-menu'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-page'] });
  for (const dialog of Object.values(dialogs)) {
    observer.observe(dialog, { attributes: true, attributeFilter: dialog === dialogs.menu ? ['open', 'inert'] : ['open'] });
  }
  const resetPendingDestination = () => { pendingDestination = null; sync(); };
  // A native dismissal or breakpoint change can cancel the queued handoff.
  dialogs.menu.addEventListener('close', resetPendingDestination);
  desktopMedia.addEventListener('change', resetPendingDestination);
  nav.hidden = false;
  document.body.dataset.mobileNav = 'true';
  sync();
}
