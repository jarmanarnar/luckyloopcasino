import assert from 'node:assert/strict';
import test from 'node:test';
import { initSiteSearch } from '../public/site-search.js';

test('an unconfigured shell search entry remains safely inactive', () => {
  assert.doesNotThrow(() => initSiteSearch().openSearch());
});
