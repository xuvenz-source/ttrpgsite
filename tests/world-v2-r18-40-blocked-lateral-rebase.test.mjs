import test from 'node:test';
import assert from 'node:assert/strict';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const P=(x,y)=>({x,y});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<5;i++)await tick()};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});
 return {promise,resolve};};
const ok=req=>({version:2,sessionId:SESSION,seq:req.seq,
 blocked:false,accepted:expandGestureRoute(req.from,req.targets)});
const blocked=(req,accepted=[])=>({version:2,sessionId:SESSION,seq:req.seq,
 blocked:true,accepted});
function fixture({mode='drag',advance=ok,predict=()=>false}={}){
 const calls={begin:[],advance:[],commit:[],cancel:[]},events=[];
 const authority={
  async begin(req){calls.begin.push(req);return {version:2,sessionId:SESSION}},
  async advance(req){calls.advance.push(req);return advance(req)},
  async commit(req){calls.commit.push(req);
   return {version:2,sessionId:SESSION,seq:req.seq,endpoint:req.endpoint}},
  async cancel(req){calls.cancel.push(req);return true}
 };
 const controller=createMovementController({authority,canPredict:predict,
  onEvent:e=>events.push(e)});
 const begin=()=>controller.beginGesture({mapId:MAP,
  selection:[{kind:'token',id:TOKEN}],mode,origin:P(2,2),pointer:P(2,2),
  environmentRevision:7,permissionGeneration:9});
 return {controller,calls,events,begin};
}
test('R18-40 preserves only fresh sideways correction and revalidates against ACKed origin',async()=>{
 const gate=deferred();
 const h=fixture({advance:async req=>{
  if(req.seq===1){await gate.promise;return blocked(req)}
  return ok(req);
 }});
 try{
  h.begin();await settle();
  h.controller.updateGesture(P(3,2));await settle();
  assert.equal(h.calls.advance.length,1);
  h.controller.updateGestureSamples([P(3.02,2.05),P(2.10,3.02),P(2.08,3.12)]);
  const end=h.controller.endGesture();
  assert.equal(h.calls.commit.length,0);
  gate.resolve();await settle();
  assert.equal(h.calls.advance.length,2,
   'a new lateral destination should survive the first denied ACK');
  assert.deepEqual(h.calls.advance[1].from,P(2,2));
  assert.deepEqual(h.calls.advance[1].targets,[P(2,3)]);
  assert.equal(h.calls.advance[1].seq,2);
  assert.deepEqual(h.calls.advance[1].selection,h.calls.advance[0].selection);
  assert.equal(h.calls.advance[1].environmentRevision,7);
  assert.equal(h.calls.advance[1].permissionGeneration,9);
  const result=await end;
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,P(2,3));
  assert.equal(h.calls.commit.length,1);
  assert.deepEqual(h.calls.commit[0].endpoint,P(2,3));
  assert.equal(h.events.some(e=>e.type==='presented'),false,
   'no unapproved steps can appear on the map');
  assert.deepEqual(h.events.filter(e=>e.type==='blocked')[0].approved,P(2,2));
  assert.equal(h.events.filter(e=>e.type==='approved').length,1);
 }finally{h.controller.dispose()}
});
test('R18-40 same-wall straight extension is discarded and never causes a retry loop',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  await gate.promise;return blocked(req);
 }});
 try{
  h.begin();await settle();
  h.controller.updateGesture(P(3,2));await settle();
  h.controller.updateGesture(P(5,2));
  h.controller.updateGesture(P(9,2));
  const end=h.controller.endGesture();
  gate.resolve();
  const result=await end;
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,1,
   'forward samples must not probe a blocked wall again');
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-40 same denied endpoint cannot create duplicate collision requests',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  await gate.promise;return blocked(req);
 }});
 try{
  h.begin();await settle();h.controller.updateGesture(P(3,2));await settle();
  for(let i=0;i<80;i++)h.controller.updateGesture(P(3.002,2.001));
  gate.resolve();await settle();
  for(let i=0;i<80;i++)h.controller.updateGesture(P(3.002,2.001));
  await settle();
  assert.equal(h.calls.advance.length,1);
  const result=await h.controller.endGesture();
  assert.equal(result.noMotion,true);
 }finally{h.controller.dispose()}
});
test('R18-40 accepts approved prefix but rebases the sideways turn from last ACKed cell',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  if(req.seq===1){await gate.promise;return blocked(req,[P(3,2)])}
  return ok(req);
 }});
 try{
  h.begin();await settle();
  h.controller.updateGesture(P(4,2));await settle();
  h.controller.updateGesture(P(3,3));
  const end=h.controller.endGesture();gate.resolve();await settle();
  assert.deepEqual(h.calls.advance[1].from,P(3,2));
  assert.deepEqual(h.calls.advance[1].targets,[P(3,3)]);
  const result=await end;
  assert.deepEqual(result.endpoint,P(3,3));
  assert.equal(h.calls.commit.length,1);
  assert.deepEqual(h.events.find(e=>e.type==='blocked').accepted,[P(3,2)]);
 }finally{h.controller.dispose()}
});
test('R18-40 a newly rebased turn denied by server cannot escape the blocked cell',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  if(req.seq===1)await gate.promise;
  return blocked(req);
 }});
 try{
  h.begin();await settle();h.controller.updateGesture(P(3,2));await settle();
  h.controller.updateGesture(P(2,3));
  const end=h.controller.endGesture();gate.resolve();
  const result=await end;
  assert.equal(result.status,'committed');
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,2);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.filter(e=>e.type==='blocked').length,2);
  assert.equal(h.events.filter(e=>e.type==='presented').length,0);
 }finally{h.controller.dispose()}
});
test('R18-40 keyboard blocked intent is unchanged: no lateral auto-retry',async()=>{
 const gate=deferred(),h=fixture({mode:'keyboard',advance:async req=>{
  await gate.promise;return blocked(req);
 }});
 try{
  h.begin();await settle();h.controller.updateGesture(P(3,2));await settle();
  h.controller.updateGesture(P(2,3));
  const end=h.controller.endGesture();gate.resolve();
  const result=await end;
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-40 permission revocation before blocker ACK cannot rebase or commit',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  await gate.promise;return blocked(req);
 }});
 try{
  h.begin();await settle();h.controller.updateGesture(P(3,2));await settle();
  h.controller.updateGesture(P(2,3));const end=h.controller.endGesture();
  h.controller.updateContext({permissionGeneration:10});
  assert.equal((await end).status,'revoked');
  gate.resolve();await settle();
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.filter(e=>e.type==='committed').length,0);
 }finally{h.controller.dispose()}
});
test('R18-40 invalid ACK prevents all lateral recovery and rejects safely',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  await gate.promise;return {version:2,sessionId:SESSION,seq:req.seq,
   blocked:true,accepted:[P(999,999)]};
 }});
 try{
  h.begin();await settle();h.controller.updateGesture(P(3,2));await settle();
  h.controller.updateGesture(P(2,3));const end=h.controller.endGesture();
  gate.resolve();assert.equal((await end).status,'rejected');
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.some(e=>e.type==='presented'),false);
 }finally{h.controller.dispose()}
});

