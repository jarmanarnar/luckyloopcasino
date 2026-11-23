import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ALL_GAMES, GAMES } from '../public/catalog.js';
import { GAME_ARTWORK } from '../public/game-artwork.js';
import { createGameArt } from '../public/game-artwork-view.js';
import { waitForPageAssets } from '../public/app-readiness.js';

function documentStub(imageState = {}) {
  return { createElement(tag) { return { tag, dataset: {}, children: [], events: {}, hidden: false,
    ...(tag === 'img' ? { complete: false, naturalWidth: 0, ...imageState } : {}),
    append(child) { child.parentNode = this; this.children.push(child); },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, fn) { this.events[name] = fn; },
  }; } };
}

test('the reviewed covers belong to available games and are valid local image files', async () => {
  const active = new Set(GAMES.map(game => game.id));
  assert.equal(Object.keys(GAME_ARTWORK).length, 1299);
  for (const [id, artwork] of Object.entries(GAME_ARTWORK)) {
    assert.ok(active.has(id), `Artwork cannot reintroduce ${id}`);
    assert.ok(artwork.width > 0 && artwork.height > 0);
    assert.match(artwork.src, /^assets\/games\/(?:hacksaw\/)?[A-Za-z0-9-]+\.(?:webp|jpe?g|png)$/);
    const bytes = await readFile(new URL(`../public/${artwork.src}`, import.meta.url));
    if (artwork.src.endsWith('.webp')) {
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    } else if (artwork.src.endsWith('.png')) {
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    } else assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255]);
  }
});

test('covered games retain a title fallback and failed artwork restores the name without changing dimensions', () => {
  const game = GAMES.find(game => game.id === 'nunchucksr96f100');
  const art = createGameArt(game, { document: documentStub() });
  const [title, image] = art.children;
  assert.equal(title.textContent, game.title);
  assert.equal(title.hidden, false);
  assert.equal(art.dataset.artwork, undefined, 'the provider placeholder remains visible while artwork loads');
  assert.equal(image.src, GAME_ARTWORK[game.id].src);
  assert.equal(image.alt, '');
  assert.equal(image.loading, 'lazy');
  image.events.error();
  assert.equal(title.hidden, false);
  assert.equal(image.hidden, true);
  assert.equal(art.dataset.artwork, undefined);
});

test('slow covers retain the name and provider until the loaded image has decoded', async () => {
  const game = GAMES.find(game => game.id === 'nunchucksr96f100');
  let finishDecode;
  const decoding = new Promise(resolve => { finishDecode = resolve; });
  const art = createGameArt(game, { document: documentStub({ decode: () => decoding }) });
  const [title, image] = art.children;
  image.complete = true;
  image.naturalWidth = GAME_ARTWORK[game.id].width;
  const loading = image.events.load();
  assert.equal(title.hidden, false);
  assert.equal(art.dataset.artwork, undefined);
  finishDecode();
  await loading;
  assert.equal(title.hidden, true);
  assert.equal(art.dataset.artwork, 'true');
  assert.equal(image.width, GAME_ARTWORK[game.id].width);
  assert.equal(image.height, GAME_ARTWORK[game.id].height);
});

test('cached valid covers display even if explicit decode rejects, while broken cached images keep their fallback', async () => {
  const game = GAMES.find(game => game.id === 'nunchucksr96f100');
  const art = createGameArt(game, { document: documentStub({ complete: true, naturalWidth: 300,
    decode: () => Promise.reject(new Error('Explicit decoding unavailable')) }) });
  await Promise.resolve();
  assert.equal(art.dataset.artwork, 'true');
  assert.equal(art.children[0].hidden, true);
  assert.equal(art.children[1].hidden, false);

  const broken = createGameArt(game, { document: documentStub({ complete: true, naturalWidth: 0 }) });
  assert.equal(broken.dataset.artwork, undefined);
  assert.equal(broken.children[0].hidden, false);
  assert.equal(broken.children[1].hidden, true);
});

test('late decoding cannot reveal failed, replaced, or removed artwork', async () => {
  const game = GAMES.find(game => game.id === 'nunchucksr96f100');
  for (const interrupt of [image => image.events.error(), image => { image.src = 'replacement.webp'; }, image => { image.parentNode = null; }]) {
    let finishDecode;
    const decoding = new Promise(resolve => { finishDecode = resolve; });
    const art = createGameArt(game, { document: documentStub({ decode: () => decoding }) });
    const [title, image] = art.children;
    image.complete = true;
    image.naturalWidth = 300;
    const loading = image.events.load();
    interrupt(image);
    finishDecode();
    await loading;
    assert.equal(title.hidden, false);
    assert.equal(art.dataset.artwork, undefined);
  }
});

test('games without reviewed covers use visible names without requesting images', () => {
  const fixtures = [
    { game: { id: 'no-cover', title: 'Existing title' } },
    ...['hacksaw-1294', 'hacksaw-2491'].map(id => {
      const game = ALL_GAMES.find(game => game.id === id);
      assert.ok(game, id);
      return { game, eager: true };
    }),
  ];
  for (const { game, eager } of fixtures) {
    const { id } = game;
    assert.equal(GAME_ARTWORK[id], undefined, id);
    const art = createGameArt(game, { document: documentStub(), eager });
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
