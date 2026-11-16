import { getDiscoveredGameCount } from './rewards-pages.js';
import { createShelfIcon } from './shelf-icons.js';
import { prepareProfilePhoto, renderProfileAvatar } from './profile-photo.js';

const dateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const number = new Intl.NumberFormat('en-US');

export function initProfileMenu({ router, account, auth, openNotifications, openRedeem, preparePhoto = prepareProfilePhoto }) {
  const trigger = document.querySelector('#header-profile');
  const menu = document.querySelector('#profile-menu');
  const summary = document.querySelector('#profile-summary');
  if (!trigger || !menu || !summary) return;
  const hasPopover = typeof menu.showPopover === 'function';

  for (const item of menu.querySelectorAll('[data-profile-icon]')) {
    item.prepend(createShelfIcon(item.dataset.profileIcon));
  }
  const fields = Object.fromEntries(['avatar', 'name', 'since',
    'games', 'favorites', 'rewards', 'coins'].map(id => [id, summary.querySelector(`#profile-summary-${id}`)]));
  const status = menu.querySelector('#profile-menu-status');
  const isMenuOpen = () => hasPopover && menu.matches(':popover-open');
  const title = summary.querySelector('#profile-summary-title');
  const overview = summary.querySelector('#profile-summary-overview');
  const edit = summary.querySelector('.profile-summary__edit');
  const editor = summary.querySelector('#profile-editor');
  const name = summary.querySelector('#profile-editor-name');
  const avatars = summary.querySelector('#profile-editor-avatars');
  const choices = [...avatars.querySelectorAll('[data-avatar]')];
  const cancel = summary.querySelector('#profile-editor-cancel');
  const save = summary.querySelector('#profile-editor-save');
  const feedback = summary.querySelector('#profile-editor-status');
  const photoPreview = summary.querySelector('#profile-photo-preview');
  const photoFile = summary.querySelector('#profile-photo-file');
  const photoUpload = summary.querySelector('#profile-photo-upload');
  const photoRemove = summary.querySelector('#profile-photo-remove');
  const photoFeedback = summary.querySelector('#profile-photo-status');
  let originalProfile, selectedAvatar, selectedPhoto = null, photoChanged = false;
  let saving = false, preparingPhoto = false, editSession = 0, photoRequest = 0;

  function syncEditorControls() {
    save.disabled = saving || preparingPhoto;
    cancel.disabled = name.disabled = edit.disabled = saving;
    avatars.disabled = photoUpload.disabled = photoRemove.disabled = photoFile.disabled = saving || preparingPhoto;
  }

  function renderPhotoPreview() {
    renderProfileAvatar(photoPreview, { avatar: selectedAvatar, photo: selectedPhoto });
    photoRemove.hidden = !selectedPhoto;
    photoUpload.textContent = selectedPhoto ? 'Change photo' : 'Upload photo';
    for (const choice of choices) choice.setAttribute('aria-pressed', String(!selectedPhoto && choice.dataset.avatar === selectedAvatar));
  }

  function setEditorVisible(visible) {
    editSession++;
    photoRequest++;
    preparingPhoto = false;
    photoFile.value = '';
    photoFeedback.textContent = '';
    syncEditorControls();
    overview.hidden = visible;
    editor.hidden = !visible;
    title.textContent = visible ? 'Edit profile' : 'My Profile';
    feedback.textContent = '';
    summary.scrollTop = 0;
  }

  function startEditing() {
    if (saving) return;
    originalProfile = { ...account.getSnapshot().member.profile };
    selectedAvatar = originalProfile.avatar;
    selectedPhoto = originalProfile.photo || null;
    photoChanged = false;
    name.value = originalProfile.displayName;
    setEditorVisible(true);
    renderPhotoPreview();
    name.focus();
  }

  function showOverview() {
    setEditorVisible(false);
    renderSummary();
    edit.focus({ preventScroll: true });
  }

  function open({ edit: editing = false } = {}) {
    const show = () => {
      if (document.querySelector('dialog[open]') && !summary.open) return;
      closeMenu();
      setEditorVisible(false);
      renderSummary();
      if (!summary.open) summary.showModal();
      if (editing) startEditing();
    };
    if (auth) return auth.require(show);
    if (account.isSignedIn()) show();
  }

  edit.addEventListener('click', startEditing);
  cancel.addEventListener('click', showOverview);
  photoUpload.addEventListener('click', () => { if (!saving && !preparingPhoto) photoFile.click(); });
  photoFile.addEventListener('change', async () => {
    const file = photoFile.files?.[0];
    photoFile.value = '';
    if (!file || saving || editor.hidden) return;
    const session = editSession, request = ++photoRequest;
    preparingPhoto = true;
    syncEditorControls();
    photoFeedback.textContent = 'Preparing photo…';
    try {
      const photo = await preparePhoto(file);
      if (session !== editSession || request !== photoRequest || !summary.open) return;
      selectedPhoto = photo;
      photoChanged = true;
      renderPhotoPreview();
      photoFeedback.textContent = 'Save your profile to use this photo.';
    } catch (error) {
      if (session === editSession && request === photoRequest && summary.open) {
        photoFeedback.textContent = error.message || 'Your photo could not be opened. Try another image.';
      }
    } finally {
      if (session === editSession && request === photoRequest) {
        preparingPhoto = false;
        syncEditorControls();
      }
    }
  });
  photoRemove.addEventListener('click', () => {
    if (saving || preparingPhoto) return;
    selectedPhoto = null;
    photoChanged = true;
    renderPhotoPreview();
    photoFeedback.textContent = 'Save your profile to remove the photo.';
    photoUpload.focus();
  });
  for (const choice of choices) choice.addEventListener('click', () => {
    if (saving || preparingPhoto) return;
    selectedAvatar = choice.dataset.avatar;
    if (selectedPhoto) { selectedPhoto = null; photoChanged = true; }
    photoFeedback.textContent = '';
    renderPhotoPreview();
  });
  editor.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || preparingPhoto || !editor.reportValidity()) return;
    const displayName = name.value.trim();
    if (displayName.length < 2 || displayName.length > 24) {
      feedback.textContent = 'Use a display name with 2–24 characters.';
      name.focus();
      return;
    }
    const patch = {};
    if (displayName !== originalProfile.displayName) patch.displayName = displayName;
    if (selectedAvatar !== originalProfile.avatar) patch.avatar = selectedAvatar;
    if (photoChanged) patch.photo = selectedPhoto;
    if (!Object.keys(patch).length) { showOverview(); return; }
    const session = editSession;
    saving = true;
    syncEditorControls();
    save.textContent = 'Saving…';
    feedback.textContent = '';
    try {
      const result = await account.saveProfile(patch);
      if (!summary.open || session !== editSession) return;
      if (result.ok) {
        showOverview();
        feedback.textContent = 'Profile saved.';
      } else feedback.textContent = result.reason || 'Your profile could not be saved. Please try again.';
    } catch {
      if (summary.open && session === editSession) feedback.textContent = 'Your profile could not be saved. Please try again.';
    } finally {
      saving = false;
      syncEditorControls();
      save.textContent = 'Save profile';
      if (summary.open && !overview.hidden) edit.focus({ preventScroll: true });
    }
  });
  summary.addEventListener('close', () => { if (!summary.open) setEditorVisible(false); });
  if (!hasPopover) trigger.addEventListener('click', () => open());

  function positionMenu() {
    const anchor = trigger.getBoundingClientRect();
    if (!anchor.width || !anchor.height) return false;
    menu.style.setProperty('--profile-menu-top', `${anchor.bottom + 8}px`);
    menu.style.setProperty('--profile-menu-right', `${Math.max(8, document.documentElement.clientWidth - anchor.right)}px`);
    return true;
  }

  function renderSummary() {
    const { identity, createdAt, member, ledger } = account.getSnapshot();
    const registeredAt = identity?.registeredAt || createdAt;
    const rewards = ledger.filter(entry => entry.type === 'bonus');
    const goldCredited = rewards.reduce((sum, entry) => sum + (entry.currency === 'GC' ? entry.amountUnits : 0), 0);
    renderProfileAvatar(fields.avatar, member.profile);
    fields.name.textContent = member.profile.displayName;
    fields.since.dateTime = registeredAt;
    fields.since.textContent = dateLabel.format(new Date(registeredAt));
    fields.games.textContent = number.format(getDiscoveredGameCount(member));
    fields.favorites.textContent = number.format(member.favorites.length);
    fields.rewards.textContent = number.format(rewards.length);
    fields.coins.textContent = number.format(goldCredited);
  }

  function closeMenu() {
    if (isMenuOpen()) menu.hidePopover();
  }
  function closeSummary() {
    if (summary.open) summary.close();
  }
  function close() {
    closeMenu();
    closeSummary();
  }
  menu.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open') return;
    if (!account.isSignedIn() || document.querySelector('dialog[open]') || !positionMenu()) {
      event.preventDefault();
      return;
    }
    status.textContent = '';
  });

  function navigate(event) {
    const link = event.target.closest?.('[data-profile-page]');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
    const pageId = link.dataset.profilePage;
    const samePage = router.getRoute().pageId === pageId;
    router.navigate({ type: 'feature', pageId }, link.hasAttribute('data-profile-transactions')
      ? { historyFilter: 'transaction', force: samePage, replace: samePage } : {});
  }
  menu.addEventListener('click', navigate);
  summary.addEventListener('click', navigate);
  summary.querySelector('.profile-summary__close').addEventListener('click', closeSummary);
  summary.addEventListener('click', event => {
    if (event.target !== summary) return;
    const bounds = summary.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSummary();
  });

  const actions = {
    summary: () => open(),
    messages: openNotifications,
    redeem: openRedeem,
  };
  for (const [name, action] of Object.entries(actions)) {
    menu.querySelector(`[data-profile-action="${name}"]`).addEventListener('click', () => {
      closeMenu();
      trigger.focus({ preventScroll: true });
      action();
    });
  }
  const logout = menu.querySelector('[data-profile-action="logout"]');
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    status.textContent = '';
    try {
      const result = await account.logout();
      if (!result.ok) status.textContent = result.reason || 'Unable to log out.';
    } catch {
      status.textContent = 'Unable to log out.';
    } finally {
      logout.disabled = false;
    }
  });

  window.addEventListener('resize', () => { if (isMenuOpen() && !positionMenu()) closeMenu(); });
  router.subscribe(close);
  account.subscribe(() => {
    if (!account.isSignedIn()) close();
    else {
      if (summary.open) renderSummary();
    }
  });
  return { open };
}
