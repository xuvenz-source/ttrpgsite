import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createObserverRecoveryWatch,OBSERVER_RECOVERY_INTERVAL_MS}
 from '../src/engine/v2/ObserverRecoveryWatch.js';
import {createWorldRealtimeTransport}
 from '../src/engine/v2/RealtimeTransport.js';

const MAP='10000000-0000-4000-8000-000000000001';
const VIEWER='30000000-0000-4000-8000-000000000001';
const A='40000000-0000-4000-8000-000000000001';
const B='40000000-0000-4000-8000-000000000002';
const C='40000000-0000-4000-8000-000000000003';
const piece=(id,x,y)=>({kind:'token',id,x,y});
const snap=(cursor,visiblePieces,extras={})=>({
 version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',cursor,
 environmentRevision:9,permissionGeneration:4,
 visiblePieces,...extras
});
const path=(id,coords)=>({kind:'token',id,action:'path',
 path:coords.map(([x,y])=>({x,y}))});
const packet=(seq,items,extras={})=>({
 version:2,mapId:MAP,viewerId:VIEWER,seq,
 environmentRevision:9,permissionGeneration:4,items,...extras
});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function scheduler(){
 let seq=0;
 const tasks=new Map();
 return {
  tasks,
  schedule(fn,ms){const id=++seq;tasks.set(id,{fn,ms});return id},
  cancel(id){tasks.delete(id)},
  fire(){const [id,task]=tasks.entries().next().value??[];
   if(!task)return false;tasks.delete(id);task.fn();return true
  }
 };
}
function transportHarness(initial=snap(0,[piece(A,1,1)])){
 const seen=[],hidden=[],revoked=[];let receiver,subscriber,current=initial;
 const channel={on(event,filter,cb){
  if(filter.event==='world-motion-v2')receiver=cb;
  return this;
 },subscribe(cb){subscriber=cb;return this}};
 const db={channel:()=>channel,removeChannel:async()=>{},
  realtime:{setAuth:async()=>{}}};
 const t=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,onResync:async()=>current,
  onPath:p=>seen.push(p),onHide:p=>hidden.push(p),
  onRevoke:reason=>revoked.push(reason)
 });
 return {t,seen,hidden,revoked,
  setSnapshot:v=>{current=v},
  async join(){await t.start();subscriber('SUBSCRIBED');await flush();},
  send:(seq,items,extras)=>receiver({payload:packet(seq,items,extras)})
 };
}

test('B10-R18-02 signed-sight watch is interval bounded and does not poll at boot',async()=>{
 const clock=scheduler();let checks=0,allowed=true,foreground=true;
 const watch=createObserverRecoveryWatch({
  check:async()=>{checks++;return true},
  canCheck:()=>allowed,isForeground:()=>foreground,
  schedule:clock.schedule,cancel:clock.cancel
 });
 assert.equal(OBSERVER_RECOVERY_INTERVAL_MS,12000);
 assert.equal(watch.start(),true);
 assert.equal(clock.tasks.size,1);
 assert.equal([...clock.tasks.values()][0].ms,12000);
 assert.equal(checks,0,'no extra join RPC');
 assert.equal(clock.fire(),true);await flush();
 assert.equal(checks,1);
 assert.equal(clock.tasks.size,1);
 allowed=false;clock.fire();await flush();
 assert.equal(checks,1,'no request when authorization/channel unavailable');
 allowed=true;foreground=false;clock.fire();await flush();
 assert.equal(checks,1,'background tab uses no database calls');
 foreground=true;assert.equal(await watch.resume(),true);
 assert.equal(checks,2,'foreground return reconciles immediately');
 watch.dispose();
 assert.equal(clock.tasks.size,0);
 assert.equal(watch.start(),false);
});

test('B10-R18-02 only one signed sight may be in flight, and cleanup stops repeats',async()=>{
 const clock=scheduler();let completes,checks=0;
 const inFlight=new Promise(resolve=>{completes=resolve});
 const w=createObserverRecoveryWatch({
  check:()=>{checks++;return inFlight},canCheck:()=>true,
  schedule:clock.schedule,cancel:clock.cancel
 });
 w.start();clock.fire();await flush();
 assert.equal(checks,1);assert.equal(w.busy,true);
 const pending=w.resume();assert.equal(checks,1);
 assert.equal(clock.tasks.size,0,'no overlapping timers or RPC');
 w.stop();completes(true);assert.equal(await pending,true);
 await flush();assert.equal(clock.tasks.size,0);
 w.start();assert.equal(clock.tasks.size,1);
 w.dispose();assert.equal(clock.tasks.size,0);
});

