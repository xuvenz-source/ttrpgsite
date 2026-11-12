import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pointerIntentCell,POINTER_EDGE_HYSTERESIS_CELLS}
 from '../src/engine/v2/PointerIntentCell.js';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const selection=[{kind:'token',id:TOKEN}];
const same=(p,x,y)=>p.x===x&&p.y===y;
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}
function make({onAdvance=({from,targets})=>({
 blocked:false,accepted:expandGestureRoute(from,targets)
 }),onCommit=({endpoint})=>({endpoint}),onBegin=()=>({})}={}){
 let now=0;
 const trace=createWorldV2Trace({enabled:true,now:()=>now});
 const calls={begin:[],advance:[],commit:[],cancel:[]},events=[];
 let advanceCount=0;
 const authority={
  async begin(req){
   calls.begin.push(req);
   const reply=await onBegin(req);
   return {version:2,sessionId:'test-session',...reply};
  },
  async advance(req){
   calls.advance.push(req);
   advanceCount++;
   const response=await onAdvance(req);
   return {
    version:2,sessionId:req.sessionId,seq:req.seq,
    blocked:false,accepted:[],...response
   };
  },
  async commit(req){
   calls.commit.push(req);
   const response=await onCommit(req);
   return {
    version:2,sessionId:req.sessionId,seq:req.seq,
    endpoint:req.endpoint,...response
   };
  },
  async cancel(req){calls.cancel.push(req);return true}
 };
 const controller=createMovementController({
  authority,onEvent:e=>events.push(e),trace
 });
 const begin=(mode='drag',origin={x:2,y:2})=>
  controller.beginGesture({mapId:MAP,selection,origin,pointer:origin,mode,
   environmentRevision:1,permissionGeneration:1});
 return {controller,begin,calls,events,trace,now:ms=>{now+=ms},
  get advanceCount(){return advanceCount}};
}

test('R18-15 rounds exact integer keyboard requests unchanged',()=>{
 const current={x:2,y:2};
 assert.deepEqual(pointerIntentCell({x:2.6,y:2.6},null),{x:3,y:3});
 assert.equal(POINTER_EDGE_HYSTERESIS_CELLS,0.10);
 assert.deepEqual(pointerIntentCell({x:4.1,y:2.1},current),{x:4,y:2});
});

test('R18-15 corner jitter near both shared axes cannot create artificial turns',()=>{
 let previous={x:2,y:2},crossings=0;
 for(let i=0;i<1000;i++){
  const s=i%2===0?0.495:0.505;
  const next=pointerIntentCell({x:2+s,y:2+1-s},previous);
  if(next.x!==previous.x||next.y!==previous.y)crossings++;
  previous=next;
 }
 assert.equal(crossings,0);
 assert.deepEqual(previous,{x:2,y:2});
 // Deliberate diagonal crossing is still supported.
 previous=pointerIntentCell({x:2.65,y:2.66},previous);
 assert.deepEqual(previous,{x:3,y:3});
 for(const x of [2.49,2.51,2.45,2.55])
  assert.deepEqual(pointerIntentCell({x,y:x},previous),{x:3,y:3});
 assert.deepEqual(pointerIntentCell({x:2.35,y:2.36},previous),{x:2,y:2});
});

test('R18-15 hysteresis works when moving left/up and near negative boundaries',()=>{
 assert.deepEqual(pointerIntentCell({x:2.49,y:2.51},{x:3,y:2}),
  {x:3,y:2});
 assert.deepEqual(pointerIntentCell({x:2.35,y:2.65},{x:3,y:2}),
  {x:2,y:3});
 assert.deepEqual(pointerIntentCell({x:-0.51,y:-0.49},{x:0,y:0}),
  {x:0,y:0});
 assert.deepEqual(pointerIntentCell({x:-0.66,y:-0.67},{x:0,y:0}),
  {x:-1,y:-1});
});

test('R18-15 rejects invalid pointer/previous without synthesizing a cell',()=>{
 for(const p of [null,{}, {x:Infinity,y:2},{x:NaN,y:0}]){
  assert.equal(pointerIntentCell(p,{x:2,y:2}),null);
 }
 assert.equal(pointerIntentCell({x:2,y:2},{x:2.3,y:2}),null);
 assert.equal(pointerIntentCell({x:2,y:2},{x:2,y:2},{hysteresis:0.5}),null);
});

test('R18-15 repeated exact denied pointer target triggers one server collision RPC',async()=>{
 const h=make({onAdvance:({from,targets})=>{
  assert.deepEqual(from,{x:2,y:2});
  assert.deepEqual(targets,[{x:3,y:2}]);
  return {blocked:true,accepted:[]};
 }});
 assert.equal(h.begin(),true);
 await tick();
 assert.equal(h.controller.updateGesture({x:3,y:2}),true);
 await tick();
 assert.equal(h.advanceCount,1);
 assert.equal(h.events.some(x=>x.type==='blocked'),true);
 for(let i=0;i<200;i++)
  assert.equal(h.controller.updateGesture({x:3.01,y:2.01}),true);
 await tick();
 assert.equal(h.advanceCount,1);
 assert.equal(h.events.filter(x=>x.type==='blocked').length,1);
 h.now(34);
 const result=await h.controller.endGesture();
 assert.equal(result.status,'committed');
 assert.equal(result.noMotion,true);
 assert.equal(h.calls.commit.length,0,
  'blocked-only gesture cancels its session, not commit unapproved motion');
 assert.equal(h.trace.snapshot().durations['movement.release-to-terminal'].samples,1);
 h.controller.dispose();
});

