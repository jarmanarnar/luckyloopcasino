import assert from 'node:assert/strict';
import test from 'node:test';
import { initSiteSearch } from '../public/site-search.js';

test('the shell search entry delegates to a page destination without requiring a dialog', () => {
  const calls = [];
  const search = initSiteSearch({ openSearch(options) { calls.push(options); } });
  const options = { returnFocusTo: { id: 'menu-search' } };
  search.openSearch(options);
  assert.deepEqual(calls, [options]);
  assert.doesNotThrow(() => initSiteSearch().openSearch());
});
