import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SID='33333333-3333-4333-8333-333333333333';
const point=(x,y)=>({x,y});
const tick=()=>new Promise(done=>setImmediate(done));
const settle=async()=>{for(let i=0;i<4;i++)await tick()};
const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{
 resolve=yes;reject=no;
});return {promise,resolve,reject}};
const good=req=>({version:2,sessionId:SID,seq:req.seq,blocked:false,
 accepted:expandGestureRoute(req.from,req.targets)});
function fixture({mode='drag',begin,advance,canPredict=()=>false}={}){
 const calls={begin:[],advance:[],commit:[],cancel:[]},events=[];
 let inflight=0,maximumInflight=0;
 const authority={
  async begin(request){
   calls.begin.push(request);
   return begin?begin(request):{version:2,sessionId:SID};
  },
  async advance(request){
   calls.advance.push(request);
   inflight++;maximumInflight=Math.max(maximumInflight,inflight);
   try{return await (advance?advance(request):good(request))}
   finally{inflight--}
  },
  async commit(request){
   calls.commit.push(request);
   return {version:2,sessionId:SID,seq:request.seq,endpoint:request.endpoint};
  },
  async cancel(request){calls.cancel.push(request);return true}
 };
 const movement=createMovementController({
  authority,canPredict,onEvent:event=>events.push(event)
 });
 const start=()=>movement.beginGesture({
  mapId:MAP,selection:[{kind:'token',id:TOKEN}],
  origin:point(1,1),pointer:point(1,1),mode,
  environmentRevision:7,permissionGeneration:9
 });
 return {calls,events,movement,start,
  get maximumInflight(){return maximumInflight}};
}
test('R18-82: one coalesced browser event dispatches exactly ONE ordered signed Advance',async()=>{
 const h=fixture();
 try{
  assert.equal(h.start(),true);await settle();
  const samples=[
   point(2.11,1.05),point(3.11,1.03),point(3.09,2.1),
   point(2.08,2.1),point(2.03,1.04),point(4.1,1.1)
  ];
  assert.equal(h.movement.updateGestureSamples(samples),true);
  assert.equal(h.calls.advance.length,1,
   'server must not receive a premature intermediate-sample Advance');
  assert.deepEqual(h.calls.advance[0].targets,[
   point(3,1),point(3,2),point(2,2),point(2,1),point(4,1)
  ]);
  const result=await h.movement.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,point(4,1));
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,1);
  assert.equal(h.calls.commit[0].seq,2);
  assert.deepEqual(h.events.filter(x=>x.type==='approved')
   .flatMap(x=>x.accepted),expandGestureRoute(
   point(1,1),h.calls.advance[0].targets));
 }finally{h.movement.dispose()}
});
test('R18-82: final pointer prediction occurs once; no extra unapproved repaint',async()=>{
 let checks=0;
 const h=fixture({canPredict:()=>{checks++;return false}});
 try{
  h.start();await settle();
  assert.equal(h.movement.updateGestureSamples([
   point(2.1,1),point(2.2,1),point(3,1),point(3.1,1),point(4,1)
  ]),true);
  assert.equal(checks,1);
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.events.filter(x=>x.type==='presented').length,0);
  assert.equal((await h.movement.endGesture()).status,'committed');
  assert.equal(h.calls.commit.length,1);
 }finally{h.movement.dispose()}
});
test('R18-82: an in-flight Advance stays serialized while later bursts preserve turns',async()=>{
 const first=gate(),h=fixture({advance:req=>req.seq===1?first.promise:good(req)});
 try{
  h.start();await settle();
  h.movement.updateGestureSamples([
   point(2,1),point(3,1),point(3,2)
  ]);
  assert.equal(h.calls.advance.length,1);
  h.movement.updateGestureSamples([
   point(4,2),point(4,3),point(3,3)
  ]);
  assert.equal(h.calls.advance.length,1);
  const ending=h.movement.endGesture();
  first.resolve(good(h.calls.advance[0]));
  const result=await ending;
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,point(3,3));
  assert.equal(h.calls.advance.length,2);
  assert.equal(h.maximumInflight,1,'never overlap two signed Advances');
  assert.deepEqual(h.calls.advance[1].from,point(3,2));
  assert.deepEqual(h.calls.advance[1].targets,[
   point(4,2),point(4,3),point(3,3)
  ]);
  assert.equal(h.calls.commit.length,1);
 }finally{h.movement.dispose()}
});
test('R18-82: server-blocked first crossing discards later burst intent and NEVER Commits',async()=>{
 const h=fixture({advance:req=>({version:2,sessionId:SID,
  seq:req.seq,blocked:true,accepted:[]})});
 try{
  h.start();await settle();
  h.movement.updateGestureSamples([
   point(2,1),point(2,2),point(3,2),point(3,3)
  ]);
  const result=await h.movement.endGesture();
  assert.equal(result.status,'committed');
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.filter(x=>x.type==='blocked').length,1);
  assert.equal(h.events.filter(x=>x.type==='presented').length,0);
 }finally{h.movement.dispose()}
});
test('R18-82: partial wall collision preserves ONLY server-approved prefix and endpoint',async()=>{
 const h=fixture({advance:req=>({version:2,sessionId:SID,
  seq:req.seq,blocked:true,accepted:expandGestureRoute(
   req.from,req.targets).slice(0,2)})});
 try{
  h.start();await settle();
  h.movement.updateGestureSamples([
   point(2,1),point(3,1),point(4,1),point(5,1)
  ]);
  const result=await h.movement.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,point(3,1));
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.commit.length,1);
  assert.deepEqual(h.calls.commit[0].endpoint,point(3,1));
  const blocked=h.events.find(x=>x.type==='blocked');
  assert.deepEqual(blocked.approved,point(3,1));
  assert.deepEqual(blocked.blockedAt,point(4,1));
 }finally{h.movement.dispose()}
});
test('R18-82: malformed intermediate coalesced sample dispatches no partial route',async()=>{
 const h=fixture();
 try{
  h.start();await settle();
  assert.equal(h.movement.updateGestureSamples([
   point(2,1),{x:Number.NaN,y:1},point(4,1)
  ]),false);
  assert.equal(h.calls.advance.length,0);
  assert.equal(h.events.filter(x=>x.type==='presented').length,0);
  assert.equal(h.movement.updateGesture(point(2,1)),true);
  const result=await h.movement.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,point(2,1));
  assert.equal(h.calls.advance.length,1);
 }finally{h.movement.dispose()}
});
test('R18-82: permission revocation ignores a late batched ACK and never Commits',async()=>{
 const pending=gate(),h=fixture({advance:()=>pending.promise});
 try{
  h.start();await settle();
  h.movement.updateGestureSamples([
   point(2,1),point(3,1),point(4,1)
  ]);
  assert.equal(h.calls.advance.length,1);
  const terminal=h.movement.endGesture();
  h.movement.updateContext({permissionGeneration:10});
  const result=await terminal;
  assert.equal(result.status,'revoked');
  pending.resolve(good(h.calls.advance[0]));await settle();
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.events.some(e=>e.type==='committed'),false);
  assert.equal(h.calls.cancel.length,1);
 }finally{h.movement.dispose()}
});
test('R18-82: a long coalesced burst remains bounded by existing 24-cell batches',async()=>{
 const h=fixture();
 try{
  h.start();await settle();
  const samples=Array.from({length:40},(_,i)=>point(i+2,1));
  assert.equal(h.movement.updateGestureSamples(samples),true);
  const result=await h.movement.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,point(41,1));
  assert.equal(h.calls.advance.length,2);
  assert.equal(h.calls.commit.length,1);
  for(const req of h.calls.advance){
   assert.ok(req.targets.length<=8);
   assert.ok(expandGestureRoute(req.from,req.targets).length<=24);
  }
  assert.deepEqual(h.calls.advance[0].targets,[point(25,1)]);
  assert.deepEqual(h.calls.advance[1].targets,[point(41,1)]);
 }finally{h.movement.dispose()}
});
test('R18-82: plain single pointer/keyboard input STILL dispatches immediately',async()=>{
 const h=fixture({mode:'keyboard'});
 try{
  h.start();await settle();
  assert.equal(h.movement.updateGesture(point(2,1)),true);
  assert.equal(h.calls.advance.length,1);
  assert.equal((await h.movement.endGesture()).status,'committed');
  assert.equal(h.calls.commit.length,1);
 }finally{h.movement.dispose()}
});
test('R18-82: exact-source fix cannot introduce a second authority or fog shortcut',()=>{
 const src=readFileSync(new URL('../src/engine/v2/MovementController.js',import.meta.url),'utf8');
 assert.match(src,/if\(g\.sessionId&&!deferAdvance\)void drain\(g\)/);
 assert.match(src,/!updatePointer\(samples\[i\],i===samples\.length-1,true\)/);
 assert.match(src,/if\(active===g&&g\.sessionId\)void drain\(g\)/);
 assert.match(src,/!samples\.every\(validPoint\)/);
 assert.match(src,/const reply=await authority\.commit/);
 assert.match(src,/if\(response\.blocked\)g\.pending\.length=0/);
 assert.match(src,/enableAtomicFinalize=false/);
 assert.doesNotMatch(src,/db\.rpc|localStorage|sessionStorage|sendBroadcast|visibility\.frame=/);
});
