import { createUiIcon } from './ui-icons.js';
import { initPopoverMotion } from './popover-motion.js';

// Keep the existing select as the value source for catalog filters and routing.
export function enhanceCatalogSelect(select, { commitReselection = false } = {}) {
  const wrapper = select.closest('.catalog-page-filter');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = `${select.id}-trigger`;
  trigger.className = 'catalog-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  value.id = `${select.id}-value`;
  value.className = 'catalog-select-value';
  trigger.setAttribute('aria-labelledby', `${select.id}-label ${value.id}`);
  trigger.append(value, createUiIcon('down', 'catalog-select-chevron'));
  const menu = document.createElement('div');
  menu.id = `${select.id}-menu`;
  menu.className = 'catalog-select-menu';
  menu.setAttribute('popover', 'auto');
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', select.getAttribute('aria-label'));
  trigger.setAttribute('aria-controls', menu.id);
  // Associate the invoker so tapping it is not treated as an outside dismissal.
  trigger.setAttribute('popovertarget', menu.id);
  select.hidden = true;
  wrapper.append(trigger, menu);
  let choices = [];
  let activeIndex = 0;
  let typed = '';
  let typedAt = 0;
  const isOpen = () => menu.matches(':popover-open');
  const motion = initPopoverMotion(menu, { trigger, document, window, bindTrigger: false });

  function close() {
    if (isOpen()) menu.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    typed = '';
  }

  function activate(index, reveal = true) {
    activeIndex = Math.max(0, Math.min(choices.length - 1, index));
    for (const [i, element] of [...menu.children].entries()) element.classList.toggle('is-active', i === activeIndex);
    const active = menu.children[activeIndex];
    if (!active || !isOpen()) return;
    trigger.setAttribute('aria-activedescendant', active.id);
    if (reveal) active.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  function refresh() {
    choices = [...select.options].filter(option => !option.disabled);
    value.textContent = select.selectedOptions[0]?.textContent || choices[0]?.textContent || '';
    trigger.disabled = select.disabled || !choices.length;
    activeIndex = Math.max(0, choices.findIndex(option => option.value === select.value));
    menu.replaceChildren(...choices.map((option, index) => {
      const item = document.createElement('div');
      item.id = `${select.id}-option-${index}`;
      item.className = 'catalog-select-option';
      item.dataset.optionIndex = String(index);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === select.value));
      const label = document.createElement('span');
      label.textContent = option.textContent;
      item.append(label, createUiIcon('check', 'catalog-select-check'));
      return item;
    }));
  }

  function position() {
    if (!isOpen()) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft || 0) + 12;
    const rightEdge = (viewport?.offsetLeft || 0) + (viewport?.width || innerWidth) - 12;
    const header = document.querySelector('.top-bar')?.getBoundingClientRect();
    const topEdge = Math.max((viewport?.offsetTop || 0) + 12, (header?.bottom || 0) + 8);
    const navigation = document.querySelector('#mobile-nav')?.getBoundingClientRect();
    const bottomEdge = Math.min((viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 12,
      navigation?.height ? navigation.top - 8 : Infinity);
    if (!rect.width || rect.bottom <= topEdge || rect.top >= bottomEdge) { close(); return; }
    const width = Math.min(Math.max(rect.width, 208), rightEdge - leftEdge);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(leftEdge, Math.min(rect.left, rightEdge - width))}px`;
    const desired = Math.min(368, menu.scrollHeight + 2);
    const below = bottomEdge - rect.bottom - 8;
    const above = rect.top - topEdge - 8;
    const useBelow = below >= Math.min(desired, 200) || below >= above;
    const height = Math.min(desired, useBelow ? below : above);
    if (height < 44) { close(); return; }
    menu.style.maxHeight = `${height}px`;
    menu.style.top = `${useBelow ? rect.bottom + 8 : rect.top - height - 8}px`;
  }

  function open() {
    refresh();
    if (trigger.disabled) return;
    menu.showPopover();
    trigger.setAttribute('aria-expanded', 'true');
    position();
    activate(activeIndex);
  }

  function choose(index) {
    const option = choices[index];
    if (!option) return;
    const changed = select.value !== option.value;
    select.value = option.value;
    close();
    refresh();
    trigger.focus({ preventScroll: true });
    if (changed || commitReselection) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  trigger.addEventListener('click', event => {
    // The custom toggle also refreshes options and positions the list; avoid a
    // second native toggle after this handler.
    event.preventDefault();
    if (isOpen() && !motion.isClosing()) motion.dismiss({ restoreFocus: true });
    else open();
  });
  trigger.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      motion.dismiss({ restoreFocus: true });
      return;
    }
    if (event.key === 'Tab') { motion.dismiss(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen()) choose(activeIndex);
      else open();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const wasOpen = isOpen();
      if (!wasOpen) open();
      if (event.key === 'Home') activate(0);
      else if (event.key === 'End') activate(choices.length - 1);
      else if (wasOpen) activate(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      if (!isOpen()) open();
      const now = Date.now();
      typed = now - typedAt > 700 ? event.key : typed + event.key;
      typedAt = now;
      const prefix = [...typed].every(letter => letter === typed[0]) ? typed[0] : typed;
      const start = prefix.length === 1 ? activeIndex + 1 : activeIndex;
      for (let offset = 0; offset < choices.length; offset++) {
        const index = (start + offset) % choices.length;
        if (choices[index].textContent.toLowerCase().startsWith(prefix.toLowerCase())) { activate(index); break; }
      }
    }
  });
  menu.addEventListener('click', event => {
    const option = event.target.closest('[data-option-index]');
    if (option && menu.contains(option)) choose(Number(option.dataset.optionIndex));
  });
  menu.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const option = event.target.closest('[data-option-index]');
    if (option) activate(Number(option.dataset.optionIndex), false);
  });
  menu.addEventListener('mousedown', event => event.preventDefault());
  menu.addEventListener('toggle', () => {
    if (!isOpen()) close();
  });
  window.addEventListener('scroll', event => { if (!menu.contains(event.target)) position(); }, true);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  select.addEventListener('change', refresh);
  refresh();
  return { refresh, close };
}
