import test from 'node:test';
import assert from 'node:assert/strict';
import {initSiteMode} from '../public/site-mode.js';
test('site mode initializes from persisted account and follows shared changes without changing balances',()=>{
 const wallet={currency:'SC',balances:{GC:120,SC:45}};const before=JSON.stringify(wallet.balances);let listener;
 const doc={body:{dataset:{}}};const account={getSnapshot:()=>({wallet}),subscribe:fn=>{listener=fn;}};
 const mode=initSiteMode({account,document:doc});
 assert.equal(doc.body.dataset.siteMode,'SC');
 wallet.currency='GC';listener();assert.equal(mode.getMode(),'GC');assert.equal(doc.body.dataset.currency,'GC');
 assert.equal(JSON.stringify(wallet.balances),before);
});

