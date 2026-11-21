function pageKey(route) {
  if (route.type === 'category') return `category:${route.gameTypeId || ''}:${route.categoryId || ''}`;
  if (route.type === 'provider') return `provider:${route.providerId}`;
  if (route.type === 'feature') return `feature:${route.pageId}`;
  if (route.type === 'game-details' || route.type === 'game') return `${route.type}:${route.gameId}`;
  return route.type;
}

// Route content already exists locally. Give a new destination a short reveal
// without delaying navigation or pretending that an extra download is needed.
export function initPageMotion({ router, document: doc = document, window: scope = window }) {
  const reduced = scope.matchMedia('(prefers-reduced-motion: reduce)');
  let current = pageKey(router.getRoute()), animation = null;
  function cancel() {
    const previous = animation;
    animation = null;
    previous?.cancel();
  }
  const unsubscribe = router.subscribe((route, meta = {}) => {
    const next = pageKey(route), changed = next !== current;
    current = next;
    cancel();
    if (!changed || (meta.preserveScroll && meta.focus === false) || route.type === 'game' || doc.hidden || reduced.matches
      || doc.body.dataset.reduceMotion === 'true' || doc.body.dataset.appState !== 'ready'
      || doc.body.dataset.appStarting) return;
    const selector = route.type === 'feature' ? '#feature-view'
      : route.type === 'store' ? '#store-view'
        : route.type === 'game-details' ? '#game-details-view' : '#lobby-view';
    const content = doc.querySelector(selector);
    if (!content || content.hidden || typeof content.animate !== 'function') return;
    try {
      const reveal = content.animate([{ opacity: .35 }, { opacity: 1 }], {
        duration: 180, easing: 'cubic-bezier(.4, 0, .2, 1)'
      });
      animation = reveal;
      const finish = () => { if (animation === reveal) animation = null; };
      reveal.finished?.then(finish, finish);
    } catch { /* Content stays usable on a host without animation support. */ }
  }, { priority: 1000 });
  const settle = () => {
    if (reduced.matches || doc.hidden || doc.body.dataset.reduceMotion === 'true') cancel();
  };
  reduced.addEventListener('change', settle);
  doc.addEventListener('visibilitychange', settle);
  doc.addEventListener('loop:preferences-change', settle);
  return { destroy() {
    cancel();
    unsubscribe();
    reduced.removeEventListener('change', settle);
    doc.removeEventListener('visibilitychange', settle);
    doc.removeEventListener('loop:preferences-change', settle);
  } };
}
