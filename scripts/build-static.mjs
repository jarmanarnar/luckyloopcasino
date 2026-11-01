import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
  for (const file of files.filter(file => file.endsWith('.html'))) {
    let html = await readFile(path.join(source, file), 'utf8');
    if (!/<meta\s+charset=["']utf-8["'][^>]*>/i.test(html)) throw new Error(`Missing UTF-8 charset in ${file}`);
    html = html.replace(/<meta\s+charset=["']utf-8["'][^>]*>/i,
      match => `${match}\n  <script type="importmap">${JSON.stringify({ imports })}</script>`);
    html = html.replace(/((?:src|href)=["'])([^"':?]+\.(?:js|css))(["'])/g,
      (_, start, url, end) => `${start}${url}?v=${version}${end}`);
    await writeFile(path.join(output, file), html);
  }
  return { version, modules: Object.keys(imports).length, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  console.log(JSON.stringify(await buildStatic(root, version)));
}
