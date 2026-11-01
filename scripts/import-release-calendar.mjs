import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../public/catalog.js';

const normalize = value => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function releaseDay(value) {
  const match = String(value).match(/^(\d{1,2})(?:st|nd|rd|th) (\w+) (\d{4})$/);
  const month = match && months.indexOf(match[2]);
  if (!match || month < 0) throw new Error(`Unrecognized release date: ${value}`);
  const date = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`Invalid release day: ${value}`);
  return date;
}

export function buildReleaseData(games, calendar) {
  if (calendar.source !== 'https://games.nolimitcity.com/' || !/^\d{4}-\d{2}-\d{2}$/.test(calendar.observedOn || '')) {
    throw new Error('A dated snapshot of the official release calendar is required');
  }
  const byTitle = new Map();
  for (const item of calendar.games || []) {
    const key = normalize(item.title);
    if (byTitle.has(key)) throw new Error(`Ambiguous calendar title: ${item.title}`);
    const page = new URL(item.url);
    if (page.origin !== 'https://nolimitcity.com' || !/^\/games\/[a-z0-9-]+$/i.test(page.pathname)) {
      throw new Error(`Unexpected official game page: ${item.url}`);
    }
    byTitle.set(key, { ...item, date: releaseDay(item.date) });
  }
  const ids = new Set();
  const matchedPages = new Set();
  return games.map(game => {
    if (ids.has(game.id)) throw new Error(`Duplicate catalog ID: ${game.id}`);
    ids.add(game.id);
    const item = byTitle.get(normalize(game.title));
    if (!item) throw new Error(`No unique official release date for ${game.title}`);
    if (matchedPages.has(item.url)) throw new Error(`Ambiguous catalog title: ${game.title}; verify by provider game ID`);
    matchedPages.add(item.url);
    if (item.date > calendar.observedOn) throw new Error(`Unreleased game in active catalog: ${game.title}`);
    return [game.id, item.date, item.url];
  });
}

export function releaseModule(rows, calendar) {
  return '// General release dates from the official, rendered game calendar.\n'
    + '// Matched one-to-one by complete normalized title; ambiguous or missing matches fail the import.\n'
    + `export const RELEASES_VERIFIED_ON = ${JSON.stringify(calendar.observedOn)};\n`
    + 'export const GAME_RELEASES = Object.freeze(Object.fromEntries([\n'
    + rows.map(row => `  ${JSON.stringify(row)},`).join('\n')
    + '\n].map(([id, date, page]) => [id, Object.freeze({ date, page,\n'
    + `  source: ${JSON.stringify(calendar.source)}, verifiedOn: RELEASES_VERIFIED_ON })])));\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: npm run catalog:releases -- <official-calendar-snapshot.json>');
  const calendar = JSON.parse(await readFile(input, 'utf8'));
  const rows = buildReleaseData(GAMES.filter(game => new URL(game.url).origin === 'https://playin.com'), calendar);
  await writeFile(new URL('../public/game-releases.js', import.meta.url), releaseModule(rows, calendar));
  console.log(`Verified release dates for ${rows.length} catalog games (${calendar.observedOn}).`);
}
