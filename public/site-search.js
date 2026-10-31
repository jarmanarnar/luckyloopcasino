let initialized = false;

export function initSiteSearch({ searchGames } = {}) {
  if (initialized) return;
  const dialog = document.querySelector('#site-search');
  const input = document.querySelector('#site-search-input');
  const form = document.querySelector('#site-search-form');
  const close = document.querySelector('#site-search-close');
  if (!dialog || !input || !form || !close || !searchGames) return;
  initialized = true;
  let submitted = false;

  function openSearch() {
    if (document.querySelector('dialog[open]') || document.body.dataset.view === 'game') return;
    submitted = false;
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
    searchGames(query);
  });
  dialog.addEventListener('close', () => {
    if (submitted) return;
    const back = document.querySelector('#back-to-lobby');
    if (document.body.dataset.view === 'game') {
      back?.focus({ preventScroll: true });
      return;
    }
    const trigger = document.querySelector('#menu-search');
    const fallback = document.querySelector('#menu-toggle');
    (trigger?.getClientRects().length ? trigger : fallback)?.focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', () => {
    if (dialog.open) dialog.close();
  });
  return { openSearch };
}
