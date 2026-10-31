import { CATEGORIES, getGamesForCategory } from './collections.js';
import { createShelfIcon } from './shelf-icons.js';

let initialized = false;
let menuController = null;

export function initSiteMenu({ openCategory, openProviders, openSearch, openStore, openFeature, openHowToPlay, member } = {}) {
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
  const dailyButton = document.querySelector('#menu-daily-bonus');
  const dailyAmount = document.querySelector('#menu-daily-amount');
  const dailyBadge = document.querySelector('#menu-daily-badge');
  const tooltip = document.querySelector('#menu-tooltip');
  const bottomTrigger = document.querySelector('#mobile-nav-menu');
  const bottomNav = document.querySelector('#mobile-nav');
  if (![trigger, dialog, navigation, buyButton, categories, wallet,
    sidebar, sidebarHeader, sidebarContent, menuContent, shortcuts, mobileHeader].every(Boolean)) return;
  initialized = true;

  const triggerHome = trigger.parentElement;
  const triggerSibling = trigger.nextSibling;
  const menuBackground = new Map();
  const desktopMedia = window.matchMedia('(min-width: 45rem)');
  let desktop = false;
  let expanded = false;
  let afterClose = null;
  let pendingClose = false;
  let tooltipTarget = null;
  let menuOpener = trigger;
  const items = new Map();
  const featureItems = new Map();
  const disclosures = new Map();
  let selectedFeature = null;
  navigation.replaceChildren();
  const menuItems = [...CATEGORIES, { id: 'providers', title: 'Providers' }];
  for (const category of menuItems) {
    if (category.id !== 'providers' && getGamesForCategory(category.id).length === 0) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-menu__item';
    button.dataset.menuCategory = category.id;
    button.setAttribute('aria-label', category.title);
    button.dataset.tooltip = category.title;
    const label = document.createElement('span');
    label.className = 'site-menu__label';
    label.textContent = category.title;
    button.append(createShelfIcon(category.id), label);
    navigation.append(button);
    items.set(category.id, button);
  }

  // Separate destinations keep rewards and account tools out of the casino catalog.
  const featureGroups = [
    { label: 'Membership', items: [['vip-club', 'VIP Club'], ['rank-system', 'Rank System']] },
    { label: 'Free Money', items: [['free-money', 'Free Money']] },
    { label: 'Partners', disclosure: 'partners', items: [['partners', 'Partners'], ['invite-friends', 'Referral'], ['affiliate-program', 'Affiliate']] },
    { label: 'My account', items: [['profile', 'My Profile'], ['history', 'History'], ['favorites', 'Favorites'], ['notifications', 'Notifications']] },
    { label: 'Help and preferences', plain: true, items: [['support', 'Live Support'], ['blog', 'Blog'], ['settings', 'Settings'], ['how-to-play', 'How to Play']] },
  ];
  for (const group of featureGroups) {
    const section = document.createElement('nav');
    section.className = `site-menu__navigation site-menu__feature-group${group.plain ? ' site-menu__navigation--plain' : ''}`;
    section.setAttribute('aria-label', group.label);
    let list = section;
    for (const [id, title] of group.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'site-menu__item';
      button.dataset.menuFeature = id;
      button.dataset.tooltip = title;
      button.setAttribute('aria-label', title);
      if (id === 'how-to-play') {
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-controls', 'how-to-play-dialog');
      }
      const label = document.createElement('span');
      label.className = 'site-menu__label';
      label.textContent = title;
      button.append(createShelfIcon(id), label);
      list.append(button);
      featureItems.set(id, button);
      if (id === group.disclosure) {
        const chevron = createShelfIcon('chevron-down');
        chevron.setAttribute('class', 'site-menu__chevron');
        button.append(chevron);
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', `menu-${id}-items`);
        list = document.createElement('div');
        list.id = `menu-${id}-items`;
        list.className = 'site-menu__subitems';
        list.hidden = true;
        section.append(list);
        disclosures.set(id, { button, list });
      }
    }
    menuContent.append(section);
  }
  if (redeemButton) redeemButton.disabled = false;
  let dailyTimer;
  function syncDailyBonus() {
    if (!dailyButton || !dailyAmount || !dailyBadge || !member?.getDailyStatus) return;
    clearTimeout(dailyTimer);
    const now = new Date();
    const daily = member.getDailyStatus(now);
    const next = daily.available ? daily : member.getDailyStatus(new Date(daily.nextAt));
    const remaining = Math.max(0, new Date(daily.nextAt).getTime() - now.getTime());
    const badge = daily.available ? 'Ready' : remaining > 3_600_000
      ? `${Math.ceil(remaining / 3_600_000)}h` : `${Math.max(1, Math.ceil(remaining / 60_000))}m`;
    const amount = `${new Intl.NumberFormat('en-US').format(next.amount)} GC`;
    dailyAmount.textContent = amount;
    dailyBadge.textContent = badge;
    dailyButton.dataset.available = String(daily.available);
    dailyButton.setAttribute('aria-label', `Daily Bonus, ${amount}, ${daily.available ? 'ready to collect' : `available in ${badge}`}`);
    dailyButton.dataset.tooltip = `Daily Bonus · ${amount} · ${badge}`;
    if (!document.hidden) dailyTimer = setTimeout(syncDailyBonus,
      daily.available ? Math.max(1, remaining) : Math.min(60_000, remaining || 60_000));
  }
  member?.subscribe(syncDailyBonus);
  document.addEventListener('visibilitychange', syncDailyBonus);
  syncDailyBonus();

  function setDisclosure(id, open) {
    const { button, list } = disclosures.get(id);
    if (!open && list.contains(document.activeElement)) button.focus({ preventScroll: true });
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  function syncMenu() {
    const selected = categories.dataset.activeMenu
      || categories.querySelector('[data-category][aria-pressed="true"]')?.dataset.category || 'lobby';
    for (const [id, button] of items) {
      if (id === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const [id, button] of featureItems) {
      if (id === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const [id, { button, list }] of disclosures) {
      const activeChild = list.contains(featureItems.get(selected));
      button.dataset.childActive = String(activeChild);
      if (selected !== selectedFeature && activeChild && (!desktop || expanded)) setDisclosure(id, true);
    }
    selectedFeature = selected;
    if (dailyButton) {
      if (selected === 'daily-bonus') dailyButton.setAttribute('aria-current', 'page');
      else dailyButton.removeAttribute('aria-current');
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
    hideTooltip();
    expanded = value;
    document.body.dataset.sidebar = value ? 'expanded' : 'collapsed';
    sidebar.dataset.expanded = String(value);
    trigger.setAttribute('aria-expanded', String(value));
    trigger.setAttribute('aria-label', value ? 'Collapse sidebar' : 'Expand sidebar');
    for (const [id, { list }] of disclosures) {
      if (!value) setDisclosure(id, false);
      else if (list.contains(featureItems.get(categories.dataset.activeMenu))) setDisclosure(id, true);
    }
  }

  function restoreMenuFocus(preferred = null) {
    const candidates = [preferred, trigger, bottomTrigger, document.querySelector('.site-logo')];
    candidates.find(node => node?.getClientRects().length)?.focus({ preventScroll: true });
  }

  function setMenuBackgroundInert(active) {
    if (active) {
      for (const element of document.body.children) {
        if (element === dialog || element === bottomNav || menuBackground.has(element)) continue;
        menuBackground.set(element, element.inert);
        element.inert = true;
      }
    } else {
      for (const [element, inert] of menuBackground) element.inert = inert;
      menuBackground.clear();
    }
  }

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
    desktop = desktopMedia.matches;
    sidebar.hidden = !desktop;
    if (desktop) {
      sidebarHeader.append(trigger);
      sidebarHeader.append(shortcuts);
      sidebarContent.append(menuContent);
      trigger.removeAttribute('aria-haspopup');
      trigger.setAttribute('aria-controls', 'site-sidebar');
      setExpanded(false);
      observeState();
      syncMenu();
    } else {
      triggerHome.insertBefore(trigger, triggerSibling);
      mobileHeader.append(shortcuts);
      dialog.append(menuContent);
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', 'site-menu');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', 'Open menu');
      delete document.body.dataset.sidebar;
      sidebar.dataset.expanded = 'false';
      observer.disconnect();
    }
    if (restoreFocus) restoreMenuFocus();
  }

  function openMenu({ returnFocusTo = trigger } = {}) {
    if (pendingClose || document.querySelector('dialog[open]')) return;
    if (desktop) {
      setExpanded(!expanded);
      return;
    }
    menuOpener = returnFocusTo;
    syncDailyBonus();
    syncMenu();
    afterClose = null;
    // The mobile bar remains in the shell. A non-modal dialog lets that same
    // bar stay interactive while the covered page is inert.
    dialog.show();
    setMenuBackgroundInert(true);
    trigger.setAttribute('aria-expanded', 'true');
    buyButton.focus({ preventScroll: true });
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
    if (id === 'providers') closeMenu(() => openProviders?.());
    else closeMenu(() => openCategory?.(id));
  }

  trigger.addEventListener('click', openMenu);
  buyButton.addEventListener('click', () => closeMenu(() => openStore?.()));
  redeemButton?.addEventListener('click', () => closeMenu(() => openFeature?.('redeem')));
  searchButton?.addEventListener('click', () => {
    if (openSearch) closeMenu(() => openSearch({ returnFocusTo: searchButton }));
  });
  dailyButton?.addEventListener('click', () => closeMenu(() => openFeature?.('daily-bonus')));
  menuContent.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const item = event.target.closest('[data-menu-feature]');
    if (item && menuContent.contains(item) && featureItems.has(item.dataset.menuFeature)) {
      if (disclosures.has(item.dataset.menuFeature)) {
        hideTooltip();
        if (desktop && !expanded) {
          setExpanded(true);
          setDisclosure(item.dataset.menuFeature, true);
        } else setDisclosure(item.dataset.menuFeature, disclosures.get(item.dataset.menuFeature).list.hidden);
      } else if (item.dataset.menuFeature === 'how-to-play') {
        const returnFocusTo = desktop ? item : menuOpener;
        closeMenu(() => openHowToPlay?.({ returnFocusTo }));
      } else closeMenu(() => openFeature?.(item.dataset.menuFeature));
    }
  });
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
    setMenuBackgroundInert(false);
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
    const controls = [dialog, bottomNav].filter(Boolean).flatMap(root =>
      [...root.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')])
      .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
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
