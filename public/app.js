import { initGameView } from './game-view.js';
import { initCatalogView } from './catalog-view.js';
import { initWallet } from './wallet.js';
import { initCatalogToolbar } from './catalog-toolbar.js';
import { initSiteMenu } from './site-menu.js';
import { initHeroCarousel } from './hero-carousel.js';
import { initSiteSearch } from './site-search.js';
import { initMobileNav } from './mobile-nav.js';
import { initRouter } from './routes.js';
import { initStoreView } from './store-view.js';
import { initFeatureView } from './feature-view.js';
import { initGameDetails } from './game-details-view.js';
import { initHowToPlay } from './how-to-play.js';
import { openDemoAccount } from './demo-account.js';
import { GAMES } from './catalog.js';
import { initAuthView } from './auth-view.js';

export async function initApplication() {
  const account = await openDemoAccount({ catalogIds: GAMES.map(game => game.id) });
  const auth = initAuthView({ account, router: initRouter() });
  const router = auth.router;
  initGameView({ router });
  const wallet = initWallet({ account, router, openStore: () => router.navigate({ type: 'store' }) });
  const features = initFeatureView({ router, wallet, account, auth });
  const catalog = initCatalogView({ router, member: features.member });
  initStoreView({ router });
  initCatalogToolbar();
  initGameDetails({ router, member: features.member });
  const search = initSiteSearch(catalog);
  const help = initHowToPlay({ router, openHome: catalog.openHome });
  const menu = initSiteMenu({ ...catalog, ...search, ...features, ...help });
  initMobileNav({ ...catalog, ...search, ...features, ...menu });
  initHeroCarousel(catalog);

  document.querySelector('.site-logo')?.addEventListener('click', event => {
    event.preventDefault();
    catalog.openHome();
  });
  return { ...router, prepareLayout: () => wallet.refreshLayout() };
}
