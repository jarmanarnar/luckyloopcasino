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

const router = initRouter();
initGameView({ router });
const catalog = initCatalogView({ router });
initStoreView({ router });
initCatalogToolbar();
const wallet = initWallet(catalog);
const features = initFeatureView({ router, wallet });
const search = initSiteSearch(catalog);
const menu = initSiteMenu({ ...catalog, ...search, ...features });
initMobileNav({ ...catalog, ...search, ...features, ...menu });
initHeroCarousel(catalog);

document.querySelector('.site-logo')?.addEventListener('click', event => {
  event.preventDefault();
  catalog.openHome();
});
