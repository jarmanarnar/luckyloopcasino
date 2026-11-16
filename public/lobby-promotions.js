import { ACHIEVEMENTS, formatAchievementRewards } from './achievement-catalog.js';
import { getAchievements } from './rewards-pages.js';
import { createUiIcon } from './ui-icons.js';

// Each lobby icon owns one promotion. Campaign copy and artwork live here,
// while reward amounts and eligibility come from the existing achievement catalog.
export const LOBBY_PROMOTIONS = Object.freeze([
  { id: 'welcome', label: 'Welcome reward', title: 'Welcome to the squad.',
    description: 'Your COP COIN journey starts with a welcome reward.',
    image: 'assets/rewards-gift.svg', taskId: 'welcome-member', tone: 'blue' },
  { id: 'streak', label: 'Daily streak rewards', title: 'Make every day count.',
    description: 'Come back, build your streak and unlock more rewards along the way.',
    image: 'assets/promotions/silver-trophy.svg', taskId: 'login-streak-2', tone: 'red' },
].map(promotion => Object.freeze(promotion)));

export function initLobbyPromotions({ router, account, auth, document: doc = document }) {
  const node = (tag, css, text) => {
    const el = doc.createElement(tag);
    if (css) el.className = css;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const artwork = (promotion, css) => {
    const img = node('img', css);
    img.src = promotion.image; img.alt = ''; img.width = img.height = 160;
    img.draggable = false;
    return img;
  };
  const dock = node('aside', 'lobby-promotions');
  dock.id = 'lobby-promotions'; dock.lang = 'en'; dock.dir = 'ltr'; dock.hidden = true;
  dock.setAttribute('aria-label', 'Lobby promotions');
  const dialog = node('dialog', 'promotion-dialog');
  dialog.id = 'promotion-dialog'; dialog.lang = 'en'; dialog.dir = 'ltr';
  dialog.setAttribute('aria-labelledby', 'promotion-title');
  dialog.setAttribute('aria-describedby', 'promotion-description');
  const close = node('button', 'dialog-close icon-button promotion-dialog__close');
  close.type = 'button'; close.setAttribute('aria-label', 'Close promotion');
  close.append(createUiIcon('close'));
  const content = node('div', 'promotion-dialog__content');
  const action = node('button', 'primary-button promotion-dialog__action'); action.type = 'button';
  dialog.append(close, content, action); doc.body.append(dock, dialog);
  let selected = null, opener = null, handoff = false;

  const triggers = LOBBY_PROMOTIONS.map(promotion => {
    const trigger = node('button', 'lobby-promotions__trigger'); trigger.type = 'button';
    trigger.dataset.promotion = promotion.id; trigger.dataset.tone = promotion.tone;
    trigger.setAttribute('aria-label', promotion.label); trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', dialog.id); trigger.setAttribute('aria-expanded', 'false');
    trigger.append(artwork(promotion, 'lobby-promotions__image'));
    trigger.addEventListener('click', () => {
      if (router.getRoute().type !== 'home' || doc.querySelector('dialog[open]')) return;
      selected = promotion; opener = trigger; handoff = false;
      render(); trigger.setAttribute('aria-expanded', 'true'); dialog.showModal();
      close.focus({ preventScroll: true });
    });
    dock.append(trigger); return trigger;
  });

  function render() {
    if (!selected) return;
    const task = ACHIEVEMENTS.find(item => item.id === selected.taskId);
    const memberTask = account.isSignedIn()
      ? getAchievements(account.getMemberState()).find(item => item.id === selected.taskId) : null;
    dialog.dataset.tone = selected.tone;
    const visual = node('div', 'promotion-dialog__visual'); visual.append(artwork(selected, 'promotion-dialog__art'));
    const kicker = node('p', 'promotion-dialog__kicker', selected.label);
    const title = node('h2', 'promotion-dialog__title', selected.title); title.id = 'promotion-title';
    const description = node('p', 'promotion-dialog__description', selected.description); description.id = 'promotion-description';
    const reward = node('div', 'promotion-dialog__reward');
    reward.setAttribute('aria-label', formatAchievementRewards(task.rewards));
    for (const [currency, units] of Object.entries(task.rewards)) {
      const item = node('span', 'promotion-dialog__coin');
      const img = node('img'); img.src = `assets/coins/${currency === 'GC' ? 'gold' : 'super'}-coin-front.png`;
      img.alt = ''; img.width = img.height = 28;
      const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(units / (currency === 'SC' ? 100 : 1));
      item.append(img, node('strong', '', amount), node('span', '', currency)); reward.append(item);
    }
    const condition = node('p', 'promotion-dialog__condition', selected.id === 'streak'
      ? `Your first streak reward: log in for ${task.goal} consecutive days.`
      : 'Available once when you create your account.');
    if (memberTask?.claimed) condition.textContent = selected.id === 'streak'
      ? 'First streak reward collected. Explore your next milestones.' : 'Welcome reward collected. More achievements are waiting for you.';
    content.replaceChildren(visual, kicker, title, description, reward, condition);
    action.textContent = account.isSignedIn() ? 'View achievements' : 'Join & Unlock';
  }

  action.addEventListener('click', () => {
    handoff = true; dialog.close();
    const destination = () => router.navigate({ type: 'feature', pageId: 'achievements' });
    if (account.isSignedIn()) destination(); else auth.open('register', destination);
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    triggers.forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
    if (!handoff && !dock.hidden && !doc.querySelector('dialog[open]')) opener?.focus({ preventScroll: true });
    selected = null;
  });
  const syncRoute = route => {
    dock.hidden = route.type !== 'home';
    if (dialog.open) { handoff = true; dialog.close(); }
  };
  router.subscribe(syncRoute); syncRoute(router.getRoute());
  account.subscribe(() => { if (dialog.open) render(); });
  return { close: () => { if (dialog.open) dialog.close(); } };
}
