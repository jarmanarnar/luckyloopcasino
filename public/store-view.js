import { STORE_PACKAGES, getStorePackage, formatPackagePrice } from './store-packages.js';

let initialized = false;
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function coin(code, size = 32) {
  const img = node('img', 'coin-art');
  Object.assign(img, { src: `assets/coins/${code === 'GC' ? 'gold' : 'sweeps'}-coin.svg`,
    alt: '', width: size, height: size });
  img.setAttribute('aria-hidden', 'true');
  return img;
}
export function initStoreView({ router } = {}) {
  if (initialized || !router) return;
  const view = document.querySelector('#store-view');
  const list = document.querySelector('#store-packages');
  const dialog = document.querySelector('#store-package-dialog');
  const title = document.querySelector('#store-package-title');
  const details = document.querySelector('#store-package-details');
  if (![view, list, dialog, title, details].every(Boolean)) return;
  initialized = true;
  for (const packageInfo of STORE_PACKAGES) {
    const card = node('li', 'store-package');
    card.dataset.packageId = packageInfo.id;
    if (packageInfo.badge) card.append(node('span', 'store-package__badge', packageInfo.badge));
    const heading = node('h2', 'store-package__amount');
    heading.append(coin('GC'), node('span', '', packageInfo.goldLabel), node('small', '', 'GC'));
    const art = node('div', 'store-package__art');
    art.setAttribute('aria-hidden', 'true');
    art.append(coin('GC', 64));
    if (packageInfo.sweepsCoins) art.append(coin('SC', 44));
    const bonus = node('p', 'store-package__bonus');
    if (packageInfo.sweepsCoins) {
      bonus.append(node('span', '', '+ FREE'), coin('SC', 20), node('strong', '', String(packageInfo.sweepsCoins)), node('span', '', 'SC'));
    } else bonus.setAttribute('aria-hidden', 'true');
    const price = node('button', 'store-package__price', formatPackagePrice(packageInfo));
    price.type = 'button';
    price.dataset.package = packageInfo.id;
    price.setAttribute('aria-haspopup', 'dialog');
    price.setAttribute('aria-controls', 'store-package-dialog');
    price.setAttribute('aria-label', `View ${packageInfo.goldLabel} GC${packageInfo.sweepsCoins ? ` plus ${packageInfo.sweepsCoins} free SC` : ''} package for ${formatPackagePrice(packageInfo)}`);
    card.append(heading, art, bonus, price);
    list.append(card);
  }
  list.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-package]');
    if (!button || document.querySelector('dialog[open]')) return;
    const packageInfo = getStorePackage(button.dataset.package);
    if (!packageInfo) return;
    title.textContent = `${packageInfo.goldLabel} Gold Coins`;
    const facts = node('dl', 'store-package-facts');
    const values = [['Gold Coins', `${new Intl.NumberFormat('en-US').format(packageInfo.goldCoins)} GC`],
      ...(packageInfo.sweepsCoins ? [['Free Sweeps Coins', `${packageInfo.sweepsCoins} SC`]] : []),
      ['Price', `${formatPackagePrice(packageInfo)} USD`]];
    for (const [label, value] of values) {
      const row = node('div');
      row.append(node('dt', '', label), node('dd', '', value));
      facts.append(row);
    }
    details.replaceChildren(facts);
    dialog.showModal();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  function render(route, meta = {}) {
    if (route.type !== 'store' && dialog.open) dialog.close();
    view.hidden = route.type !== 'store';
    if (!view.hidden) {
      document.body.dataset.page = 'store';
      document.title = 'Store · LuckyLoop Casino';
      if (meta.source === 'navigate' && meta.focus !== false) view.querySelector('h1').focus({ preventScroll: true });
    }
  }
  router.subscribe(render);
  render(router.getRoute());
}
