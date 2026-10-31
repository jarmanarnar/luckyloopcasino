let initialized = false;

export function initSiteSearch({ searchGames, returnToLobby = action => action?.() } = {}) {
  if (initialized) return;
  const dialog = document.querySelector('#site-search');
  const input = document.querySelector('#site-search-input');
  const form = document.querySelector('#site-search-form');
  const close = document.querySelector('#site-search-close');
  if (!dialog || !input || !form || !close || !searchGames) return;
  initialized = true;
  let submitted = false;
  let searchOpener = null;

  function openSearch({ returnFocusTo = null } = {}) {
    if (document.querySelector('dialog[open]')) return;
    submitted = false;
    searchOpener = returnFocusTo;
    dialog.showModal();
    input.focus({ preventScroll: true });
    input.select();
  }

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    submitted = true;
    dialog.close();
    returnToLobby(() => searchGames(query));
  });
  dialog.addEventListener('close', () => {
    if (submitted) return;
    const trigger = document.querySelector('#menu-search');
    const focusTarget = [searchOpener, trigger, document.querySelector('#menu-toggle'),
      document.querySelector('#mobile-nav-search'), document.querySelector('#mobile-nav-menu'),
      document.querySelector('.site-logo')]
      .find(node => node?.getClientRects().length);
    focusTarget?.focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', () => {
    if (dialog.open) dialog.close();
  });
  return { openSearch };
}
