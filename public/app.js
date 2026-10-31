import { initGameView } from './game-view.js';
import { initCatalogView } from './catalog-view.js';
import { initWallet } from './wallet.js';
import { initCatalogToolbar } from './catalog-toolbar.js';
import { initSiteMenu } from './site-menu.js';
import { initHeroCarousel } from './hero-carousel.js';
import { initSiteSearch } from './site-search.js';

const catalog = initCatalogView();
initCatalogToolbar();
initWallet();
initGameView();
const search = initSiteSearch(catalog);
initSiteMenu({ ...catalog, ...search });
initHeroCarousel(catalog);
document.querySelector('.site-logo')?.addEventListener('click', () => {
  document.querySelector('#catalog-categories [data-category="all"]')?.click();
});
