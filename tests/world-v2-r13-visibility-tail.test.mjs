import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {createVisibilityController} from '../src/engine/v2/VisibilityController.js';

const MAP='11111111-1111-4111-8111-111111111111';
const VIEWER='22222222-2222-4222-8222-222222222222';
const TOKEN='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const pending=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const sight=(n=1)=>({version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',
 cursor:n,environmentRevision:9,permissionGeneration:4,
 sceneGeneration:1,visionEpoch:n,enabled:false,width:10,height:10,
 partyShared:false,visible:[],explored:[],
 visiblePieces:[{kind:'token',id:TOKEN,x:1,y:1}],
 predictionGrants:[],lightCells:[],dmMovingLights:[]});
const events=(t,name)=>t.snapshot().events.filter(e=>e.event===name);
const make=({rpc,now=()=>0,onRevoke=()=>{},onSnapshot=()=>true}={})=>{
 // Use the SAME injected monotonic clock as the visibility controller so
 // queue wait timings are deterministic rather than runner scheduling jitter.
 const trace=createWorldV2Trace({enabled:true,limit:256,now});
 const controller=createVisibilityController({db:{rpc},mapId:MAP,
  viewerId:VIEWER,trace,now,onRevoke,onSnapshot});
 return {trace,controller};
};

test('R13 measures original one-bit queue without adding or reordering sight RPCs',async()=>{
 let clock=100,calls=0;
 const first=pending();
 const frames=[],h=make({
  now:()=>clock,
  rpc:async()=>{calls++;return calls===1?first.promise:
   {data:sight(2),error:null}},
  onSnapshot:frame=>{frames.push(frame.cursor);return true}
 });
 try{
  const p1=h.controller.refresh('initial');
  await tick();
  assert.equal(calls,1);
  clock=145;
  const p2=h.controller.refresh('committed');
  const p3=h.controller.refresh('movement-vision-dirty');
  assert.equal(calls,1,'two triggers coalesce behind only one ongoing RPC');
  assert.deepEqual(events(h.trace,'visibility.queue').map(e=>e.detail),
   ['queued','coalesced']);
  clock=230;
  first.resolve({data:sight(1),error:null});
  await Promise.all([p1,p2,p3]);
  for(let i=0;i<6;i++)await tick();
  assert.equal(calls,2,'only the original and existing one follow-up may run');
  assert.deepEqual(frames,[1,2]);
  assert.equal(h.controller.authorized,true);
  assert.equal(h.controller.frame.cursor,2);
  assert.deepEqual(events(h.trace,'visibility.rpc-call').map(x=>x.detail),
   ['initial','queued']);
  assert.deepEqual(events(h.trace,'visibility.queue').map(x=>x.detail),
   ['queued','coalesced','drained']);
  const wait=h.trace.snapshot().durations['visibility.queue-wait'];
  assert.equal(wait.samples,1,'one queue timer for the entire coalesced burst');
  assert.equal(wait.p50Ms,85);
  assert.equal(wait.maxMs,85);
 }finally{h.controller.dispose()}
});

test('R13 permission revocation discards queued sight and cannot resurrect authority',async()=>{
 let clock=0,calls=0;const first=pending(),revoked=[];
 const h=make({now:()=>clock, onRevoke:o=>revoked.push(o.reason),
  rpc:async()=>{calls++;return first.promise}});
 try{
  const p=h.controller.refresh('initial');
  await tick();clock=20;
  const wait=h.controller.refresh('movement-vision-dirty');
  clock=50;
  h.controller.revoke('permission');
  first.resolve({data:sight(1),error:null});
  await Promise.all([p,wait]);
  for(let i=0;i<5;i++)await tick();
  assert.equal(calls,1,'revoked pending queue cannot start a later RPC');
  assert.equal(h.controller.authorized,false);
  assert.equal(h.controller.frame,null);
  assert.ok(revoked.includes('permission'));
  assert.deepEqual(events(h.trace,'visibility.queue').map(x=>x.detail),
   ['queued','discarded']);
  assert.equal(h.trace.snapshot().durations['visibility.queue-wait'].samples,1);
  assert.equal(h.trace.snapshot().counts['visibility.queue-wait.error'],1);
 }finally{h.controller.dispose()}
});

test('R13 distinguishes a six-second db.rpc round-trip from client queue delay',async()=>{
 let clock=0,calls=0;
 const h=make({now:()=>clock,rpc:async()=>{
  calls++;clock=6128;return {data:sight(1),error:null};
 }});
 try{
  assert.ok(await h.controller.refresh('committed'));
  assert.equal(calls,1);
  assert.equal(h.controller.authorized,true);
  assert.deepEqual(events(h.trace,'visibility.rpc-call').map(x=>x.detail),
   ['committed']);
  assert.deepEqual(events(h.trace,'visibility.rpc-tail').map(x=>x.detail),
   ['over-5s']);
  assert.ok(!h.trace.snapshot().durations['visibility.queue-wait']);
  assert.deepEqual(events(h.trace,'visibility.queue'),[]);
 }finally{h.controller.dispose()}
});

test('R13 timing buckets are finite and monotonic, trigger tags are private-data safe',async()=>{
 const cases=[
  {latency:749,expected:[]},
  {latency:750,expected:['over-750ms']},
  {latency:2000,expected:['over-2s']},
  {latency:5000,expected:['over-5s']}
 ];
 for(const {latency,expected} of cases){
  let clock=0;
  const h=make({now:()=>clock,rpc:async()=>{
   clock=latency;return {data:sight(),error:null}
  }});
  try{
   await h.controller.refresh('observer-resync');
   assert.deepEqual(events(h.trace,'visibility.rpc-tail').map(x=>x.detail),expected);
   h.trace.event('visibility.rpc-call','session=SECRET tokenID and map coords');
   assert.equal(events(h.trace,'visibility.rpc-call').at(-1).detail,'other');
   assert.ok(!JSON.stringify(h.trace.snapshot()).includes('SECRET'));
  }finally{h.controller.dispose()}
 }
});

test('R13 malformed server-signed sight still revokes; no instrumentation grants fog',async()=>{
 const revocations=[];
 const h=make({rpc:async()=>({data:{...sight(),viewerId:MAP},error:null}),
  onRevoke:x=>revocations.push(x.reason)});
 try{
  assert.equal(await h.controller.refresh('initial'),null);
  assert.equal(h.controller.authorized,false);
  assert.equal(h.controller.frame,null);
  assert.deepEqual(revocations,['invalid-snapshot']);
  assert.equal(h.trace.snapshot().counts['visibility.reject'],1);
 }finally{h.controller.dispose()}
});
