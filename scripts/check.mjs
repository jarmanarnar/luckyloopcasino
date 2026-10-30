import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => entry.name !== '.git' && entry.name !== 'node_modules')
    .map(entry => entry.isDirectory() ? sourceFiles(path.join(directory, entry.name))
      : /\.(?:mjs|js)$/.test(entry.name) ? [path.join(directory, entry.name)] : []));
  return nested.flat();
}
const files = await sourceFiles(root);
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
console.log(`Syntax checked ${files.length} JavaScript files.`);
