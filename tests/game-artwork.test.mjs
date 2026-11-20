import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GAMES } from '../public/catalog.js';
import { GAME_ARTWORK } from '../public/game-artwork.js';
import { createGameArt } from '../public/game-artwork-view.js';
import { waitForPageAssets } from '../public/app-readiness.js';

function documentStub() {
  return { createElement(tag) { return { tag, dataset: {}, children: [], events: {}, hidden: false,
    append(child) { this.children.push(child); },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, fn) { this.events[name] = fn; },
  }; } };
}

test('the reviewed covers belong to available games and are valid local image files', async () => {
  const active = new Set(GAMES.map(game => game.id));
  assert.equal(Object.keys(GAME_ARTWORK).length, 816);
  for (const [id, artwork] of Object.entries(GAME_ARTWORK)) {
    assert.ok(active.has(id), `Artwork cannot reintroduce ${id}`);
    assert.ok(artwork.width > 0 && artwork.height > 0);
    assert.match(artwork.src, /^assets\/games\/(?:hacksaw\/)?[A-Za-z0-9-]+\.(?:webp|jpg)$/);
    const bytes = await readFile(new URL(`../public/${artwork.src}`, import.meta.url));
    if (artwork.src.endsWith('.webp')) {
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    } else assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255]);
  }
});

test('covered games retain a title fallback and failed artwork restores the name without changing dimensions', () => {
  const game = GAMES.find(game => game.id === 'nunchucksr96f100');
  const art = createGameArt(game, { document: documentStub() });
  const [title, image] = art.children;
  assert.equal(title.textContent, game.title);
  assert.equal(title.hidden, true);
  assert.equal(image.src, GAME_ARTWORK[game.id].src);
  assert.equal(image.alt, '');
  assert.equal(image.loading, 'lazy');
  image.events.error();
  assert.equal(title.hidden, false);
  assert.equal(image.hidden, true);
  assert.equal(art.dataset.artwork, undefined);
});

test('unsampled games keep the existing text card and do not request arbitrary artwork', () => {
  const art = createGameArt({ id: 'no-cover', title: 'Existing title' }, { document: documentStub() });
  assert.equal(art.children.length, 1);
  assert.equal(art.children[0].textContent, 'Existing title');
  assert.equal(art.children[0].hidden, false);
});

test('games without reviewed covers use visible names without requesting images', () => {
  for (const id of ['hacksaw-1294', 'hacksaw-2491', 'aftermathr96f100', 'judgementalr96f1']) {
    const game = GAMES.find(game => game.id === id);
    assert.ok(game, id);
    assert.equal(GAME_ARTWORK[id], undefined, id);
    const art = createGameArt(game, { document: documentStub(), eager: true });
    assert.equal(art.children.length, 1, id);
    assert.equal(art.children[0].tag, 'span', id);
    assert.equal(art.children[0].textContent, game.title, id);
    assert.equal(art.children[0].hidden, false, id);
    assert.equal(art.dataset.artwork, undefined, id);
  }
});

test('missing artwork never blocks startup or promotes lazy requests', async () => {
  const required = { loading: 'lazy', getClientRects: () => [{}], decode: () => Promise.resolve() };
  const optional = { dataset: { optionalArtwork: 'true' }, loading: 'lazy',
    getClientRects: () => [{}], decode: () => Promise.reject(new Error('Missing cover')) };
  const doc = { images: [required, optional], fonts: { ready: Promise.resolve() } };
  await waitForPageAssets(doc);
  assert.equal(optional.loading, 'lazy');
  required.decode = () => Promise.reject(new Error('Missing required asset'));
  await waitForPageAssets(doc);
  assert.equal(required.loading, 'lazy');
});
