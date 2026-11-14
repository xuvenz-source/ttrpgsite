import test from 'node:test';
import assert from 'node:assert/strict';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';
import {canPredictWithinWorldGrants} from '../src/engine/v2/PredictionGrants.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const P=(x,y)=>({x,y});
const deferred=()=>{let resolve;let reject;const promise=new Promise((a,b)=>{
 resolve=a;reject=b;});return {promise,resolve,reject}};
const tick=()=>new Promise(r=>setImmediate(r));
const settle=async()=>{for(let i=0;i<5;i++)await tick()};
const ok=req=>({version:2,sessionId:SESSION,seq:req.seq,blocked:false,
 accepted:expandGestureRoute(req.from,req.targets)});

function fixture({begin=async()=>({version:2,sessionId:SESSION}),
 advance=async req=>ok(req),commit=async req=>({
  version:2,sessionId:SESSION,seq:req.seq,endpoint:req.endpoint
 }),mode='keyboard',canPredict=()=>false}={}){
 const calls={begin:[],advance:[],commit:[],cancel:[]},events=[];
 let outstanding=0,maxOutstanding=0;
 const authority={
  async begin(req){calls.begin.push(req);return begin(req)},
  async advance(req){
   outstanding++;maxOutstanding=Math.max(outstanding,maxOutstanding);
   calls.advance.push(req);
   try{return await advance(req)}finally{outstanding--}
  },
  async commit(req){calls.commit.push(req);return commit(req)},
  async cancel(req){calls.cancel.push(req);return true}
 };
 const movement=createMovementController({authority,
  onEvent:event=>events.push(event),canPredict});
 const start=(origin=P(2,2))=>movement.beginGesture({
  mapId:MAP,selection:[{kind:'token',id:TOKEN}],
  mode,origin,pointer:origin,environmentRevision:7,permissionGeneration:9
 });
 return {movement,calls,events,start,get maxOutstanding(){return maxOutstanding}};
}

test('R18-41: 23 paced authorized key steps require 23 serial HTTPS-like Advances',async()=>{
 const gates=[],h=fixture({advance:req=>{
  const gate=deferred();gates.push({gate,req});return gate.promise;
 }});
 try{
  assert.equal(h.start(),true);await settle();
  for(let i=0;i<23;i++){
   assert.equal(h.movement.updateGesture(P(i+3,2)),true);
   await settle();
   assert.equal(h.calls.advance.length,i+1);
   assert.equal(h.maxOutstanding,1);
   assert.equal(h.calls.advance[i].seq,i+1);
   assert.deepEqual(h.calls.advance[i].targets,[P(i+3,2)]);
   assert.equal(h.calls.commit.length,0);
   gates[i].gate.resolve(ok(gates[i].req));
   await settle();
  }
  const result=await h.movement.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,P(25,2));
  assert.equal(h.calls.advance.length,23);
  assert.equal(h.calls.commit.length,1);
  assert.equal(h.calls.cancel.length,0);
 }finally{h.movement.dispose()}
});

test('R18-41: same 23 cells *before Begin reply* fit one existing certified Advance',async()=>{
 const gate=deferred(),h=fixture({begin:()=>gate.promise});
 try{
  assert.equal(h.start(),true);
  for(let i=0;i<23;i++)
   assert.equal(h.movement.updateGesture(P(i+3,2)),true);
  assert.equal(h.calls.advance.length,0);
  gate.resolve({version:2,sessionId:SESSION});await settle();
  assert.equal(h.calls.advance.length,1);
  assert.deepEqual(h.calls.advance[0].targets,[P(25,2)]);
  assert.equal(h.calls.advance[0].seq,1);
  assert.equal(expandGestureRoute(
   h.calls.advance[0].from,h.calls.advance[0].targets).length,23);
  const result=await h.movement.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,P(25,2));
  assert.equal(h.calls.commit.length,1);
 }finally{h.movement.dispose()}
});

