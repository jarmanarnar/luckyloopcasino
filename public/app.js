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
const game = initGameView();
const search = initSiteSearch({ ...catalog, ...game });
const menu = initSiteMenu({ ...catalog, ...search, ...game });
initMobileNav({ ...catalog, ...search, ...menu, ...game });
initHeroCarousel(catalog);
document.querySelector('.site-logo')?.addEventListener('click', () => {
  game.returnToLobby(() => document.querySelector('#catalog-categories [data-category="all"]')?.click());
});