test('R18-15 accepted prefix before a wall is preserved; new direction still authorizes',async()=>{
 const h=make({onAdvance:({from,targets})=>{
  if(same(from,2,2)&&same(targets.at(-1),4,2))
   return {blocked:true,accepted:[{x:3,y:2}]};
  assert.deepEqual(from,{x:3,y:2});
  assert.deepEqual(targets,[{x:3,y:3}]);
  return {blocked:false,accepted:[{x:3,y:3}]};
 }});
 h.begin();await tick();
 h.controller.updateGesture({x:4,y:2});await tick();
 assert.equal(h.advanceCount,1);
 const blocked=h.events.find(e=>e.type==='blocked');
 assert.deepEqual(blocked.approved,{x:3,y:2});
 assert.deepEqual(blocked.blockedAt,{x:4,y:2});
 // Duplicate pointer cell 4,2 is a no-op. A new direction is never hidden
 // from the authoritative collision solver.
 h.controller.updateGesture({x:4.01,y:2.02});
 await tick();assert.equal(h.advanceCount,1);
 h.controller.updateGesture({x:3,y:3});
 await tick();assert.equal(h.advanceCount,2);
 const done=await h.controller.endGesture();
 assert.equal(done.status,'committed');
 assert.deepEqual(h.calls.commit[0].endpoint,{x:3,y:3});
 assert.deepEqual(done.endpoint,{x:3,y:3});
 h.controller.dispose();
});

test('R18-15 an independent later attempt can retry the same denied cell',async()=>{
 const h=make({onAdvance:({from,targets})=>
  ({blocked:true,accepted:[]})});
 for(let i=0;i<2;i++){
  h.begin();await tick();
  h.controller.updateGesture({x:3,y:2});
  await tick();
  const done=await h.controller.endGesture();
  assert.equal(done.status,'committed');
 }
 assert.equal(h.advanceCount,2,
  'denial cache must be scoped to the single authorized gesture');
 h.controller.dispose();
});

test('R18-15 pending segment continues only after server ACK; release stays locked',async()=>{
 const first=deferred(),last=deferred();
 let advances=0;
 const h=make({
  onAdvance:({from,targets})=>{
   advances++;
   return advances===1?first.promise:{
    blocked:false,accepted:expandGestureRoute(from,targets)
   };
  },
  onCommit:()=>last.promise
 });
 h.begin();await tick();
 h.controller.updateGesture({x:3,y:2});await tick();
 assert.equal(h.advanceCount,1);
 h.controller.updateGesture({x:3,y:3});
 const finishing=h.controller.endGesture();
 await tick();
 assert.equal(h.controller.active,true);
 assert.equal(h.begin(),false,'must not open overlapping live auth gesture');
 h.now(150);
 first.resolve({blocked:false,accepted:[{x:3,y:2}]});
 await tick();await tick();
 assert.equal(h.advanceCount,2);
 assert.equal(h.calls.commit.length,1);
 assert.equal(h.controller.active,true);
 h.now(950);
 last.resolve({endpoint:{x:3,y:3}});
 const done=await finishing;
 assert.equal(done.status,'committed');
 assert.equal(h.controller.active,false);
 assert.equal(h.trace.snapshot().durations['movement.release-to-terminal'].p95Ms,
  1100);
 h.controller.dispose();
});

test('R18-15 no jitter burst can exhaust bend budget before begin ACK',async()=>{
 const beginGate=deferred();
 const h=make({onBegin:()=>beginGate.promise});
 h.begin();
 for(let i=0;i<600;i++){
  const x=i%2?2.502:2.498;
  assert.equal(h.controller.updateGesture({x,y:x}),true);
 }
 h.controller.updateGesture({x:2.67,y:2.65});
 beginGate.resolve({});
 await tick();await tick();
 assert.equal(h.calls.advance.length,1,
  'one diagonal move, not 600 server-validated corner bends');
 assert.deepEqual(h.calls.advance[0].targets,[{x:3,y:3}]);
 const result=await h.controller.endGesture();
 assert.equal(result.status,'committed');
 h.controller.dispose();
});

test('R18-15 only record bounded new release-to-terminal trace timing',()=>{
 const code=readFileSync(new URL('../src/engine/v2/WorldTrace.js',import.meta.url),'utf8');
 const movement=readFileSync(new URL(
  '../src/engine/v2/MovementController.js',import.meta.url),'utf8');
 assert.match(code,/movement\.release-to-terminal/);
 assert.match(movement,/g\.releaseTimer=trace\.begin\?\.\('movement\.release-to-terminal'\)/);
 assert.match(movement,/g\.releaseTimer\?\.\(result\.status==='committed'/);
 assert.match(movement,/if\(g\.pending\.length===0&&g\.blockedRetry/);
 assert.match(movement,/\['drag','touch','preview'\]\.includes\(g\.mode\)/);
 assert.match(movement,/if\(response\.blocked\)g\.pending\.length=0/);
 assert.match(movement,/const response=await authority\.advance/);
 assert.match(movement,/const reply=await authority\.commit/);
 assert.doesNotMatch(movement,/db\.rpc|localStorage|sendBroadcast/);
});
