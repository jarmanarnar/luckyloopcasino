import { GAME_ARTWORK } from './game-artwork.js';

export function createGameArt(game, { document: doc = document, eager = false } = {}) {
  const art = doc.createElement('span');
  art.className = 'game-launch__art';
  const title = doc.createElement('span');
  title.textContent = game.title;
  art.append(title);
  const artwork = GAME_ARTWORK[game.id];
  if (!artwork) return art;
  const image = doc.createElement('img');
  Object.assign(image, { className: 'game-cover', alt: '',
    width: artwork.width, height: artwork.height, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  image.dataset.optionalArtwork = 'true';
  image.setAttribute('aria-hidden', 'true');
  let revision = 0;
  function failed() {
    revision++;
    image.hidden = true;
    title.hidden = false;
    delete art.dataset.artwork;
  }
  async function ready() {
    const current = ++revision, source = image.src;
    try { await image.decode?.(); }
    catch { /* A loaded image can still display when explicit decoding is unavailable. */ }
    if (current !== revision || image.src !== source || image.parentNode !== art) return;
    if (!image.complete || !image.naturalWidth) return;
    image.hidden = false;
    title.hidden = true;
    art.dataset.artwork = 'true';
  }
  image.addEventListener('load', ready);
  image.addEventListener('error', failed);
  art.append(image);
  image.src = artwork.src;
  if (image.complete) {
    if (image.naturalWidth) void ready();
    else failed();
  }
  return art;
}