test('R18-41: in-flight Advance cannot be parallelized by following keyboard input',async()=>{
 const first=deferred(),h=fixture({advance:req=>
  req.seq===1?first.promise:ok(req)});
 try{
  h.start();await settle();
  h.movement.updateGesture(P(3,2));await settle();
  for(const p of [P(4,2),P(5,2),P(6,2),P(6,3),P(6,4)])
   h.movement.updateGesture(p);
  assert.equal(h.calls.advance.length,1);
  const done=h.movement.endGesture();
  assert.equal(h.calls.commit.length,0);
  first.resolve(ok(h.calls.advance[0]));await settle();
  assert.equal(h.calls.advance.length,2,
   'new path is serialized in exactly one additional signed batch');
  assert.deepEqual(h.calls.advance[1].from,P(3,2));
  assert.deepEqual(h.calls.advance[1].targets,[P(6,2),P(6,4)]);
  const result=await done;
  assert.deepEqual(result.endpoint,P(6,4));
  assert.equal(h.maxOutstanding,1);
 }finally{h.movement.dispose()}
});

test('R18-41: Commit awaiting server ACK blocks the next drag even after release',async()=>{
 const gate=deferred(),h=fixture({commit:req=>gate.promise,
  mode:'drag'});
 try{
  h.start();await settle();
  h.movement.updateGesture(P(3,2));await settle();
  const ending=h.movement.endGesture();
  await settle();
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,1);
  assert.equal(h.movement.active,true);
  assert.equal(h.movement.beginGesture({
   mapId:MAP,selection:[{kind:'token',id:TOKEN}],
   origin:P(3,2),pointer:P(3,2),mode:'drag',
   environmentRevision:7,permissionGeneration:9
  }),false,'a new gesture cannot assume that the old canonical write succeeded');
  gate.resolve({version:2,sessionId:SESSION,
   seq:h.calls.commit[0].seq,endpoint:P(3,2)});
  assert.equal((await ending).status,'committed');
  assert.equal(h.movement.active,false);
 }finally{h.movement.dispose()}
});

test('R18-41: server-blocked route cannot be silently painted or committed',async()=>{
 const h=fixture({advance:req=>({
  version:2,sessionId:SESSION,seq:req.seq,
  blocked:true,accepted:[]
 }),canPredict:()=>false});
 try{
  h.start();await settle();
  h.movement.updateGesture(P(3,2));await settle();
  const done=await h.movement.endGesture();
  assert.equal(done.status,'committed');
  assert.equal(done.noMotion,true);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.filter(e=>e.type==='presented').length,0);
  assert.equal(h.events.filter(e=>e.type==='blocked').length,1);
 }finally{h.movement.dispose()}
});

test('R18-41: no speculative corridor extends a player beyond source-signed grants',()=>{
 const frame={mapId:MAP,scope:'viewer',sceneGeneration:8,
  environmentRevision:7,permissionGeneration:9,
  visiblePieces:[{kind:'token',id:TOKEN,x:2,y:2}],
  predictionGrants:[{kind:'token',id:TOKEN,x:2,y:2,quadrants:[[1,0],[1,1]]}]};
 const scene={mapId:MAP,scope:'viewer',published:true,revision:7,
  sceneGeneration:8};
 const request=(from,pointer)=>({
  mapId:MAP,selection:[{kind:'token',id:TOKEN}],
  from,pointer,environmentRevision:7,permissionGeneration:9
 });
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request(P(2,2),P(2.3,2))
 }),true);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request(P(2,2),P(3.1,2))
 }),false,'viewer grant is not a multi-cell movement ticket');
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request(P(3,2),P(3.3,2))
 }),false,'new origin needs fresh signed viewer authorization');
 assert.equal(canPredictWithinWorldGrants({
  frame:{...frame,permissionGeneration:10},
  scene,request:request(P(2,2),P(2.3,2))
 }),false);
});
