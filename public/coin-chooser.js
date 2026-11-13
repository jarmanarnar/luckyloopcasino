export function initCoinChooser({ document: doc = document, onPlay, onSelect = async () => {} }) {
 const gc=doc.querySelector('#game-play-gc'), sc=doc.querySelector('#game-play-sc'), play=doc.querySelector('#game-play-confirm');
 if (!gc || !sc || !play) return { reset() {} };
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
 }
 gc.addEventListener('click',()=>select('GC'));
 sc.addEventListener('click',()=>select('SC'));
 play.addEventListener('click',()=>{if (!busy) return onPlay(selected);});
 render();
 return {reset(currency='GC'){selected=currency==='SC'?'SC':'GC';render();}};
}
