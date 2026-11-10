export function initPhoneVerification({ router, account }) {
  const dialog = document.querySelector('#phone-verification-dialog');
  const numberForm = document.querySelector('#phone-verification-number-form');
  const codeForm = document.querySelector('#phone-verification-code-form');
  const number = document.querySelector('#phone-verification-number');
  const code = document.querySelector('#phone-verification-code');
  const send = numberForm.querySelector('button[type="submit"]');
  const verify = codeForm.querySelector('button[type="submit"]');
  const status = codeForm.querySelector('[role="status"]');

  function validNumber() {
    return /^[0-9 ()+.-]+$/.test(number.value) && /^1?[0-9]{10}$/.test(number.value.replace(/\D/g, ''));
  }
  function validCode() {
    return /^[0-9]{6}$/.test(code.value);
  }
  function reset() {
    numberForm.reset();
    codeForm.reset();
    numberForm.hidden = false;
    codeForm.hidden = true;
    send.disabled = true;
    verify.disabled = true;
    status.textContent = '';
  }

  number.addEventListener('input', () => { send.disabled = !validNumber(); });
  code.addEventListener('input', () => {
    verify.disabled = !validCode();
    status.textContent = '';
  });
  numberForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!validNumber()) return;
    numberForm.reset();
    send.disabled = true;
    numberForm.hidden = true;
    codeForm.hidden = false;
    code.focus({ preventScroll: true });
  });
  codeForm.addEventListener('submit', event => {
    event.preventDefault();
    if (validCode()) {
      status.textContent = 'Demo only';
      codeForm.reset();
      verify.disabled = true;
      code.focus({ preventScroll: true });
    }
  });
  codeForm.querySelector('.phone-verification__back').addEventListener('click', () => {
    reset();
    number.focus({ preventScroll: true });
  });

  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', () => { if (!dialog.open) reset(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  router.subscribe(close);
  account.subscribe(() => { if (!account.isSignedIn()) close(); });

  return {
    open() {
      if (document.querySelector('dialog[open]:not(#store-dialog)')) return;
      reset();
      dialog.showModal();
      number.focus({ preventScroll: true });
    },
  };
}
