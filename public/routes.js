import { isFeaturePage } from './feature-pages.js';

// Hash routes work on both localhost and static GitHub Pages without rewrites.
const categoryIds = new Set(['all', 'popular', 'slots', 'new-releases', 'spooky', 'picks', 'tap', 'megaways', 'jackpot', 'fruit', 'adventure']);
const sortIds = new Set(['featured', 'az', 'za', 'newest']);
const validId = value => /^[a-z0-9][a-z0-9_-]*$/i.test(value || '');
const decode = value => { try { return decodeURIComponent(value); } catch { return ''; } };
const isLegacyAllGamesHash = hash => ['all-games', 'all'].includes(
  decode(String(hash).replace(/^#/, '').split('?')[0].replace(/^\//, '').replace(/\/$/, '')));

function detailsOrigin(value) {
  if (typeof value !== 'string' || !/^#(?:\/|$)/.test(value)) return '';
  const path = value.slice(1).split('?')[0];
  const first = decode(path.replace(/^\//, '').split('/')[0]);
  // A details page remembers its shell origin, never another details page.
  // Check before parsing so nested/encoded game paths cannot recurse.
  if (first === 'games') return '';
  const route = parseRoute(value);
  if (route.type === 'home' && value !== '#/' && value !== '#') return '';
  return formatRoute(route);
}

export function parseRoute(hash = '') {
  const source = String(hash).replace(/^#/, '');
  if (!source || source === '/') return { type: 'home' };
  if (source.startsWith('game=')) {
    const params = new URLSearchParams(source);
    const gameId = params.get('game');
    if (!validId(gameId)) return { type: 'home' };
    const from = params.get('from');
    return { type: 'game', gameId, ...(from && !from.includes('game=') ? { from } : {}) };
  }
  const [path, search = ''] = source.split('?');
  const segments = path.replace(/^\//, '').replace(/\/$/, '').split('/').map(decode);
  const params = new URLSearchParams(search);
  let route;
  if (segments[0] === 'games' && segments.length === 2 && validId(segments[1])) {
    const from = detailsOrigin(params.get('from'));
    return { type: 'game-details', gameId: segments[1], ...(from ? { from } : {}) };
  }
  if (segments.length === 1 && ['all-games', 'all'].includes(segments[0])) route = { type: 'search', query: '' };
  else if (segments.length === 1 && categoryIds.has(segments[0])) route = { type: 'category', categoryId: segments[0] };
  else if (segments.length === 1 && isFeaturePage(segments[0])) return { type: 'feature', pageId: segments[0] };
  else if (segments[0] === 'store' && segments.length === 1) return { type: 'store' };
  else if (segments[0] === 'providers' && segments.length === 1) route = { type: 'providers' };
  else if (segments[0] === 'providers' && segments.length === 2 && validId(segments[1])) route = { type: 'provider', providerId: segments[1] };
  else if (segments[0] === 'search' && segments.length === 1) route = { type: 'search', query: '' };
  else return { type: 'home' };
  const query = params.get('q');
  if (query) route.query = query;
  const providerId = params.get('provider');
  if (route.type !== 'provider' && validId(providerId)) route.providerId = providerId;
  const categoryId = params.get('category');
  if (route.type !== 'category' && categoryIds.has(categoryId)) route.categoryId = categoryId;
  const sort = params.get('sort');
  if (sortIds.has(sort)) route.sort = sort;
  return route;
}

export function formatRoute(route = { type: 'home' }) {
  if (route.type === 'home') return '#/';
  if (route.type === 'feature') return isFeaturePage(route.pageId) ? `#/${route.pageId}` : '#/';
  if (route.type === 'store') return '#/store';
  if (route.type === 'game-details') {
    if (!validId(route.gameId)) return '#/';
    const from = detailsOrigin(route.from);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    return `#/games/${encodeURIComponent(route.gameId)}${params.size ? `?${params}` : ''}`;
  }
  if (route.type === 'game') {
    const params = new URLSearchParams({ game: route.gameId });
    if (route.from && !route.from.includes('game=')) params.set('from', route.from);
    return `#${params}`;
  }
  const path = route.type === 'category' ? route.categoryId === 'all' ? 'search' : route.categoryId
    : route.type === 'provider' ? `providers/${encodeURIComponent(route.providerId)}`
      : route.type === 'providers' ? 'providers' : 'search';
  const params = new URLSearchParams();
  if (route.query) params.set('q', route.query);
  if (route.providerId && route.type !== 'provider') params.set('provider', route.providerId);
  if (route.categoryId && route.categoryId !== 'all' && route.type !== 'category') params.set('category', route.categoryId);
  if (route.sort && sortIds.has(route.sort)) params.set('sort', route.sort);
  return `#/${path}${params.size ? `?${params}` : ''}`;
}

export function initRouter({ window: scope = window } = {}) {
  const { history, location } = scope;
  const subscribers = new Set();
  const positions = new Map();
  let serial = 0;
  let currentRoute = parseRoute(location.hash);
  let currentUrl = location.href;
  let frame = 0;
  const position = () => ({ x: scope.scrollX || 0, y: scope.scrollY || 0 });
  let entry = history.state?.loopRoute || { id: ++serial, index: 0, scroll: position() };
  const scrollStorageKey = 'luckyloop-scroll-v1';
  let initialScroll = { ...(entry.scroll || position()) };
  try {
    const saved = JSON.parse(scope.sessionStorage?.getItem(scrollStorageKey) || 'null');
    if (saved?.url === currentUrl && saved.id === entry.id
      && Number.isFinite(saved.scroll?.x) && Number.isFinite(saved.scroll?.y)) initialScroll = saved.scroll;
  } catch { /* History remains the fallback when session storage is unavailable. */ }
  serial = Math.max(serial, entry.id);
  history.replaceState({ ...history.state, loopRoute: entry }, '',
    isLegacyAllGamesHash(location.hash) ? formatRoute(currentRoute) : location.href);
  currentUrl = location.href;
  history.scrollRestoration = 'manual';

  function savePosition() {
    const scroll = position();
    positions.set(entry.id, scroll);
    // Save while the page is active: browser reload can snapshot history state
    // before pagehide. This small, tab-local record belongs to one history entry.
    try { scope.sessionStorage?.setItem(scrollStorageKey, JSON.stringify({ url: location.href, id: entry.id, scroll })); }
    catch { /* Native navigation and in-memory scroll still work. */ }
  }
  scope.addEventListener('scroll', savePosition, { passive: true });
  scope.addEventListener('pagehide', () => {
    savePosition();
    history.replaceState({ ...history.state, loopRoute: { ...entry, scroll: position() } }, '', location.href);
  });
  function emit(previous, options) {
    scope.cancelAnimationFrame(frame);
    for (const listener of [...subscribers].sort((a, b) => a.priority - b.priority)) {
      listener.fn(currentRoute, { ...options, previous });
    }
    if (currentRoute.type === 'game') return;
    const target = options.restore ? positions.get(entry.id) || entry.scroll || { x: 0, y: 0 }
      : options.preserveScroll ? position() : { x: 0, y: 0 };
    frame = scope.requestAnimationFrame(() => {
      scope.scrollTo({ left: target.x, top: target.y, behavior: 'instant' });
    });
  }
  function navigate(route, options = {}) {
    savePosition();
    const hash = formatRoute(route);
    const next = parseRoute(hash);
    if (formatRoute(currentRoute) === hash && !options.force) return;
    const previous = currentRoute;
    const old = entry;
    entry = options.replace ? { ...entry } : { id: ++serial, index: old.index + 1, scroll: { x: 0, y: 0 } };
    history.replaceState({ ...history.state, loopRoute: { ...old, scroll: position() } }, '', location.href);
    history[options.replace ? 'replaceState' : 'pushState']({ ...history.state, loopRoute: entry }, '', hash);
    currentRoute = next;
    currentUrl = location.href;
    emit(previous, { ...options, source: 'navigate' });
  }
  function fromHistory() {
    if (currentUrl === location.href && history.state?.loopRoute?.id === entry.id) return;
    const previous = currentRoute;
    entry = history.state?.loopRoute || { id: ++serial, index: 0, scroll: { x: 0, y: 0 } };
    serial = Math.max(serial, entry.id);
    currentRoute = parseRoute(location.hash);
    history.replaceState({ ...history.state, loopRoute: entry }, '',
      isLegacyAllGamesHash(location.hash) ? formatRoute(currentRoute) : location.href);
    currentUrl = location.href;
    emit(previous, { restore: true, source: 'history', focus: false });
  }
  scope.addEventListener('popstate', fromHistory);
  scope.addEventListener('hashchange', fromHistory);
  return {
    getRoute: () => currentRoute,
    restoreInitialScroll() {
      if (currentRoute.type !== 'game') scope.scrollTo({ left: initialScroll.x, top: initialScroll.y, behavior: 'instant' });
    },
    navigate,
    subscribe(fn, { priority = 0 } = {}) {
      const listener = { fn, priority };
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    back(fallback = { type: 'home' }) {
      if (entry.index > 0) history.back();
      else navigate(fallback, { replace: true });
    },
  };
}
