// Local prototype content. Rewards use the local demo ledger; vendor wagers,
// purchases, referrals and VIP eligibility are not connected to these pages.
export const DEMO_TASKS = Object.freeze([
  Object.freeze({ id: 'complete-profile', title: 'Make it yours', description: 'Choose your display name in Profile.', amount: 500, target: 'profile', action: 'Edit profile' }),
  Object.freeze({ id: 'first-game', title: 'Try your first game', description: 'Open a game from the casino lobby.', amount: 500, target: 'popular', action: 'Browse games' }),
  Object.freeze({ id: 'daily-check-in', title: 'Your daily check-in', description: 'Collect your first Daily Bonus.', amount: 250, target: 'daily-bonus', action: 'Daily Bonus' }),
]);

export const DEMO_RANKS = Object.freeze([
  Object.freeze({ name: 'Starter', games: 0 }),
  Object.freeze({ name: 'Explorer', games: 3 }),
  Object.freeze({ name: 'Regular', games: 10 }),
  Object.freeze({ name: 'Insider', games: 25 }),
  Object.freeze({ name: 'Legend', games: 50 }),
]);

const amount = value => new Intl.NumberFormat('en-US').format(value);
const gameCount = state => new Set(Array.isArray(state.discoveredGameIds) ? state.discoveredGameIds
  : (state.history || []).filter(item => item.type === 'game' && item.gameId).map(item => item.gameId)).size;

export function getDemoRank(state) {
  const games = gameCount(state);
  const index = DEMO_RANKS.findLastIndex(rank => games >= rank.games);
  const current = DEMO_RANKS[Math.max(0, index)];
  const next = DEMO_RANKS[index + 1] || null;
  const progress = next ? Math.min(1, (games - current.games) / (next.games - current.games)) : 1;
  return { current, next, games, progress };
}

export function taskComplete(id, state) {
  if (id === 'complete-profile') return Boolean(state.profile?.displayName?.trim() && state.profile.displayName.trim() !== 'Loop Player');
  if (id === 'first-game') return gameCount(state) > 0 || (state.history || []).some(item => item.type === 'game');
  if (id === 'daily-check-in') return (state.daily?.totalClaims || 0) > 0;
  return false;
}

function tools(ctx) {
  const n = ctx.node;
  const stack = (...children) => {
    const el = n('div', 'feature-stack');
    el.append(...children.filter(Boolean));
    return el;
  };
  const grid = (...children) => {
    const el = n('div', 'feature-grid');
    el.append(...children.filter(Boolean));
    return el;
  };
  const card = (title, description, iconId, ...children) => {
    const el = n('section', 'feature-card');
    if (iconId) {
      const icon = n('span', 'feature-card__icon');
      icon.append(ctx.icon(iconId));
      el.append(icon);
    }
    el.append(n('h2', '', title));
    if (description) el.append(n('p', 'feature-muted', description));
    el.append(...children.filter(Boolean));
    return el;
  };
  const button = (label, action, disabled = false) => {
    const el = n('button', 'feature-button', label);
    el.type = 'button';
    el.disabled = disabled;
    el.addEventListener('click', action);
    return el;
  };
  const note = text => n('p', 'feature-muted', text);
  const stats = values => {
    const list = n('dl', 'feature-stats');
    for (const [label, value] of values) {
      const item = n('div', 'feature-stat');
      item.append(n('dt', 'feature-muted', label), n('dd', '', String(value)));
      list.append(item);
    }
    return list;
  };
  const progress = (value, label) => {
    const el = n('progress', 'feature-progress');
    el.max = 1;
    el.value = value;
    el.setAttribute('aria-label', label);
    return el;
  };
  const details = (label, text) => {
    const el = n('details', 'feature-details');
    el.append(n('summary', '', label), note(text));
    return el;
  };
  return { n, stack, grid, card, button, note, stats, progress, details };
}

