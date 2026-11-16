// Local design playground: no account modules, storage or network mutations.
const states = [
  ['default', 'רגיל'], ['hover', 'ריחוף'], ['pressed', 'לחוץ'],
  ['focus', 'מיקוד'], ['disabled', 'מושבת'],
];
const families = [
  ['primary', 'Primary', 'פעולה ראשית', 'Save changes'],
  ['secondary', 'Secondary', 'פעולה משנית', 'Cancel'],
  ['quiet', 'Text action', 'פעולה שקטה', 'View details'],
  ['danger', 'Remove', 'פעולת הסרה', 'Remove photo'],
];
const stateAttributes = state => state === 'disabled' ? 'disabled' : state === 'default' ? '' : `data-state="${state}"`;
document.querySelector('#button-states').innerHTML = families.map(([variant, title, description, label]) => `
  <div class="lab-state-row" role="group" aria-label="${title}">
    <div class="lab-family" lang="en">${title}<small lang="he">${description}</small></div>
    ${states.map(([state, stateLabel]) => `<div class="lab-state-sample"><span class="lab-state-label">${stateLabel}</span><button class="ui-button ui-button--${variant}" type="button" ${stateAttributes(state)} lang="en" aria-label="${title}: ${stateLabel}" data-feedback="דוגמה קבועה: ${description} · ${stateLabel}">${label}</button></div>`).join('')}
  </div>`).join('');
document.querySelector('#close-states').innerHTML = states.map(([state, label]) => `
  <div class="lab-close-sample"><button type="button" class="ui-close" ${stateAttributes(state)} aria-label="סגירה: ${label}" data-feedback="דוגמה קבועה: סגירה · ${label}"><svg aria-hidden="true"><use href="#icon-close"/></svg></button><span class="lab-state-label">${label}</span></div>`).join('');

const defaults = { radius: 10, glow: 12, depth: 2 };
const controls = Object.fromEntries(Object.keys(defaults).map(key => [key, document.getElementById(key)]));
function updateTuning() {
  for (const [key, input] of Object.entries(controls)) {
    const unit = key === 'glow' ? '%' : 'px';
    document.documentElement.style.setProperty(`--lab-${key}`, `${input.value}${unit}`);
    document.getElementById(`${key}-value`).value = `${input.value}${key === 'glow' ? '%' : ''}`;
  }
}
Object.values(controls).forEach(input => input.addEventListener('input', updateTuning));
document.querySelector('#reset-tuning').addEventListener('click', () => {
  for (const [key, value] of Object.entries(defaults)) controls[key].value = value;
  updateTuning();
  showFeedback('חזרנו להגדרות המקוריות של הדוגמה');
});

let feedbackTimer;
const feedback = document.querySelector('#lab-feedback');
function showFeedback(message) {
  clearTimeout(feedbackTimer);
  feedback.textContent = message;
  feedback.setAttribute('data-visible', '');
  feedbackTimer = setTimeout(() => feedback.removeAttribute('data-visible'), 3000);
}
document.addEventListener('click', event => {
  const sample = event.target.closest('[data-feedback]');
  if (sample && !sample.disabled) showFeedback(sample.dataset.feedback);
});

const dialog = document.querySelector('#preview-dialog');
const form = document.querySelector('#preview-form');
const name = document.querySelector('#preview-name');
const shell = document.querySelector('#preview-name-shell');
const help = document.querySelector('#preview-name-help');
const submit = document.querySelector('#preview-submit');
const status = document.querySelector('#preview-status');
let saveTimer;
let opener;
function resetFeedback() {
  shell.removeAttribute('data-state');
  name.removeAttribute('aria-invalid');
  help.classList.remove('ui-help--error');
  help.textContent = '2–24 characters.';
  status.textContent = '';
}
function restoreSubmit() {
  clearTimeout(saveTimer);
  submit.disabled = false;
  submit.removeAttribute('aria-busy');
  submit.textContent = 'Save changes';
  name.readOnly = false;
}
function openPreview(event) {
  opener = event.currentTarget;
  form.reset();
  resetFeedback();
  restoreSubmit();
  dialog.showModal();
  name.focus();
}
document.querySelector('#open-preview').addEventListener('click', openPreview);
document.querySelector('#open-preview-save').addEventListener('click', openPreview);
document.querySelectorAll('[data-close-preview]').forEach(button => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('close', () => {
  restoreSubmit();
  resetFeedback();
  opener?.focus();
});
name.addEventListener('input', resetFeedback);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (submit.disabled) return;
  resetFeedback();
  if (name.value.trim().length < 2) {
    name.setAttribute('aria-invalid', 'true');
    shell.dataset.state = 'error';
    help.classList.add('ui-help--error');
    help.textContent = 'Use at least 2 characters.';
    status.textContent = 'Please check your display name.';
    name.focus();
    return;
  }
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  submit.innerHTML = '<span class="lab-spinner" aria-hidden="true"></span> Saving…';
  name.readOnly = true;
  status.textContent = 'Saving the preview…';
  saveTimer = setTimeout(() => {
    restoreSubmit();
    status.textContent = 'Preview saved. Your account was not changed.';
  }, 1000);
});
