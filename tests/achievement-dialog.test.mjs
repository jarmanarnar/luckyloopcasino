import { requestDialogClose } from '../public/dialog-motion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getAchievements } from '../public/rewards-pages.js';
import { achievementMedal, formatAchievementProgress as format } from '../public/achievements-view.js';
import { formatAchievementRewards } from '../public/achievement-catalog.js';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';
const source = (await readFile(new URL('../public/achievement-dialog.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace('export function initAchievementDialog', 'function initAchievementDialog');

function page({ hold, failure = false, signedIn = true, member = { attendance: { bestStreak: 5, streak: 5 } } } = {}) {
  const nodes = [], listeners = [];
  const document = { activeElement: null };
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this.dataset = {}; this.style = { setProperty() {} }; this.textContent = ''; this.className = ''; nodes.push(this); }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.events[key] = fn; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
    querySelector(selector) { for (const child of this.children) { if (child.tag === selector) return child; const result = child.querySelector(selector); if (result) return result; } return null; }
    click() { if (!this.disabled) return this.events.click?.({ target: this }); }
  }
  document.body = new Element('body'); document.createElement = tag => new Element(tag);
  document.querySelector = selector => selector === 'dialog[open]' ? nodes.find(node => node.tag === 'dialog' && node.open) : null;
  document.getElementById = id => nodes.find(node => node.id === id);
  let saved = createDemoAccount({ member }); saved.auth = { signedIn };
  let calls = 0, memberReads = 0, authRequired = 0;
  const registrations = [], verifications = [], navigations = [];
  const account = {
    getSnapshot: () => saved, getMemberState: () => { memberReads++; return accountMemberState(saved); }, isSignedIn: () => saved.auth.signedIn, subscribe: fn => listeners.push(fn),
    getCapabilities: () => ({ verification: { email: true, phone: true }, gameEvents: true }),
    async claimTask(taskId) { calls++; if (hold) await hold; if (failure) throw new Error('Storage unavailable'); const outcome = applyAccountCommand(saved, { type: 'claim-task', taskId }); saved = outcome.account; listeners.forEach(fn => fn()); return outcome.result; },
  };
  const icon = () => new Element('svg');
  const context = { requestDialogClose, document, account, getAchievements, achievementMedal, format, formatAchievementRewards, createShelfIcon: icon, createUiIcon: icon,
    openVerification: metric => verifications.push(metric),
    auth: { require: fn => { authRequired++; return fn(); }, open: mode => registrations.push({ mode, detailOpen: document.getElementById('achievement-dialog').open }) },
    router: { subscribe() {}, navigate: route => navigations.push(route) } };
  const api = vm.runInNewContext(`${source}\ninitAchievementDialog({ account, auth, router, openVerification, document });`, context);
  const dialog = document.getElementById('achievement-dialog');
  const tree = node => [node, ...node.children.flatMap(tree)];
  return { api, dialog, document, account, registrations, verifications, navigations,
    get calls() { return calls; }, get memberReads() { return memberReads; }, get authRequired() { return authRequired; },
    fail: value => { failure = value; }, update: change => { change?.(saved); listeners.forEach(fn => fn()); },
    find: text => tree(dialog).find(node => node.textContent === text),
    notice: () => tree(dialog).find(node => node.className === 'achievement-dialog__notice').textContent };
}

test('guests browse catalog details with zero progress without reading a saved player or prompting for authentication', () => {
  const view = page({ signedIn: false, member: {
    attendance: { bestStreak: 30, streak: 30 }, taskClaims: ['welcome-member', 'login-streak-4'],
    achievementStats: { playSCUnits: 3150000, loyaltySCUnits: 130000000, emailVerified: true, phoneVerified: true },
  } });
  view.account.getSnapshot().ledger.push({ source: 'task', sourceId: 'welcome-member', currency: 'GC', amountUnits: 1234 });
  for (const [id, progress] of [['welcome-member', '0 / 1'], ['login-streak-4', '0 / 4'], ['verify-email', '0 / 1'],
    ['verify-phone', '0 / 1'], ['limit-breaker-1', '0 / 70'], ['loyalty-tier-1', '0 / 100']]) {
    view.api.open(id);
    assert.equal(view.dialog.open, true); assert.ok(view.find(progress));
    assert.ok(view.find('Close')); assert.ok(view.find('Join & Unlock'));
    assert.equal(view.find('Claim'), undefined); assert.equal(view.find('Verify Email'), undefined); assert.equal(view.find('Verify Phone'), undefined);
    if (id === 'welcome-member') { assert.ok(view.find('50K GC Reward')); assert.ok(view.find('50,000')); assert.equal(view.find('1,234'), undefined); }
    if (id === 'login-streak-4') { assert.ok(view.find('1,500')); assert.ok(view.find('0.15')); }
    view.update(); assert.equal(view.dialog.open, true); assert.ok(view.find(progress));
    view.find('Close').click();
  }
  assert.equal(view.memberReads, 0); assert.equal(view.authRequired, 0); assert.equal(view.calls, 0);
  assert.deepEqual(view.registrations, []); assert.deepEqual(view.verifications, []); assert.deepEqual(view.navigations, []);
});

test('guest Join & Unlock closes the preview before opening registration and never claims', () => {
  const view = page({ signedIn: false }); view.api.open('verify-email'); view.find('Join & Unlock').click();
  assert.equal(view.dialog.open, false); assert.deepEqual(view.registrations, [{ mode: 'register', detailOpen: false }]);
  view.update(saved => { saved.auth.signedIn = true; });
  assert.equal(view.dialog.open, false); assert.equal(view.calls, 0); assert.deepEqual(view.verifications, []);
});

test('member verification and game actions still work and logout closes private progress', () => {
  const view = page(); view.api.open('verify-email'); view.find('Verify Email').click();
  assert.equal(view.dialog.open, false); assert.deepEqual(view.verifications, ['email']);
  view.api.open('limit-breaker-1'); view.find('Play Now').click();
  assert.equal(view.dialog.open, false); assert.equal(view.navigations[0].type, 'home');
  view.api.open('verify-phone'); const staleVerification = view.find('Verify Phone'); view.dialog.close();
  view.api.open('login-streak-4'); const staleClaim = view.find('Claim');
  view.update(saved => { saved.auth.signedIn = false; });
  assert.equal(view.dialog.open, false); staleClaim.click(); assert.equal(view.calls, 0);
  staleVerification.click(); assert.deepEqual(view.verifications, ['email']);
  view.api.open('login-streak-4'); assert.ok(view.find('0 / 4')); assert.ok(view.find('Join & Unlock'));
});

test('details claim both currencies once, then show Close while the achievement remains completed', async () => {
  const view = page(); view.api.open('login-streak-4');
  assert.ok(view.find('4 / 4')); assert.ok(view.find('1,500')); assert.ok(view.find('0.15'));
  const claim = view.find('Claim'); await claim.click(); await claim.click();
  assert.equal(view.account.getSnapshot().wallet.balances.GC, 1500);
  assert.equal(view.account.getSnapshot().wallet.balances.SC, 15);
  assert.ok(view.find('Close')); assert.equal(view.find('Claim'), undefined);
  assert.equal(getAchievements(view.account.getMemberState()).find(item => item.id === 'login-streak-4').ready, false);
});

test('failed claims remain retryable; unfinished and already collected details cannot claim', async () => {
  const view = page({ failure: true }); view.api.open('login-streak-4'); await view.find('Claim').click();
  assert.match(view.notice(), /Unable to claim/); assert.equal(view.find('Claim').disabled, false);
  view.fail(false); await view.find('Claim').click(); assert.ok(view.find('Close'));
  view.dialog.close(); view.api.open('login-streak-14');
  assert.ok(view.find('5 / 14')); assert.ok(view.find('Try Your Luck')); assert.equal(view.find('Claim'), undefined);
});

test('closing and opening another detail during a pending claim never strands the new dialog or repeats credit', async () => {
  let release; const view = page({ hold: new Promise(resolve => { release = resolve; }) });
  view.api.open('login-streak-4'); const pending = view.find('Claim').click();
  assert.equal(view.find('Claiming…').disabled, true);
  view.dialog.close(); view.api.open('login-streak-5');
  release(); await pending;
  assert.ok(view.find('5 Days Streak')); assert.equal(view.find('Claim').disabled, false);
  assert.equal(view.notice(), ''); assert.equal(view.calls, 1);
  assert.equal(view.account.getSnapshot().wallet.balances.GC, 1500);
});

test('achievement header and actions remain outside the scrolling details', () => {
  const view = page(); view.api.open('login-streak-4');
  const [header, scroll, actions] = view.dialog.children;
  assert.equal(header.className, 'achievement-dialog__header');
  assert.ok(header.children.some(node => node.attributes['aria-label'] === 'Close achievement'));
  assert.equal(scroll.className, 'achievement-dialog__scroll');
  assert.deepEqual(scroll.children.map(node => node.className), ['achievement-dialog__body', 'achievement-dialog__notice']);
  assert.equal(actions.className, 'achievement-dialog__actions');
  assert.ok(actions.children.includes(view.find('Claim')));
});

test('a queued close event cannot clear a reopened achievement or steal focus from another dialog', () => {
  const view = page();
  view.api.open('verify-email');
  view.dialog.close();
  view.api.open('verify-phone');
  view.dialog.events.close();
  view.update(saved => { saved.member.achievementStats.phoneVerified = true; });
  assert.ok(view.find('Claim'), 'the reopened selection still receives state updates');

  view.dialog.close();
  const opener = view.document.createElement('button'); opener.isConnected = true; opener.focus();
  view.api.open('verify-email');
  view.dialog.open = false;
  const nextDialog = view.document.createElement('dialog'); nextDialog.showModal();
  const nextControl = view.document.createElement('button'); nextControl.focus();
  view.dialog.events.close();
  assert.equal(view.document.activeElement, nextControl, 'an auth or verification handoff keeps its new focus');
});