function lounge(ctx, t) {
  const state = ctx.state();
  const daily = ctx.dailyStatus();
  return t.stack(
    t.card(`Welcome, ${state.profile?.displayName || 'Loop Player'}`, 'Your bonuses, membership and invitations in one place.', 'lounge',
      t.stats([['Daily Bonus', daily.available ? 'Ready to collect' : 'Collected today'], ['Demo rank', getDemoRank(state).current.name]])),
    t.grid(
      t.card('VIP Club', 'Explore member benefits and the proposed VIP experience.', 'vip-club', ctx.link('vip-club', 'Explore VIP')),
      t.card('Daily Bonus', `${amount(daily.amount)} GC for your next daily check-in.`, 'daily-bonus', ctx.link('daily-bonus', daily.available ? 'Collect bonus' : 'View streak')),
      t.card('Invite Friends', 'Your invitation code and referral overview.', 'invite-friends', ctx.link('invite-friends', 'Invite friends')),
      t.card('CoinBack', 'A place for rewards returned to your account.', 'coinback', ctx.link('coinback', 'View CoinBack')),
    ),
    t.grid(
      t.card('Missions', 'Small goals to explore the local prototype.', 'missions', ctx.link('missions', 'View missions')),
      t.card('Bonus Hub', 'Browse all available reward areas.', 'bonus-hub', ctx.link('bonus-hub', 'Open Bonus Hub')),
    ),
  );
}

function bonusHub(ctx, t) {
  const state = ctx.state();
  const claimed = (state.taskClaims || []).length;
  return t.stack(
    t.card('Your rewards, together', 'Collect your daily demo bonus, complete missions and explore upcoming benefits.', 'bonus-hub',
      t.stats([['Daily claims', state.daily?.totalClaims || 0], ['Missions collected', `${claimed} / ${DEMO_TASKS.length}`]])),
    t.grid(
      t.card('Daily Bonus', 'A seven-day cycle of Gold Coins rewards.', 'daily-bonus', ctx.link('daily-bonus', 'Daily Bonus')),
      t.card('Free Money', 'Demo rewards for getting to know the platform.', 'free-money', ctx.link('free-money', 'View tasks')),
      t.card('Promotions', 'Discover the current promotion concepts.', 'promotions', ctx.link('promotions', 'Browse promotions')),
      t.card('VIP Club', 'Preview exclusive member benefits.', 'vip-club', ctx.link('vip-club', 'Explore VIP')),
      t.card('CoinBack', 'Your future CoinBack rewards will live here.', 'coinback', ctx.link('coinback', 'View CoinBack')),
      t.card('Invite Friends', 'Keep your invitation tools in one place.', 'invite-friends', ctx.link('invite-friends', 'Invite friends')),
    ),
    t.details('How demo rewards work', 'Gold Coins collected here are saved only in this browser. They have no cash value and do not change the separate play balance inside provider demos.'),
  );
}

