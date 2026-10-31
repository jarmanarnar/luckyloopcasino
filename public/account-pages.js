const AVATARS = ['L', '∞', '★', '7', 'G', 'S'];
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function when(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

function button(ctx, label, action, className = 'feature-button') {
  const el = ctx.node('button', className, label);
  el.type = 'button';
  if (action) el.addEventListener('click', action);
  return el;
}

function card(ctx, title, text) {
  const el = ctx.node('section', 'feature-card feature-stack');
  if (title) el.append(ctx.node('h2', 'feature-section-title', title));
  if (text) el.append(ctx.node('p', 'feature-muted', text));
  return el;
}

function field(ctx, label, input) {
  const wrap = ctx.node('label', 'feature-field');
  wrap.append(ctx.node('span', '', label), input);
  return wrap;
}

function empty(ctx, title, text, link) {
  const el = ctx.node('div', 'feature-empty feature-stack');
  el.append(ctx.node('h2', 'feature-section-title', title), ctx.node('p', 'feature-muted', text));
  if (link) el.append(link);
  return el;
}

function profile(ctx) {
  const state = ctx.state();
  const root = ctx.node('div', 'feature-grid');
  const overview = card(ctx, state.profile.displayName);
  const avatar = ctx.node('span', 'feature-avatar', state.profile.avatar || 'L');
  avatar.setAttribute('aria-hidden', 'true');
  overview.prepend(avatar);
  const shortcuts = ctx.node('div', 'feature-actions');
  shortcuts.append(ctx.link('history', 'Activity history'), ctx.link('favorites', 'Favorites'), ctx.link('rank-system', 'My rank'));
  overview.append(shortcuts);
  const form = ctx.node('form', 'feature-card feature-stack');
  form.append(ctx.node('h2', 'feature-section-title', 'Edit profile'));
  const name = ctx.node('input', 'feature-input');
  name.type = 'text';
  name.name = 'displayName';
  name.value = state.profile.displayName;
  name.minLength = 2;
  name.maxLength = 24;
  name.required = true;
  name.autocomplete = 'nickname';
  form.append(field(ctx, 'Display name', name));
  const avatarField = ctx.node('fieldset', 'feature-field');
  avatarField.append(ctx.node('legend', '', 'Choose an avatar'));
  const choices = ctx.node('div', 'feature-actions');
  let selected = AVATARS.includes(state.profile.avatar) ? state.profile.avatar : 'L';
  for (const value of AVATARS) {
    const choice = button(ctx, value, () => {
      selected = value;
      avatar.textContent = value;
      for (const item of choices.children) item.setAttribute('aria-pressed', String(item.dataset.avatar === value));
    }, 'feature-avatar-choice');
    choice.dataset.avatar = value;
    choice.setAttribute('aria-label', `Avatar ${value}`);
    choice.setAttribute('aria-pressed', String(value === selected));
    choices.append(choice);
  }
  avatarField.append(choices);
  const save = ctx.node('button', 'feature-button feature-button--primary', 'Save profile');
  save.type = 'submit';
  const status = ctx.node('p', 'feature-muted');
  status.setAttribute('role', 'status');
  form.append(avatarField, save, status);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const displayName = name.value.trim();
    if (displayName.length < 2) {
      status.textContent = 'Use a display name with 2–24 characters.';
      name.focus();
      return;
    }
    if (ctx.saveProfile({ displayName, avatar: selected }) !== false) ctx.notify('Profile saved in this browser.');
  });
  root.append(overview, form);
  return root;
}

