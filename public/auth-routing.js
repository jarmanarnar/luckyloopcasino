const publicFeatures = new Set(['support', 'blog', 'vip-club', 'partners', 'affiliate-program']);
export function requiresAccount(route) {
  return ['game', 'game-details', 'favorites', 'store'].includes(route.type)
    || route.type === 'feature' && !publicFeatures.has(route.pageId);
}

export function createAuthRouter(router, account, requestLogin) {
  const guard = route => {
    if (account.isSignedIn() || !requiresAccount(route)) return false;
    router.navigate({ type: 'home' }, { replace: true, focus: false });
    requestLogin(route);
    return true;
  };
  // Runs before views, so deep links and browser Back never mount a private view for guests.
  router.subscribe(route => guard(route), { priority: -200 });
  guard(router.getRoute());
  return { ...router,
    navigate(route, options) {
      if (!account.isSignedIn() && requiresAccount(route)) { requestLogin(route); return; }
      router.navigate(route, options);
    },
  };
}
