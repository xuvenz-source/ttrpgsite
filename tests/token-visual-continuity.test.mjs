import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileTokenSnapshot,isPositionOnlyTokenEvent} from '../src/LiveTokenMovement.js';
import {fogFrameDuringRefresh,tokenObservedByFogFrame} from '../src/MapFogModel.js';
import {createSignedAssetStore} from '../src/SignedAssetUrls.js';
import {createTrailingRefresh} from '../src/PerformanceScheduling.js';
import {isFreshVisibilityTick,retainFogSnapshot} from '../src/FogVisibilityContinuity.js';

const a={id:'a',map_id:'map',x:1,y:2,name:'Druid',
 visible:true,image_path:'actors/druid',status_effects:[{id:'blessed'}]};
const b={...a,id:'b',x:3,name:'Guard'};
const clone=x=>JSON.parse(JSON.stringify(x));
test('an unchanged full snapshot preserves token identity, even with fresh RLS JSON',()=>{
 const before=[a,b];
 assert.equal(reconcileTokenSnapshot(before,[clone(a),clone(b)]),before);
 const moved={...a,x:5};
 const result=reconcileTokenSnapshot(before,[clone(moved),clone(b)]);
 assert.notEqual(result,before);
 assert.equal(result[1],b);
 assert.equal(result[0].x,5);
 assert.equal(reconcileTokenSnapshot(result,[clone(b)]).length,1);
 assert.equal(reconcileTokenSnapshot(result,[clone(b)])[0],b);
});
test('only a known coordinate-only UPDATE takes the fast motion path',()=>{
 const event={eventType:'UPDATE',new:{...clone(a),x:5,updated_at:'now'}};
 assert.equal(isPositionOnlyTokenEvent(event,[a,b],'map'),true);
 assert.equal(isPositionOnlyTokenEvent({...event,new:{...event.new,image_path:'changed'}},[a,b],'map'),false);
 assert.equal(isPositionOnlyTokenEvent({...event,new:{...event.new,status_effects:[{id:'poison'}]}},[a,b],'map'),false);
 assert.equal(isPositionOnlyTokenEvent(event,[b],'map'),false);
 assert.equal(isPositionOnlyTokenEvent(event,[a,b],'other-map'),false);
});
test('pending fog events keep sight revoked but avoid repetitive frame invalidation',()=>{
 const frame={mapId:'map',width:4,height:4,revision:4,enabled:true,
  partyShared:false,visible:[5,6],explored:[1,5,6]};
 const pending=fogFrameDuringRefresh(frame,'map');
 assert.equal(pending.visible.length,0);
 assert.equal(tokenObservedByFogFrame({...a,owner_id:null,x:1,y:1},pending,'someone'),false);
 assert.equal(fogFrameDuringRefresh(pending,'map'),pending);
 assert.equal(fogFrameDuringRefresh(frame,'different'),null);
});
test('synchronous signed artwork cache prevents placeholders after remount',async()=>{
 let now=10000,requests=0,callbacks=[];
 const store=createSignedAssetStore({now:()=>now,ttlMs:60000,
  sign:async()=>({data:{signedUrl:'signed-'+(++requests)}}),
  setTimer:()=>1,clearTimer:()=>{}});
 const db={};
 assert.equal(store.peek(db,'tabletop-artwork','a'),'');
 const done=store.subscribe(db,'tabletop-artwork','a',url=>callbacks.push(url));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(store.peek(db,'tabletop-artwork','a'),'signed-1');
 done();
 assert.equal(store.peek(db,'tabletop-artwork','a'),'signed-1');
 now+=65000;
 assert.equal(store.peek(db,'tabletop-artwork','a'),'');
 store.clear();
 assert.equal(store.peek(db,'tabletop-artwork','a'),'');
});
test('high-rate movement reconciles once after gestures settle',()=>{
 let seq=0,callbacks=new Map(),invocations=0;
 const setTimer=fn=>{const id=++seq;callbacks.set(id,fn);return id};
 const clearTimer=id=>callbacks.delete(id);
 const trailing=createTrailingRefresh(()=>{invocations++},420,{setTimer,clearTimer});
 trailing.request();trailing.request();trailing.request();
 assert.equal(callbacks.size,1);
 const [timerId,callback]=[...callbacks.entries()][0];callbacks.delete(timerId);callback();
 assert.equal(invocations,1);
 trailing.request();trailing.cancel();
 assert.equal(callbacks.size,0);
});
test('board preserves local drop previews until new positions commit',()=>{
 const board=readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const artwork=readFileSync(new URL('../src/Artwork.jsx',import.meta.url),'utf8');
 assert.match(board,/motion\.current\?\.handoff\(member\.id\)/);
 assert.match(board,/motion\.current\?\.reconcile\(token\.id,Number\(token\.x\),Number\(token\.y\)\)/);
 assert.match(app,/reconcileTokenSnapshot\(previous,rows\.map\(token=>/);
 assert.match(app,/isPositionOnlyTokenEvent/);
 assert.match(artwork,/signedAssetStore\.peek\(db,bucket,path\)/);
});

test('already validated revision never causes an all-token visibility flash',()=>{
 const frame={mapId:'map',width:3,height:3,revision:6,enabled:true,
  partyShared:true,visible:[1,2],explored:[0,1,2]};
 assert.equal(isFreshVisibilityTick(
  {revision:6,fog_enforced:true},frame,'map'),false);
 assert.equal(isFreshVisibilityTick(
  {revision:5,fog_enforced:true},frame,'map'),false);
 assert.equal(isFreshVisibilityTick(
  {revision:7,fog_enforced:true},frame,'map'),true);
 assert.equal(isFreshVisibilityTick(
  {revision:6,fog_enforced:false},frame,'map'),true);
 assert.equal(isFreshVisibilityTick(null,frame,'map'),true);
 assert.equal(isFreshVisibilityTick({revision:6,fog_enforced:true},frame,'other'),true);
 assert.equal(retainFogSnapshot(frame,{...frame,visible:[1,2],explored:[0,1,2]}),frame);
 assert.notEqual(retainFogSnapshot(frame,{...frame,visible:[1]}),frame);
 const pending=fogFrameDuringRefresh(frame,'map');
 assert.notEqual(retainFogSnapshot(pending,frame),pending);
});
