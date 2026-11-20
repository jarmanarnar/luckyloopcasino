import { GAME_FAMILIES, getGamesForCategory } from './collections.js';
import { createShelfIcon } from './shelf-icons.js';

let initialized = false;
let menuController = null;

export function initSiteMenu({ openHome, openRecentGames, openCategory, openFavorites, openProviders, openSearch, openStore, openFeature, openHowToPlay, openSpinWheel } = {}) {
  if (initialized) return menuController;
  const trigger = document.querySelector('#menu-toggle');
  const dialog = document.querySelector('#site-menu');
  const navigation = document.querySelector('#menu-navigation');
  const buyButton = document.querySelector('#menu-buy');
  const redeemButton = document.querySelector('#menu-redeem');
  const categories = document.querySelector('#catalog-categories');
  const wallet = document.querySelector('#coin-wallet');
  const sidebar = document.querySelector('#site-sidebar');
  const sidebarHeader = document.querySelector('#sidebar-header');
  const sidebarContent = document.querySelector('#sidebar-content');
  const menuContent = document.querySelector('#menu-content');
  const shortcuts = document.querySelector('#menu-shortcuts');
  const mobileHeader = document.querySelector('#menu-mobile-header');
  const searchButton = document.querySelector('#menu-search');
  const tooltip = document.querySelector('#menu-tooltip');
  const bottomTrigger = document.querySelector('#mobile-nav-menu');
  const bottomNav = document.querySelector('#mobile-nav');
  if (![trigger, dialog, navigation, buyButton, categories, wallet,
    sidebar, sidebarHeader, sidebarContent, menuContent, shortcuts, mobileHeader].every(Boolean)) return;
  initialized = true;

  const triggerHome = trigger.parentElement;
  const triggerSibling = trigger.nextSibling;
  const menuBackground = new Map();
  const desktopMedia = window.matchMedia('(width > 1024px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let desktop = false;
  let sidebarExitTimer = null;
  let finishSidebarExit = null;
  let expanded = false;
  const sidebarStorageKey = 'luckyloop-sidebar-expanded-v1';
  try { expanded = localStorage.getItem(sidebarStorageKey) === 'true'; } catch { /* Keep the default when storage is unavailable. */ }
  let afterClose = null;
  let pendingClose = false;
  let tooltipTarget = null;
  let menuOpener = trigger;
  const items = new Map();
  const featureItems = new Map();
  const disclosures = new Map();
  let selectedDestination = null;

  function menuButton(icon, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-menu__item';
    button.dataset.tooltip = title;
    button.setAttribute('aria-label', title);
    const label = document.createElement('span');
    label.className = 'site-menu__label';
    label.textContent = title;
    button.append(createShelfIcon(icon), label);
    return button;
  }

  function featureButton(id, title) {
    const button = menuButton(id, title);
    button.dataset.menuFeature = id;
    if (id === 'how-to-play') {
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'how-to-play-dialog');
    }
    featureItems.set(id, button);
    return button;
  }

  function createDisclosure(id, button) {
    const list = document.createElement('div');
    list.id = `menu-${id}-items`;
    list.className = 'site-menu__subitems';
    list.hidden = true;
    const chevron = createShelfIcon('chevron-down');
    chevron.setAttribute('class', 'site-menu__chevron');
    button.append(chevron);
    button.dataset.menuDisclosure = id;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', list.id);
    disclosures.set(id, { button, list });
    return list;
  }

  const casinoButton = menuButton('table', 'Game Types');
  const casinoList = createDisclosure('social-casino', casinoButton);
  navigation.replaceChildren();
  for (const [id, title] of [['popular', 'Top Picks'], ['new-releases', 'New Releases']]) {
    const button = menuButton(id, title);
    button.dataset.menuCategory = id;
    items.set(id, button);
    navigation.append(button);
  }
  navigation.append(casinoButton, casinoList);
  for (const category of GAME_FAMILIES) {
    if (getGamesForCategory(category.id).length === 0) continue;
    const button = menuButton(category.id, category.title);
    button.dataset.menuCategory = category.id;
    casinoList.append(button);
    items.set(category.id, button);
  }
  const providersButton = menuButton('providers', 'Providers');
  providersButton.dataset.menuCategory = 'providers';
  const providersNavigation = document.createElement('nav');
  providersNavigation.className = 'site-menu__navigation site-menu__feature-group';
  providersNavigation.setAttribute('aria-label', 'Game providers');
  providersNavigation.append(providersButton);
  items.set('providers', providersButton);

  const gamesNavigation = document.createElement('nav');
  gamesNavigation.className = 'site-menu__navigation site-menu__feature-group';
  gamesNavigation.setAttribute('aria-label', 'Games');
  for (const [id, title, icon] of [
    ['lobby', 'Lobby', 'lobby'],
    ['recent-games', 'Recent Games', 'history'], ['favorites', 'Favorite Games', 'favorites'],
  ]) {
    const button = menuButton(icon, title);
    button.dataset.menuCategory = id;
    items.set(id, button);
    gamesNavigation.append(button);
  }
  menuContent.append(gamesNavigation);

  // Separate destinations keep rewards and account tools out of the casino catalog.
  const featureGroups = [
    { label: 'Achievements', beforeCatalog: true, items: [['achievements', 'Achievements']] },
    { label: 'Help and preferences', plain: true, items: [['support', 'Live Support'], ['settings', 'Settings'], ['how-to-play', 'How to Play']] },
  ];
  for (const group of featureGroups) {
    const section = document.createElement('nav');
    section.className = `site-menu__navigation site-menu__feature-group${group.plain ? ' site-menu__navigation--plain' : ''}`;
    section.setAttribute('aria-label', group.label);
    for (const [id, title] of group.items) section.append(featureButton(id, title));
    menuContent.append(section);
    if (group.beforeCatalog) menuContent.append(navigation, providersNavigation);
  }
  if (redeemButton) redeemButton.disabled = false;

  function setDisclosure(id, open) {
    const { button, list } = disclosures.get(id);
    if (!open && list.contains(document.activeElement)) button.focus({ preventScroll: true });
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  function syncMenu() {
    const selected = categories.dataset.activeMenu
      ?? categories.querySelector('[data-category][aria-pressed="true"]')?.dataset.category ?? 'lobby';
    for (const [id, button] of items) {
      if (id === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const [id, button] of featureItems) {
      if (id === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const activeItem = items.get(selected) ?? featureItems.get(selected);
    for (const [id, { button, list }] of disclosures) {
      const activeChild = list.contains(activeItem);
      button.dataset.childActive = String(activeChild);
      if (selected !== selectedDestination && activeChild && (!desktop || expanded)) setDisclosure(id, true);
    }
    selectedDestination = selected;
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
    hideTooltip();
    expanded = value;
    try { localStorage.setItem(sidebarStorageKey, String(value)); } catch { /* The current layout still works without storage. */ }
    document.body.dataset.sidebar = value ? 'expanded' : 'collapsed';
    sidebar.dataset.expanded = String(value);
    trigger.setAttribute('aria-expanded', String(value));
    trigger.setAttribute('aria-label', value ? 'Collapse sidebar' : 'Expand sidebar');
    const selected = categories.dataset.activeMenu;
    const activeItem = items.get(selected) ?? featureItems.get(selected);
    for (const [id, { list }] of disclosures) {
      if (!value) setDisclosure(id, false);
      else if (list.contains(activeItem)) setDisclosure(id, true);
    }
  }

  function restoreMenuFocus(preferred = null) {
    const candidates = [preferred, trigger, bottomTrigger, document.querySelector('.site-logo')];
    candidates.find(node => node?.getClientRects().length && !(sidebar.inert && sidebar.contains(node)))?.focus({ preventScroll: true });
  }

  function isAvailableControl(element) {
    if (!element || element.disabled || element.tabIndex < 0 || !element.getClientRects().length) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.inert) return false;
    }
    return true;
  }

  function availableControls(root) {
    return root ? [...root.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
      .filter(isAvailableControl) : [];
  }

  function setMenuBackgroundInert(active) {
    if (active) {
      const guest = document.body.dataset.auth === 'guest';
      const blockBackground = element => {
        if (element === dialog || (!guest && element === bottomNav) || menuBackground.has(element)) return;
        // Guests close the drawer from the header hamburger; block its siblings,
        // not the ancestors that keep that one control interactive.
        if (guest && element.contains(trigger)) {
          if (element !== trigger) [...element.children].forEach(blockBackground);
          return;
        }
        menuBackground.set(element, element.inert);
        element.inert = true;
      };
      [...document.body.children].forEach(blockBackground);
    } else {
      for (const [element, inert] of menuBackground) element.inert = inert;
      menuBackground.clear();
    }
  }

  function moveMenuToMobile() {
    sidebar.hidden = true;
    triggerHome.insertBefore(trigger, triggerSibling);
    mobileHeader.append(shortcuts);
    dialog.append(menuContent);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'site-menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Open menu');
  }

  function cancelSidebarExit() {
    clearTimeout(sidebarExitTimer);
    sidebarExitTimer = null;
    finishSidebarExit = null;
  }

  sidebar.addEventListener('transitionend', event => {
    if (event.target === sidebar && event.propertyName === 'transform') finishSidebarExit?.();
  });

  function applyLayout() {
    hideTooltip();
    const restoreFocus = trigger === document.activeElement || (bottomTrigger && bottomTrigger === document.activeElement)
      || dialog.contains(document.activeElement)
      || sidebar.contains(document.activeElement);
    afterClose = null;
    setMenuBackgroundInert(false);
    if (dialog.open) {
      pendingClose = true;
      dialog.close();
    }
    const wasDesktop = desktop;
    cancelSidebarExit();
    desktop = desktopMedia.matches;
    if (desktop) {
      const wasHidden = sidebar.hidden;
      sidebar.hidden = false;
      sidebar.inert = false;
      sidebarHeader.append(trigger);
      sidebarHeader.append(shortcuts);
      sidebarContent.append(menuContent);
      trigger.removeAttribute('aria-haspopup');
      trigger.setAttribute('aria-controls', 'site-sidebar');
      sidebar.dataset.expanded = String(expanded);
      // Establish the off-screen starting point when returning from mobile.
      // A breakpoint reversal during an exit keeps its current transition instead.
      if (wasHidden) sidebar.getBoundingClientRect();
      setExpanded(expanded);
      observeState();
      syncMenu();
    } else {
      document.body.dataset.sidebar = 'hidden';
      sidebar.inert = true;
      observer.disconnect();
      if (wasDesktop && !reducedMotion.matches && document.body.dataset.reduceMotion !== 'true' && !document.hidden) {
        // Keep the real controls in place until the panel has slid out.
        // Opening the mobile drawer can finish this handoff immediately.
        const finish = () => {
          if (finishSidebarExit !== finish || desktop) return;
          cancelSidebarExit();
          moveMenuToMobile();
        };
        finishSidebarExit = finish;
        const duration = getComputedStyle(sidebar).getPropertyValue('--sidebar-duration').trim();
        const milliseconds = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
        sidebarExitTimer = setTimeout(finish, (Number.isFinite(milliseconds) ? milliseconds : 240) + 80);
      } else {
        moveMenuToMobile();
      }
    }
    if (restoreFocus) restoreMenuFocus(desktop ? trigger : bottomTrigger);
  }

  function openMenu({ returnFocusTo = trigger } = {}) {
    if (pendingClose || document.querySelector('dialog[open]')) return;
    if (desktop) {
      setExpanded(!expanded);
      return;
    }
    finishSidebarExit?.();
    menuOpener = returnFocusTo;
    syncMenu();
    afterClose = null;
    // A non-modal dialog keeps the member bar or guest hamburger interactive
    // while the rest of the covered page is inert.
    dialog.show();
    setMenuBackgroundInert(true);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-label', 'Close menu');
    availableControls(dialog)[0]?.focus({ preventScroll: true });
    observeState();
  }

  function closeMenu(action = null) {
    hideTooltip();
    if (desktop) {
      if (action) action();
      return;
    }
    if (!dialog.open) return;
    afterClose = action;
    pendingClose = true;
    setMenuBackgroundInert(false);
    dialog.close();
  }

  function chooseCategory(id) {
    if (id === 'lobby') closeMenu(() => openHome?.());
    else if (id === 'recent-games') closeMenu(() => openRecentGames?.());
    else if (id === 'favorites') closeMenu(() => openFavorites?.());
    else if (id === 'providers') closeMenu(() => openProviders?.());
    else closeMenu(() => openCategory?.(id));
  }

  trigger.addEventListener('click', () => {
    if (!desktop && dialog.open) closeMenu();
    else openMenu();
  });
  buyButton.addEventListener('click', () => closeMenu(() => openStore?.()));
  document.querySelector('#menu-spin-wheel')?.addEventListener('click', event => {
    const returnFocusTo = desktop ? event.currentTarget : menuOpener;
    closeMenu(() => openSpinWheel?.({ returnFocusTo }));
  });
  redeemButton?.addEventListener('click', () => closeMenu(() => openFeature?.('redeem')));
  searchButton?.addEventListener('click', () => {
    if (openSearch) closeMenu(() => openSearch({ returnFocusTo: searchButton }));
  });
  menuContent.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const disclosure = event.target.closest('[data-menu-disclosure]');
    if (disclosure && menuContent.contains(disclosure)) {
      const id = disclosure.dataset.menuDisclosure;
      const open = (desktop && !expanded) || disclosures.get(id).list.hidden;
      hideTooltip();
      if (desktop && !expanded) setExpanded(true);
      setDisclosure(id, open);
      return;
    }
    const item = event.target.closest('[data-menu-feature]');
    if (item && menuContent.contains(item) && featureItems.has(item.dataset.menuFeature)) {
      if (item.dataset.menuFeature === 'how-to-play') {
        const returnFocusTo = desktop ? item : menuOpener;
        closeMenu(() => openHowToPlay?.({ returnFocusTo }));
      } else closeMenu(() => openFeature?.(item.dataset.menuFeature));
    }
  });
  menuContent.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const item = event.target.closest('[data-menu-category]');
    if (item && items.get(item.dataset.menuCategory) === item) chooseCategory(item.dataset.menuCategory);
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
    setMenuBackgroundInert(false);
    if (desktop) {
      afterClose = null;
      return;
    }
    observer.disconnect();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Open menu');
    const action = afterClose;
    afterClose = null;
    if (action) {
      action();
      return;
    }
    restoreMenuFocus(menuOpener);
  });
  document.addEventListener('keydown', event => {
    if (desktop || !dialog.open || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    const shellControls = document.body.dataset.auth === 'guest'
      ? [trigger].filter(isAvailableControl) : availableControls(bottomNav);
    const controls = [...availableControls(dialog), ...shellControls];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement);
    const next = current < 0 ? event.shiftKey ? controls.length - 1 : 0
      : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault();
    controls[next].focus({ preventScroll: true });
  });
  sidebar.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    setExpanded(false);
    trigger.focus({ preventScroll: true });
  });
  function hideTooltip() {
    if (tooltip) tooltip.hidden = true;
    tooltipTarget?.removeAttribute('aria-describedby');
    tooltipTarget = null;
  }
  function showTooltip(event) {
    if (!tooltip || !desktop || expanded
      || document.querySelector('dialog[open]') || !(event.target instanceof Element)) return;
    const target = event.target.closest('[data-tooltip]');
    if (!target || !sidebar.contains(target)) return;
    hideTooltip();
    tooltipTarget = target;
    tooltip.textContent = target.dataset.tooltip;
    tooltip.hidden = false;
    target.setAttribute('aria-describedby', tooltip.id);
    const bounds = target.getBoundingClientRect();
    const height = tooltip.getBoundingClientRect().height;
    tooltip.style.left = `${sidebar.getBoundingClientRect().right + 8}px`;
    tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, bounds.top + (bounds.height - height) / 2))}px`;
  }
  sidebar.addEventListener('pointerover', showTooltip);
  sidebar.addEventListener('focusin', showTooltip);
  sidebar.addEventListener('pointerout', event => {
    if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideTooltip();
  });
  sidebar.addEventListener('focusout', hideTooltip);
  menuContent.addEventListener('scroll', hideTooltip, { passive: true });
  window.addEventListener('resize', hideTooltip, { passive: true });
  window.addEventListener('hashchange', () => closeMenu());
  desktopMedia.addEventListener('change', applyLayout);
  applyLayout();
  menuController = { openMenu, closeMenu };
  return menuController;
}
