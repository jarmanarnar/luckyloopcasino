import { SPIN_PRIZES, SPIN_DURATION, spinStatus, spinCountdown, spinClockParts, spinLanding, spinProgress } from './spin-wheel-state.js';
import { createUiIcon } from './ui-icons.js';
import { createWalletCounter } from './wallet-counter.js';
import { CURRENCIES, formatBalance } from './wallet-state.js';
import { initWalletMenu } from './wallet-menu.js';

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
  dialog.setAttribute('aria-label', 'Spin & Win');
  const close = node('button', 'dialog-close icon-button');
  close.type = 'button'; close.setAttribute('aria-label', 'Close Spin & Win');
  close.append(createUiIcon('close'));
  const body = node('div', 'spin-wheel__body');
  const controls = node('div', 'spin-wheel__controls');
  const prizesButton = node('button', 'spin-wheel__text-button', 'View prizes');
  const soundButton = node('button', 'spin-wheel__sound');
  soundButton.type = prizesButton.type = 'button';
  soundButton.setAttribute('aria-label', 'Turn wheel sound on');
  soundButton.setAttribute('aria-pressed', 'false');
  soundButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h4l6-5v16l-6-5H3z"/><path class="spin-sound-on" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8q4 4 0 8m3-11q7 7 0 14"/><path class="spin-sound-off" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m17 9 5 6m0-6-5 6"/></svg>';
  controls.append(prizesButton, soundButton, close);
  const wheelView = node('section', 'spin-wheel__play');
  const intro = node('div', 'spin-wheel__intro');
  intro.append(node('h2', '', 'Make it your lucky day.'));
  const { dial, rotor, pointer } = createDial();
  const stage = node('div', 'spin-wheel__stage'); stage.append(dial);
  const actions = node('div', 'spin-wheel__actions');
  const statusRow = node('div', 'spin-wheel__status');
  const availability = node('p', 'spin-wheel__availability');
  const cooldown = node('div', 'spin-wheel__cooldown'); cooldown.hidden = true;
  const countdown = node('span', 'spin-wheel__next-time');
  countdown.id = 'spin-wheel-next-time'; countdown.setAttribute('role', 'timer'); countdown.setAttribute('aria-live', 'off');
  cooldown.append(node('span', 'spin-wheel__next-label', 'Next free spin in'), countdown);
  statusRow.append(availability, cooldown);
  const spin = node('button', 'spin-wheel__spin', 'Spin & Win'); spin.type = 'button'; spin.id = 'spin-wheel-start';
  const message = node('p', 'spin-wheel__message'); message.setAttribute('role', 'status');
  actions.append(statusRow, spin, message);
  wheelView.append(intro, stage, actions);
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
  // The celebration sits above the wheel. Dismissing it never closes or
  // replaces the wheel, including after the last available spin.
  const winDialog = node('dialog', 'spin-win');
  winDialog.id = 'spin-win-dialog'; winDialog.lang = 'en'; winDialog.dir = 'ltr';
  winDialog.setAttribute('aria-labelledby', 'spin-win-title');
  winDialog.setAttribute('aria-describedby', 'spin-win-amount spin-win-currency');
  const winClose = node('button', 'dialog-close icon-button spin-win__close');
  winClose.type = 'button'; winClose.setAttribute('aria-label', 'Close reward and return to wheel');
  winClose.append(createUiIcon('close'));
  const winWalletArea = node('div', 'header-wallet-controls spin-win__wallet-area');
  const winWallet = node('button', 'wallet-switch wallet-balance-trigger spin-win__wallet');
  winWallet.type = 'button';
  winWallet.setAttribute('aria-haspopup', 'dialog');
  winWallet.setAttribute('aria-expanded', 'false');
  winWallet.setAttribute('aria-controls', 'spin-win-wallet-menu');
  const winWalletCoin = node('img', 'coin-art');
  winWalletCoin.alt = ''; winWalletCoin.width = winWalletCoin.height = 24;
  const winWalletValue = node('strong', 'wallet-balance-value');
  winWalletValue.id = 'spin-win-wallet-value';
  winWalletValue.setAttribute('aria-hidden', 'true');
  const winWalletCopy = node('span', 'wallet-balance-copy');
  winWalletCopy.dir = 'ltr'; winWalletCopy.setAttribute('aria-hidden', 'true');
  winWalletCopy.append(winWalletValue);
  const winWalletChevron = createUiIcon('down'); winWalletChevron.classList.add('wallet-chevron');
  winWallet.append(winWalletCoin, winWalletCopy, winWalletChevron);
  const winWalletPanel = node('section', 'wallet-currency-menu');
  winWalletPanel.id = 'spin-win-wallet-menu'; winWalletPanel.hidden = true;
  winWalletPanel.setAttribute('role', 'dialog'); winWalletPanel.setAttribute('aria-label', 'Wallet currencies');
  const winWalletOptions = new Map(Object.keys(CURRENCIES).map(code => {
    const row = node('div', 'wallet-currency-row');
    const button = node('button', 'wallet-currency-option');
    button.type = 'button'; button.id = `spin-win-wallet-select-${code}`;
    const coin = node('img'); coin.src = coinPath(code); coin.alt = ''; coin.width = coin.height = 18;
    const name = node('span', 'wallet-currency-name');
    const amount = node('strong', 'wallet-currency-amount');
    button.append(coin, name, amount); row.append(button); winWalletPanel.append(row);
    return [code, { row, button, name, amount }];
  }));
  const winWalletHide = node('button', 'wallet-hide-balance');
  winWalletHide.type = 'button'; winWalletHide.setAttribute('role', 'switch');
  const winWalletHideSwitch = node('span', 'wallet-setting-switch'); winWalletHideSwitch.setAttribute('aria-hidden', 'true');
  winWalletHide.append(node('span', '', 'Hide Balance'), winWalletHideSwitch);
  const winWalletFeedback = node('p', 'wallet-menu-status'); winWalletFeedback.setAttribute('role', 'status');
  winWalletPanel.append(winWalletHide, winWalletFeedback);
  winWalletArea.append(winWallet, winWalletPanel);
  const resultView = node('section', 'spin-wheel__result');
  resultView.append(node('span', 'spin-wheel__eyebrow', 'LOOKS GOOD ON YOU'));
  const resultHeading = node('h2', '', 'You won!'); resultHeading.id = 'spin-win-title';
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
  resultAmount.id = 'spin-win-amount'; resultCurrency.id = 'spin-win-currency';
  const resultStatus = node('p', 'spin-wheel__result-status', 'Added to your balance'); resultStatus.setAttribute('role', 'status');
  const done = node('button', 'spin-wheel__spin', 'Back to wheel'); done.type = 'button';
  resultView.append(resultHeading, resultArt, resultAmount, resultCurrency, resultStatus, done);
  winDialog.append(winWalletArea, winClose, resultView);
  body.append(wheelView, prizeView);
  dialog.append(controls, body); document.body.append(dialog);
  document.body.append(winDialog);

  const launchers = [];
  const launcherClocks = [];
  let launcherBadge;
  if (document.querySelector('#menu-content')) {
    const launcher = node('button', 'spin-launcher'); launcher.type = 'button';
    launcher.dataset.tooltip = 'Spin & Win'; launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-controls', dialog.id);
    const copy = node('span', 'spin-launcher__copy');
    const clock = createClock();
    copy.append(node('strong', '', 'Spin & Win'), clock.clock);
    launcherBadge = node('span', 'spin-launcher__badge', 'Available soon'); launcherBadge.hidden = true;
    const artwork = node('span', 'spin-launcher__art');
    artwork.setAttribute('aria-hidden', 'true');
    artwork.append(node('span', 'spin-launcher__spark spin-launcher__spark--gold'), node('span', 'spin-launcher__spark spin-launcher__spark--violet'), createDial(true).dial);
    launcher.append(launcherBadge, copy, artwork);
    launcher.id = 'menu-spin-wheel';
    document.querySelector('#menu-search').after(launcher);
    launchers.push(launcher); launcherClocks.push(clock);
  }

  // Rewards uses the same compact list pattern as the other reward entries.
  // Only its action opens the wheel; the promotional banner belongs in the menu.
  const rewardsHost = document.querySelector('#rewards-popover');
  let rewardsList, rewardsAction, rewardsDescription, rewardsWaiting, rewardsNextTime;
  if (rewardsHost) {
    rewardsList = node('ul', 'rewards-popover__list rewards-popover__wheel');
    const row = node('li', 'reward-preview reward-preview--wheel');
    const artwork = createDial(true).dial;
    artwork.classList.add('reward-preview__wheel');
    const copy = node('div', 'reward-preview__copy');
    rewardsDescription = node('span', 'reward-preview__status', 'Wheel of Fortune');
    rewardsDescription.id = 'rewards-spin-description';
    copy.append(node('strong', '', 'Spin & Win Now!'), rewardsDescription);
    rewardsAction = node('button', 'reward-preview__action reward-preview__spin', 'Spin & Win');
    rewardsAction.type = 'button'; rewardsAction.id = 'rewards-spin-wheel';
    rewardsAction.setAttribute('aria-haspopup', 'dialog');
    rewardsAction.setAttribute('aria-controls', dialog.id);
    rewardsAction.setAttribute('aria-describedby', rewardsDescription.id);
    rewardsWaiting = node('div', 'reward-preview__waiting');
    rewardsWaiting.id = 'rewards-spin-waiting';
    rewardsWaiting.setAttribute('role', 'timer');
    rewardsWaiting.setAttribute('aria-live', 'off');
    rewardsNextTime = node('strong', 'reward-preview__countdown');
    rewardsNextTime.id = 'rewards-spin-next-time';
    rewardsWaiting.append(node('span', 'reward-preview__waiting-label', 'Available In'), rewardsNextTime);
    const rewardControl = node('div', 'reward-preview__wheel-control');
    rewardControl.append(rewardsAction, rewardsWaiting);
    row.append(artwork, copy, rewardControl);
    rewardsList.append(row);
    rewardsHost.querySelector('header').after(rewardsList);
    launchers.push(rewardsAction);
  }

  let phase = 'wheel', spinning = false, animation = null, angle = 0, opener = null, dialogSession = 0;
  let sound = false, audio = null, ticking = 0, spinFrom = 0, spinTo = 0, tickSegment = 0, pointerAnimation = null;
  const spinDuration = SPIN_DURATION;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || account.getMemberState().settings.reducedMotion;
  let winWalletCode = null, winWalletPlayer = null, winWalletTarget = null;
  const winWalletCounter = createWalletCounter({
    duration: 1300,
    onFrame(text) {
      winWalletValue.textContent = account.getMemberState().settings.hideBalance ? '••••••' : text;
    },
  });
  const winWalletMenu = initWalletMenu({ account, router, document,
    elements: { shell: winWalletArea, panel: winWalletPanel, trigger: winWallet, coin: winWalletCoin,
      hide: winWalletHide, feedback: winWalletFeedback, options: winWalletOptions },
    getCurrency: () => winWalletCode ?? account.getSnapshot().wallet.currency,
    inPlay: () => false,
    selectCurrency(code) {
      if (code !== winWalletCode) { winWalletCode = code; updateWinWallet(0); }
      return true;
    },
  });
  winWallet.addEventListener('click', () => winWalletMenu.toggle());
  function updateWinWallet(from) {
    if (!winDialog.open || !winWalletCode) return;
    const snapshot = account.getSnapshot();
    if (!account.isSignedIn() || snapshot.playerId !== winWalletPlayer) { closeAll(); return; }
    const hidden = account.getMemberState().settings.hideBalance;
    const target = snapshot.wallet.balances[winWalletCode];
    const formatter = units => formatBalance(winWalletCode, Math.round(units));
    winWalletMenu.render();
    if (hidden || reduced() || document.hidden) winWalletCounter.immediate(target, formatter);
    else if (from !== undefined || target !== winWalletTarget) {
      if (from !== undefined) winWalletCounter.immediate(from, formatter);
      winWalletCounter.animateTo(target, formatter);
    } else if (winWalletValue.textContent === '••••••') winWalletCounter.immediate(target, formatter);
    winWalletTarget = target;
  }
  function update() {
    const status = spinStatus(account.getSnapshot());
    const availableLabel = `${status.spinsAvailable} free ${status.spinsAvailable === 1 ? 'spin' : 'spins'}`;
    const label = `${availableLabel} available. Next free spin in ${spinCountdown(status.remaining)}`;
    launcherClocks.forEach(item => item.update(status.remaining));
    if (launcherBadge) launcherBadge.hidden = status.available;
    launchers.forEach(element => { element.hidden = !account.isSignedIn(); element.setAttribute('aria-label', `Spin & Win. ${label}`); element.dataset.ready = String(status.available); });
    if (rewardsList) rewardsList.hidden = !account.isSignedIn();
    if (rewardsDescription) rewardsDescription.textContent = status.spinsAvailable > 1 ? `${availableLabel} available` : 'Wheel of Fortune';
    if (rewardsAction) {
      rewardsAction.hidden = !account.isSignedIn() || !status.available;
      rewardsAction.disabled = !status.available || spinning;
      rewardsWaiting.hidden = status.available;
      const nextTime = spinClockParts(status.remaining).join(':');
      if (rewardsNextTime.textContent !== nextTime) rewardsNextTime.textContent = nextTime;
      rewardsWaiting.setAttribute('aria-label', `Next free spin in ${spinCountdown(status.remaining)}`);
    }
    if (spinning) return;
    const lastIndex = SPIN_PRIZES.findIndex(prize => prize.id === status.last?.sourceId);
    if (lastIndex >= 0) {
      angle = (360 - lastIndex * 45) % 360;
      rotor.style.transform = `rotate(${angle}deg)`;
    }
    availability.textContent = status.available ? `${status.spinsAvailable} ${status.spinsAvailable === 1 ? 'spin' : 'spins'} left` : 'No spins left';
    availability.setAttribute('aria-label', status.available ? `${availableLabel} available` : `No spins left. Next free spin in ${spinCountdown(status.remaining)}`);
    availability.dataset.ready = String(status.available);
    actions.dataset.state = status.available ? 'ready' : 'waiting';
    cooldown.hidden = status.available;
    const nextSpin = spinCountdown(status.remaining);
    if (countdown.textContent !== nextSpin) countdown.textContent = nextSpin;
    spin.disabled = !status.available;
    spin.textContent = 'Spin & Win';
  }
  function view(next) {
    phase = next; dialog.dataset.phase = next;
    wheelView.hidden = next !== 'wheel'; prizeView.hidden = next !== 'prizes';
    prizesButton.textContent = next === 'wheel' ? 'View prizes' : 'Back to wheel';
    prizesButton.disabled = spinning;
    body.scrollTop = 0;
    update();
  }
  function showResult(prize, transactionId) {
    if (!dialog.open || winDialog.open) return;
    resultView.dataset.currency = prize.currency;
    resultCoin.src = coinPath(prize.currency);
    resultAmount.textContent = new Intl.NumberFormat('en-US').format(prize.amount / (prize.currency === 'SC' ? 100 : 1));
    resultCurrency.textContent = prize.name;
    const snapshot = account.getSnapshot();
    const credited = snapshot.ledger.find(entry => entry.id === transactionId && entry.currency === prize.currency);
    const from = credited ? credited.balanceAfterUnits - credited.amountUnits
      : Math.max(0, snapshot.wallet.balances[prize.currency] - prize.amount);
    winWalletCode = prize.currency;
    winWalletPlayer = snapshot.playerId;
    winWalletTarget = null;
    view('wheel');
    winDialog.showModal();
    updateWinWallet(from);
    done.focus({ preventScroll: true });
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
    const session = dialogSession, playerId = account.getSnapshot().playerId;
    const stillOpen = () => dialog.open && dialogSession === session && account.isSignedIn() && account.getSnapshot().playerId === playerId;
    spinning = true; spin.disabled = true; prizesButton.disabled = true;
    actions.dataset.state = 'spinning'; cooldown.hidden = true;
    spin.textContent = 'Spinning…'; availability.textContent = 'A little luck is on its way'; message.textContent = '';
    availability.setAttribute('aria-label', 'Spinning the wheel'); availability.dataset.ready = 'false';
    dialog.dataset.spinning = 'true';
    delete dial.dataset.landed;
    try {
      const result = await account.spinWheel();
      if (!stillOpen()) return;
      if (!result.ok) { message.textContent = result.reason; return; }
      const prize = SPIN_PRIZES[result.index];
      const target = spinLanding(result.index, angle);
      if (stillOpen()) {
        spinFrom = angle; spinTo = target; tickSegment = Math.floor((angle + 22.5) / 45);
        const frames = Array.from({ length: 121 }, (_, index) => ({
          offset: index / 120, transform: `rotate(${angle + (target - angle) * spinProgress(index / 120)}deg)`,
        }));
        animation = rotor.animate(frames, { duration: reduced() ? 150 : spinDuration, easing: 'linear', fill: 'forwards' });
        if (!reduced()) tick();
        await animation.finished.catch(() => {});
      }
      if (!stillOpen()) return;
      angle = target % 360; rotor.style.transform = `rotate(${angle}deg)`;
      animation?.cancel(); animation = null;
      stopTicks();
      dial.dataset.landed = 'true';
      if (stillOpen()) {
        tone(1047, .35, .045);
        if (!reduced()) await new Promise(resolve => setTimeout(resolve, 220));
      }
      spinning = false;
      if (stillOpen()) showResult(prize, result.transactionId);
    } catch { message.textContent = 'We could not save your spin. Please try again.'; }
    finally { spinning = false; delete dialog.dataset.spinning; prizesButton.disabled = false; stopTicks(); update(); }
  });
  prizesButton.addEventListener('click', () => view(phase === 'wheel' ? 'prizes' : 'wheel'));
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
  close.addEventListener('click', () => dialog.close());
  done.addEventListener('click', () => winDialog.close());
  winClose.addEventListener('click', () => winDialog.close());
  winDialog.addEventListener('click', event => { if (event.target === winDialog) winDialog.close(); });
  winDialog.addEventListener('close', () => {
    if (winDialog.open) return;
    winWalletMenu.close();
    winWalletCounter.cancel();
    winWalletCode = winWalletPlayer = winWalletTarget = null;
    if (!dialog.open) return;
    view('wheel');
    (spin.disabled ? close : spin).focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialogSession++;
    if (winDialog.open) winDialog.close();
    animation?.cancel(); stopTicks();
    [opener, document.querySelector('#header-rewards'), document.querySelector('#mobile-nav-menu')]
      .find(element => element?.getClientRects().length && !element.closest('[inert]'))?.focus({ preventScroll: true });
  });
  function openSpinWheel({ returnFocusTo = document.activeElement } = {}) {
    return auth.require(() => {
      if (dialog.open || document.querySelector('dialog[open]')) return;
      opener = returnFocusTo;
      dialogSession++;
      view('wheel');
      message.textContent = ''; dialog.showModal();
    });
  }
  document.querySelector('#rewards-spin-wheel')?.addEventListener('click', () => {
    document.querySelector('#rewards-popover').hidePopover();
    openSpinWheel({ returnFocusTo: document.querySelector('#header-rewards') });
  });
  function closeAll() {
    winWalletCounter.cancel();
    if (winDialog.open) winDialog.close();
    if (dialog.open) dialog.close();
  }
  router.subscribe(closeAll);
  account.subscribe(() => { if (!account.isSignedIn()) closeAll(); else updateWinWallet(); update(); });
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('spin-motion-paused', document.hidden);
    if (!document.hidden) { update(); updateWinWallet(); if (spinning && !reduced()) tick(); }
    else { stopTicks(); if (winDialog.open) winWalletCounter.finish(); }
  });
  setInterval(() => { if (!document.hidden) update(); }, 1000);
  update(); view('wheel');
  return { openSpinWheel };
}
