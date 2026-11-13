export function initPhoneVerification({ router, account }) {
  const dialog = document.querySelector('#phone-verification-dialog');
  const numberForm = document.querySelector('#phone-verification-number-form');
  const codeForm = document.querySelector('#phone-verification-code-form');
  const number = document.querySelector('#phone-verification-number');
  const code = document.querySelector('#phone-verification-code');
  const send = numberForm.querySelector('button[type="submit"]');
  const verify = codeForm.querySelector('button[type="submit"]');
  const status = codeForm.querySelector('[role="status"]');

  // This is a nonfunctional preview: never collect a number or advance to codes.
  function reset() {
    numberForm.reset();
    codeForm.reset();
    numberForm.hidden = false;
    codeForm.hidden = true;
    number.disabled = true;
    code.disabled = true;
    send.disabled = true;
    verify.disabled = true;
    status.textContent = '';
  }
  numberForm.addEventListener('submit', event => event.preventDefault());
  codeForm.addEventListener('submit', event => event.preventDefault());
  reset();

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
      dialog.querySelector('.phone-verification__close')?.focus({ preventScroll: true });
    },
  };
}
