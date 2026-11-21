import { requestDialogClose } from './dialog-motion.js';

import { createUiIcon } from './ui-icons.js';

export function initIdentityVerification({ account, auth, router, onVerified, document: doc = document }) {
  const node = (tag, css, text) => { const el = doc.createElement(tag); if (css) el.className = css; if (text) el.textContent = text; return el; };
  const dialog = node('dialog', 'achievement-dialog identity-verification'); dialog.id = 'identity-verification-dialog'; dialog.dir = 'ltr'; dialog.lang = 'en';
  dialog.setAttribute('aria-labelledby', 'identity-verification-title');
  const close = node('button', 'dialog-close icon-button achievement-dialog__close'); close.type = 'button'; close.setAttribute('aria-label', 'Close verification'); close.append(createUiIcon('close'));
  const title = node('h2'); title.id = 'identity-verification-title';
  const description = node('p', 'achievement-dialog__description');
  const form = node('form', 'identity-verification__form');
  const label = node('label'); label.htmlFor = 'identity-verification-contact';
  const contact = node('input'); contact.id = label.htmlFor; contact.required = true;
  const codeLabel = node('label', '', 'Verification code'); codeLabel.htmlFor = 'identity-verification-code';
  const code = node('input'); code.id = codeLabel.htmlFor; code.type = 'text'; code.inputMode = 'numeric'; code.autocomplete = 'one-time-code'; code.pattern = '[0-9]{4,10}'; code.maxLength = 10;
  const status = node('p', 'achievement-dialog__notice'); status.setAttribute('role', 'status');
  const submit = node('button', 'achievement-claim'); submit.type = 'submit';
  const resend = node('button', 'achievement-dialog__secondary', 'Send a new code'); resend.type = 'button';
  const done = node('button', 'achievement-claim', 'View reward'); done.type = 'button';
  form.append(label, contact, codeLabel, code, status, submit, resend, done); dialog.append(close, title, description, form); doc.body.append(dialog);
  let channel = null, challengeId = null, busy = false, verified = false, generation = 0, opener = null, timer = null;
  const cooldown = { email: 0, phone: 0 };
  const available = () => account.getCapabilities?.().verification?.[channel] === true;
  function render() {
    const sent = Boolean(challengeId), seconds = Math.max(0, Math.ceil((cooldown[channel] - Date.now()) / 1000));
    title.textContent = verified ? `${channel === 'email' ? 'Email' : 'Phone'} verified` : `Verify your ${channel === 'email' ? 'email' : 'phone'}`;
    description.textContent = verified ? 'Your achievement reward is ready to claim.' : !available()
      ? 'Verification is currently unavailable. Please try again later.' : sent
        ? 'Enter the code you received. Codes expire after 10 minutes.' : channel === 'email'
          ? 'We will send a code to your account email address.' : 'Enter your phone number including the country code, for example +12025550123.';
    label.hidden = contact.hidden = verified || !available() || sent;
    codeLabel.hidden = code.hidden = verified || !available() || !sent;
    code.required = !code.hidden; contact.required = !contact.hidden;
    contact.disabled = busy; code.disabled = busy;
    submit.hidden = verified || !available(); submit.disabled = busy || (!sent && seconds > 0);
    submit.textContent = busy ? 'Please wait…' : sent ? 'Verify code' : seconds ? `Send code in ${seconds}s` : 'Send code';
    resend.hidden = verified || !available() || !sent; resend.disabled = busy || seconds > 0;
    resend.textContent = seconds ? `Send a new code in ${seconds}s` : 'Send a new code';
    done.hidden = !verified;
  }
  async function run(check) {
    if (busy || !available() || !account.isSignedIn() || !(check ? code.reportValidity() : contact.reportValidity())) return;
    const runGeneration = generation, playerId = account.getSnapshot().playerId, runChannel = channel;
    busy = true; status.textContent = ''; render();
    try {
      const result = check ? await account.checkVerification(runChannel, challengeId, code.value.trim())
        : await account.startVerification(runChannel, contact.value.trim());
      if (!dialog.open || runGeneration !== generation || playerId !== account.getSnapshot().playerId) return;
      if (result.ok) {
        verified = result.verified === true;
        if (!verified) { challengeId = result.challengeId; cooldown[channel] = Date.now() + 60000; code.value = ''; status.textContent = 'Code sent. Check your messages.'; }
      } else status.textContent = result.reason || 'Please try again.';
    } catch { if (dialog.open && runGeneration === generation) status.textContent = 'Unable to connect. Please try again.'; }
    finally {
      busy = false;
      if (dialog.open) { render(); if (runGeneration === generation) (verified ? done : challengeId ? code : contact).focus({ preventScroll: true }); }
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void run(Boolean(challengeId)); });
  resend.addEventListener('click', () => {
    if (busy || cooldown[channel] > Date.now()) return;
    // A resend validates the contact, not an unfinished code.
    void run(false);
  });
  done.addEventListener('click', () => { const completed = channel; dialog.close(); doc.querySelector('#store-dialog[open]')?.close(); onVerified?.(completed); });
  close.addEventListener('click', () => requestDialogClose(dialog));
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestDialogClose(dialog);
  } });
  dialog.addEventListener('close', () => { generation++; clearInterval(timer); timer = null; code.value = ''; contact.value = ''; if (!doc.querySelector('dialog[open]') && opener?.isConnected) opener.focus({ preventScroll: true }); });
  router.subscribe(() => { if (dialog.open) dialog.close(); });
  account.subscribe(() => {
    if (!dialog.open) return;
    if (!account.isSignedIn()) dialog.close();
    else { verified = account.getMemberState().achievementStats[`${channel}Verified`] === true; render(); }
  });
  return { open(nextChannel) { return auth.require(() => {
    if (!['email', 'phone'].includes(nextChannel) || doc.querySelector('dialog[open]:not(#store-dialog)')) return;
    generation++; channel = nextChannel; challengeId = null; opener = doc.activeElement; status.textContent = ''; code.value = '';
    verified = account.getMemberState().achievementStats[`${channel}Verified`] === true;
    contact.type = channel === 'email' ? 'email' : 'tel'; contact.autocomplete = channel === 'email' ? 'email' : 'tel';
    contact.readOnly = channel === 'email'; contact.value = channel === 'email' ? account.getSnapshot().identity?.email || '' : '';
    label.textContent = channel === 'email' ? 'Email address' : 'Phone number';
    render(); dialog.showModal(); (verified ? done : available() ? contact : close).focus({ preventScroll: true });
    timer = setInterval(() => { if (dialog.open) render(); }, 1000);
  }); } };
}

