import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {createWorldRealtimeTransport} from '../src/engine/v2/RealtimeTransport.js';

const MAP='11111111-1111-4111-8111-111111111111';
const VIEWER='22222222-2222-4222-8222-222222222222';
const OTHER='44444444-4444-4444-8444-444444444444';
const TOKEN='33333333-3333-4333-8333-333333333333';
const T2='55555555-5555-4555-8555-555555555555';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const frame=(seq,options={})=>({
 version:2,mapId:MAP,viewerId:VIEWER,seq,
 environmentRevision:9,permissionGeneration:4,
 items:[{kind:'token',id:TOKEN,action:'path',
  path:[{x:seq,y:1},{x:seq+1,y:1}]}],...options
});
function harness(){
 let clock=0,subscriber=null,subscribes=0,resyncCalls=0;
 const handlers={},paths=[],revocations=[],statuses=[];
 const trace=createWorldV2Trace({enabled:true,now:()=>clock});
 const channel={
  on(_type,filter,callback){handlers[filter.event]=callback;return this},
  subscribe(callback){subscriber=callback;subscribes++;return this}
 };
 const db={channel:()=>channel,removeChannel:async()=>{},realtime:{setAuth:async()=>{}}};
 const transport=createWorldRealtimeTransport({db,mapId:MAP,viewerId:VIEWER,trace,
  onResync:async()=>{
   resyncCalls++;
   return {version:2,mapId:MAP,viewerId:VIEWER,cursor:0,
    environmentRevision:9,permissionGeneration:4,
    visiblePieces:[{kind:'token',id:TOKEN,x:1,y:1}]};
  },
  onPath:(item,meta)=>paths.push({item,meta}),
  onRevoke:reason=>revocations.push(reason),
  onState:state=>statuses.push(state.reason)
 });
 return {trace,transport,handlers,paths,revocations,statuses,
  publish:p=>handlers['world-motion-v2']({payload:p}),
  connect:async()=>{await transport.start();subscriber('SUBSCRIBED');for(let i=0;i<4;i++)await tick()},
  disconnect:()=>subscriber('CLOSED'),
  reconnect:async()=>{subscriber('SUBSCRIBED');for(let i=0;i<4;i++)await tick()},
  at:ms=>{clock=ms},
  get subscribes(){return subscribes},get resyncCalls(){return resyncCalls}
 };
}
const accepted=h=>h.trace.snapshot().counts['observer.frame-accepted']??0;

test('B10-R14 accepted packets are visible in passive observer trace, no extra RPCs or channels',async()=>{
 const h=harness();
 try{
  await h.connect();
  assert.equal(h.transport.locked,false);
  assert.equal(h.resyncCalls,1);
  assert.equal(h.subscribes,1);
  assert.equal(accepted(h),0);
  h.at(100);h.publish(frame(1));
  assert.equal(accepted(h),1);
  assert.equal(h.paths.length,1);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'],undefined);
  h.at(310);h.publish(frame(2));
  assert.equal(accepted(h),2);
  assert.equal(h.paths.length,2);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'].samples,1);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'].p50Ms,210);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'].maxMs,210);
  assert.equal(h.resyncCalls,1);
  assert.equal(h.subscribes,1);
  assert.deepEqual(h.trace.snapshot().events.filter(e=>e.event==='observer.frame-accepted').map(e=>e.detail),['','']);
  assert.equal(h.transport.locked,false);
 }finally{await h.transport.dispose()}
});

test('B10-R14 malformed and wrong-viewer packets NEVER count as accepted',async()=>{
 const h=harness();
 try{
  await h.connect();
  h.at(120);h.publish(frame(1,{viewerId:OTHER}));
  assert.equal(accepted(h),0);
  assert.equal(h.paths.length,0);
  assert.equal(h.transport.locked,true);
  await h.transport.whenSettled();
  assert.equal(h.transport.locked,false);
  h.at(130);h.publish(frame(1,{unexpected:'dangerous'}));
  assert.equal(accepted(h),0);
  await h.transport.whenSettled();
  h.at(200);h.publish(frame(1,{items:[{kind:'token',id:T2,action:'path',path:[{x:1,y:1},{x:2,y:1}]}]}));
  assert.equal(accepted(h),0);
  await h.transport.whenSettled();
  assert.ok(h.trace.snapshot().counts['observer.invalid-frame']>=2);
  assert.ok(h.trace.snapshot().counts['observer.unknown-piece']>=1);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'],undefined);
  const result=JSON.stringify(h.trace.snapshot());
  assert.equal(result.includes(T2),false);
  assert.equal(result.includes(MAP),false);
  assert.equal(result.includes(OTHER),false);
 }finally{await h.transport.dispose()}
});

test('B10-R14 reconnect resets accepted frame clock, excluding offline time',async()=>{
 const h=harness();
 try{
  await h.connect();
  h.at(100);h.publish(frame(1));
  h.at(190);h.publish(frame(2));
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'].samples,1);
  h.disconnect();
  assert.equal(h.transport.locked,true);
  h.at(10000);await h.reconnect();
  assert.equal(h.transport.locked,false);
  h.at(11000);h.publish(frame(1));
  assert.equal(accepted(h),3);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'].samples,1,
   'offline time must not be observed as a frame interval');
  h.at(11150);h.publish(frame(2));
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'].samples,2);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'].maxMs,150);
  assert.equal(h.resyncCalls,2);
  assert.equal(h.subscribes,1);
 }finally{await h.transport.dispose()}
});

test('B10-R14 client with no accepted packets has no cosmetic observer frame work',async()=>{
 const h=harness();
 try{
  await h.connect();
  h.at(45000);
  assert.equal(accepted(h),0);
  assert.equal(h.trace.snapshot().durations['observer.frame-gap'],undefined);
  assert.equal(h.paths.length,0);
  assert.equal(h.resyncCalls,1);
  assert.equal(h.subscribes,1);
 }finally{await h.transport.dispose()}
});