function activity(ctx) {
  const root = ctx.node('div', 'feature-stack');
  const filters = ctx.node('div', 'feature-tabs');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter history');
  const panel = ctx.node('div', 'feature-stack');
  let selected = ctx.ui?.historyFilter || 'all';
  const labels = [['all', 'All'], ['game', 'Games'], ['reward', 'Rewards'], ['transaction', 'Transactions']];
  const render = () => {
    for (const item of filters.children) item.setAttribute('aria-pressed', String(item.dataset.type === selected));
    const entries = [...ctx.state().history].filter(entry => selected === 'all' || entry.type === selected).reverse();
    panel.replaceChildren();
    if (!entries.length) {
      panel.append(empty(ctx, selected === 'transaction' ? 'No transactions' : 'No activity yet',
        selected === 'transaction' ? 'Package previews do not create purchases or redemptions.' : 'Games opened and demo rewards collected in this browser will appear here.',
        ctx.link('daily-bonus', 'Daily Bonus')));
      return;
    }
    const list = ctx.node('ul', 'feature-list');
    for (const entry of entries) {
      const item = ctx.node('li', 'feature-card feature-history-row');
      const copy = ctx.node('div', 'feature-stack');
      const time = ctx.node('time', 'feature-muted', when(entry.at));
      if (!Number.isNaN(new Date(entry.at).getTime())) time.dateTime = new Date(entry.at).toISOString();
      copy.append(ctx.node('span', 'feature-kicker', entry.type === 'game' ? 'Game opened' : entry.type === 'reward' ? 'Demo reward' : 'Activity'),
        ctx.node('h2', 'feature-section-title', entry.title), ctx.node('p', 'feature-muted', entry.detail || ''), time);
      item.append(copy);
      if (entry.gameId && ctx.games.some(game => game.id === entry.gameId)) {
        const actions = ctx.node('div', 'feature-actions');
        actions.append(button(ctx, 'View game', () => ctx.openGame(entry.gameId)));
        if (ctx.toggleFavorite) {
          const saved = ctx.state().favorites.includes(entry.gameId);
          const favorite = button(ctx, saved ? '♥ Saved' : '♡ Favorite', () => ctx.toggleFavorite(entry.gameId));
          favorite.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${entry.title} ${saved ? 'from' : 'to'} favorites`);
          favorite.setAttribute('aria-pressed', String(saved));
          actions.append(favorite);
        }
        item.append(actions);
      }
      list.append(item);
    }
    panel.append(list);
  };
  for (const [type, label] of labels) {
    const filter = button(ctx, label, () => { selected = type; if (ctx.ui) ctx.ui.historyFilter = type; render(); }, 'feature-tab');
    filter.dataset.type = type;
    filters.append(filter);
  }
  root.append(filters, panel);
  render();
  return root;
}

function settings(ctx) {
  const form = ctx.node('form', 'feature-card feature-stack');
  form.append(ctx.node('h2', 'feature-section-title', 'Display preferences'));
  const state = ctx.state().settings;
  const reduced = ctx.node('input');
  reduced.type = 'checkbox'; reduced.name = 'reducedMotion'; reduced.checked = state.reducedMotion;
  const hidden = ctx.node('input');
  hidden.type = 'checkbox'; hidden.name = 'hideBalance'; hidden.checked = state.hideBalance;
  const motionRow = ctx.node('label', 'feature-setting');
  const motionCopy = ctx.node('span');
  motionCopy.append(ctx.node('strong', '', 'Reduce motion'), ctx.node('small', 'feature-muted', 'Pause automatic banners and reduce interface animation.'));
  motionRow.append(motionCopy, reduced);
  const balanceRow = ctx.node('label', 'feature-setting');
  const balanceCopy = ctx.node('span');
  balanceCopy.append(ctx.node('strong', '', 'Hide header balance'), ctx.node('small', 'feature-muted', 'Mask the amount in the top bar.'));
  balanceRow.append(balanceCopy, hidden);
  const save = ctx.node('button', 'feature-button feature-button--primary', 'Save preferences');
  save.type = 'submit';
  form.append(motionRow, balanceRow, save);
  form.addEventListener('submit', event => {
    event.preventDefault();
    ctx.saveSettings({ reducedMotion: reduced.checked, hideBalance: hidden.checked });
    ctx.notify('Preferences saved.');
  });
  return form;
}

const FAQs = [
  ['Why does the game show a different balance?', 'Each provider demo has its own play balance. The GC and SC amounts in our top bar are local interface balances and are not connected to the game.'],
  ['Where is my daily reward?', 'Open Daily Bonus from the menu. Collected demo rewards are recorded in Activity history.'],
  ['How do I find a game?', 'Use Search or open Providers to browse a particular studio. Popular and Editor’s Favorites are curated collections.'],
  ['Can I buy or redeem coins here?', 'The Store currently previews packages. Purchases, payments and redemptions are not connected.'],
];

function support(ctx) {
  const root = ctx.node('div', 'feature-grid');
  const faq = card(ctx, 'Quick answers');
  for (const [question, answer] of FAQs) {
    const details = ctx.node('details', 'feature-disclosure');
    details.append(ctx.node('summary', '', question), ctx.node('p', 'feature-muted', answer));
    faq.append(details);
  }
  const form = ctx.node('form', 'feature-card feature-stack');
  form.append(ctx.node('h2', 'feature-section-title', 'Live Support'));
  const topic = ctx.node('select', 'feature-input');
  for (const text of ['Games', 'Coins & rewards', 'Profile', 'Something else']) {
    const option = ctx.node('option', '', text); option.value = text; topic.append(option);
  }
  const message = ctx.node('textarea', 'feature-input');
  message.rows = 5; message.maxLength = 2000; message.required = true;
  message.placeholder = 'Describe what you need help with';
  const preview = ctx.node('button', 'feature-button', 'Preview message');
  preview.type = 'submit';
  const result = ctx.node('div', 'feature-stack');
  result.setAttribute('role', 'status');
  form.append(field(ctx, 'Topic', topic), field(ctx, 'Message', message), preview, result);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!message.value.trim()) return;
    result.replaceChildren(ctx.node('h3', 'feature-section-title', `${topic.value} · Draft`),
      ctx.node('p', 'feature-message', message.value.trim()), ctx.node('small', 'feature-muted', 'Preview only — not sent.'));
  });
  root.append(faq, form);
  return root;
}

const ARTICLES = [
  { title: 'GC and SC, explained', category: 'Coins', summary: 'Understand the two balances in the top bar.', paragraphs: [
    'Gold Coins (GC) and Sweeps Coins (SC) have separate balances. Use the coin switch in the top bar to choose which one is displayed.',
    'In this prototype, both are local demo values saved in your browser. Changing the selected coin does not change a provider demo’s balance.',
    'Store packages are previews. The current interface does not process payments or redemptions.',
  ] },
  { title: 'Find your next game', category: 'Discover', summary: 'Browse collections, providers and search.', paragraphs: [
    'Popular is a curated starting point. Slots gathers the reel games, and New Releases highlights titles with recorded release dates.',
    'Open Providers to browse one studio’s catalog. Search can narrow the list by game name, category and provider.',
    'A game opens inside the same navigation shell. Your activity history keeps a shortcut to games you opened in this browser.',
  ] },
  { title: 'Your local demo account', category: 'Getting started', summary: 'What is saved and how the prototype works.', paragraphs: [
    'Your display name, avatar, favorites, preferences and local activity belong to this browser. A different device starts with its own state.',
    'Daily Bonus and Free Money let you try the reward interface. VIP, Rank System and partner pages show the proposed structure of the platform.',
    'External game demos run independently. This local prototype has no real account login, payment service or support agent.',
  ] },
];

function blog(ctx) {
  const grid = ctx.node('div', 'feature-grid feature-grid--3');
  for (const article of ARTICLES) {
    const item = ctx.node('article', 'feature-card feature-stack');
    item.append(ctx.node('span', 'feature-kicker', article.category), ctx.node('h2', 'feature-section-title', article.title),
      ctx.node('p', 'feature-muted', article.summary));
    const details = ctx.node('details', 'feature-disclosure');
    details.append(ctx.node('summary', '', 'Read article'));
    for (const paragraph of article.paragraphs) details.append(ctx.node('p', 'feature-muted', paragraph));
    item.append(details);
    grid.append(item);
  }
  return grid;
}

function notifications(ctx) {
  const entries = [...ctx.state().history].filter(entry => entry.type === 'reward').reverse();
  if (!entries.length) return empty(ctx, 'You’re all caught up', 'Collected demo rewards will appear here.', ctx.link('daily-bonus', 'Daily Bonus'));
  const list = ctx.node('ul', 'feature-list');
  for (const entry of entries) {
    const item = ctx.node('li', 'feature-card feature-stack');
    item.append(ctx.node('span', 'feature-kicker', 'Reward activity'), ctx.node('h2', 'feature-section-title', entry.title),
      ctx.node('p', 'feature-muted', entry.detail || ''), ctx.node('small', 'feature-muted', when(entry.at)));
    list.append(item);
  }
  return list;
}

function redeem(ctx) {
  const root = ctx.node('div', 'feature-stack');
  const panel = card(ctx, 'Redemptions', 'This is a preview of the redemption area. No payment or redemption service is connected.');
  const steps = ctx.node('ol', 'feature-list feature-grid feature-grid--3');
  for (const [title, text] of [
    ['Account verification', 'Verification status and required documents will be shown here.'],
    ['Eligible balance', 'A connected account will show the balance available to redeem.'],
    ['Request & track', 'Redemption methods and request status will appear in this area.'],
  ]) {
    const step = ctx.node('li', 'feature-card feature-stack');
    step.append(ctx.node('h3', 'feature-section-title', title), ctx.node('p', 'feature-muted', text));
    steps.append(step);
  }
  panel.append(ctx.link('history', 'View activity history'));
  root.append(panel, steps);
  return root;
}

function favorites(ctx) {
  const saved = new Set(ctx.state().favorites || []);
  const games = ctx.games.filter(game => saved.has(game.id));
  if (!games.length) return empty(ctx, 'Save your favorites', 'Use the heart beside a game in your history to build this collection.', ctx.link('history', 'Open game history'));
  const grid = ctx.node('ul', 'feature-grid feature-grid--3 feature-list');
  for (const game of games) {
    const item = ctx.node('li', 'feature-card feature-stack');
    item.append(ctx.node('span', 'feature-kicker', game.providerName), ctx.node('h2', 'feature-section-title', game.title));
    const actions = ctx.node('div', 'feature-actions');
    actions.append(button(ctx, 'View game', () => ctx.openGame(game.id)), button(ctx, 'Remove favorite', () => ctx.toggleFavorite?.(game.id)));
    item.append(actions);
    grid.append(item);
  }
  return grid;
}

/** Each page shares the shell, route lifecycle and local state owned by feature-view. */
export function renderAccountPage(pageId, ctx) {
  switch (pageId) {
    case 'profile': return profile(ctx);
    case 'history': return activity(ctx);
    case 'settings': return settings(ctx);
    case 'support': return support(ctx);
    case 'blog': return blog(ctx);
    case 'notifications': return notifications(ctx);
    case 'redeem': return redeem(ctx);
    case 'favorites': return favorites(ctx);
    default: return null;
  }
}
