import { CATEGORIES, getGamesForCategory } from './collections.js';
import { createShelfIcon } from './shelf-icons.js';

let initialized = false;

export function initSiteMenu() {
  if (initialized) return;
  const trigger = document.querySelector('#menu-toggle');
  const dialog = document.querySelector('#site-menu');
  const closeButton = document.querySelector('#menu-close');
  const navigation = document.querySelector('#menu-navigation');
  const buyButton = document.querySelector('#menu-buy');
  const categories = document.querySelector('#catalog-categories');
  const wallet = document.querySelector('#coin-wallet');
  const addButton = document.querySelector('#wallet-add');
  if (![trigger, dialog, closeButton, navigation, buyButton, categories, wallet, addButton].every(Boolean)) return;
  initialized = true;

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
    const label = document.createElement('span');
    label.textContent = category.title;
    button.append(createShelfIcon(category.id), label);
    navigation.append(button);
    items.set(category.id, button);
  }

  function syncMenu() {
    const selected = categories.querySelector('[data-category][aria-pressed="true"]')?.dataset.category || 'all';
    for (const [id, button] of items) {
      if (id === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const code = wallet.dataset.currency === 'SC' ? 'SC' : 'GC';
    dialog.dataset.currency = code;
  }

  const observer = new MutationObserver(() => { if (dialog.open) syncMenu(); });

  function openMenu() {
    if (pendingClose || dialog.open || document.body.dataset.view === 'game' || document.querySelector('dialog[open]')) return;
    syncMenu();
    afterClose = null;
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
    observer.observe(categories, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    observer.observe(wallet, { attributes: true, attributeFilter: ['data-currency'] });
  }

  function closeMenu(action = null) {
    if (!dialog.open) return;
    afterClose = action;
    pendingClose = true;
    dialog.close();
  }

  function chooseCategory(id) {
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
  window.addEventListener('hashchange', () => closeMenu());
}
