import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldRealtimeTransport}
 from '../src/engine/v2/RealtimeTransport.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

const MAP='10000000-0000-4000-8000-000000000001';
const VIEWER='20000000-0000-4000-8000-000000000001';
const KNOWN='30000000-0000-4000-8000-000000000001';
const NEW='40000000-0000-4000-8000-000000000001';
const UNKNOWN='50000000-0000-4000-8000-000000000001';
const piece=(id,x=1,y=1)=>({kind:'token',id,x,y});
const sight=(cursor,pieces=[piece(KNOWN)],extra={})=>({
 version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',cursor,
 environmentRevision:9,permissionGeneration:4,
 visiblePieces:pieces,...extra
});
const path=(id=KNOWN,coords=[[1,1],[2,1]])=>({
 kind:'token',id,action:'path',
 path:coords.map(([x,y])=>({x,y}))
});
const frame=(seq,items=[path()],extra={})=>({
 version:2,mapId:MAP,viewerId:VIEWER,seq,
 environmentRevision:9,permissionGeneration:4,items,...extra
});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<7;i++)await flush()};
function clock(){
 let counter=0;const timers=new Map();
 return {timers,
  schedule(fn,ms){const id=++counter;timers.set(id,{fn,ms});return id},
  cancel:id=>timers.delete(id),
  fire(){const [id,task]=timers.entries().next().value??[];
   if(task){timers.delete(id);task.fn();return true}return false}
 };
}
function harness({
 initial=sight(0),softResyncEnabled=true,
 recover=()=>current,timeout=700
}={}){
 let current=initial,subscriber=null,receiver=null,visionReceiver=null;
 const seen=[],hidden=[],revoked=[],requests=[],trace=createWorldV2Trace({enabled:true});
 const timers=clock();let channels=0;
 const channel={
  on(_event,filter,cb){
   if(filter.event==='world-motion-v2')receiver=cb;
   if(filter.event==='world-vision-v2')visionReceiver=cb;
   return this;
  },
  subscribe(fn){subscriber=fn;return this}
 };
 const db={
  realtime:{async setAuth(){}},
  channel(){channels++;return channel},
  async removeChannel(){}
 };
 const transport=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,trace,softResyncEnabled,
  softRecoveryTimeoutMs:timeout,
  scheduleRecovery:timers.schedule,cancelRecovery:timers.cancel,
  onResync:async reason=>{
   requests.push(reason);
   // Real runtime uses visibility.observerSnapshot(): renderer adopts
   // authenticated sight BEFORE transport receives it. This mock supplies
   // typed signed data only and independently checks the transport gate.
   return recover(reason,current);
  },
  onPath:item=>seen.push(item),onHide:item=>hidden.push(item),
  onRevoke:r=>revoked.push(r)
 });
 return {transport,timers,seen,hidden,revoked,requests,trace,
  get channels(){return channels},
  setSnapshot:x=>{current=x},
  async start(){
   await transport.start();subscriber('SUBSCRIBED');await settle();
   assert.equal(transport.locked,false);
   revoked.length=0;requests.length=0;trace.clear();
  },
  emit:(seq,items,extra)=>receiver({payload:frame(seq,items,extra)}),
  raw:x=>receiver({payload:x}),
  vision:x=>visionReceiver({payload:x}),
  disconnect:()=>subscriber('CHANNEL_ERROR'),
  async dispose(){await transport.dispose()}
 };
}

test('R18-04 unknown-piece fetches certified new roster without renderer seal or unauthorized path',async()=>{
 const h=harness();await h.start();
 try{
  h.setSnapshot(sight(1,[piece(KNOWN),piece(NEW,3,3)]));
  h.emit(1,[path(NEW,[[2,3],[3,3]])]);
  assert.equal(h.transport.recovering,true);
  assert.equal(h.revoked.length,0);
  assert.equal(h.seen.length,0,'unknown path NEVER paints during recovery');
  await settle();
  assert.equal(h.transport.recovering,false);
  assert.equal(h.transport.locked,false);
  assert.equal(h.transport.cursor,1);
  assert.equal(h.seen.length,0,'offending packet is never replayed');
  assert.equal(h.revoked.length,0);
  assert.equal(h.channels,1);
  assert.equal(h.timers.timers.size,0);
  h.emit(2,[path(NEW,[[3,3],[4,3]])]);
  assert.equal(h.seen.length,1,'only a later certified path may animate');
  assert.equal(h.trace.snapshot().counts['observer.guarded-recovered'],1);
  const log=JSON.stringify(h.trace.snapshot());
  for(const id of [MAP,VIEWER,KNOWN,NEW])
   assert.equal(log.includes(id),false,'diagnostics must never log identities');
 }finally{await h.dispose()}
});

test('R18-04 missing middle packet discards trajectory and aligns from signed cursor',async()=>{
 const h=harness();await h.start();
 try{
  h.emit(1);assert.equal(h.seen.length,1);
  h.setSnapshot(sight(4,[piece(KNOWN,4,1)]));
  h.emit(4,[path(KNOWN,[[3,1],[4,1]])]);
  assert.equal(h.seen.length,1,'gap never paints unobserved positions');
  await settle();
  assert.equal(h.transport.cursor,4);
  assert.equal(h.revoked.length,0);
  h.emit(5,[path(KNOWN,[[2,1],[3,1]])]);
  assert.equal(h.seen.length,1,'old origin fenced after certified point');
  h.emit(6,[path(KNOWN,[[4,1],[5,1]])]);
  assert.equal(h.seen.length,2,'new server-approved frontier resumes');
 }finally{await h.dispose()}
});

