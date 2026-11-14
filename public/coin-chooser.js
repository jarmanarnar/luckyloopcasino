const coinInfo = {
 GC: { question: 'What are Gold Coins?', answer: 'Gold Coins are virtual coins for social play. They have no cash value. The game demo uses its own balance.' },
 SC: { question: 'What are Sweep Coins?', answer: 'Sweep Coins have a separate balance. You can preview this mode here, but play is unavailable in this demo.' },
};

export function initCoinChooser({ document: doc = document, onPlay, onSelect = async () => {} }) {
 const gc=doc.querySelector('#game-play-gc'), sc=doc.querySelector('#game-play-sc'), play=doc.querySelector('#game-play-confirm');
 if (!gc || !sc || !play) return { reset() {} };
 const info = doc.querySelector('#game-coin-info');
 const question = doc.querySelector('#game-coin-question'), answer = doc.querySelector('#game-coin-answer');
 let selected='GC', busy=false;
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
  play.textContent=selected==='SC'?'Play with Sweep Coins':'Play with Gold Coins';
  if (question) question.textContent = coinInfo[selected].question;
  if (answer) answer.textContent = coinInfo[selected].answer;
 }
 gc.addEventListener('click',()=>select('GC'));
 sc.addEventListener('click',()=>select('SC'));
 play.addEventListener('click', () => {
  if (busy) return;
  if (info) info.open = false;
  return onPlay(selected);
 });
 render();
 return {reset(currency='GC'){selected=currency==='SC'?'SC':'GC';render();}};
}
