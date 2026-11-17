import { formatAchievementRewards } from './achievement-catalog.js';

export const formatAchievementProgress = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

export function achievementMedal(ctx, entry, hero = false) {
  const n = ctx.node;
  const el = n('span', `achievement-medal${entry.complete ? ' is-complete' : ''}${entry.ready ? ' is-ready' : ''}${hero ? ' achievement-medal--hero' : ''}`);
  el.setAttribute('aria-hidden', 'true'); el.dataset.group = entry.group;
  el.style?.setProperty('--achievement-progress', `${Math.min(100, entry.progress / entry.goal * 100)}%`);
  const face = n('span', 'achievement-medal__face');
  if (entry.badge) face.append(n('strong', 'achievement-medal__number', entry.badge), n('span', 'achievement-medal__label', entry.badgeLabel));
  else face.append(ctx.icon(entry.icon || 'achievements'));
  el.append(face); return el;
}

export function renderAchievements(ctx, entries, collect) {
  const n = ctx.node;
  const completed = entries.filter(entry => entry.complete).sort((a, b) => Number(b.ready) - Number(a.ready) || b.goal - a.goal);
  const ready = entries.filter(entry => entry.ready), busy = Boolean(ctx.ui.achievementsCollecting);
  const filter = ctx.ui.achievementFilter || 'all', pageSize = 12;
  const root = n('div', 'achievements');
  const button = (text, className, action) => {
    const el = n('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el;
  };
  const hero = n('section', 'achievements-hero'); hero.setAttribute('aria-label', 'Achievement overview');
  const intro = n('div', 'achievements-hero__intro'), copy = n('div', 'achievements-hero__copy'); copy.append(n('h2', '', 'Your Achievements'));
  const total = n('div', 'achievements-hero__total');
  total.append(ctx.icon('jackpot'), n('strong', '', `${completed.length}/${entries.length}`));
  total.setAttribute('aria-label', `${completed.length} of ${entries.length} achievements completed`); copy.append(total);
  const artwork = n('img', 'achievements-hero__art'); artwork.src = 'assets/hero/cop-coin-achievements-trophy-v1.webp'; artwork.alt = ''; artwork.width = 624; artwork.height = 624; artwork.decoding = 'async';
  intro.append(copy, artwork);
  const showcase = n('div', 'achievements-hero__showcase'), heading = n('div', 'achievements-hero__heading'); heading.append(n('h3', '', 'Completed'));
  const claimAll = button(busy ? 'Claiming…' : 'Claim All Rewards', 'achievement-claim', () => collect(ready.map(entry => entry.id)));
  claimAll.id = 'achievement-claim-all'; claimAll.disabled = busy || ready.length === 0;
  const totals = ready.reduce((sum, entry) => { for (const [code, value] of Object.entries(entry.rewards)) sum[code] = (sum[code] || 0) + value; return sum; }, {});
  claimAll.title = ready.length ? `${formatAchievementRewards(totals)} ready to claim` : 'No rewards ready to claim'; heading.append(claimAll);
  const medals = n('div', 'achievements-hero__medals');
  for (const entry of completed) {
    const badge = button('', 'achievement-award', () => ctx.openAchievement?.(entry.id)); badge.dataset.achievementId = entry.id;
    badge.setAttribute('aria-label', `${entry.title} — ${entry.claimed ? 'reward collected' : 'ready to claim'}`);
    badge.setAttribute('aria-haspopup', 'dialog'); badge.title = entry.title;
    badge.append(achievementMedal(ctx, entry, true)); medals.append(badge);
  }
  if (!completed.length) medals.append(n('p', 'feature-muted', 'Your completed achievements will appear here.'));
  showcase.append(heading, medals); hero.append(intro, showcase);
  const toolbar = n('div', 'achievements-toolbar'), filters = n('div', 'achievement-filters');
  filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Filter achievements');
  for (const [value, label] of [['in-progress', 'In progress'], ['completed', 'Completed'], ['all', 'All']]) {
    const tab = button(label, 'achievement-filter', () => {
      ctx.ui.achievementFilter = value; ctx.ui.achievementLimit = pageSize; ctx.refresh('achievements', `achievement-filter-${value}`);
    });
    tab.id = `achievement-filter-${value}`; tab.setAttribute('aria-pressed', String(filter === value)); tab.setAttribute('aria-controls', 'achievement-results'); filters.append(tab);
  }
  toolbar.append(filters);
  const results = n('div', 'achievements-results'); results.id = 'achievement-results'; results.setAttribute('aria-busy', String(busy));
  const matching = entries.filter(entry => filter === 'all' || (filter === 'completed' ? entry.complete : !entry.complete));
  const visible = matching.slice(0, ctx.ui.achievementLimit || pageSize), grid = n('div', 'achievement-grid');
  for (const entry of visible) {
    const card = button('', `achievement-card${entry.ready ? ' is-ready' : ''}`, () => ctx.openAchievement?.(entry.id));
    card.id = `achievement-${entry.id}`; card.setAttribute('aria-haspopup', 'dialog'); card.setAttribute('aria-label', `View ${entry.title}`);
    const body = n('span', 'achievement-card__body');
    body.append(n('span', 'achievement-card__title', entry.title), n('span', 'achievement-card__description', entry.description));
    card.append(achievementMedal(ctx, entry), body); grid.append(card);
  }
  if (visible.length) results.append(grid);
  else results.append(n('p', 'achievements-empty', filter === 'completed' ? 'No completed achievements yet.' : 'All achievements are completed.'));
  const pagination = n('div', 'achievements-pagination'), count = n('p', 'achievements-count', `Showing ${visible.length} of ${matching.length} achievements`);
  count.setAttribute('role', 'status'); pagination.append(count);
  if (visible.length < matching.length) pagination.append(button('Show more', 'achievement-show-more', () => {
    ctx.ui.achievementLimit = visible.length + pageSize; ctx.refresh('achievements', `achievement-${matching[visible.length].id}`);
  }));
  root.append(hero, toolbar, results, pagination); return root;
}
