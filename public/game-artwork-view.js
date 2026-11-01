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
  Object.assign(image, { className: 'game-cover', src: artwork.src, alt: '',
    width: artwork.width, height: artwork.height, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  image.dataset.optionalArtwork = 'true';
  image.setAttribute('aria-hidden', 'true');
  title.hidden = true;
  art.dataset.artwork = 'true';
  image.addEventListener('error', () => {
    image.hidden = true;
    title.hidden = false;
    delete art.dataset.artwork;
  }, { once: true });
  art.append(image);
  return art;
}
