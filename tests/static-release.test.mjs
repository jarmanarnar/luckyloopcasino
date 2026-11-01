import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildStatic } from '../scripts/build-static.mjs';

test('a new deployment changes cache keys for entries, dynamic imports and dependencies without rewriting module code', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loop-static-release-'));
  try {
    const source = path.join(root, 'public');
    await mkdir(source);
    const modules = { 'bootstrap.js': "import('./app.js');", 'app.js': "import { value } from './state.js';", 'state.js': 'export const value = 1;' };
    for (const [name, text] of Object.entries(modules)) await writeFile(path.join(source, name), text);
    const entry = '<head><meta charset="utf-8"><link href="styles.css" rel="stylesheet"><script type="module" src="bootstrap.js"></script><script src="https://example.test/sdk.js"></script></head>';
    for (const name of ['index.html', 'hacksaw-demo.html']) await writeFile(path.join(source, name), entry);
    await writeFile(path.join(source, 'styles.css'), 'body { margin: 0 }');
    await buildStatic(root, 'aaaaaaa');
    await writeFile(path.join(root, 'dist', 'obsolete.js'), 'old');
    await buildStatic(root, 'bbbbbbb');
    for (const name of ['index.html', 'hacksaw-demo.html']) {
      const html = await readFile(path.join(root, 'dist', name), 'utf8');
      const map = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]);
      const base = 'https://example.test/luckyloopcasino/';
      assert.ok(html.indexOf('charset="utf-8"') < html.indexOf('type="importmap"'));
      assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
      assert.match(html, /src="bootstrap\.js\?v=bbbbbbb"/);
      assert.match(html, /href="styles\.css\?v=bbbbbbb"/);
      assert.match(html, /src="https:\/\/example\.test\/sdk\.js"/);
      for (const file of Object.keys(modules)) {
        const resolved = new URL(map.imports[`./${file}`], base);
        assert.equal(resolved.searchParams.get('v'), 'bbbbbbb', 'dynamic and static dependencies use the current release');
        assert.equal(await readFile(path.join(root, 'dist', file), 'utf8'), modules[file]);
      }
      assert.doesNotMatch(html, /aaaaaaa/);
    }
    await assert.rejects(access(path.join(root, 'dist', 'obsolete.js')));
    await assert.rejects(buildStatic(root, '../invalid-version'));
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('loop-static-release-')) throw new Error('Unexpected test cleanup path');
    await rm(root, { recursive: true, force: true });
  }
});
