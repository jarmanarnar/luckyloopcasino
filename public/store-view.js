import { requestDialogClose } from './dialog-motion.js';

import { STORE_PACKAGES, getStorePackage, formatPackagePrice, formatOriginalPrice, formatPackageCoins } from './store-packages.js';

let controller;
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function coin(code, size = 32) {
  const img = node('img', 'coin-art');
  Object.assign(img, { src: `assets/coins/${code === 'GC' ? 'gold' : 'super'}-coin-front.webp`,
    alt: '', width: size, height: size });
  img.setAttribute('aria-hidden', 'true');
  return img;
}
function renderPackages(list, headingTag) {
  for (const packageInfo of STORE_PACKAGES) {
    const card = node('li', 'store-package');
    card.dataset.packageId = packageInfo.id;
    if (packageInfo.offer) card.dataset.offer = packageInfo.offer;
    if (packageInfo.badge) card.append(node('span', 'store-package__badge', packageInfo.badge));
    const heading = node(headingTag, 'store-package__amount');
    heading.append(coin('GC'), node('span', '', formatPackageCoins(packageInfo.goldCoins)), node('span', 'visually-hidden', ' Gold Coins'));
    card.append(heading);
    if (packageInfo.sweepsCoins > 0) {
      const bonus = node('p', 'store-package__bonus');
      bonus.append(coin('SC', 20), node('strong', '', formatPackageCoins(packageInfo.sweepsCoins)), node('span', 'store-package__free', 'free'), node('span', 'visually-hidden', ' Super Coins'));
      card.append(bonus);
    }
    const purchase = node('div', 'store-package__purchase');
    if (packageInfo.originalPriceCents > packageInfo.priceCents) {
      const original = node('s', 'store-package__original-price', formatOriginalPrice(packageInfo));
      original.setAttribute('aria-hidden', 'true');
      purchase.append(original);
    }
    const price = node('button', 'store-package__price', formatPackagePrice(packageInfo));
    price.type = 'button';
    price.dataset.package = packageInfo.id;
    price.setAttribute('aria-haspopup', 'dialog');
    price.setAttribute('aria-controls', 'phone-verification-dialog');
    price.setAttribute('aria-label', `Buy ${formatPackageCoins(packageInfo.goldCoins)} Gold Coins${packageInfo.sweepsCoins ? ` plus ${formatPackageCoins(packageInfo.sweepsCoins)} free Super Coins` : ''} for ${formatPackagePrice(packageInfo)}${packageInfo.originalPriceCents > packageInfo.priceCents ? `, previously ${formatOriginalPrice(packageInfo)}` : ''}`);
    purchase.append(price);
    card.append(purchase);
    list.append(card);
  }
}

export function initStoreView({ router, account, auth, verifyPhone } = {}) {
  if (controller || !router || !account || !auth || !verifyPhone) return controller;
  const view = document.querySelector('#store-view');
  const pageList = document.querySelector('#store-packages');
  const storeDialog = document.querySelector('#store-dialog');
  const dialogList = document.querySelector('#store-dialog-packages');
  if (![view, pageList, storeDialog, dialogList].every(Boolean)) return;

  renderPackages(pageList, 'h2');
  renderPackages(dialogList, 'h3');

  function buyPackage(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-package]');
    if (button && getStorePackage(button.dataset.package)) verifyPhone();
  }
  pageList.addEventListener('click', buyPackage);
  dialogList.addEventListener('click', buyPackage);

  storeDialog.addEventListener('click', event => {
    if (event.target !== storeDialog) return;
    const rect = storeDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestDialogClose(storeDialog);
  });

  const entryPoints = document.querySelectorAll('#menu-buy, #wallet-add, #mobile-nav-store');
  for (const button of entryPoints) {
    button.setAttribute('aria-controls', storeDialog.id);
    button.setAttribute('aria-haspopup', 'dialog');
  }

  function openStore() {
    return auth.require(() => {
      if (document.querySelector('dialog[open]')) return;
      storeDialog.showModal();
      storeDialog.scrollTop = 0;
    });
  }

  account.subscribe(() => { if (!account.isSignedIn()) storeDialog.close(); });

  function render(route, meta = {}) {
    storeDialog.close();
    view.hidden = route.type !== 'store';
    if (!view.hidden) {
      document.body.dataset.page = 'store';
      document.title = 'Store · COP COIN';
      if (meta.source === 'navigate' && meta.focus !== false) view.querySelector('h1').focus({ preventScroll: true });
    }
  }
  router.subscribe(render);
  render(router.getRoute());
  controller = { openStore };
  return controller;
}