test('R18-40 never mistakes budget-limited unsent bends for fresh post-RPC input',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  await gate.promise;return blocked(req);
 }});
 try{
  h.begin();
  // Send a 20-cell east leg + 20-cell north leg before Begin resolves.
  // First Advance is bounded to 24 cells, leaving the OLD north target
  // in the queue while the request is in flight.
  h.controller.updateGesture(P(22,2));
  h.controller.updateGesture(P(22,22));
  await settle();
  assert.equal(h.calls.advance.length,1);
  assert.deepEqual(h.calls.advance[0].targets,[P(22,2),P(22,6)]);
  const end=h.controller.endGesture();
  gate.resolve();const result=await end;
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,1,
   'a pre-existing unsent tail cannot be replayed as fresh lateral input');
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-40 same-cell samples while Advance is pending do not mark old bends as fresh',async()=>{
 const gate=deferred(),h=fixture({advance:async req=>{
  await gate.promise;return blocked(req);
 }});
 try{
  h.begin();
  h.controller.updateGesture(P(22,2));
  h.controller.updateGesture(P(22,22));
  await settle();
  for(let i=0;i<150;i++)h.controller.updateGesture(P(22.001,22.001));
  const end=h.controller.endGesture();gate.resolve();
  const result=await end;
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,1);
 }finally{h.controller.dispose()}
});
