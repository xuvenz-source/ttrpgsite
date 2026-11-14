import test from 'node:test';
import assert from 'node:assert/strict';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SID='33333333-3333-4333-8333-333333333333';
const P=(x,y)=>({x,y});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<4;i++)await tick()};
const deferred=()=>{let resolve,reject;
 const promise=new Promise((a,b)=>{resolve=a;reject=b});
 return {promise,resolve,reject};
};
const approved=req=>({
 version:2,sessionId:SID,seq:req.seq,blocked:false,
 accepted:expandGestureRoute(req.from,req.targets)
});
function harness({mode='drag',prediction=()=>false,advance=req=>approved(req),
 trace}={}){
 const calls={begin:[],advance:[],commit:[],cancel:[]},events=[];
 const authority={
  async begin(req){calls.begin.push(req);return {version:2,sessionId:SID}},
  async advance(req){calls.advance.push(req);return advance(req)},
  async commit(req){calls.commit.push(req);return {
   version:2,sessionId:SID,seq:req.seq,endpoint:req.endpoint
  }},
  async cancel(req){calls.cancel.push(req);return true}
 };
 const controller=createMovementController({authority,
  canPredict:prediction,onEvent:event=>events.push(event),
  ...(trace?{trace}:{})});
 const begin=()=>controller.beginGesture({
  mapId:MAP,selection:[{kind:'token',id:TOKEN}],
  mode,origin:P(2,2),pointer:P(2,2),
  environmentRevision:1,permissionGeneration:1
 });
 return {controller,begin,calls,events};
}
function wire(calls){
 return calls.advance.map(req=>({
  seq:req.seq,from:req.from,targets:req.targets
 }));
}
const points=[
 P(2.01,2.01),P(2.11,2.04),P(2.19,2.09),
 P(3.04,2.01),P(3.17,2.09),P(3.33,2.14),
 P(3.11,3.11),P(2.12,3.11),P(2.07,2.02),
 P(3.07,2.05),P(4.13,2.03),P(4.15,3.04)
];
test('R18-38 coalesced stable-cell samples invoke one collision preflight while preserving final fractional rendering',async()=>{
 let checks=0;
 const h=harness({prediction:()=>{checks++;return true}});
 try{
  assert.equal(h.begin(),true);await settle();
  const samples=Array.from({length:240},(_,i)=>P(2.01+i/1000,2.12));
  assert.equal(h.controller.updateGestureSamples(samples),true);
  assert.equal(checks,1,'one visual frame needs only its final predicate');
  const presented=h.events.filter(e=>e.type==='presented');
  assert.equal(presented.length,1);
  assert.deepEqual(presented[0].presented,samples.at(-1),
   'the last fractional pointer must not be rounded or dropped');
  assert.equal(h.calls.advance.length,0);
  assert.equal(h.events.filter(e=>e.type==='sampled').length,0);
  const result=await h.controller.endGesture();
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-38 batched prediction is final-pointer-only while server-validated bend order matches original sequential input',async()=>{
 const run=async batching=>{
  let checks=0;
  const h=harness({prediction:()=>{checks++;return true}});
  try{
   assert.equal(h.begin(),true);await settle();
   if(batching)assert.equal(h.controller.updateGestureSamples(points),true);
   else for(const point of points)assert.equal(h.controller.updateGesture(point),true);
   const result=await h.controller.endGesture();
   assert.equal(result.status,'committed');
   return {calls:h.calls,result,checks,
    signedEvents:h.events.filter(e=>e.type==='approved'||e.type==='blocked').map(e=>({
     type:e.type,approved:e.approved,accepted:e.accepted
    })),
    lastPresentation:h.events.filter(e=>e.type==='presented').at(-1)?.presented};
  }finally{h.controller.dispose()}
 };
 const old=await run(false),batch=await run(true);
 assert.deepEqual(batch.result.endpoint,old.result.endpoint);
 assert.deepEqual(wire(batch.calls),wire(old.calls),
  'server Advance sequence and all ordered corner/reversal bends unchanged');
 assert.deepEqual(batch.signedEvents,old.signedEvents);
 assert.deepEqual(batch.calls.commit,old.calls.commit);
 assert.equal(old.checks,points.length);
 assert.equal(batch.checks,1);
 assert.deepEqual(batch.lastPresentation,points.at(-1));
});
test('R18-38 held wall collision remains blocked and fails closed after input microburst',async()=>{
 const first=deferred();
 const h=harness({prediction:()=>false,advance:async req=>{
  await first.promise;
  return {version:2,sessionId:SID,seq:req.seq,
   blocked:true,accepted:[]};
 }});
 try{
  h.begin();await settle();
  h.controller.updateGesture(P(3,2));await settle();
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.controller.updateGestureSamples([
   P(3.05,2.03),P(3.12,3.04),P(3.11,2.05)
  ]),true);
  const ending=h.controller.endGesture();
  first.resolve();
  const result=await ending;
  assert.equal(result.status,'committed');
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.some(e=>e.type==='presented'),false);
  assert.equal(h.events.filter(e=>e.type==='blocked').length,1);
 }finally{h.controller.dispose()}
});
test('R18-38 invalid intermediate position fails closed without presenting later unvalidated samples',async()=>{
 let checks=0;
 const h=harness({prediction:()=>{checks++;return true}});
 try{
  h.begin();await settle();
  assert.equal(h.controller.updateGestureSamples([
   P(2.12,2.1),{x:Number.NaN,y:2},P(4,2)
  ]),false);
  assert.equal(checks,0);
  assert.equal(h.events.some(e=>e.type==='presented'),false);
  assert.equal(h.calls.advance.length,0);
  const result=await h.controller.endGesture();
  assert.equal(result.noMotion,true);
 }finally{h.controller.dispose()}
});
test('R18-38 single-sample and keyboard APIs remain unchanged',async()=>{
 let checks=0;
 const h=harness({mode:'keyboard',prediction:()=>{checks++;return true}});
 try{
  h.begin();await settle();
  assert.equal(h.controller.updateGesture(P(3,2)),true);
  assert.equal(h.controller.updateGestureSamples([P(4,2)]),true);
  const result=await h.controller.endGesture();
  assert.equal(result.status,'committed');
  assert.equal(checks,2);
  assert.deepEqual(result.endpoint,P(4,2));
  assert.equal(h.calls.commit.length,1);
 }finally{h.controller.dispose()}
});
test('R18-38 context revocation still prevents pending Advance from committing',async()=>{
 const first=deferred();
 const h=harness({advance:req=>first.promise.then(()=>approved(req))});
 try{
  h.begin();await settle();
  h.controller.updateGesture(P(3,2));await settle();
  h.controller.updateGestureSamples([P(4,2),P(4,3),P(4,4)]);
  const completion=h.controller.endGesture();
  h.controller.updateContext({permissionGeneration:2});
  const result=await completion;
  first.resolve();await settle();
  assert.equal(result.status,'revoked');
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.filter(e=>e.type==='committed').length,0);
 }finally{h.controller.dispose()}
});
test('R18-38 rejects empty sample batch but retains existing direct point input',async()=>{
 const h=harness();
 try{
  h.begin();await settle();
  assert.equal(h.controller.updateGestureSamples([]),false);
  assert.equal(h.controller.updateGesture(P(3,2)),true);
  const result=await h.controller.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,P(3,2));
 }finally{h.controller.dispose()}
});


