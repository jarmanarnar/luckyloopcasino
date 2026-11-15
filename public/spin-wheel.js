import { SPIN_PRIZES, SPIN_DURATION, spinStatus, spinCountdown, spinClockParts, spinLanding, spinProgress } from './spin-wheel-state.js';
import { createUiIcon } from './ui-icons.js';

const coinPath = currency => `assets/coins/${currency === 'GC' ? 'gold' : 'super'}-coin-front.png`;
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};
const svgNode = (tag, attributes = {}) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
};

let dialId = 0;
function wheelFace(mini, id) {
  const svg = svgNode('svg', { viewBox: '0 0 400 400', 'aria-hidden': 'true' });
  const defs = svgNode('defs');
  // Concentric shading stays centered as the sectors rotate. The directional
  // reflection and metal surround are separate, stationary layers.
  for (const name of ['gold', 'violet']) {
    const gradient = svgNode('radialGradient', { id: `${id}-${name}`, cx: 200, cy: 200, r: 172, gradientUnits: 'userSpaceOnUse' });
    ['light', 'mid', 'shade'].forEach((tone, index) => gradient.append(svgNode('stop', { offset: `${index * 50}%`, 'stop-color': `var(--wheel-${name}-${tone})` })));
    defs.append(gradient);
  }
  svg.append(defs);
  const point = (radius, degrees) => {
    const radians = (degrees - 90) * Math.PI / 180;
    return `${200 + Math.cos(radians) * radius},${200 + Math.sin(radians) * radius}`;
  };
  SPIN_PRIZES.forEach((prize, index) => {
    const tone = index % 2 === 0 ? 'gold' : 'violet';
    const group = svgNode('g', { transform: `rotate(${index * 45} 200 200)`, 'data-segment': index, 'data-tone': tone });
    group.append(svgNode('path', {
      d: `M ${point(42, -22.5)} L ${point(172, -22.5)} A 172 172 0 0 1 ${point(172, 22.5)} L ${point(42, 22.5)} A 42 42 0 0 0 ${point(42, -22.5)} Z`,
      fill: `url(#${id}-${tone})`, stroke: '#30363e', 'stroke-width': '2', 'stroke-linejoin': 'round',
    }));
    group.append(svgNode('path', {
      d: `M ${point(47, -22)} L ${point(170, -22)} A 170 170 0 0 1 ${point(170, 22)}`,
      fill: 'none', stroke: '#ffffff60', 'stroke-width': '1', 'stroke-linecap': 'round',
    }));
    // The small outer pegs move with the wheel; the rim does not.
    const [cx, cy] = point(178, 22.5).split(',');
    group.append(svgNode('circle', { cx, cy, r: 2.5, fill: '#edf3f7', stroke: '#67717b', 'stroke-width': 1 }));
    if (!mini) {
      group.append(svgNode('image', { href: coinPath(prize.currency), x: 184, y: 52, width: 32, height: 32 }));
      const amount = svgNode('text', { x: 200, y: 111, 'text-anchor': 'middle', class: 'spin-dial__amount' });
      amount.textContent = prize.label;
      const label = svgNode('text', { x: 200, y: 129, 'text-anchor': 'middle', class: 'spin-dial__currency' });
      label.textContent = prize.currency;
      group.append(amount, label);
    }
    svg.append(group);
  });
  return svg;
}

function createDial(mini = false) {
  const dial = node('div', `spin-dial${mini ? ' spin-dial--mini' : ''}`);
  dial.setAttribute('aria-hidden', 'true');
  const frame = node('div', 'spin-dial__frame');
  const viewport = node('div', 'spin-dial__viewport');
  const rotor = node('div', 'spin-dial__rotor');
  rotor.append(wheelFace(mini, `spin-dial-${++dialId}`));
  viewport.append(rotor);
  const reflection = node('div', 'spin-dial__reflection');
  const hub = node('div', 'spin-dial__hub');
  const logo = node('img');
  logo.src = 'assets/brand/cop-coin-cc.png'; logo.alt = ''; logo.width = 80; logo.height = 46;
  hub.append(logo);
  const pointer = node('span', 'spin-dial__pointer');
  dial.append(frame, viewport, reflection, hub, pointer);
  return { dial, rotor, pointer };
}

function createClock() {
  const clock = node('span', 'spin-countdown');
  clock.setAttribute('aria-hidden', 'true');
  const digits = ['d', 'h', 'm', 's'].map(unit => {
    const part = node('span', 'spin-countdown__part');
    const value = node('strong', '', '00');
    part.append(value, node('small', '', unit)); clock.append(part);
    return value;
  });
  return { clock, update(remaining) {
    const values = spinClockParts(remaining);
    digits.forEach((digit, index) => {
      if (digit.textContent !== values[index]) digit.textContent = values[index];
      digit.parentElement.dataset.zero = String(values[index] === '00');
    });
  } };
}

