import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildStatic } from '../scripts/build-static.mjs';

test('a new deployment versions the bundled entry and retained modules without modifying source files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loop-static-release-'));
  try {
    const source = path.join(root, 'public');
    await mkdir(source);
    const modules = { 'bootstrap.js': "import('./app.js');", 'app.js': "import { value } from './state.js';", 'state.js': 'export const value = 1;' };
    for (const [name, text] of Object.entries(modules)) await writeFile(path.join(source, name), text);
    const entry = '<head><meta charset="utf-8"><link href="styles.css" rel="stylesheet"><script type="module" src="bootstrap.js"></script><script src="https://example.test/sdk.js"></script></head>';
    for (const name of ['index.html', 'hacksaw-demo.html']) await writeFile(path.join(source, name), entry);
    await writeFile(path.join(source, 'styles.css'), 'body { margin: 0 }');
    await writeFile(path.join(source, 'sw.js'), "const RELEASE = '__COP_COIN_RELEASE__';");
    await writeFile(path.join(source, 'manifest.webmanifest'), '{"scope":"./","display":"standalone"}');
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
        assert.equal(await readFile(path.join(source, file), 'utf8'), modules[file], 'development source stays unchanged');
        if (file !== 'bootstrap.js') assert.equal(await readFile(path.join(root, 'dist', file), 'utf8'), modules[file]);
      }
      assert.doesNotMatch(await readFile(path.join(root, 'dist', 'bootstrap.js'), 'utf8'), /import\s*\(/,
        'the production dynamic app dependency is included in the entry');
      assert.doesNotMatch(html, /aaaaaaa/);
    }
    await assert.rejects(access(path.join(root, 'dist', 'obsolete.js')));
    assert.equal(await readFile(path.join(root, 'dist', 'sw.js'), 'utf8'), "const RELEASE = 'bbbbbbb';");
    assert.equal(await readFile(path.join(source, 'sw.js'), 'utf8'), "const RELEASE = '__COP_COIN_RELEASE__';");
    assert.deepEqual(JSON.parse(await readFile(path.join(root, 'dist', 'manifest.webmanifest'), 'utf8')), { scope: './', display: 'standalone' });
    await assert.rejects(buildStatic(root, '../invalid-version'));
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('loop-static-release-')) throw new Error('Unexpected test cleanup path');
    await rm(root, { recursive: true, force: true });
  }
});

test('the production entry runs its dynamic application dependency from one file and preserves its URL base', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loop-static-release-'));
  try {
    const source = path.join(root, 'public');
    await mkdir(source);
    await writeFile(path.join(source, 'index.html'), '<head><meta charset="utf-8"><link rel="modulepreload" href="bootstrap.js"></head><script>import("./bootstrap.js")</script>');
    await writeFile(path.join(source, 'bootstrap.js'), 'export async function start() { return (await import("./app.js")).read(); }');
    await writeFile(path.join(source, 'app.js'), 'import { value } from "./state.js"; export function read() { return { value, base: new URL("./", import.meta.url).href }; }');
    await writeFile(path.join(source, 'state.js'), 'export const value = 42;');
    const result = await buildStatic(root, 'ccccccc');
    assert.equal(result.applicationBundle.modules, 3);
    const output = path.join(root, 'dist', 'bootstrap.js');
    const bundle = await readFile(output, 'utf8');
    assert.doesNotMatch(bundle, /\bimport\s*(?:\(|["'{*])/);
    const module = await import(pathToFileURL(output).href);
    assert.deepEqual(await module.start(), { value: 42, base: pathToFileURL(path.join(root, 'dist') + path.sep).href });
    const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
    assert.match(html, /rel="modulepreload" href="bootstrap\.js\?v=ccccccc"/);
    const map = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]);
    assert.equal(map.imports['./bootstrap.js'], './bootstrap.js?v=ccccccc', 'the inline recovery import uses the same release as its preload');
    assert.ok(html.indexOf('type="importmap"') < html.indexOf('import("./bootstrap.js")'));
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('loop-static-release-')) throw new Error('Unexpected test cleanup path');
    await rm(root, { recursive: true, force: true });
  }
});

test('index styles become one request with cascade, early loader fallback and relative asset paths preserved', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loop-static-release-'));
  try {
    const source = path.join(root, 'public');
    await mkdir(path.join(source, 'nested'), { recursive: true });
    await writeFile(path.join(source, 'first.css'), '.first { --phase: first; }');
    await writeFile(path.join(source, 'nested', 'last.css'), '.last { --phase: last; background: url(../assets/card.webp); } @font-face { font-family: Test; src: url(../assets/test.woff2) format("woff2"); }');
    const html = '<head><meta charset="utf-8"><link rel="stylesheet" href="first.css"><style id="app-loader-styles">.probe { --phase: inline; }</style><link href="nested/last.css" rel="stylesheet"></head>';
    await writeFile(path.join(source, 'index.html'), html);
    await writeFile(path.join(source, 'other.html'), html);
    const result = await buildStatic(root, 'ddddddd');
    assert.equal(result.styleBundle.stylesheets, 2);
    const index = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
    assert.equal([...index.matchAll(/<link\b[^>]*rel="stylesheet"/g)].length, 1);
    assert.match(index, /href="app-styles\.css\?v=ddddddd"/);
    assert.match(index, /<style id="app-loader-styles">\.probe \{ --phase: inline; \}<\/style>/);
    assert.ok(index.indexOf('id="app-loader-styles"') < index.indexOf('href="app-styles.css'));
    const css = await readFile(path.join(root, 'dist', 'app-styles.css'), 'utf8');
    const phasePositions = ['first', 'inline', 'last'].map(value => css.search(new RegExp(`--phase:\\s*${value}`)));
    assert.ok(phasePositions.every(position => position >= 0));
    assert.ok(phasePositions[0] < phasePositions[1]);
    assert.ok(phasePositions[1] < phasePositions[2]);
    assert.match(css, /url\(["']?\.\/assets\/card\.webp["']?\)/);
    assert.match(css, /url\(["']?\.\/assets\/test\.woff2["']?\)/);
    const other = await readFile(path.join(root, 'dist', 'other.html'), 'utf8');
    assert.match(other, /href="first\.css\?v=ddddddd"/);
    assert.match(other, /href="nested\/last\.css\?v=ddddddd"/);
    assert.equal(await readFile(path.join(source, 'index.html'), 'utf8'), html);
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('loop-static-release-')) throw new Error('Unexpected test cleanup path');
    await rm(root, { recursive: true, force: true });
  }
});
