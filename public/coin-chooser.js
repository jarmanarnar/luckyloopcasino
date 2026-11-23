const coinInfo = {
 GC: { question: 'What are Gold Coins?', answer: 'Gold Coins are virtual coins for social play. They have no cash value. The game demo uses its own balance.' },
 SC: { question: 'What are Super Coins?', answer: 'Super Coins have a separate balance. You can preview this mode here, but play is unavailable in this demo.' },
};

export function initCoinChooser({ document: doc = document, onPlay, onSelect = async () => {} }) {
 const gc=doc.querySelector('#game-play-gc'), sc=doc.querySelector('#game-play-sc'), play=doc.querySelector('#game-play-confirm');
 if (!gc || !sc || !play) return { reset() {} };
 const info = doc.querySelector('#game-coin-info');
 const question = doc.querySelector('#game-coin-question'), answer = doc.querySelector('#game-coin-answer');
 const trigger = doc.querySelector('#game-coin-info-trigger');
 const anchor = doc.querySelector('#game-coin-info-anchor');
 const view = doc.defaultView;
 let pinned = false, closeTimer;
 let selected='GC', busy=false;
 function hideInfo() {
  clearTimeout(closeTimer);
  pinned = false;
  if (answer) answer.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
 }
 function positionInfo() {
  if (!view || !trigger || !answer || answer.hidden) return;
  const target = trigger.getBoundingClientRect();
  if (!trigger.getClientRects().length || target.bottom < 0 || target.top > view.innerHeight) {
   hideInfo();
   return;
  }
  const bounds = answer.getBoundingClientRect(), inset = 16, gap = 8;
  const center = target.left + target.width / 2;
  const left = Math.max(inset, Math.min(center - bounds.width / 2, view.innerWidth - bounds.width - inset));
  const above = target.top >= bounds.height + gap + inset;
  answer.dataset.placement = above ? 'top' : 'bottom';
  answer.style.left = `${left}px`;
  answer.style.top = `${above ? target.top - bounds.height - gap : target.bottom + gap}px`;
  answer.style.setProperty('--tooltip-arrow-left', `${Math.max(12, Math.min(center - left, bounds.width - 12))}px`);
 }
 function showInfo() {
  if (!answer) return;
  clearTimeout(closeTimer);
  answer.hidden = false;
  trigger?.setAttribute('aria-expanded', 'true');
  positionInfo();
 }
 function leaveInfo() {
  if (pinned || (doc.activeElement === trigger && trigger.matches(':focus-visible'))) return;
  clearTimeout(closeTimer);
  // Keep the tooltip reachable across the small gap above the icon.
  closeTimer = setTimeout(hideInfo, 120);
 }
 trigger?.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showInfo(); });
 trigger?.addEventListener('focus', () => { if (trigger.matches(':focus-visible')) showInfo(); });
 trigger?.addEventListener('blur', event => { if (!pinned && !anchor?.contains(event.relatedTarget)) hideInfo(); });
 trigger?.addEventListener('click', () => {
  if (pinned) hideInfo();
  else { pinned = true; showInfo(); }
 });
 anchor?.addEventListener('pointerleave', leaveInfo);
 answer?.addEventListener('pointerenter', () => clearTimeout(closeTimer));
 answer?.addEventListener('pointerleave', leaveInfo);
 doc.addEventListener('pointerdown', event => { if (!info?.contains(event.target)) hideInfo(); });
 doc.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !answer || answer.hidden) return;
  event.preventDefault();
  hideInfo();
 }, true);
 doc.addEventListener('scroll', positionInfo, true);
 view?.addEventListener('resize', positionInfo);
 async function select(currency) {
  if (busy || selected === currency) return;
  const previous=selected; selected=currency; busy=true; render();
  try { await onSelect(currency); } catch { selected=previous; }
  finally { busy=false; render(); }
 }
 function render(){
  gc.disabled=busy; sc.disabled=busy; play.disabled=busy;
  gc.setAttribute('aria-pressed',String(selected==='GC'));
  sc.setAttribute('aria-pressed',String(selected==='SC'));
  play.textContent=selected==='SC'?'Play with Super Coins':'Play with Gold Coins';
  if (question) question.textContent = coinInfo[selected].question;
  if (answer) answer.textContent = coinInfo[selected].answer;
  trigger?.setAttribute('aria-label', selected === 'SC' ? 'About Super Coins' : 'About Gold Coins');
  positionInfo();
 }
 gc.addEventListener('click',()=>select('GC'));
 sc.addEventListener('click',()=>select('SC'));
 play.addEventListener('click', () => {
  if (busy) return;
  hideInfo();
  return onPlay(selected);
 });
 hideInfo();
 render();
 return {reset(currency='GC'){hideInfo();selected=currency==='SC'?'SC':'GC';render();}};
}