test('B10-R18-02 failures cannot create hot retries or invent authority',async()=>{
 const clock=scheduler();const reported=[];
 const w=createObserverRecoveryWatch({
  check:async()=>{throw Error('signed sight denied')},
  canCheck:()=>true,schedule:clock.schedule,cancel:clock.cancel,
  onError:error=>reported.push(error.message)
 });
 w.start();clock.fire();await flush();
 assert.deepEqual(reported,['signed sight denied']);
 assert.equal(clock.tasks.size,1,'one delayed check only');
 w.dispose();
 assert.throws(()=>createObserverRecoveryWatch({
  check:()=>true,canCheck:()=>true,intervalMs:20
 }),/Invalid/);
});

test('B10-R18-02 signed canonical correction drops budget-stranded stale paths without revocation',async()=>{
 const h=transportHarness(snap(0,[piece(A,1,1),piece(B,5,5)]));
 await h.join();
 assert.equal(h.t.locked,false);
 const revocationsBefore=h.revoked.length;
 assert.equal(h.t.acceptSignedSight(snap(0,[piece(A,3,1),piece(B,5,5)])),true);
 h.send(1,[path(A,[[1,1],[2,1]]),path(B,[[5,5],[6,5]])]);
 assert.equal(h.t.cursor,1,'cursor advances without replaying stale sprite');
 assert.deepEqual(h.seen,[path(B,[[5,5],[6,5]])]);
 assert.equal(h.revoked.length,revocationsBefore,'no additional renderer or terrain seal');
 h.send(2,[path(A,[[2,1],[3,1]])]);
 assert.equal(h.seen.length,1,'later deferred path also suppressed');
 h.send(3,[path(A,[[3,1],[4,1]])]);
 assert.equal(h.seen.length,2,'fresh authorized path from canonical frontier accepted');
 assert.equal(h.seen[1].path[0].x,3);
 await h.t.dispose();
});

test('B10-R18-02 lost hide is reconciled by signed roster, never by a forged packet',async()=>{
 const h=transportHarness(snap(0,[piece(A,1,1),piece(C,3,3)]));
 await h.join();
 assert.equal(h.t.acceptSignedSight(snap(0,[piece(A,1,1)])),true);
 h.setSnapshot(snap(1,[piece(A,1,1)]));
 h.send(1,[path(C,[[3,3],[4,3]])]);
 await flush(); // Unknown-piece requests fresh authorized roster; never grants C.
 assert.equal(h.seen.length,0,'hidden piece has no approved roster membership');
 assert.equal(h.t.cursor,1);
 assert.equal(h.hidden.length,0,'no guessed hidden ID sent to renderer');
 await h.t.dispose();
});

test('B10-R18-02 fail-closed observer revisions and no fabricated visible roster',async()=>{
 const h=transportHarness();await h.join();
 const before=h.t.cursor;
 assert.equal(h.t.acceptSignedSight(snap(1,[piece(A,1,1)],{viewerId:C})),false);
 assert.equal(h.t.acceptSignedSight(snap(1,[piece(A,-1,1)])),false);
 assert.equal(h.t.cursor,before);
 assert.equal(h.t.acceptSignedSight(snap(1,[piece(A,1,1)])),true);
 assert.equal(h.t.acceptSignedSight(snap(0,[piece(A,1,1)])),false);
 h.send(2,[{kind:'token',id:C,action:'hide'}]);
 assert.equal(h.hidden.length,0,'unknown hide never reveals actor ID');
 await h.t.dispose();
});

test('B10-R18-02 new signed permission/scope seals old stream before accepting old movement',async()=>{
 const h=transportHarness();await h.join();
 const oldSealCount=h.revoked.length;
 h.setSnapshot(snap(2,[piece(A,1,1)],{permissionGeneration:5}));
 assert.equal(h.t.acceptSignedSight(snap(2,[piece(A,1,1)],{permissionGeneration:5})),false);
 assert.equal(h.t.locked,true,'old permission generation sealed synchronously');
 assert.equal(h.revoked.length,oldSealCount+1);
 h.send(1,[path(A,[[1,1],[2,1]])]);
 assert.equal(h.seen.length,0,'no old generation path may animate while locked');
 await flush();
 assert.equal(h.t.locked,false,'new authenticated sight restores observer');
 assert.equal(h.t.cursor,2);
 await h.t.dispose();
});

