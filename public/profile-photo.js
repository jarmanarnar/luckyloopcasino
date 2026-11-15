export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_LENGTH = 200000;

// Only bounded, embedded raster images may be persisted or rendered as avatars.
export function isProfilePhoto(value) {
  if (typeof value !== 'string' || value.length > MAX_PROFILE_PHOTO_LENGTH) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const header = atob(match[2].slice(0, 32));
    return match[1] === 'jpeg' ? header.startsWith('\xff\xd8\xff')
      : match[1] === 'png' ? header.startsWith('\x89PNG\r\n\x1a\n')
        : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  } catch { return false; }
}

export async function prepareProfilePhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG or WebP image.');
  }
  if (!file.size || file.size > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.');
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  let timeout;
  try {
    await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('This image could not be opened. Try another photo.')), 15000);
      image.onload = resolve;
      image.onerror = () => reject(new Error('This image could not be opened. Try another photo.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) {
      throw new Error('Choose a smaller image, up to 40 megapixels.');
    }
    // Store a small, square, metadata-free copy rather than the original upload.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your photo could not be prepared. Please try again.');
    context.fillStyle = '#070708';
    context.fillRect(0, 0, 256, 256);
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
    const photo = canvas.toDataURL('image/jpeg', .88);
    if (!isProfilePhoto(photo)) throw new Error('Your photo could not be prepared. Try another image.');
    return photo;
  } finally {
    clearTimeout(timeout);
    image.onload = image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

export function renderProfileAvatar(element, profile) {
  if (!element) return;
  element.textContent = profile?.avatar || 'L';
  if (!isProfilePhoto(profile?.photo)) return;
  const image = element.ownerDocument.createElement('img');
  image.className = 'profile-avatar-image';
  image.alt = '';
  image.src = profile.photo;
  image.addEventListener('error', () => image.remove(), { once: true });
  element.append(image);
}
