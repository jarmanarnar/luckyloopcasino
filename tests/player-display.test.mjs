import assert from 'node:assert/strict';
import test from 'node:test';
import { initPlayerDisplay } from '../public/player-display.js';
function fixture(native = true) {
 const node = () => ({dataset:{}, attrs:{}, handlers:{}, setAttribute(k,v){this.attrs[k]=v;}, addEventListener(k,fn){this.handlers[k]=fn;}});
 const view=node(), theater=node(), fullscreen=node(), sidebar=node();
 sidebar.dataset.expanded='true';
 const doc={body:node(), handlers:{}, fullscreenElement:null, querySelector:s=>({'#game-theater':theater,'#game-fullscreen':fullscreen,'.site-sidebar':sidebar}[s]), addEventListener(k,fn){this.handlers[k]=fn;}};
 doc.body.dataset.sidebar='expanded';
 doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.handlers.fullscreenchange();};
 if(native)view.requestFullscreen=async()=>{doc.fullscreenElement=view;doc.handlers.fullscreenchange();};
 const api=initPlayerDisplay({view,document:doc});
 return {view,theater,fullscreen,sidebar,doc,api};
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
