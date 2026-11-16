import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getAchievements } from '../public/rewards-pages.js';
import { ACHIEVEMENTS, formatAchievementRewards } from '../public/achievement-catalog.js';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';

const source = (await readFile(new URL('../public/rewards-popover.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function initRewardsPopover', 'function initRewardsPopover');

function page({ member = {}, hold, failure, signedIn = true, details = false, nativePopover = true } = {}) {
  const subscribers = [], navigations = [], calls = [], opened = [], registrations = [];
  const document = { hidden: false, activeElement: null, documentElement: { clientWidth: 1280 }, addEventListener() {} };
  class Element {
    constructor(tag, id = '') { this.tagName = tag; this.id = id; this.className = ''; this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.textContent = ''; this.hidden = false; this.style = { setProperty() {} }; }
    append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
    after(...items) { const parent = this.parentElement; for (const item of items) item.parentElement = parent; parent.children.splice(parent.children.indexOf(this) + 1, 0, ...items); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    addEventListener(name, action) { this.listeners[name] = action; }
    setAttribute(name, value) { this.attributes[name] = value; }
    matches(selector) { return selector === ':popover-open' ? this.open : selector.startsWith('#') ? this.id === selector.slice(1) : selector.startsWith('.') ? this.className.split(' ').includes(selector.slice(1)) : selector === '[data-rewards-page]' ? Boolean(this.dataset.rewardsPage) : this.tagName === selector; }
    querySelector(selector) { for (const child of this.children) { if (child.matches(selector)) return child; const nested = child.querySelector(selector); if (nested) return nested; } return null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    getBoundingClientRect() { return { width: 90, height: 44, bottom: 60, right: 1200 }; }
    focus() { document.activeElement = this; }
    showPopover() { let prevented = false; this.listeners.beforetoggle?.({ newState: 'open', preventDefault() { prevented = true; } }); if (!prevented) this.open = true; }
    hidePopover() { this.open = false; }
    click() { if (!this.disabled) return this.listeners.click?.({ target: this }); }
  }
  const root = new Element('main'), trigger = new Element('button', 'header-rewards'), panel = new Element('section', 'rewards-popover');
  panel.append(new Element('h2', 'rewards-popover-title'));
  const section = new Element('section'), missions = new Element('ul', 'rewards-missions'), link = new Element('a');
  link.dataset.rewardsPage = 'achievements';
  link.className = 'rewards-popover__more'; link.textContent = 'Show more';
  section.append(missions, link); panel.append(section); root.append(trigger, panel);
  if (!nativePopover) panel.showPopover = undefined;
  document.querySelector = selector => root.querySelector(selector);
  document.createElement = tag => new Element(tag);
  let saved = createDemoAccount({ member });
  saved.auth = { signedIn };
  const emit = () => subscribers.forEach(listener => listener());
  const account = {
    isSignedIn: () => saved.auth.signedIn,
    getMemberState: () => { assert.equal(saved.auth.signedIn, true, 'guest previews must not read private member state'); return accountMemberState(saved); },
    subscribe: listener => subscribers.push(listener),
    async claimTask(id) {
      calls.push(id);
      if (hold) await hold;
      if (failure === 'throw') throw new Error('Storage unavailable');
      if (failure) return { ok: false, reason: 'Please retry your claim.' };
      const outcome = applyAccountCommand(saved, { type: 'claim-task', taskId: id });
      saved = outcome.account; emit(); return outcome.result;
    },
  };
  const context = { document, account, getAchievements, ACHIEVEMENTS, formatAchievementRewards, Intl, createShelfIcon: () => new Element('svg'),
    window: { addEventListener() {} }, router: { navigate: route => navigations.push(route), subscribe() {} },
    openAchievement: details ? id => opened.push(id) : undefined,
    openRegistration: () => registrations.push({ popoverOpen: Boolean(panel.open) }) };
  vm.runInNewContext(`${source}\ninitRewardsPopover({ router, account, openAchievement, openRegistration });`, context);
  return { panel, trigger, missions, calls, navigations, opened, registrations, query: selector => panel.querySelector(selector),
    open: () => panel.showPopover(), saved: () => saved, fail: value => { failure = value; },
    externalClaim(id) { saved = applyAccountCommand(saved, { type: 'claim-task', taskId: id }).account; emit(); },
    logout() { saved.auth.signedIn = false; emit(); }, login() { saved.auth.signedIn = true; emit(); } };
}

const fullMember = {
  profile: { displayName: 'Alex', avatar: '★' }, favorites: Array.from({ length: 75 }, (_, i) => `game-${i}`),
  discoveredGameIds: Array.from({ length: 150 }, (_, i) => `game-${i}`),
  attendance: { lastVisit: new Date().toISOString(), streak: 30, bestStreak: 30 },
  achievementStats: { playSCUnits: 3150000, loyaltySCUnits: 130000000, emailVerified: true, phoneVerified: true },
};

test('with no claimable rewards, two unfinished achievements open details without claiming or inflating the badge', () => {
  const view = page({ member: { attendance: { bestStreak: 1 }, taskClaims: ['welcome-member'] }, details: true });
  view.open();
  assert.deepEqual(view.missions.children.map(row => row.dataset.rewardId), ['limit-breaker-1', 'limit-breaker-2']);
  assert.equal(view.query('.rewards-popover__empty').hidden, true);
  assert.equal(view.trigger.querySelector('.rewards-count').hidden, true);
  assert.equal(view.query('.reward-preview__claim'), null);
  assert.match(view.query('.reward-preview__status').textContent, /Reach 70 SC/);
  view.missions.children[0].querySelector('.reward-preview__show-more').click();
  assert.deepEqual(view.opened, ['limit-breaker-1']); assert.equal(view.panel.open, false);
  view.open(); view.missions.children[1].querySelector('.reward-preview__details').click();
  assert.deepEqual(view.opened, ['limit-breaker-1', 'limit-breaker-2']); assert.equal(view.calls.length, 0);
  assert.equal(view.saved().wallet.balances.GC, 0);
});

test('the popup stays at two eligible rewards and the quiet footer opens the full achievements page', () => {
  const view = page({ member: fullMember });
  assert.equal(view.trigger.querySelector('.rewards-count').textContent, '55');
  assert.equal(view.query('.rewards-count').textContent, '55');
  view.open();
  assert.equal(view.missions.children.length, 2);
  assert.ok(view.missions.children.every(row => getAchievements(view.saved().member).some(task => task.id === row.dataset.rewardId && task.ready)));
  assert.ok(view.missions.children.every(row => row.querySelector('button').textContent === 'Claim'));
  const link = view.query('.rewards-popover__more');
  view.panel.listeners.click({ target: { closest: () => link }, preventDefault() {} });
  assert.equal(view.navigations[0].pageId, 'achievements'); assert.equal(view.panel.open, false);
  view.panel.hidePopover(); view.open();
  assert.equal(view.missions.children.length, 2);
});

test('a claim credits once, blocks concurrent clicks and removes the claimed row from the popup', async () => {
  let release;
  const view = page({ member: fullMember, hold: new Promise(resolve => { release = resolve; }) });
  view.open();
  const button = view.missions.children[0].querySelector('button'), id = view.missions.children[0].dataset.rewardId;
  const first = button.click();
  await button.click();
  assert.equal(view.calls.length, 1);
  assert.ok(view.missions.children.every(row => row.querySelector('button').disabled));
  release(); await first;
  assert.equal(view.saved().wallet.balances.GC, 2500);
  assert.equal(view.saved().wallet.balances.SC, 25);
  assert.equal(view.saved().ledger.filter(entry => entry.operationKey === `task:${id}`).length, 1);
  assert.ok(view.missions.children.every(row => row.dataset.rewardId !== id));
  assert.equal(view.missions.children.length, 2, 'the next ready reward fills the vacancy');
  assert.equal(view.query('.rewards-popover__notice').textContent, '2,500 GC + 0.25 SC claimed.');
  assert.equal(view.trigger.querySelector('.rewards-count').textContent, '54');
  assert.equal(view.query('.rewards-count').textContent, '54');
});

test('failed claims stay available; collecting the last reward switches to unfinished suggestions', async () => {
  const view = page({ member: { attendance: { bestStreak: 1 } }, failure: 'rejected' });
  view.open();
  await view.missions.children[0].querySelector('button').click();
  assert.equal(view.missions.children.length, 1);
  assert.equal(view.saved().wallet.balances.GC, 0);
  assert.equal(view.query('.rewards-popover__notice').textContent, 'Please retry your claim.');
  assert.equal(view.trigger.querySelector('.rewards-count').textContent, '1');
  view.fail('throw');
  await view.missions.children[0].querySelector('button').click();
  assert.match(view.query('.rewards-popover__notice').textContent, /Unable to claim/);
  assert.equal(view.missions.children[0].querySelector('button').disabled, false);
  view.fail(false);
  await view.missions.children[0].querySelector('button').click();
  assert.equal(view.missions.children.length, 2);
  assert.equal(view.query('.rewards-popover__empty').hidden, true);
  assert.equal(view.query('.reward-preview__claim'), null);
  assert.ok(view.missions.children.every(row => row.querySelector('.reward-preview__show-more')));
  assert.equal(view.saved().wallet.balances.GC, 50000);
  assert.equal(view.trigger.querySelector('.rewards-count').hidden, true);
  assert.equal(view.query('.rewards-count').hidden, true);
});

test('fully completed accounts have no suggestions, collected entries or claim badge', () => {
  const view = page({ member: { ...fullMember, taskClaims: getAchievements(fullMember).map(task => task.id) } });
  view.open();
  assert.equal(view.missions.children.length, 0);
  assert.equal(view.query('.rewards-popover__empty').hidden, false);
  assert.equal(view.query('.rewards-popover__empty').textContent, 'All achievements completed.');
  assert.equal(view.trigger.querySelector('.rewards-count').hidden, true);
});

test('claims from another surface update the open popup and logout clears private rows', () => {
  const view = page({ member: fullMember });
  view.open();
  const id = view.missions.children[0].dataset.rewardId;
  view.externalClaim(id);
  assert.ok(view.missions.children.every(row => row.dataset.rewardId !== id));
  view.logout();
  assert.equal(view.trigger.querySelector('.rewards-count').hidden, false);
  assert.equal(view.trigger.querySelector('.rewards-count').textContent, '1');
  assert.equal(view.query('.rewards-count').hidden, true);
  assert.equal(view.panel.open, false);
  assert.deepEqual(view.missions.children.map(row => row.dataset.rewardId), ['verify-email', 'loyalty-tier-1']);
  view.open();
  assert.equal(view.panel.open, true);
  assert.ok(view.missions.children.every(row => row.querySelector('.reward-preview__join')));
});

test('guests see two public rewards and both Join & Unlock actions open registration without claims', () => {
  const view = page({ signedIn: false, member: { ...fullMember, taskClaims: ACHIEVEMENTS.map(task => task.id) }, details: true });
  const before = structuredClone(view.saved());
  for (let index = 0; index < 2; index++) {
    view.open();
    assert.equal(view.panel.open, true);
    assert.deepEqual(view.missions.children.map(row => row.dataset.rewardId), ['verify-email', 'loyalty-tier-1']);
    assert.equal(view.trigger.querySelector('.rewards-count').hidden, false);
    assert.equal(view.trigger.querySelector('.rewards-count').textContent, '1');
    assert.equal(view.query('.rewards-count').hidden, true);
    const join = view.missions.children[index].querySelector('.reward-preview__join');
    assert.equal(join.textContent, 'Join & Unlock');
    join.click();
    assert.equal(view.panel.open, false);
  }
  assert.deepEqual(view.registrations, [{ popoverOpen: false }, { popoverOpen: false }]);
  assert.deepEqual(view.calls, []);
  assert.deepEqual(view.opened, []);
  assert.deepEqual(view.saved(), before);
});

test('guest reward cards and Show more open registration; sign-in restores member rewards and their real count', () => {
  const view = page({ signedIn: false, member: fullMember, details: true });
  view.open();
  view.missions.children[0].querySelector('.reward-preview__details').click();
  view.open();
  const link = view.query('.rewards-popover__more');
  view.panel.listeners.click({ target: { closest: () => link }, preventDefault() {} });
  assert.equal(view.registrations.length, 2);
  assert.deepEqual(view.navigations, []);
  view.open();
  view.login();
  assert.equal(view.panel.open, false, 'close before moving the header anchor after sign-in');
  view.open();
  assert.equal(view.query('.reward-preview__join'), null);
  assert.equal(view.trigger.querySelector('.rewards-count').textContent, '55');
  assert.ok(view.query('.reward-preview__claim'));
});

test('without native popovers the guest Rewards button opens registration, while members open achievements', () => {
  const guest = page({ signedIn: false, nativePopover: false });
  guest.trigger.click();
  assert.equal(guest.registrations.length, 1);
  assert.equal(guest.navigations.length, 0);
  const member = page({ nativePopover: false });
  member.trigger.click();
  assert.equal(member.navigations[0].pageId, 'achievements');
});

test('the member claim count updates while closed; guests have one invitation indicator', () => {
  const view = page({ member: { attendance: { bestStreak: 2, streak: 2 }, taskClaims: ['welcome-member'] } });
  const badge = view.trigger.querySelector('.rewards-count');
  assert.equal(badge.textContent, '1');
  assert.equal(badge.hidden, false);
  assert.equal(view.trigger.attributes['aria-label'], 'Rewards, 1 reward ready to claim');
  view.externalClaim('login-streak-2');
  assert.equal(badge.hidden, true);
  assert.equal(view.query('.rewards-count').hidden, true);
  assert.equal(view.trigger.attributes['aria-label'], 'Rewards');
  const guest = page({ signedIn: false, member: fullMember });
  assert.equal(guest.trigger.querySelector('.rewards-count').hidden, false);
  assert.equal(guest.trigger.querySelector('.rewards-count').textContent, '1');
  assert.equal(guest.trigger.attributes['aria-label'], 'Rewards, 1 new notification');
  assert.equal(guest.query('.rewards-count').hidden, true);
});
