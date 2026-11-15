import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { openDemoAccount } from '../public/demo-account.js';
import { createMemberState } from '../public/member-state.js';
import { isProfilePhoto, prepareProfilePhoto, renderProfileAvatar, MAX_PROFILE_PHOTO_BYTES, MAX_PROFILE_PHOTO_LENGTH } from '../public/profile-photo.js';

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const otherPhoto = 'data:image/jpeg;base64,/9j/2Q==';

test('profile photo storage accepts bounded embedded raster data and rejects URLs, SVG and malformed values', () => {
  assert.equal(isProfilePhoto(photo), true);
  for (const invalid of [null, {}, '', 'https://example.com/photo.jpg', 'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,SGVsbG8=',
    'data:image/jpeg;base64,/9j/invalid!', photo + 'A'.repeat(MAX_PROFILE_PHOTO_LENGTH)]) {
    assert.equal(isProfilePhoto(invalid), false);
    assert.equal(createMemberState({ profile: { photo: invalid } }).profile.photo, undefined);
  }
  assert.equal(createMemberState({ profile: { photo } }).profile.photo, photo);
});

test('unsupported, empty and oversized uploads are rejected before decoding', async () => {
  await assert.rejects(prepareProfilePhoto({ type: 'image/svg+xml', size: 100 }), /JPG, PNG or WebP/);
  await assert.rejects(prepareProfilePhoto({ type: 'image/png', size: 0 }), /5 MB/);
  await assert.rejects(prepareProfilePhoto({ type: 'image/jpeg', size: MAX_PROFILE_PHOTO_BYTES + 1 }), /5 MB/);
});

test('photos persist across reopen, unrelated profile edits preserve them and removal survives another reopen', async () => {
  const options = { indexedDB: new IDBFactory(), scope: undefined };
  let account = await openDemoAccount(options);
  try {
    await account.register({ email: 'profile-photo@example.test', password: 'ProfilePhoto37!', accepted: true });
    const before = account.getSnapshot();
    assert.equal((await account.saveProfile({ avatar: '★', photo })).ok, true);
    account.close();
    account = await openDemoAccount(options);
    assert.equal(account.getMemberState().profile.photo, photo);
    await account.saveProfile({ displayName: 'Photo Player' });
    assert.equal(account.getMemberState().profile.photo, photo);
    await account.saveProfile({ photo: otherPhoto });
    assert.equal(account.getMemberState().profile.photo, otherPhoto);
    const invalid = await account.saveProfile({ photo: 'https://example.com/untrusted.svg', displayName: 'Invalid' });
    assert.equal(invalid.ok, false);
    assert.equal(account.getMemberState().profile.displayName, 'Photo Player');
    assert.equal(account.getMemberState().profile.photo, otherPhoto);
    await account.saveProfile({ photo: null });
    account.close();
    account = await openDemoAccount(options);
    assert.equal(account.getMemberState().profile.photo, undefined);
    assert.equal(account.getMemberState().profile.avatar, '★');
    assert.deepEqual(account.getSnapshot().wallet, before.wallet);
    assert.deepEqual(account.getSnapshot().ledger, before.ledger);
  } finally { account.close(); }
});

test('avatar rendering uses an image element and retains the preset if image loading fails', () => {
  let image;
  const element = { textContent: '', ownerDocument: { createElement(tag) {
    assert.equal(tag, 'img');
    image = { addEventListener(type, fn) { assert.equal(type, 'error'); this.fail = fn; }, remove() { this.removed = true; } };
    return image;
  } }, append(child) { this.child = child; } };
  renderProfileAvatar(element, { avatar: '★', photo });
  assert.equal(element.textContent, '★');
  assert.equal(image.src, photo);
  assert.equal(image.alt, '');
  image.fail();
  assert.equal(image.removed, true);
  assert.equal(element.textContent, '★');
});
