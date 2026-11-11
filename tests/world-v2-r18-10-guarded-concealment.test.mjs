import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldRealtimeTransport} from '../src/engine/v2/RealtimeTransport.js';

const MAP='10000000-0000-4000-8000-000000000001';
const VIEWER='20000000-0000-4000-8000-000000000001';
const KNOWN='30000000-0000-4000-8000-000000000001';
const UNKNOWN='40000000-0000-4000-8000-000000000001';
const piece=(id,x=1,y=1)=>({kind:'token',id,x,y});
const sight=(cursor,pieces=[piece(KNOWN)])=>({
 version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',cursor,
 environmentRevision:9,permissionGeneration:4,visiblePieces:pieces
});
const path=(id=KNOWN)=>({
 kind:'token',id,action:'path',path:[{x:1,y:1},{x:2,y:1}]
});
const hide=(id=KNOWN)=>({kind:'token',id,action:'hide'});
const frame=(seq,items)=>({
 version:2,mapId:MAP,viewerId:VIEWER,seq,
 environmentRevision:9,permissionGeneration:4,items
});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<6;i++)await flush()}
function harness({guarded=true}={}){
 let subscriber=null,motion=null,vision=null,current=sight(0);
 let releaseGuarded;
 const pendingGuarded=new Promise(resolve=>{releaseGuarded=resolve});
 const revoked=[],paths=[],hides=[],visionNotices=[],reasons=[];
 const timers=new Map();
 let sequence=0;
 const channel={
  on(_,filter,callback){
   if(filter.event==='world-motion-v2')motion=callback;
   if(filter.event==='world-vision-v2')vision=callback;
   return this;
  },
  subscribe(callback){subscriber=callback;return this}
 };
 const db={
  realtime:{async setAuth(){}},
  channel(){return channel},
  async removeChannel(){}
 };
 const transport=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,softResyncEnabled:guarded,
  scheduleRecovery:(callback,ms)=>{
   const id=++sequence;timers.set(id,{callback,ms});return id;
  },
  cancelRecovery:id=>timers.delete(id),
  onResync:async reason=>{
   reasons.push(reason);
   return reason==='observer-guarded-sight'?pendingGuarded:current;
  },
  onPath:p=>paths.push(p),onHide:p=>hides.push(p),
  onRevoke:reason=>revoked.push(reason),
  onVisionDirty:notice=>visionNotices.push(notice)
 });
 return {
  transport,timers,revoked,paths,hides,visionNotices,reasons,
  releaseGuarded,
  setSight:next=>{current=next},
  async join(){
   await transport.start();subscriber('SUBSCRIBED');await settle();
   assert.equal(transport.locked,false);
   revoked.length=0;reasons.length=0;
  },
  send:(seq,items)=>motion({payload:frame(seq,items)}),
  sightDirty:payload=>vision({payload}),
  async dispose(){await transport.dispose()}
 };
}

test('R18-10 a hide received during guarded unknown-piece recovery must synchronously seal',async()=>{
 const h=harness();await h.join();
 try{
  h.send(1,[path(UNKNOWN)]);await settle();
  assert.equal(h.transport.recovering,true);
  assert.equal(h.transport.locked,false);
  assert.equal(h.paths.length,0,'unknown motion must not authorize a sprite');
  h.setSight(sight(2,[]));
  h.send(2,[hide(KNOWN)]);
  assert.equal(h.transport.locked,true,'hide cannot wait for a 700ms timer');
  assert.deepEqual(h.revoked,['observer-guarded-hide']);
  assert.equal(h.transport.recovering,false);
  assert.equal(h.timers.size,0);
  await settle();
  assert.equal(h.transport.locked,false,'fresh independently signed sight may recover');
  assert.equal(h.transport.cursor,2);
  h.releaseGuarded(sight(2,[piece(KNOWN)]));
  await settle();
  assert.equal(h.paths.length,0,'stale guarded reply cannot resurrect hidden path');
  assert.equal(h.revoked.length,1);
 }finally{await h.dispose()}
});

