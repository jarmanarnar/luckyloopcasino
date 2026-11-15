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

function activity(ctx) {
  const root = ctx.node('div', 'feature-stack activity-history');
  const filters = ctx.node('div', 'feature-tabs');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter history');
  const panel = ctx.node('div', 'feature-stack');
  let selected = ctx.ui?.historyFilter || 'all';
  const labels = [['all', 'All'], ['game', 'Games'], ['reward', 'Rewards'], ['transaction', 'Transactions']];
  const render = () => {
    for (const item of filters.children) item.setAttribute('aria-pressed', String(item.dataset.type === selected));
    const entries = [...ctx.state().history].filter(entry => selected === 'all'
      || (selected === 'transaction' ? Boolean(entry.transactionId) : entry.type === selected)).reverse();
    panel.replaceChildren();
    if (!entries.length) {
      panel.append(empty(ctx, selected === 'transaction' ? 'No transactions' : 'No activity yet',
        selected === 'transaction' ? 'Your demo coin movements will appear here.' : 'Games opened and demo rewards collected in this browser will appear here.',
        ctx.link('achievements', 'Achievements')));
      return;
    }
    const list = ctx.node('ul', 'feature-list');
    for (const entry of entries) {
      const item = ctx.node('li', 'feature-card feature-history-row');
      const copy = ctx.node('div', 'feature-stack');
      const time = ctx.node('time', 'feature-muted', when(entry.at));
      if (!Number.isNaN(new Date(entry.at).getTime())) time.dateTime = new Date(entry.at).toISOString();
      copy.append(ctx.node('span', 'feature-kicker', entry.type === 'game' ? 'Game opened' : entry.type === 'reward' ? 'Demo reward' : 'Opening balance'),
        ctx.node('h2', 'feature-section-title', entry.title), ctx.node('p', 'feature-muted', entry.detail || ''), time);
      if (entry.transactionId) {
        const details = ctx.node('details', 'feature-disclosure');
        details.append(ctx.node('summary', '', 'Transaction details'),
          ctx.node('p', 'feature-muted', `Status: Completed · ${entry.currency}`),
          ctx.node('p', 'feature-muted', `Reference: ${entry.transactionId}`));
        copy.append(details);
      }
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
  const form = ctx.node('form', 'feature-card feature-stack settings-panel');
  const header = ctx.node('header', 'settings-panel__header');
  const icon = ctx.node('span', 'settings-panel__icon');
  icon.append(ctx.icon('settings'));
  header.append(icon, ctx.node('h2', 'feature-section-title', 'Display preferences'));
  form.append(header);
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
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const patch = {};
    if (reduced.checked !== state.reducedMotion) patch.reducedMotion = reduced.checked;
    if (hidden.checked !== state.hideBalance) patch.hideBalance = hidden.checked;
    save.disabled = true;
    try { if (await ctx.saveSettings(patch)) ctx.notify('Preferences saved.'); }
    finally { save.disabled = false; }
  });
  return form;
}

const FAQs = [
  ['Why does the game show a different balance?', 'Each provider demo has its own play balance. The GC and SC amounts in our top bar are local interface balances and are not connected to the game.'],
  ['Where can I find my rewards?', 'Open Rewards to view available tasks. Collected demo rewards are recorded in Activity history.'],
  ['How do I find a game?', 'Use Search or open Providers to browse a particular studio. Popular and Editor’s Favorites are curated collections.'],
  ['Can I buy or redeem coins here?', 'The Store currently previews packages. Purchases, payments and redemptions are not connected.'],
];

function support(ctx) {
  const root = ctx.node('div', 'feature-grid support-page');
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

/** Each page shares the shell, route lifecycle and local state owned by feature-view. */
export function renderAccountPage(pageId, ctx) {
  switch (pageId) {
    case 'history': return activity(ctx);
    case 'settings': return settings(ctx);
    case 'support': return support(ctx);
    default: return null;
  }
}
