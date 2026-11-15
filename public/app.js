import { initSiteMode } from './site-mode.js';
import { initGameView } from './game-view.js';
import { initCatalogView } from './catalog-view.js';
import { initWallet } from './wallet.js';
import { initCatalogToolbar } from './catalog-toolbar.js';
import { initSiteMenu } from './site-menu.js';
import { initHeroCarousel } from './hero-carousel.js';
import { initMobileNav } from './mobile-nav.js';
import { initRouter } from './routes.js';
import { initStoreView } from './store-view.js';
import { initPhoneVerification } from './phone-verification.js';
import { initNotificationsDrawer } from './notifications-drawer.js';
import { initRewardsPopover } from './rewards-popover.js';
import { initProfileMenu } from './profile-menu.js';
import { initCommunityChat } from './community-chat.js';
import { initFeatureView } from './feature-view.js';
import { initGameDetails } from './game-details-view.js';
import { initHowToPlay } from './how-to-play.js';
import { openDemoAccount } from './demo-account.js';
import { GAMES } from './catalog.js';
import { initAuthView } from './auth-view.js';
import { initSiteFooter } from './site-footer.js';
import { initUiIcons } from './ui-icons.js';
import { initSpinWheel } from './spin-wheel.js';

export async function initApplication() {
  initUiIcons();
  const account = await openDemoAccount({ catalogIds: GAMES.map(game => game.id) });
  initSiteMode({ account });
  const auth = initAuthView({ account, router: initRouter() });
  const router = auth.router;
  const phone = initPhoneVerification({ router, account });
  const notifications = initNotificationsDrawer({ router, account, auth });
  initRewardsPopover({ router, account });
  const wheel = initSpinWheel({ router, account, auth });
  const verifyPhone = () => auth.require(phone.open);
  const profile = initProfileMenu({ router, account, auth, openNotifications: notifications.open, verifyPhone });
  initGameView({ router, account, verifyPhone: phone.open });
  const store = initStoreView({ router, account, auth, verifyPhone });
  const wallet = initWallet({ account, router, openStore: store.openStore });
  const features = initFeatureView({ router, wallet, account, auth, verifyPhone, openNotifications: notifications.open, openProfile: profile.open });
  const catalog = initCatalogView({ router, member: features.member });
  initCatalogToolbar();
  initGameDetails({ router, member: features.member });
  const help = initHowToPlay({ router });
  initSiteFooter({ router, openHowToPlay: help.openHowToPlay, openStore: store.openStore });
  const menu = initSiteMenu({ ...catalog, ...features, ...help, ...wheel, openStore: store.openStore });
  const chat = initCommunityChat({ account, auth });
  initMobileNav({ ...catalog, ...features, ...menu, openStore: store.openStore, openChat: chat.open });
  initHeroCarousel(catalog);

  document.querySelector('.site-logo')?.addEventListener('click', event => {
    event.preventDefault();
    catalog.openHome();
  });
  return { ...router, prepareLayout: () => wallet.refreshLayout() };
}
