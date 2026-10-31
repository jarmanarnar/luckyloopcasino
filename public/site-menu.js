import { CATEGORIES, getGamesForCategory } from './collections.js';
import { createShelfIcon } from './shelf-icons.js';

let initialized = false;

export function initSiteMenu({ openProviders } = {}) {
  if (initialized) return;
  const trigger = document.querySelector('#menu-toggle');
  const dialog = document.querySelector('#site-menu');
  const closeButton = document.querySelector('#menu-close');
  const navigation = document.querySelector('#menu-navigation');
  const buyButton = document.querySelector('#menu-buy');
  const categories = document.querySelector('#catalog-categories');
  const wallet = document.querySelector('#coin-wallet');
  const addButton = document.querySelector('#wallet-add');
  const sidebar = document.querySelector('#site-sidebar');
  const sidebarHeader = document.querySelector('#sidebar-header');
  const sidebarContent = document.querySelector('#sidebar-content');
  const menuContent = document.querySelector('#menu-content');
  if (![trigger, dialog, closeButton, navigation, buyButton, categories, wallet, addButton,
    sidebar, sidebarHeader, sidebarContent, menuContent].every(Boolean)) return;
  initialized = true;

  const triggerHome = trigger.parentElement;
  const desktopMedia = window.matchMedia('(min-width: 64rem)');
  let desktop = false;
  let expanded = false;
  let afterClose = null;
  let pendingClose = false;
  const items = new Map();
  navigation.replaceChildren();
  const menuItems = [CATEGORIES[0], { id: 'providers', title: 'Providers' }, ...CATEGORIES.slice(1)];
  for (const category of menuItems) {
    if (category.id !== 'all' && category.id !== 'providers' && getGamesForCategory(category.id).length === 0) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-menu__item';
    button.dataset.menuCategory = category.id;
    button.setAttribute('aria-label', category.title);
    button.title = category.title;
    const label = document.createElement('span');
    label.className = 'site-menu__label';
    label.textContent = category.title;
    button.append(createShelfIcon(category.id), label);
    navigation.append(button);
    items.set(category.id, button);
  }

  function syncMenu() {
    const selected = categories.dataset.activeMenu
      || categories.querySelector('[data-category][aria-pressed="true"]')?.dataset.category || 'all';
    for (const [id, button] of items) {
      if (id === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const code = wallet.dataset.currency === 'SC' ? 'SC' : 'GC';
    dialog.dataset.currency = code;
    sidebar.dataset.currency = code;
  }

  const observer = new MutationObserver(() => { if (desktop || dialog.open) syncMenu(); });

  function observeState() {
    observer.disconnect();
    observer.observe(categories, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'data-active-menu'] });
    observer.observe(wallet, { attributes: true, attributeFilter: ['data-currency'] });
  }

  function setExpanded(value) {
    expanded = value;
    document.body.dataset.sidebar = value ? 'expanded' : 'collapsed';
    sidebar.dataset.expanded = String(value);
    trigger.setAttribute('aria-expanded', String(value));
    trigger.setAttribute('aria-label', value ? 'Collapse sidebar' : 'Expand sidebar');
  }

  function applyLayout() {
    const restoreFocus = trigger === document.activeElement || dialog.contains(document.activeElement)
      || sidebar.contains(document.activeElement);
    afterClose = null;
    if (dialog.open) {
      pendingClose = true;
      dialog.close();
    }
    desktop = desktopMedia.matches;
    sidebar.hidden = !desktop;
    if (desktop) {
      sidebarHeader.append(trigger);
      sidebarContent.append(menuContent);
      trigger.removeAttribute('aria-haspopup');
      trigger.setAttribute('aria-controls', 'site-sidebar');
      setExpanded(false);
      observeState();
      syncMenu();
    } else {
      triggerHome.append(trigger);
      dialog.append(menuContent);
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', 'site-menu');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', 'Open menu');
      delete document.body.dataset.sidebar;
      sidebar.dataset.expanded = 'false';
      observer.disconnect();
    }
    if (restoreFocus && document.body.dataset.view !== 'game') trigger.focus({ preventScroll: true });
  }

  function openMenu() {
    if (pendingClose || document.body.dataset.view === 'game' || document.querySelector('dialog[open]')) return;
    if (desktop) {
      setExpanded(!expanded);
      return;
    }
    syncMenu();
    afterClose = null;
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
    observeState();
  }

  function closeMenu(action = null) {
    if (desktop) {
      if (action) action();
      return;
    }
    if (!dialog.open) return;
    afterClose = action;
    pendingClose = true;
    dialog.close();
  }

  function chooseCategory(id) {
    if (id === 'providers') {
      if (openProviders) closeMenu(() => openProviders({ focusResults: true }));
      return;
    }
    const target = categories.querySelector(`[data-category="${id}"]`);
    if (!target) return;
    closeMenu(() => {
      target.click();
      target.focus({ preventScroll: true });
    });
  }

  trigger.addEventListener('click', openMenu);
  closeButton.addEventListener('click', () => closeMenu());
  buyButton.addEventListener('click', () => closeMenu(() => addButton.click()));
  navigation.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const item = event.target.closest('[data-menu-category]');
    if (item && navigation.contains(item) && items.has(item.dataset.menuCategory)) chooseCategory(item.dataset.menuCategory);
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeMenu();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMenu();
  });
  dialog.addEventListener('close', () => {
    pendingClose = false;
    if (desktop) {
      afterClose = null;
      return;
    }
    observer.disconnect();
    trigger.setAttribute('aria-expanded', 'false');
    const action = afterClose;
    afterClose = null;
    if (action) {
      action();
      return;
    }
    const focusTarget = trigger.getClientRects().length ? trigger : document.querySelector('#back-to-lobby');
    focusTarget?.focus({ preventScroll: true });
  });
  sidebar.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    setExpanded(false);
    trigger.focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', () => closeMenu());
  desktopMedia.addEventListener('change', applyLayout);
  applyLayout();
}
