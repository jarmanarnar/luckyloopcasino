const format = value => new Intl.NumberFormat('en-US').format(value);

export function renderAchievements(ctx, entries, collect) {
  const n = ctx.node;
  const completed = entries.filter(entry => entry.complete);
  const ready = entries.filter(entry => entry.ready);
  const busy = Boolean(ctx.ui.achievementsCollecting);
  const filter = ctx.ui.achievementFilter || 'all';
  const root = n('div', 'achievements');
  const button = (text, className, action) => {
    const el = n('button', className, text);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  };
  const medal = (entry, hero = false) => {
    const el = n('span', `achievement-medal${entry.complete ? ' is-complete' : ''}${entry.ready ? ' is-ready' : ''}${hero ? ' achievement-medal--hero' : ''}`);
    el.setAttribute('aria-hidden', 'true');
    const face = n('span', 'achievement-medal__face');
    face.append(ctx.icon(entry.id === 'complete-profile' ? 'profile' : 'picks'));
    el.append(face, n('span', 'achievement-medal__check', entry.complete ? '✓' : ''));
    return el;
  };

  const hero = n('section', 'achievements-hero');
  hero.setAttribute('aria-label', 'Achievement overview');
  const intro = n('div', 'achievements-hero__intro');
  const copy = n('div', 'achievements-hero__copy');
  copy.append(n('h2', '', 'Your Achievements'));
  const total = n('div', 'achievements-hero__total');
  total.append(ctx.icon('jackpot'), n('strong', '', `${completed.length}/${entries.length}`));
  copy.append(total);
  const artwork = n('img', 'achievements-hero__art');
  artwork.src = 'assets/brand/cop-coin-beacons.png';
  artwork.alt = '';
  artwork.width = 1536;
  artwork.height = 1024;
  intro.append(copy, artwork);
  const showcase = n('div', 'achievements-hero__showcase');
  const heading = n('div', 'achievements-hero__heading');
  heading.append(n('h3', '', 'Completed'));
  const claimAll = button(busy ? 'Collecting…' : 'Claim All Rewards', 'achievement-claim', () => collect(ready.map(entry => entry.id)));
  claimAll.id = 'achievement-claim-all';
  claimAll.disabled = busy || ready.length === 0;
  claimAll.title = ready.length ? `${format(ready.reduce((sum, entry) => sum + entry.amount, 0))} GC ready to collect` : 'No rewards waiting to be collected';
  heading.append(claimAll);
  const medals = n('div', 'achievements-hero__medals');
  if (completed.length) {
    for (const entry of completed) {
      const badge = button('', 'achievement-award', () => {
        ctx.ui.achievementFilter = 'completed';
        ctx.refresh('achievements', `achievement-${entry.id}`);
      });
      badge.setAttribute('aria-label', `${entry.title} — ${entry.claimed ? 'reward collected' : 'ready to collect'}`);
      badge.title = entry.title;
      badge.append(medal(entry, true));
      medals.append(badge);
    }
  } else {
    const empty = n('div', 'achievements-hero__empty');
    empty.append(ctx.icon('achievements'), n('p', '', 'Your first badge is waiting. Complete an achievement below to unlock it.'));
    medals.append(empty);
  }
  showcase.append(heading, medals);
  hero.append(intro, showcase);

  const toolbar = n('div', 'achievements-toolbar');
  const filters = n('div', 'achievement-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter achievements');
  for (const [value, label] of [['in-progress', 'In progress'], ['completed', 'Completed'], ['all', 'All']]) {
    const tab = button(label, 'achievement-filter', () => {
      ctx.ui.achievementFilter = value;
      ctx.refresh('achievements', `achievement-filter-${value}`);
    });
    tab.id = `achievement-filter-${value}`;
    tab.setAttribute('aria-pressed', String(filter === value));
    tab.setAttribute('aria-controls', 'achievement-results');
    filters.append(tab);
  }
  const history = ctx.link('history', 'Reward history', 'achievements-history');
  history.append(ctx.icon('history'));
  toolbar.append(filters, history);
  const results = n('div', 'achievements-results');
  results.id = 'achievement-results';
  results.setAttribute('aria-busy', String(busy));
  const visible = entries.filter(entry => filter === 'all' || (filter === 'completed' ? entry.complete : !entry.complete));
  const grid = n('div', 'achievement-grid');
  for (const entry of visible) {
    const card = n('article', `achievement-card${entry.ready ? ' is-ready' : ''}`);
    card.id = `achievement-${entry.id}`;
    card.tabIndex = -1;
    card.setAttribute('aria-labelledby', `${card.id}-title`);
    const body = n('div', 'achievement-card__body');
    const title = n('h3', '', entry.title);
    title.id = `${card.id}-title`;
    body.append(title, n('p', 'achievement-card__description', entry.description));
    const reward = n('div', 'achievement-card__reward');
    const coin = n('img');
    coin.src = 'assets/coins/gold-coin-front.png';
    coin.alt = '';
    coin.width = 18;
    coin.height = 18;
    reward.append(coin, n('strong', '', `${format(entry.amount)} GC`));
    const status = entry.claimed ? 'Collected' : entry.ready ? 'Ready to collect' : 'In progress';
    const progress = n('progress', 'achievement-card__progress');
    progress.max = 1;
    progress.value = entry.complete ? 1 : 0;
    progress.setAttribute('aria-label', `${entry.title}: ${status}`);
    body.append(reward, progress);
    const footer = n('div', 'achievement-card__footer');
    footer.append(n('span', `achievement-card__status${entry.complete ? ' is-complete' : ''}`, entry.claimed ? '✓ Collected' : status));
    if (!entry.claimed) {
      if (entry.ready) {
        const claim = button('Collect reward', 'achievement-card__action', () => collect([entry.id]));
        claim.disabled = busy;
        footer.append(claim);
      } else footer.append(ctx.link(entry.target, entry.action, 'achievement-card__action'));
    }
    card.append(medal(entry), body, footer);
    grid.append(card);
  }
  if (visible.length) results.append(grid);
  else {
    const empty = n('div', 'achievements-empty');
    empty.append(ctx.icon('achievements'), n('h3', '', filter === 'completed' ? 'Your collection starts here' : 'You’re all caught up!'),
      n('p', '', filter === 'completed' ? 'Complete an achievement to earn your first badge.' : 'You’ve unlocked every available achievement.'));
    empty.append(button('View all achievements', 'achievement-card__action', () => {
      ctx.ui.achievementFilter = 'all';
      ctx.refresh('achievements', 'achievement-filter-all');
    }));
    results.append(empty);
  }
  const count = n('p', 'achievements-count', `Showing ${visible.length} of ${entries.length} achievements`);
  count.setAttribute('role', 'status');
  const conditions = n('details', 'feature-details achievements-conditions');
  conditions.append(n('summary', '', 'Reward conditions'), n('p', 'feature-muted', 'Each achievement reward can be collected once. Gold Coins are demo coins with no cash value. Your collected rewards stay in your reward history.'));
  root.append(hero, toolbar, results, count, conditions);
  return root;
}
