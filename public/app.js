import { initGameView } from './game-view.js';
import { initCatalogView } from './catalog-view.js';
import { initWallet } from './wallet.js';
import { initCatalogToolbar } from './catalog-toolbar.js';
import { initSiteMenu } from './site-menu.js';
import { initHeroCarousel } from './hero-carousel.js';
import { initSiteSearch } from './site-search.js';
import { initMobileNav } from './mobile-nav.js';

const catalog = initCatalogView();
initCatalogToolbar();
initWallet();
initGameView();
const search = initSiteSearch(catalog);
const menu = initSiteMenu({ ...catalog, ...search });
initMobileNav({ ...catalog, ...search, ...menu });
initHeroCarousel(catalog);
document.querySelector('.site-logo')?.addEventListener('click', () => {
  document.querySelector('#catalog-categories [data-category="all"]')?.click();
});
