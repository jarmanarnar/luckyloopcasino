import assert from 'node:assert/strict';
import test from 'node:test';
import { initPlayerDisplay } from '../public/player-display.js';
function fixture(native = true, mobile = false) {
 const node = () => ({dataset:{}, attrs:{}, handlers:{}, setAttribute(k,v){this.attrs[k]=v;}, addEventListener(k,fn){this.handlers[k]=fn;}});
 const view=node(), root=node(), header=node(), theater=node(), fullscreen=node(), sidebar=node(), menuFullscreen=node(), menuLabel=node();
 root.children=[header,view];
 sidebar.dataset.expanded='true';
 const doc={body:node(),documentElement:root,handlers:{},fullscreenElement:null,querySelector:s=>({'#game-theater':theater,'#game-fullscreen':fullscreen,'.site-sidebar':sidebar,'#profile-game-fullscreen':menuFullscreen,'#profile-game-fullscreen-label':menuLabel}[s]),addEventListener(k,fn){this.handlers[k]=fn;}};
 doc.body.dataset.sidebar='expanded';
 doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.handlers.fullscreenchange();};
 if(native)root.requestFullscreen=async()=>{doc.fullscreenElement=root;doc.handlers.fullscreenchange();};
 const media={matches:mobile,addEventListener(type,fn){this.change=fn;}};
 const api=initPlayerDisplay({view,document:doc,window:{matchMedia:()=>media}});
 return {view,root,header,theater,fullscreen,sidebar,doc,api,media,menuFullscreen,menuLabel};
}

test('theater collapses only sidebar and restores it; fullscreen is separate',async()=>{
 const p=fixture();p.theater.handlers.click();
 assert.equal(p.view.dataset.theater,'true');assert.equal(p.sidebar.dataset.expanded,'false');assert.equal(p.doc.fullscreenElement,null);
 await p.fullscreen.handlers.click();assert.equal(p.doc.fullscreenElement,p.root);
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
 const p=fixture();p.root.requestFullscreen=async()=>{throw Error('unavailable');};await p.api.fullscreen();
 assert.equal(p.view.dataset.fullscreenFallback,'true');p.api.reset();assert.equal(p.view.dataset.fullscreenFallback,'false');
});

test('mobile preserves the original header inside page fullscreen and exits through the profile menu', async () => {
 const p=fixture(true,true);p.api.setGame({title:'Nunchucks',currency:'GC'});
 assert.equal(p.doc.body.dataset.playerMobile,'true');assert.equal(p.theater.hidden,true);
 assert.equal(p.menuFullscreen.hidden,false);assert.ok(p.root.children.includes(p.header));
 p.theater.handlers.click();assert.equal(p.view.dataset.theater,'false');
 await p.api.fullscreen();assert.equal(p.doc.fullscreenElement,p.root);
 assert.equal(p.doc.body.dataset.playerMobile,'true');
 await p.api.fullscreen();assert.equal(p.doc.fullscreenElement,null);
 assert.equal(p.doc.body.dataset.playerMobile,'true','exiting native fullscreen keeps the viewport filled');
 await p.menuFullscreen.handlers.click();assert.equal(p.doc.fullscreenElement,p.root);
 assert.equal(p.menuLabel.textContent,'Exit fullscreen');
 await p.menuFullscreen.handlers.click();assert.equal(p.doc.fullscreenElement,null);
 p.api.reset();assert.equal(p.menuFullscreen.hidden,true);assert.equal(p.doc.body.dataset.playerMobile,'false');
});

test('mobile without a fullscreen API or after a rejection stays immersive without a fake fullscreen state', async () => {
 for (const native of [false,true]) {
  const p=fixture(native,true);p.api.setGame({title:'Game',currency:'SC'});
  if(native)p.root.requestFullscreen=async()=>{throw Error('unavailable');};
  await p.api.fullscreen();
  assert.equal(p.doc.body.dataset.playerMobile,'true');assert.equal(p.view.dataset.fullscreenFallback,'false');
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
 let finish;p.root.requestFullscreen=()=>new Promise(resolve=>{finish=()=>{p.doc.fullscreenElement=p.root;resolve();};});
 const entering=p.api.fullscreen();p.api.reset();finish();await entering;
 assert.equal(p.doc.fullscreenElement,null);assert.equal(p.doc.body.dataset.playerMobile,'false');
 assert.equal(p.view.dataset.fullscreenFallback,'false');
});

test('native fullscreen resizing keeps the mobile layout until fullscreen exits', async () => {
 const p=fixture(true,true);p.api.setGame({title:'Game'});
 await p.api.fullscreen();
 p.media.matches=false;p.media.change();
 assert.equal(p.doc.body.dataset.playerMobile,'true');
 assert.equal(p.theater.hidden,true);
 await p.api.fullscreen();
 assert.equal(p.doc.body.dataset.playerMobile,'false');
 assert.equal(p.doc.body.dataset.playerFullscreen,'false');
});