test('R18-10 gap frame containing a hide is sealed instead of entering grace',async()=>{
 const h=harness();await h.join();
 try{
  h.setSight(sight(3,[]));
  h.send(3,[hide(KNOWN)]);
  assert.equal(h.transport.locked,true);
  assert.equal(h.transport.recovering,false);
  assert.deepEqual(h.revoked,['observer-guarded-hide']);
  assert.equal(h.paths.length,0);
  await settle();
  assert.equal(h.transport.cursor,3);
  assert.equal(h.revoked.length,1);
 }finally{h.releaseGuarded(sight(3,[]));await h.dispose()}
});

test('R18-10 private vision dirty ends guarded grace before an async LOS refresh',async()=>{
 const h=harness();await h.join();
 try{
  h.send(1,[path(UNKNOWN)]);await settle();
  assert.equal(h.transport.recovering,true);
  h.setSight(sight(2,[]));
  h.sightDirty({version:2,mapId:MAP,viewerId:VIEWER,
   environmentRevision:9,permissionGeneration:4,sceneGeneration:3,visionEpoch:2});
  assert.equal(h.transport.locked,true,
   'LOS might have changed; previous fog and sprites must be revoked now');
  assert.deepEqual(h.revoked,['observer-guarded-vision-dirty']);
  assert.equal(h.visionNotices.length,0,
   'do not defer reauthorization to a later unsealed callback');
  assert.equal(h.timers.size,0);
  await settle();
  assert.equal(h.transport.locked,false);
  assert.equal(h.transport.cursor,2);
  h.releaseGuarded(sight(2,[piece(KNOWN)]));await settle();
  assert.equal(h.paths.length,0);
 }finally{await h.dispose()}
});

test('R18-10 ordinary in-order hide still removes only known sprite without full seal',async()=>{
 const h=harness();await h.join();
 try{
  h.send(1,[hide(KNOWN)]);
  assert.equal(h.hides.length,1);
  assert.equal(h.revoked.length,0);
  assert.equal(h.transport.locked,false);
  assert.equal(h.transport.cursor,1);
  h.send(2,[hide(UNKNOWN)]);
  assert.equal(h.hides.length,1,'unknown hide must not reveal unseen actor ID');
  assert.equal(h.revoked.length,0);
 }finally{h.releaseGuarded(sight(2,[]));await h.dispose()}
});

test('R18-10 stale hide packet cannot revoke a newer already-certified roster',async()=>{
 const h=harness();await h.join();
 try{
  assert.equal(h.transport.acceptSignedSight(sight(3,[piece(KNOWN)])),true);
  h.send(2,[hide(KNOWN)]);
  assert.equal(h.hides.length,0);
  assert.equal(h.revoked.length,0);
  assert.equal(h.transport.cursor,3);
 }finally{h.releaseGuarded(sight(3));await h.dispose()}
});

test('R18-10 default-off observer recovery retains prior immediate seal path',async()=>{
 const h=harness({guarded:false});await h.join();
 try{
  h.send(1,[path(UNKNOWN)]);
  assert.equal(h.transport.locked,true);
  assert.deepEqual(h.revoked,['unknown-piece']);
  assert.equal(h.transport.recovering,false);
  assert.equal(h.paths.length,0);
 }finally{h.releaseGuarded(sight(1));await h.dispose()}
});

test('R18-10 guarded client remains default-OFF, no new channels or public visibility feed',()=>{
 const source=readFileSync(new URL('../src/engine/v2/RealtimeTransport.js',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(source,/softResyncEnabled=false/);
 assert.match(source,/observer-guarded-hide/);
 assert.match(source,/observer-guarded-vision-dirty/);
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY==='1'/);
 assert.match(runtime,/guardedObserverEnabled=!dmPreview/);
 assert.doesNotMatch(source,/\.send\(|\.broadcast\(/);
});