test('R18-39 prediction metrics count only executed final check after 240 coalesced samples',async()=>{
 let now=0;
 const trace=createWorldV2Trace({enabled:true,limit:32,now:()=>{now+=0.1;return now}});
 const h=harness({trace,prediction:()=>true});
 try{
  assert.equal(h.begin(),true);await settle();
  const samples=Array.from({length:240},(_,i)=>P(2.02+i/1000,2.12));
  assert.equal(h.controller.updateGestureSamples(samples),true);
  const snap=trace.snapshot();
  assert.equal(snap.counts['movement.prediction-skipped'],239);
  assert.equal(snap.counts['movement.prediction-checked'],1);
  assert.equal(snap.durations['movement.prediction-check'].samples,1);
  assert.equal(snap.events.some(e=>e.event==='movement.prediction-skipped'),false);
  const ending=await h.controller.endGesture();
  assert.equal(ending.noMotion,true);
  assert.equal(h.calls.advance.length,0);
 }finally{h.controller.dispose()}
});
test('R18-39 blocked and revoked sample packets never turn counters into canonical authority',async()=>{
 let now=0;
 const trace=createWorldV2Trace({enabled:true,limit:32,now:()=>now++});
 const first=deferred();
 const h=harness({trace,prediction:()=>false,
  advance:async req=>{await first.promise;return approved(req)}});
 try{
  h.begin();await settle();
  h.controller.updateGesture(P(3,2));await settle();
  h.controller.updateGestureSamples([P(3.2,2.1),P(4.1,2.2),P(5.1,2.4)]);
  h.controller.updateContext({permissionGeneration:2});
  first.resolve();await settle();
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.some(e=>e.type==='committed'),false);
  assert.ok(trace.snapshot().counts['movement.prediction-checked']>=1);
 }finally{h.controller.dispose()}
});
