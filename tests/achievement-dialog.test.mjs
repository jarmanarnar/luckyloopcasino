import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getAchievements } from '../public/rewards-pages.js';
import { achievementMedal, formatAchievementProgress as format } from '../public/achievements-view.js';
import { formatAchievementRewards } from '../public/achievement-catalog.js';
import { createDemoAccount, applyAccountCommand, accountMemberState } from '../public/demo-account-state.js';
const source = (await readFile(new URL('../public/achievement-dialog.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace('export function initAchievementDialog', 'function initAchievementDialog');

function page({ hold, failure = false } = {}) {
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
  let saved = createDemoAccount({ member: { attendance: { bestStreak: 5, streak: 5 } } }); saved.auth = { signedIn: true };
  let calls = 0;
  const account = {
    getSnapshot: () => saved, getMemberState: () => accountMemberState(saved), isSignedIn: () => saved.auth.signedIn, subscribe: fn => listeners.push(fn),
    async claimTask(taskId) { calls++; if (hold) await hold; if (failure) throw new Error('Storage unavailable'); const outcome = applyAccountCommand(saved, { type: 'claim-task', taskId }); saved = outcome.account; listeners.forEach(fn => fn()); return outcome.result; },
  };
  const icon = () => new Element('svg');
  const context = { document, account, getAchievements, achievementMedal, format, formatAchievementRewards, createShelfIcon: icon, createUiIcon: icon,
    auth: { require: fn => fn() }, router: { subscribe() {}, navigate() {} } };
  const api = vm.runInNewContext(`${source}\ninitAchievementDialog({ account, auth, router, document });`, context);
  const dialog = document.getElementById('achievement-dialog');
  const tree = node => [node, ...node.children.flatMap(tree)];
  return { api, dialog, account, get calls() { return calls; }, fail: value => { failure = value; },
    find: text => tree(dialog).find(node => node.textContent === text),
    notice: () => tree(dialog).find(node => node.className === 'achievement-dialog__notice').textContent };
}

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
