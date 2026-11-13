import assert from 'node:assert/strict';
import test from 'node:test';
import { initPlayerDisplay } from '../public/player-display.js';
function fixture(native = true, mobile = false) {
 const node = () => ({dataset:{}, attrs:{}, handlers:{}, setAttribute(k,v){this.attrs[k]=v;}, addEventListener(k,fn){this.handlers[k]=fn;}});
 const view=node(), theater=node(), fullscreen=node(), sidebar=node(), close=node(), title=node(), currency=node(), label=node(), art=node();
 sidebar.dataset.expanded='true';
 const doc={body:node(), handlers:{}, fullscreenElement:null, querySelector:s=>({'#game-theater':theater,'#game-fullscreen':fullscreen,'.site-sidebar':sidebar,'#game-close':close,'#game-player-title':title,'#game-change-currency':currency,'#game-player-currency':label,'#game-player-coin':art}[s]), addEventListener(k,fn){this.handlers[k]=fn;}};
 doc.body.dataset.sidebar='expanded';
 doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.handlers.fullscreenchange();};
 if(native)view.requestFullscreen=async()=>{doc.fullscreenElement=view;doc.handlers.fullscreenchange();};
 const media={matches:mobile,addEventListener(type,fn){this.change=fn;}};
 let closes=0,choices=0;
 const api=initPlayerDisplay({view,document:doc,window:{matchMedia:()=>media},onClose:()=>closes++,onChooseCurrency:()=>choices++});
 return {view,theater,fullscreen,sidebar,doc,api,media,close,title,currency,label,art,closes:()=>closes,choices:()=>choices};
}
test('theater collapses only sidebar and restores it; fullscreen is separate',async()=>{
 const p=fixture();p.theater.handlers.click();
 assert.equal(p.view.dataset.theater,'true');assert.equal(p.sidebar.dataset.expanded,'false');assert.equal(p.doc.fullscreenElement,null);
 await p.fullscreen.handlers.click();assert.equal(p.doc.fullscreenElement,p.view);
 await p.fullscreen.handlers.click();assert.equal(p.doc.fullscreenElement,null);assert.equal(p.view.dataset.theater,'true');
 p.api.reset();assert.equal(p.doc.body.dataset.sidebar,'expanded');assert.equal(p.sidebar.dataset.expanded,'true');
});
test('mobile/unavailable native fullscreen falls back and exits without altering a frame',async()=>{
 const p=fixture(false);await p.api.fullscreen();assert.equal(p.view.dataset.fullscreenFallback,'true');
 let prevented=false;p.doc.handlers.keydown({key:'Escape',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(p.view.dataset.fullscreenFallback,'false');
 await p.api.fullscreen();await p.api.fullscreen();assert.equal(p.view.dataset.fullscreenFallback,'false');
});
test('rejected fullscreen falls back; reset clears it',async()=>{
 const p=fixture();p.view.requestFullscreen=async()=>{throw Error('unavailable');};await p.api.fullscreen();
 assert.equal(p.view.dataset.fullscreenFallback,'true');p.api.reset();assert.equal(p.view.dataset.fullscreenFallback,'false');
});

test('mobile opens as an immersive player without theater; its own toolbar stays in fullscreen', async () => {
 const p=fixture(true,true);p.api.setGame({title:'Nunchucks',currency:'GC'});
 assert.equal(p.doc.body.dataset.playerMobile,'true');assert.equal(p.theater.hidden,true);
 assert.equal(p.title.textContent,'Nunchucks');assert.equal(p.label.textContent,'GC');
 p.theater.handlers.click();assert.equal(p.view.dataset.theater,'false');
 await p.api.fullscreen();assert.equal(p.doc.fullscreenElement,p.view);
 assert.equal(p.doc.body.dataset.playerMobile,'true');
 await p.api.fullscreen();assert.equal(p.doc.fullscreenElement,null);
 assert.equal(p.doc.body.dataset.playerMobile,'true','exiting native fullscreen keeps the viewport filled');
 p.currency.handlers.click();assert.equal(p.choices(),1);
 p.close.handlers.click();assert.equal(p.closes(),1);assert.equal(p.doc.body.dataset.playerMobile,'false');
});

test('mobile without a fullscreen API or after a rejection stays immersive without a fake fullscreen state', async () => {
 for (const native of [false,true]) {
  const p=fixture(native,true);p.api.setGame({title:'Game',currency:'SC'});
  if(native)p.view.requestFullscreen=async()=>{throw Error('unavailable');};
  await p.api.fullscreen();
  assert.equal(p.doc.body.dataset.playerMobile,'true');assert.equal(p.view.dataset.fullscreenFallback,'false');
  assert.equal(p.label.textContent,'SC');assert.match(p.art.src,/sweeps/);
  if(!native)assert.equal(p.fullscreen.hidden,true);
 }
});

test('resizing desktop theater into mobile restores sidebar preferences and closes immersive layout on exit', () => {
 const p=fixture();p.api.setGame({title:'Game'});p.theater.handlers.click();
 p.media.matches=true;p.media.change();
 assert.equal(p.doc.body.dataset.playerMobile,'true');assert.equal(p.view.dataset.theater,'false');
 assert.equal(p.doc.body.dataset.sidebar,'expanded');
 p.media.matches=false;p.media.change();assert.equal(p.doc.body.dataset.playerMobile,'false');
 p.api.reset();p.media.matches=true;p.media.change();assert.equal(p.doc.body.dataset.playerMobile,'false');
});

test('leaving while fullscreen is pending cannot reopen the closed player', async () => {
 const p=fixture(true,true);p.api.setGame({title:'Game'});
 let finish;p.view.requestFullscreen=()=>new Promise(resolve=>{finish=()=>{p.doc.fullscreenElement=p.view;resolve();};});
 const entering=p.api.fullscreen();p.api.reset();finish();await entering;
 assert.equal(p.doc.fullscreenElement,null);assert.equal(p.doc.body.dataset.playerMobile,'false');
 assert.equal(p.view.dataset.fullscreenFallback,'false');
});
