import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('phone preview disables collection and never advances either submit', async () => {
  const source = (await readFile(new URL('../public/phone-verification.js', import.meta.url), 'utf8')).replace('export function', 'function');
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, open: false, listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector(selector) { return node(id + selector); },
      reset() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(id);
  }
  const context = { document: { querySelector: selector => selector.startsWith('dialog[open]') ? null : node(selector) },
    router: { subscribe() {} }, account: { subscribe() {}, isSignedIn: () => true } };
  const api = vm.runInNewContext(source + '\ninitPhoneVerification({ router, account });', context);
  api.open();
  assert.equal(node('#phone-verification-dialog').open, true);
  for (const id of ['number', 'code']) {
    assert.equal(node('#phone-verification-' + id).disabled, true);
    const form = node('#phone-verification-' + id + '-form');
    assert.equal(form.querySelector('button[type="submit"]').disabled, true);
    let prevented = false;
    form.listeners.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  assert.equal(node('#phone-verification-number-form').hidden, false);
  assert.equal(node('#phone-verification-code-form').hidden, true);
  assert.doesNotMatch(source, /fetch\(|localStorage|selectCurrency|validCode|validNumber/);
});