test('R18-04 malformed, forged and permission-changed frames still hard-seal',async()=>{
 const h=harness();await h.start();
 try{
  h.setSnapshot(sight(1));
  h.raw(frame(1,[path()],{privateWalls:['secret']}));
  assert.equal(h.transport.locked,true);
  assert.deepEqual(h.revoked,['invalid-packet']);
  await settle();
  assert.equal(h.transport.locked,false);
  h.setSnapshot(sight(2,[piece(KNOWN)],{permissionGeneration:5}));
  h.emit(2,[path()],{permissionGeneration:5});
  assert.equal(h.transport.locked,true);
  assert.ok(h.revoked.includes('version-change'));
 }finally{await h.dispose()}
});

test('R18-04 forbidden hidden piece does not acquire a sprite from fresh roster',async()=>{
 const h=harness();await h.start();
 try{
  h.setSnapshot(sight(1,[piece(KNOWN)]));
  h.emit(1,[path(UNKNOWN)]);
  await settle();
  assert.equal(h.transport.cursor,1);
  assert.equal(h.seen.length,0);
  h.emit(2,[path(UNKNOWN)]);
  await settle();
  assert.equal(h.seen.length,0,'RLS-signed roster still excludes hidden NPC');
  assert.equal(h.revoked.length,0);
 }finally{await h.dispose()}
});

test('R18-04 700ms deadline seals if fresh authenticated sight never returns',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const h=harness({recover:r=>r==='observer-guarded-sight'?pending:sight(1)});
 await h.start();
 try{
  h.emit(1,[path(UNKNOWN)]);
  assert.equal(h.transport.recovering,true);
  await flush();
  assert.equal([...h.timers.timers.values()][0]?.ms,700);
  assert.equal(h.timers.fire(),true);
  assert.equal(h.transport.locked,true);
  assert.ok(h.revoked.includes('observer-guarded-timeout'));
  release(sight(1,[piece(KNOWN),piece(NEW)]));
  await settle();
  assert.equal(h.transport.cursor,1);
  assert.equal(h.seen.length,0,'late soft result cannot publish a path');
  assert.equal(h.timers.timers.size,0);
 }finally{await h.dispose()}
});

test('R18-04 incompatible signed scope after an unknown piece immediately falls back to seal',async()=>{
 const h=harness({recover:(_r,current)=>({...current,scope:'dm'})});
 await h.start();
 try{
  h.setSnapshot(sight(1,[piece(KNOWN),piece(NEW)]));
  h.emit(1,[path(NEW)]);
  await settle();
  assert.equal(h.transport.locked,false);
  assert.ok(h.revoked.includes('observer-guarded-invalid'));
  assert.equal(h.seen.length,0);
 }finally{await h.dispose()}
});

test('R18-04 pending recovery never buffers private paths and bounds flood',async()=>{
 let release;const deferred=new Promise(resolve=>{release=resolve});
 const h=harness({recover:reason=>
  reason==='observer-guarded-sight'?deferred:sight(19)});
 await h.start();
 try{
  h.emit(1,[path(UNKNOWN)]);await flush();
  for(let i=2;i<=18;i++)h.emit(i);
  assert.equal(h.transport.locked,true,
   'more than sixteen pending frames must fail closed');
  assert.ok(h.revoked.includes('observer-guarded-overflow'));
  assert.equal(h.seen.length,0);
  release(sight(18,[piece(KNOWN)]));await settle();
  assert.equal(h.seen.length,0);
  assert.equal(h.channels,1);
 }finally{await h.dispose()}
});

test('R18-04 disconnection/disposal cancels timer and never authorizes late result',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const h=harness({recover:reason=>
  reason==='observer-guarded-sight'?pending:sight(0)});
 await h.start();
 h.emit(1,[path(UNKNOWN)]);await flush();
 h.disconnect();
 assert.equal(h.transport.locked,true);
 assert.equal(h.transport.recovering,false);
 assert.equal(h.timers.timers.size,0);
 const result=h.dispose();
 release(sight(1,[piece(KNOWN),piece(NEW)]));
 await result;await settle();
 assert.equal(h.transport.locked,true);
 assert.equal(h.seen.length,0);
});

test('R18-04 default disabled preserves current fail-closed unknown-piece and gap behavior',async()=>{
 const h=harness({softResyncEnabled:false});await h.start();
 try{
  h.setSnapshot(sight(1,[piece(KNOWN),piece(NEW)]));
  h.emit(1,[path(NEW)]);
  assert.equal(h.transport.locked,true);
  assert.ok(h.revoked.includes('unknown-piece'));
  assert.equal(h.trace.snapshot().counts['observer.guarded-start'],undefined);
 }finally{await h.dispose()}
});

test('R18-04 only explicit opt-in outside DM preview can enable guarded recovery',()=>{
 const rt=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(rt,/VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY==='1'/);
 assert.match(rt,/guardedObserverEnabled=!dmPreview/);
 assert.match(rt,/softResyncEnabled:guardedObserverEnabled/);
 assert.match(rt,/observerRecoveryEnabled\|\|guardedObserverEnabled/);
 const source=readFileSync(new URL('../src/engine/v2/RealtimeTransport.js',import.meta.url),'utf8');
 assert.match(source,/softResyncEnabled=false/);
 assert.doesNotMatch(source,/onPath\(item[\s\S]{0,35}guardedPending/);
});