export function initSpinWheel({ account, auth, router }) {
  const dialog = node('dialog', 'spin-wheel');
  dialog.id = 'spin-wheel-dialog'; dialog.lang = 'en'; dialog.dir = 'ltr';
  dialog.setAttribute('aria-labelledby', 'spin-wheel-title');
  const header = node('header', 'dialog-header');
  const title = node('h2', '', 'Spin & Win'); title.id = 'spin-wheel-title';
  const close = node('button', 'dialog-close icon-button');
  close.type = 'button'; close.setAttribute('aria-label', 'Close Spin & Win');
  close.append(createUiIcon('close'));
  header.append(title, close);
  const body = node('div', 'spin-wheel__body');
  const controls = node('div', 'spin-wheel__controls');
  const prizesButton = node('button', 'spin-wheel__text-button', 'View prizes');
  const soundButton = node('button', 'spin-wheel__sound');
  soundButton.type = prizesButton.type = 'button';
  soundButton.setAttribute('aria-label', 'Turn wheel sound on');
  soundButton.setAttribute('aria-pressed', 'false');
  soundButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h4l6-5v16l-6-5H3z"/><path class="spin-sound-on" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8q4 4 0 8m3-11q7 7 0 14"/><path class="spin-sound-off" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m17 9 5 6m0-6-5 6"/></svg>';
  controls.append(prizesButton, soundButton);
  const wheelView = node('section', 'spin-wheel__play');
  const intro = node('div', 'spin-wheel__intro');
  intro.append(node('span', 'spin-wheel__eyebrow', 'THE DAILY SPIN'), node('h3', '', 'Make it your lucky day.'));
  const { dial, rotor, pointer } = createDial();
  const stage = node('div', 'spin-wheel__stage'); stage.append(dial);
  const availability = node('p', 'spin-wheel__availability');
  const cooldownClock = createClock(); cooldownClock.clock.classList.add('spin-countdown--large');
  const spin = node('button', 'spin-wheel__spin', 'Spin & Win'); spin.type = 'button'; spin.id = 'spin-wheel-start';
  const lastReward = node('button', 'spin-wheel__text-button spin-wheel__last', 'View last reward'); lastReward.type = 'button';
  const note = node('p', 'spin-wheel__note', 'Demo rewards · One free spin every 24 hours');
  const message = node('p', 'spin-wheel__message'); message.setAttribute('role', 'status');
  wheelView.append(intro, stage, availability, cooldownClock.clock, spin, lastReward, note, message);
  const prizeView = node('section', 'spin-wheel__prizes');
  prizeView.hidden = true;
  prizeView.append(node('h3', '', 'Something good in every spin.'), node('p', 'spin-wheel__note', '8 demo prizes. Each has a 1 in 8 chance.'));
  const list = node('ul', 'spin-wheel__prize-list');
  for (const prize of SPIN_PRIZES) {
    const row = node('li'); row.dataset.currency = prize.currency;
    const image = node('img'); image.src = coinPath(prize.currency); image.alt = ''; image.width = image.height = 40;
    const copy = node('div'); copy.append(node('strong', '', new Intl.NumberFormat('en-US').format(prize.amount / (prize.currency === 'SC' ? 100 : 1))), node('span', '', prize.name));
    row.append(image, copy, node('span', 'spin-wheel__chance', '12.5%'));
    list.append(row);
  }
  prizeView.append(list);
  const resultView = node('section', 'spin-wheel__result'); resultView.hidden = true;
  resultView.append(node('span', 'spin-wheel__eyebrow', 'LOOKS GOOD ON YOU'));
  const resultHeading = node('h3', '', 'You won!');
  const resultArt = node('div', 'spin-wheel__result-art');
  const confetti = node('div', 'spin-wheel__confetti'); confetti.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i++) {
    const piece = node('i');
    const radians = (i / 28 * 360) * Math.PI / 180;
    piece.style.setProperty('--confetti-x', `${Math.cos(radians) * (90 + (i % 3) * 25)}px`);
    piece.style.setProperty('--confetti-y', `${Math.sin(radians) * (90 + (i % 4) * 18)}px`);
    piece.style.setProperty('--confetti-turn', `${i * 37}deg`);
    piece.style.setProperty('--confetti-delay', `${i % 5 * 35}ms`);
    confetti.append(piece);
  }
  const resultCoin = node('img'); resultCoin.alt = ''; resultCoin.width = resultCoin.height = 144;
  resultArt.append(confetti, resultCoin);
  const resultAmount = node('strong', 'spin-wheel__result-amount');
  const resultCurrency = node('p', 'spin-wheel__result-currency');
  const resultStatus = node('p', 'spin-wheel__result-status', 'Added to your demo balance'); resultStatus.setAttribute('role', 'status');
  const done = node('button', 'spin-wheel__spin', 'Continue'); done.type = 'button';
  resultView.append(resultHeading, resultArt, resultAmount, resultCurrency, resultStatus, done);
  body.append(controls, wheelView, prizeView, resultView);
  dialog.append(header, body); document.body.append(dialog);

  const launchers = [];
  const launcherClocks = [];
  for (const selector of ['#menu-content', '#rewards-popover']) {
    const host = document.querySelector(selector);
    if (!host) continue;
    const launcher = node('button', 'spin-launcher'); launcher.type = 'button';
    launcher.dataset.tooltip = 'Spin & Win'; launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-controls', dialog.id);
    const copy = node('span', 'spin-launcher__copy');
    const badge = node('span', 'spin-launcher__badge');
    const status = node('span', 'spin-launcher__status', '1 free spin');
    const clock = createClock();
    copy.append(node('strong', '', 'Spin & Win'), status, clock.clock);
    const artwork = node('span', 'spin-launcher__art');
    artwork.setAttribute('aria-hidden', 'true');
    artwork.append(node('span', 'spin-launcher__spark spin-launcher__spark--gold'), node('span', 'spin-launcher__spark spin-launcher__spark--violet'), createDial(true).dial);
    launcher.append(badge, copy, artwork);
    if (selector === '#menu-content') { launcher.id = 'menu-spin-wheel'; document.querySelector('#menu-search').after(launcher); }
    else { launcher.id = 'rewards-spin-wheel'; host.querySelector('header').after(launcher); }
    launchers.push(launcher); launcherClocks.push({ ...clock, badge, status });
  }

  let phase = 'wheel', spinning = false, animation = null, angle = 0, opener = null, recentPrize = null;
  let sound = false, audio = null, ticking = 0, spinFrom = 0, spinTo = 0, tickSegment = 0, pointerAnimation = null;
  const spinDuration = SPIN_DURATION;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || account.getMemberState().settings.reducedMotion;
  function update() {
    const status = spinStatus(account.getSnapshot());
    const label = status.available ? 'Free spin ready' : `Next in ${spinCountdown(status.remaining)}`;
    launcherClocks.forEach(item => {
      item.badge.textContent = status.available ? 'Free spin ready' : 'Available soon';
      item.status.hidden = !status.available;
      item.clock.hidden = status.available;
      item.update(status.remaining);
    });
    launchers.forEach(element => { element.setAttribute('aria-label', `Spin & Win. ${label}`); element.dataset.ready = String(status.available); });
    if (spinning) return;
    const lastIndex = SPIN_PRIZES.findIndex(prize => prize.id === status.last?.sourceId);
    if (lastIndex >= 0) {
      angle = (360 - lastIndex * 45) % 360;
      rotor.style.transform = `rotate(${angle}deg)`;
    }
    availability.textContent = status.available ? '1 free spin. Make it count.' : 'Your next free spin in';
    availability.setAttribute('aria-label', status.available ? '1 free spin available' : `Next free spin in ${spinCountdown(status.remaining)}`);
    cooldownClock.clock.hidden = status.available;
    cooldownClock.update(status.remaining);
    availability.dataset.ready = String(status.available);
    spin.disabled = !status.available;
    spin.textContent = status.available ? 'Spin & Win' : 'Come back for your next spin';
    lastReward.hidden = !status.last;
  }
  function view(next) {
    phase = next; dialog.dataset.phase = next;
    wheelView.hidden = next !== 'wheel'; prizeView.hidden = next !== 'prizes'; resultView.hidden = next !== 'result';
    prizesButton.textContent = next === 'wheel' ? 'View prizes' : 'Back to wheel';
    prizesButton.disabled = spinning;
    body.scrollTop = 0;
    update();
  }
  function showResult(prize) {
    recentPrize = prize;
    resultView.dataset.currency = prize.currency;
    resultCoin.src = coinPath(prize.currency);
    resultAmount.textContent = new Intl.NumberFormat('en-US').format(prize.amount / (prize.currency === 'SC' ? 100 : 1));
    resultCurrency.textContent = prize.name;
    view('result');
    if (dialog.open) done.focus({ preventScroll: true });
  }
  function tone(frequency = 700, duration = .035, volume = .025) {
    if (!sound || !audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function stopTicks() { cancelAnimationFrame(ticking); ticking = 0; pointerAnimation?.cancel(); }
  function tick() {
    if (!spinning || !dialog.open) return;
    const elapsed = Number(animation?.currentTime || 0) / spinDuration;
    const position = spinFrom + (spinTo - spinFrom) * spinProgress(elapsed);
    const segment = Math.floor((position + 22.5) / 45);
    if (segment !== tickSegment) {
      tickSegment = segment;
      tone(660, .025, .02);
      pointerAnimation?.cancel();
      pointerAnimation = pointer.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-17deg)', offset: .3 }, { transform: 'rotate(0deg)' }], { duration: 140, easing: 'ease-out' });
    }
    ticking = requestAnimationFrame(tick);
  }
  spin.addEventListener('click', async () => {
    if (spinning || !spinStatus(account.getSnapshot()).available) return;
    spinning = true; spin.disabled = true; prizesButton.disabled = true; lastReward.hidden = true;
    spin.textContent = 'Spinning…'; availability.textContent = 'A little luck is on its way'; message.textContent = '';
    cooldownClock.clock.hidden = true;
    dialog.dataset.spinning = 'true';
    delete dial.dataset.landed;
    try {
      const result = await account.spinWheel();
      if (!result.ok) { message.textContent = result.reason; return; }
      const prize = SPIN_PRIZES[result.index];
      const target = spinLanding(result.index, angle);
      if (dialog.open) {
        spinFrom = angle; spinTo = target; tickSegment = Math.floor((angle + 22.5) / 45);
        const frames = Array.from({ length: 121 }, (_, index) => ({
          offset: index / 120, transform: `rotate(${angle + (target - angle) * spinProgress(index / 120)}deg)`,
        }));
        animation = rotor.animate(frames, { duration: reduced() ? 150 : spinDuration, easing: 'linear', fill: 'forwards' });
        if (!reduced()) tick();
        await animation.finished.catch(() => {});
      }
      angle = target % 360; rotor.style.transform = `rotate(${angle}deg)`;
      animation?.cancel(); animation = null;
      stopTicks();
      dial.dataset.landed = 'true';
      if (dialog.open) {
        tone(1047, .35, .045);
        if (!reduced()) await new Promise(resolve => setTimeout(resolve, 220));
      }
      spinning = false;
      showResult(prize);
    } catch { message.textContent = 'We could not save your spin. Please try again.'; }
    finally { spinning = false; delete dialog.dataset.spinning; prizesButton.disabled = false; stopTicks(); update(); }
  });
  prizesButton.addEventListener('click', () => view(phase === 'wheel' ? 'prizes' : 'wheel'));
  lastReward.addEventListener('click', () => {
    const last = spinStatus(account.getSnapshot()).last;
    const prize = SPIN_PRIZES.find(item => item.id === last?.sourceId);
    if (prize) showResult(prize);
  });
  soundButton.addEventListener('click', async () => {
    if (!sound) {
      try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); }
      catch { return; }
    }
    sound = !sound;
    soundButton.setAttribute('aria-pressed', String(sound));
    soundButton.setAttribute('aria-label', sound ? 'Turn wheel sound off' : 'Turn wheel sound on');
    if (sound) tone();
  });
  close.addEventListener('click', () => dialog.close()); done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    animation?.cancel(); stopTicks();
    [opener, document.querySelector('#header-rewards'), document.querySelector('#mobile-nav-menu')]
      .find(element => element?.getClientRects().length && !element.closest('[inert]'))?.focus({ preventScroll: true });
  });
  function openSpinWheel({ returnFocusTo = document.activeElement } = {}) {
    return auth.require(() => {
      if (dialog.open || document.querySelector('dialog[open]')) return;
      opener = returnFocusTo;
      if (phase !== 'result' || !recentPrize || spinStatus(account.getSnapshot()).available) view('wheel');
      else view('result');
      message.textContent = ''; dialog.showModal();
    });
  }
  document.querySelector('#rewards-spin-wheel')?.addEventListener('click', () => {
    document.querySelector('#rewards-popover').hidePopover();
    openSpinWheel({ returnFocusTo: document.querySelector('#header-rewards') });
  });
  router.subscribe(() => { if (dialog.open) dialog.close(); });
  account.subscribe(() => { if (!account.isSignedIn() && dialog.open) dialog.close(); update(); });
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('spin-motion-paused', document.hidden);
    if (!document.hidden) { update(); if (spinning && !reduced()) tick(); }
    else stopTicks();
  });
  setInterval(() => { if (!document.hidden) update(); }, 1000);
  update(); view('wheel');
  return { openSpinWheel };
}
