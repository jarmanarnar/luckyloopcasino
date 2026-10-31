// Hash routes work on both localhost and static GitHub Pages without rewrites.
const categoryIds = new Set(['popular', 'slots', 'new-releases', 'spooky', 'picks', 'tap', 'megaways', 'jackpot', 'fruit', 'adventure']);
const sortIds = new Set(['featured', 'az', 'za', 'newest']);
const validId = value => /^[a-z0-9][a-z0-9_-]*$/i.test(value || '');
const decode = value => { try { return decodeURIComponent(value); } catch { return ''; } };

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
  if (segments.length === 1 && categoryIds.has(segments[0])) route = { type: 'category', categoryId: segments[0] };
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
  if (route.type === 'game') {
    const params = new URLSearchParams({ game: route.gameId });
    if (route.from && !route.from.includes('game=')) params.set('from', route.from);
    return `#${params}`;
  }
  const path = route.type === 'category' ? route.categoryId
    : route.type === 'provider' ? `providers/${encodeURIComponent(route.providerId)}`
      : route.type === 'providers' ? 'providers' : 'search';
  const params = new URLSearchParams();
  if (route.query) params.set('q', route.query);
  if (route.providerId && route.type !== 'provider') params.set('provider', route.providerId);
  if (route.categoryId && route.type !== 'category') params.set('category', route.categoryId);
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
  serial = Math.max(serial, entry.id);
  history.replaceState({ ...history.state, loopRoute: entry }, '', location.href);
  history.scrollRestoration = 'manual';

  function savePosition() { positions.set(entry.id, position()); }
  scope.addEventListener('scroll', savePosition, { passive: true });
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
    history.replaceState({ ...history.state, loopRoute: entry }, '', location.href);
    currentRoute = parseRoute(location.hash);
    currentUrl = location.href;
    emit(previous, { restore: true, source: 'history', focus: false });
  }
  scope.addEventListener('popstate', fromHistory);
  scope.addEventListener('hashchange', fromHistory);
  return {
    getRoute: () => currentRoute,
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
