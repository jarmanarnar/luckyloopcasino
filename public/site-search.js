// Search is a routed page. Keep this adapter as the shared shell entry point.
export function initSiteSearch({ openSearch } = {}) {
  return { openSearch: options => openSearch?.(options) };
}
