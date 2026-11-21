import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const browserTargets = ['chrome105', 'safari16', 'firefox110'];

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];
}

async function bundleIndexStyles(html, source, output) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || '';
  const parts = [], links = [], inline = new Map();
  for (const match of head.matchAll(/<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi)) {
    const tag = match[0];
    if (/^<style\b/i.test(tag)) {
      const id = `inline-style:${inline.size}`;
      inline.set(id, tag.replace(/^<style\b[^>]*>/i, '').replace(/<\/style\s*>$/i, ''));
      parts.push(`@import ${JSON.stringify(id)};`);
      continue;
    }
    if (attribute(tag, 'rel') !== 'stylesheet') continue;
    const href = attribute(tag, 'href');
    if (!href || /^(?:[a-z]+:|\/)/i.test(href) || /\b(?:disabled|title)\b/i.test(tag)) continue;
    const media = /\bdata-app-styles\b/i.test(tag) ? null : attribute(tag, 'media');
    parts.push(`@import ${JSON.stringify(`./${href}`)}${media ? ` ${media}` : ''};`);
    links.push(tag);
  }
  if (links.length < 2) return { html, stylesheets: 0, bytes: 0 };
  const result = await build({
    absWorkingDir: source,
    stdin: { contents: parts.join('\n'), loader: 'css', resolveDir: source, sourcefile: 'index-styles.css' },
    outfile: path.join(output, 'app-styles.css'), bundle: true, minify: true,
    target: browserTargets, metafile: true, logLevel: 'silent',
    plugins: [{
      name: 'preserve-public-style-assets',
      setup(api) {
        api.onResolve({ filter: /^inline-style:/ }, args => ({ path: args.path, namespace: 'inline-style' }));
        api.onLoad({ filter: /.*/, namespace: 'inline-style' }, args => ({ contents: inline.get(args.path), loader: 'css', resolveDir: source }));
        api.onResolve({ filter: /.*/ }, args => {
          if (args.kind !== 'url-token') return;
          if (/^(?:[a-z]+:|\/|#)/i.test(args.path)) return { path: args.path, external: true };
          // The bundle lives beside index.html; keep assets at their copied public paths.
          const relative = path.relative(source, path.resolve(args.resolveDir, args.path)).split(path.sep).join('/');
          return { path: `./${relative}`, external: true };
        });
      },
    }],
  });
  // Keep the inline loader styles available before any network stylesheet arrives.
  // Repeating them in the bundle preserves their original place in the full cascade.
  const applicationStyles = links.some(tag => /\bdata-app-styles\b/i.test(tag));
  const bundleLink = applicationStyles
    ? `<link rel="stylesheet" href="app-styles.css" data-app-styles media="print" onload="this.media='all';this.dataset.styleState='loaded'" onerror="this.dataset.styleState='error'">`
    : '<link rel="stylesheet" href="app-styles.css">';
  for (const [index, tag] of links.entries()) {
    html = html.replace(tag, index === links.length - 1 ? bundleLink : '');
  }
  return { html, stylesheets: links.length, bytes: Object.values(result.metafile.outputs)[0].bytes };
}

export async function buildStatic(rootDirectory, version) {
  if (!/^[a-f0-9]{7,40}$/.test(version)) throw new Error('A commit version is required');
  const root = path.resolve(rootDirectory);
  const source = path.join(root, 'public');
  const output = path.resolve(root, 'dist');
  if (path.dirname(output) !== root) throw new Error('Build output must stay inside the project');
  const files = [];
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await collect(path.join(directory, entry.name), relative + '/');
      else files.push(relative);
    }
  }
  await collect(source);
  const imports = Object.fromEntries(files.filter(file => file.endsWith('.js')).map(file => [`./${file}`, `./${file}?v=${version}`]));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(source, output, { recursive: true });
  let applicationBundle;
  if (files.includes('bootstrap.js')) {
    const result = await build({
      absWorkingDir: source, entryPoints: ['bootstrap.js'], outfile: path.join(output, 'bootstrap.js'),
      bundle: true, splitting: false, format: 'esm', platform: 'browser',
      target: browserTargets, minify: true, metafile: true, logLevel: 'silent', legalComments: 'inline',
    });
    applicationBundle = {
      modules: Object.keys(result.metafile.inputs).length,
      sourceBytes: Object.values(result.metafile.inputs).reduce((total, input) => total + input.bytes, 0),
      bytes: Object.values(result.metafile.outputs)[0].bytes,
    };
  }
  if (files.includes('sw.js')) {
    const worker = await readFile(path.join(source, 'sw.js'), 'utf8');
    await writeFile(path.join(output, 'sw.js'), worker.replaceAll('__COP_COIN_RELEASE__', version));
  }
  let styleBundle;
  for (const file of files.filter(file => file.endsWith('.html'))) {
    let html = await readFile(path.join(source, file), 'utf8');
    if (!/<meta\s+charset=["']utf-8["'][^>]*>/i.test(html)) throw new Error(`Missing UTF-8 charset in ${file}`);
    if (file === 'index.html') {
      const result = await bundleIndexStyles(html, source, output);
      html = result.html;
      styleBundle = { stylesheets: result.stylesheets, bytes: result.bytes };
    }
    html = html.replace(/<meta\s+charset=["']utf-8["'][^>]*>/i,
      match => `${match}\n  <script type="importmap">${JSON.stringify({ imports })}</script>`);
    html = html.replace(/((?:src|href)=["'])([^"':?]+\.(?:js|css))(["'])/g,
      (_, start, url, end) => `${start}${url}?v=${version}${end}`);
    await writeFile(path.join(output, file), html);
  }
  return { version, modules: Object.keys(imports).length, output, applicationBundle, styleBundle };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  console.log(JSON.stringify(await buildStatic(root, version)));
}