function dailyBonus(ctx, t) {
  const daily = ctx.dailyStatus();
  const days = t.n('ol', 'feature-grid feature-grid--days');
  for (let day = 1; day <= 7; day++) {
    const el = t.n('li', 'feature-card feature-day');
    const collected = daily.available ? day < daily.nextDay : day <= daily.streak;
    const current = daily.available && day === daily.nextDay;
    if (current) el.setAttribute('aria-current', 'step');
    el.dataset.status = collected ? 'collected' : current ? 'available' : 'upcoming';
    el.append(t.n('span', 'feature-kicker', `Day ${day}`), t.n('strong', '', `${amount(day * 1000)} GC`),
      t.n('small', 'feature-muted', collected ? 'Collected' : current ? 'Ready' : 'Upcoming'));
    days.append(el);
  }
  const claim = t.button(daily.available ? `Collect ${amount(daily.amount)} GC` : 'Collected today', () => {
    const result = ctx.claimDaily();
    ctx.notify(result.ok ? `${amount(result.amount)} demo GC added to your balance.` : result.reason || 'Your bonus has already been collected today.');
  }, !daily.available);
  const time = daily.nextAt ? new Date(daily.nextAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'tomorrow';
  return t.stack(
    t.card('A little luck, every day', 'Check in on consecutive days to grow your Gold Coins bonus.', 'daily-bonus',
      t.stats([['Current streak', `${daily.streak || 0} ${daily.streak === 1 ? 'day' : 'days'}`], ['Today’s reward', `${amount(daily.amount)} GC`]]), claim,
      t.note(daily.available ? 'Available now. This is a local demo reward.' : `Your next bonus is available ${time}.`)),
    days,
    t.details('About your streak', 'Collect once per calendar day in this device’s local time. Consecutive claims advance from Day 1 to Day 7; after Day 7, a new cycle begins. Missing a day starts a new cycle at Day 1.'),
    t.details('Where the coins go', 'Claimed Gold Coins update the header balance and your local reward history. Provider games keep their own independent demo balances.'),
    ctx.link('history', 'View reward history'),
  );
}

function vipClub(ctx, t) {
  return t.stack(
    t.card('A more personal experience', 'A first look at the Loop VIP Club. Membership rules and rewards are still being designed.', 'vip-club',
      t.n('span', 'feature-kicker', 'Program preview'), ctx.link('rank-system', 'View your demo rank')),
    t.n('h2', 'feature-section-title', 'Member benefits'),
    t.grid(
      t.card('Personal service', 'A dedicated place for member support and requests.', 'support', ctx.link('support', 'Support center')),
      t.card('Exclusive offers', 'A proposed home for member-only promotions.', 'promotions', ctx.link('promotions', 'Explore promotions')),
      t.card('Birthday surprises', 'A reward concept to celebrate member milestones.', 'bonus-hub', t.note('Preview · not active')),
      t.card('CoinBack rewards', 'Track future CoinBack eligibility and rewards.', 'coinback', ctx.link('coinback', 'View CoinBack')),
    ),
    t.details('How will VIP membership work?', 'This page defines the proposed structure. Qualification, benefit amounts and availability have not been configured. Your demo rank currently reflects only the different games you have opened locally.'),
    t.details('Already a VIP elsewhere?', 'A VIP transfer flow could be added here later. This prototype does not collect evidence, accept applications or grant a real VIP status.'),
  );
}

function rankSystem(ctx, t) {
  const rank = getDemoRank(ctx.state());
  const list = t.n('ol', 'feature-grid feature-grid--3');
  for (const level of DEMO_RANKS) {
    const el = t.card(level.name, `${level.games} different games opened`, 'rank-system',
      t.n('span', 'feature-kicker', level === rank.current ? 'Current rank' : rank.games >= level.games ? 'Reached' : 'Upcoming'));
    const item = t.n('li', 'feature-list-item');
    if (level === rank.current) item.setAttribute('aria-current', 'step');
    item.append(el);
    list.append(item);
  }
  return t.stack(
    t.card(rank.current.name, 'Your local activity rank', 'rank-system',
      t.stats([['Different games opened', rank.games], ['Next rank', rank.next?.name || 'Top demo rank']]),
      t.progress(rank.progress, rank.next ? `Progress to ${rank.next.name}` : 'Top demo rank reached'),
      t.note(rank.next ? `Open ${Math.max(0, rank.next.games - rank.games)} more different games to reach ${rank.next.name}.` : 'You have explored all the current demo ranks.'),
      ctx.link('popular', 'Explore games')),
    list,
    t.note('Demo progression only. No wagers, purchases or provider outcomes are tracked, and ranks do not unlock monetary benefits.'),
    ctx.link('vip-club', 'Explore VIP Club'),
  );
}

function missions(ctx, t, isFreeMoney = false) {
  const state = ctx.state();
  const claimed = new Set(state.taskClaims || []);
  const cards = DEMO_TASKS.map(task => {
    const complete = taskComplete(task.id, state);
    const collected = claimed.has(task.id);
    return t.card(task.title, task.description, 'missions',
      t.n('strong', '', `${amount(task.amount)} GC`),
      t.n('p', 'feature-kicker', collected ? 'Collected' : complete ? 'Ready to collect' : 'In progress'),
      t.progress(complete ? 1 : 0, `${task.title} progress`),
      collected ? t.note('Added to your local demo balance.') : complete
        ? t.button('Collect reward', () => {
          const result = ctx.claimTask(task.id);
          ctx.notify(result.ok ? `${amount(result.amount)} demo GC added to your balance.` : result.reason || 'This reward is not available.');
        }) : ctx.link(task.target, task.action));
  });
  return t.stack(
    t.card(isFreeMoney ? 'Small tasks. A little extra luck.' : 'Your next small goal', 'Explore the prototype and collect local demo Gold Coins along the way.', isFreeMoney ? 'free-money' : 'missions',
      t.stats([['Missions', DEMO_TASKS.length], ['Collected', claimed.size]])),
    t.grid(...cards),
    t.details('Reward conditions', 'Each mission reward can be collected once in this browser. These are local demo coins with no cash value; no social account, purchase or external message is required.'),
    ctx.link('history', 'View reward history'),
  );
}

function inviteFriends(ctx, t) {
  const name = ctx.state().profile?.displayName || 'Loop Player';
  const code = `LOOP-${name.replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase() || 'PLAYER'}`;
  const url = `${window.location.origin}${window.location.pathname}#/invite-friends?ref=${encodeURIComponent(code)}`;
  const field = t.n('input', 'feature-input');
  field.type = 'text';
  field.value = url;
  field.readOnly = true;
  field.setAttribute('aria-label', 'Invitation link preview');
  const copy = t.button('Copy invitation link', async () => {
    const ok = await ctx.copy(url);
    if (ok !== false) ctx.notify('Invitation link copied. Referral tracking is not connected yet.');
  });
  return t.stack(
    t.card('Better with friends', 'A place to invite friends and see your future referral rewards.', 'invite-friends',
      t.n('p', 'feature-kicker', 'Invitation preview'), field, copy,
      t.note('This link opens the local prototype. It does not register invitations or promise a reward.')),
    t.stats([['Your code', code], ['Tracked invitations', 'Not connected'], ['Referral rewards', 'Not active']]),
    t.grid(
      t.card('1. Share your link', 'Copy your invitation link when the referral program is ready.', 'invite-friends'),
      t.card('2. Welcome your friends', 'A future referral flow will connect a new account to an invitation.', 'profile'),
      t.card('3. Track your rewards', 'Eligible referrals and reward status will appear here.', 'history'),
    ),
    ctx.link('partners', 'Partner programs'),
  );
}

function coinback(ctx, t) {
  return t.stack(
    t.card('Your CoinBack', 'A dedicated home for CoinBack rewards and their collection status.', 'coinback',
      t.stats([['Available to collect', '0 GC'], ['Collected', '0 GC']]),
      t.note('Program preview · CoinBack rules and eligibility are not connected.')),
    t.card('No CoinBack rewards yet', 'When the program is configured, eligible rewards and their conditions will appear here.', null,
      ctx.link('bonus-hub', 'Explore other rewards')),
    t.details('How CoinBack will work', 'This area will display the reward calculation, qualifying activity and collection window. No percentage or return is promised, and provider game outcomes are not available to this prototype.'),
    ctx.link('history', 'View history'),
  );
}

function promotions(ctx, t) {
  return t.stack(
    t.note('Promotion concepts for the prototype. Active local demo rewards are marked below.'),
    t.grid(
      t.card('Daily check-in', 'Collect a growing Gold Coins reward for up to seven consecutive days.', 'daily-bonus',
        t.n('span', 'feature-kicker', 'Local demo reward'), ctx.link('daily-bonus', 'View Daily Bonus')),
      t.card('Explore and collect', 'Complete three introductory missions around the platform.', 'missions',
        t.n('span', 'feature-kicker', 'Local demo reward'), ctx.link('missions', 'View missions')),
      t.card('Member offers', 'A future home for personalized member promotions.', 'vip-club',
        t.n('span', 'feature-kicker', 'Program preview'), ctx.link('vip-club', 'Explore VIP')),
      t.card('Invite friends', 'Preview your invitation link and referral overview.', 'invite-friends',
        t.n('span', 'feature-kicker', 'Program preview'), ctx.link('invite-friends', 'View invitations')),
    ),
    t.details('Promotion details', 'Every future promotion will show eligibility, reward amounts, expiry and conditions before it can be claimed. The current local prototype has no paid promotions or real prize fulfillment.'),
  );
}

function partners(ctx, t) {
  return t.stack(
    t.card('Grow the Loop', 'Two ways to introduce people to the platform.', 'partners'),
    t.grid(
      t.card('Invite Friends', 'A personal invitation code for sharing with your friends.', 'invite-friends', ctx.link('invite-friends', 'Your invitation link')),
      t.card('Affiliate Program', 'A separate area for creators, publishers and partner collaborations.', 'affiliate-program', ctx.link('affiliate-program', 'Explore the program')),
    ),
    t.note('Both programs are in preview. Tracking, eligibility and commercial terms have not been activated.'),
  );
}

function affiliateProgram(ctx, t) {
  return t.stack(
    t.card('Built for future partners', 'A workspace for creators and publishers to follow their partnerships.', 'affiliate-program',
      t.n('p', 'feature-kicker', 'Program preview')),
    t.stats([['Program status', 'Not active'], ['Tracking', 'Not connected'], ['Commission terms', 'To be defined']]),
    t.grid(
      t.card('Partner profile', 'A future application will capture your audience, channels and contact preferences.', 'profile'),
      t.card('Campaign tools', 'Approved creative assets and campaign links will live here.', 'partners'),
      t.card('Partner reporting', 'A dedicated reporting area will show verified activity and payment status.', 'history'),
    ),
    t.details('How do I apply?', 'Applications are not open in this prototype. No personal information is sent or saved to an external partner service.'),
    ctx.link('support', 'Open support center'), ctx.link('partners', 'Back to partner programs'),
  );
}

function cryptoEarn(ctx, t) {
  return t.stack(
    t.card('Crypto & Earn', 'A place to explore future reward tools, kept separate from casino play.', 'crypto-earn',
      t.n('p', 'feature-kicker', 'Concept preview · not connected')),
    t.grid(
      t.card('Reward drops', 'A possible home for platform reward campaigns and their eligibility.', 'bonus-hub', ctx.link('bonus-hub', 'View current demo rewards')),
      t.card('Partner rewards', 'Explore the proposed invitation and partner areas.', 'partners', ctx.link('partners', 'Explore partners')),
    ),
    t.details('What is available now?', 'No crypto wallet, mining service, swap, deposit or earning product is connected. This page reserves the place in the navigation while the product is being designed.'),
  );
}

export function renderRewardsPage(pageId, ctx) {
  const t = tools(ctx);
  switch (pageId) {
    case 'lounge': return lounge(ctx, t);
    case 'bonus-hub': return bonusHub(ctx, t);
    case 'daily-bonus': return dailyBonus(ctx, t);
    case 'vip-club': return vipClub(ctx, t);
    case 'rank-system': return rankSystem(ctx, t);
    case 'free-money': return missions(ctx, t, true);
    case 'missions': return missions(ctx, t);
    case 'invite-friends': return inviteFriends(ctx, t);
    case 'coinback': return coinback(ctx, t);
    case 'promotions': return promotions(ctx, t);
    case 'partners': return partners(ctx, t);
    case 'affiliate-program': return affiliateProgram(ctx, t);
    case 'crypto-earn': return cryptoEarn(ctx, t);
    default: return null;
  }
}
