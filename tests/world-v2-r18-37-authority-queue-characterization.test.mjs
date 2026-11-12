import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';
import {canPredictWithinWorldGrants} from '../src/engine/v2/PredictionGrants.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const actor={kind:'token',id:TOKEN};
const P=(x,y)=>({x,y});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<4;i++)await flush()};
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}
const reply=req=>({
 version:2,sessionId:SESSION,seq:req.seq,blocked:false,
 accepted:expandGestureRoute(req.from,req.targets)
});
function createHarness({advance=async req=>reply(req),predict=()=>false,
 mode='drag'}={}){
 const events=[],calls={begin:[],advance:[],commit:[],cancel:[]};
 const authority={
  async begin(req){calls.begin.push(req);return {version:2,sessionId:SESSION}},
  async advance(req){calls.advance.push(req);return advance(req)},
  async commit(req){calls.commit.push(req);
   return {version:2,sessionId:SESSION,seq:req.seq,endpoint:req.endpoint}},
  async cancel(req){calls.cancel.push(req);return true}
 };
 const movement=createMovementController({
  authority,canPredict:predict,onEvent:event=>events.push(event)
 });
 const begin=()=>movement.beginGesture({mapId:MAP,
  selection:[actor],origin:P(1,1),pointer:P(1,1),
  mode,environmentRevision:1,permissionGeneration:1
 });
 return {movement,calls,events,begin};
}
test('R18-37: a slow Advance serializes new bends and the later canonical Commit',async()=>{
 const first=deferred(),second=deferred();
 let inFlight=0,maxInFlight=0,started=0;
 const h=createHarness({advance:async req=>{
  inFlight++;maxInFlight=Math.max(inFlight,maxInFlight);
  started++;
  await (started===1?first.promise:second.promise);
  inFlight--;return reply(req);
 }});
 try{
  assert.equal(h.begin(),true);
  await settle();
  assert.equal(h.movement.updateGesture(P(3,1)),true);
  await settle();
  assert.equal(h.calls.advance.length,1);
  // Input arrives during the *first* server RPC. Preserve both turns.
  assert.equal(h.movement.updateGesture(P(3,3)),true);
  assert.equal(h.movement.updateGesture(P(5,3)),true);
  const completed=h.movement.endGesture();
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.calls.advance.length,1);
  first.resolve();
  await settle();
  assert.equal(h.calls.advance.length,2);
  assert.deepEqual(h.calls.advance[1].from,P(3,1));
  assert.deepEqual(h.calls.advance[1].targets,[P(3,3),P(5,3)]);
  assert.equal(h.calls.commit.length,0);
  second.resolve();
  const result=await completed;
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,P(5,3));
  assert.equal(maxInFlight,1);
  assert.equal(h.calls.commit.length,1);
 }finally{h.movement.dispose()}
});
test('R18-37: 240 subcell input samples still run 240 synchronous prediction checks',async()=>{
 let predictionCalls=0;
 const h=createHarness({predict:()=>{predictionCalls++;return false}});
 try{
  assert.equal(h.begin(),true);
  await settle();
  // No cell boundary is crossed. Current source still calls the collision/
  // prediction callback for each pointer sample, even with no pending route.
  for(let i=0;i<240;i++){
   const x=1.01+i*0.001;
   assert.equal(h.movement.updateGesture(P(x,1.1)),true);
  }
  assert.equal(predictionCalls,240);
  const result=await h.movement.endGesture();
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,0);
  assert.equal(h.calls.commit.length,0);
 }finally{h.movement.dispose()}
});
test('R18-37 historical blocked-ACK loss is corrected only for newly arrived lateral input by R18-40',async()=>{
 const first=deferred();
 const h=createHarness({advance:async req=>{
  if(req.seq===1)await first.promise;
  return {version:2,sessionId:SESSION,seq:req.seq,blocked:true,accepted:[]};
 }});
 try{
  h.begin();await settle();
  h.movement.updateGesture(P(2,1));await settle();
  assert.equal(h.calls.advance.length,1);
  // R18-37 documented this as dropped; R18-40 rebases only the newest
  // differently directed sample, and the second ACK can still deny it.
  h.movement.updateGesture(P(2,2));
  const complete=h.movement.endGesture();
  first.resolve();
  const result=await complete;
  assert.equal(result.status,'committed');
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,2,
   'new lateral target needs one new server validation, not silent approval');
  assert.deepEqual(h.calls.advance[1].from,P(1,1));
  assert.deepEqual(h.calls.advance[1].targets,[P(2,2)]);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.filter(e=>e.type==='blocked').length,2);
 }finally{h.movement.dispose()}
});
test('R18-37: viewer prediction grant expires for presentation after first accepted cell',()=>{
 const scene={mapId:MAP,scope:'viewer',published:true,
  revision:4,sceneGeneration:3};
 const grant=(x,y)=>({kind:'token',id:TOKEN,x,y,
  quadrants:[[1,0],[1,1],[-1,0],[-1,-1]]});
 const frame={mapId:MAP,scope:'viewer',
  environmentRevision:4,permissionGeneration:2,sceneGeneration:3,
  visiblePieces:[{...actor,x:1,y:1}],predictionGrants:[grant(1,1)]};
 const request=from=>({
  mapId:MAP,environmentRevision:4,permissionGeneration:2,
  selection:[actor],from,to:P(from.x+0.35,from.y),
  pointer:P(from.x+0.35,from.y)
 });
 assert.equal(canPredictWithinWorldGrants({frame,scene,request:request(P(1,1))}),true);
 // Even after a fully server-approved first step, old sight cannot authorize
 // movement from x=2. This is correct fail-closed behavior, not a client bug.
 assert.equal(canPredictWithinWorldGrants({frame,scene,request:request(P(2,1))}),false);
 const fresh={...frame,visiblePieces:[{...actor,x:2,y:1}],
  predictionGrants:[grant(2,1)]};
 assert.equal(canPredictWithinWorldGrants({frame:fresh,scene,
  request:request(P(2,1))}),true);
});
test('R18-37: synthetic server hard batch ceiling rejects a long active gesture',async()=>{
 let acceptedBatches=0;
 const h=createHarness({mode:'keyboard',advance:async req=>{
  if(req.seq>64)throw Error('Invalid world movement response');
  acceptedBatches++;
  return reply(req);
 }});
 try{
  assert.equal(h.begin(),true);await settle();
  // One cell per network cycle: this is exactly the sustained held-key
  // pattern, not a bundled 24-cell drag request.
  for(let i=0;i<65;i++){
   assert.equal(h.movement.updateGesture(P(i+2,1)),true);
   await settle();
  }
  assert.equal(acceptedBatches,64);
  assert.equal(h.calls.advance.length,65);
  assert.equal(h.calls.commit.length,0);
  assert.ok(h.events.some(e=>e.type==='rejected'&&
   e.reason==='Invalid world movement response'));
  assert.equal(h.movement.active,false);
 }finally{h.movement.dispose()}
});
test('R18-37: shipped migration specifies finite live session limits',()=>{
 const sql=readFileSync(new URL(
  '../supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql',
  import.meta.url),'utf8');
 assert.match(sql,/s\.batches>=64/);
 assert.match(sql,/s\.attempted_cells>=128/);
 assert.match(sql,/interval '60 seconds'/);
 assert.match(sql,/interval '10 seconds'/);
 // Test is source-only, never runs DDL or activates an unreleased R05 schema.
});