test('B10-R18-02 production flag is OFF unless explicitly opted in and preview never polls',()=>{
 const runtime=readFileSync(new URL(
  '../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_RECOVERY==='1'/);
 assert.match(runtime,/observerRecoveryEnabled=!dmPreview/);
 assert.match(runtime,/createObserverRecoveryWatch/);
 assert.match(runtime,/refreshVisibility\('observer-budget-recovery'\)/);
 assert.match(runtime,/stream\?\.acceptSignedSight\(snapshot\)/);
 assert.match(runtime,/document\.addEventListener\('visibilitychange',foregroundListener\)/);
 assert.match(runtime,/observerWatch\?\.dispose\(\)/);
 assert.doesNotMatch(runtime,/\.channel\(.*recovery/i);
 const ledger=JSON.parse(readFileSync(new URL(
  '../staging/next-release-ledger.json',import.meta.url)));
 assert.ok(ledger.features.some(feature=>
  feature.id==='world-v2-b10-r18-02-signed-observer-convergence'&&
  feature.releaseReady===false));
 assert.match(runtime,/!movement\.active/);
 assert.match(runtime,/!deferredObserverRecovery\.pending/);
});


test('R18-02 dropped terminal notification converges on later signed sight, without any new channel',async()=>{
 const h=transportHarness(snap(0,[piece(A,1,1),piece(B,5,5)]));
 await h.join();
 assert.equal(h.t.cursor,0);
 // Server commits A at 4,1 but the recipient misses every private
 // terminal movement/hide packet. A later authoritative signed sight
 // includes the exact canonical positions and viewer cursor.
 const signed=snap(4,[piece(A,4,1),piece(B,5,5)]);
 h.setSnapshot(signed);
 const clock=scheduler();
 let authorizedByRenderer=false,checks=0;
 const watch=createObserverRecoveryWatch({
  schedule:clock.schedule,cancel:clock.cancel,canCheck:()=>!h.t.locked,
  check:async()=>{
   checks++;
   // This simulates the server-certified snapshot's renderer adoption;
   // transport alignment is allowed ONLY after that succeeds.
   authorizedByRenderer=true;
   return authorizedByRenderer&&h.t.acceptSignedSight(signed);
  }
 });
 try{
  watch.start();
  assert.equal(clock.fire(),true);
  await flush();
  assert.equal(checks,1);
  assert.equal(h.t.cursor,4,'missed terminal cursor caught up independently');
  assert.equal(h.revoked.length,1,
   'startup resync only; no extra full-map revocation');
  h.send(3,[path(A,[[1,1],[2,1]])]);
  assert.equal(h.seen.length,0,'old delayed frame may not paint');
  h.send(5,[path(A,[[2,1],[3,1]])]);
  assert.equal(h.seen.length,0,
   'old deferred path cannot rewind signed canonical point');
  h.send(6,[path(A,[[4,1],[5,1]])]);
  assert.equal(h.seen.length,1,'fresh route from signed position resumes');
 }finally{watch.dispose();await h.t.dispose()}
});

test('R18-02 signed-sight update cannot use a stream cursor without a full signed authorized roster',async()=>{
 const h=transportHarness();await h.join();
 const before=h.t.cursor;
 const unsigned=snap(2,[piece(A,7,1)],{scope:undefined});
 assert.equal(h.t.acceptSignedSight(unsigned),false);
 assert.equal(h.t.cursor,before);
 const noCoordinates=snap(2,[{kind:'token',id:A}]);
 assert.equal(h.t.acceptSignedSight(noCoordinates),false);
 assert.equal(h.t.cursor,before);
 const swappedViewer=snap(2,[piece(A,2,1)],{viewerId:B});
 assert.equal(h.t.acceptSignedSight(swappedViewer),false);
 assert.equal(h.t.cursor,before);
 await h.t.dispose();
});

test('R18-02 hides do not permit a late signed origin or path to reveal a concealed token',async()=>{
 const h=transportHarness(snap(0,[piece(A,1,1),piece(C,3,3)]));
 await h.join();
 assert.equal(h.t.acceptSignedSight(snap(1,[piece(A,1,1)])),true);
 // The resync has its own newer, server-signed cursor 2 and still omits C.
 h.setSnapshot(snap(2,[piece(A,1,1)]));
 h.send(2,[path(C,[[3,3],[4,3]])]);
 await flush();
 assert.equal(h.seen.length,0);
 assert.equal(h.t.locked,false,'new RLS-signed roster can contain no C');
 assert.equal(h.t.cursor,2);
 await h.t.dispose();
});

test('R18-02 watch does not continue after dispose when an in-flight request settles',async()=>{
 const clock=scheduler();let release,called=0;
 const pending=new Promise(resolve=>{release=resolve});
 const watch=createObserverRecoveryWatch({
  schedule:clock.schedule,cancel:clock.cancel,canCheck:()=>true,
  check:async()=>{called++;await pending;return true}
 });
 watch.start();clock.fire();await flush();watch.dispose();release();
 await flush();await flush();
 assert.equal(called,1);
 assert.equal(clock.tasks.size,0);
 assert.equal(watch.enabled,false);
});

test('R18-02 runtime stays explicitly default-off and never listens for preview-private observer recovery',()=>{
 const rt=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(rt,/import\.meta\.env\?\.VITE_WORLD_V2_OBSERVER_RECOVERY==='1'/);
 assert.match(rt,/observerRecoveryEnabled=!dmPreview/);
 assert.match(rt,/if\(observerRecoveryEnabled&&!observerWatch\)/);
 assert.match(rt,/stream\?\.acceptSignedSight\(snapshot\)/);
 assert.match(rt,/document\.addEventListener\('visibilitychange',foregroundListener\)/);
 assert.match(rt,/observerWatch\?\.dispose\(\)/);
 assert.doesNotMatch(rt,/db\.channel\([^\n]*recovery/i);
});
