import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMovementController}
 from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='10000000-0000-4000-8000-000000000001';
const TOKEN='40000000-0000-4000-8000-000000000001';
const TOOL='40000000-0000-4000-8000-000000000002';
const SESSION='b0000000-0000-4000-8000-000000000001';
const point=(x,y)=>({x,y});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){
 let resolve,reject;
 const promise=new Promise((ok,bad)=>{resolve=ok;reject=bad});
 return {promise,resolve,reject};
}
function clock(){
 let id=0;const pending=new Map();
 return {
  setTimer(callback,ms){const key=++id;pending.set(key,{callback,ms});return key},
  clearTimer(key){pending.delete(key)},
  fire(ms){
   const entry=[...pending.entries()].find(([,v])=>v.ms===ms);
   assert.ok(entry,'expected timer of '+ms+'ms, actual '+[...pending.values()].map(v=>v.ms));
   pending.delete(entry[0]);entry[1].callback();
  },
  count(ms){return [...pending.values()].filter(v=>v.ms===ms).length},
  get size(){return pending.size}
 };
}
function harness({deferAdvance=false,deferBegin=false,deferCommit=false,
 coalesceMotion=true,canPredict=()=>false,mode='drag'}={}){
 const c=clock(),events=[],calls=[],advances=[],begins=[],commits=[],cancels=[];
 const pendingAdvance=[],pendingBegin=[],pendingCommit=[];
 const authority={
  begin(req){
   begins.push(req);calls.push('begin');
   if(deferBegin){const d=deferred();pendingBegin.push(d);return d.promise}
   return Promise.resolve({version:2,sessionId:SESSION});
  },
  advance(req){
   advances.push(req);calls.push('advance');
   if(deferAdvance){const d=deferred();pendingAdvance.push(d);return d.promise}
   return Promise.resolve(approve(req));
  },
  commit(req){
   commits.push(req);calls.push('commit');
   if(deferCommit){const d=deferred();pendingCommit.push(d);return d.promise}
   return Promise.resolve({version:2,sessionId:SESSION,seq:req.seq,
    endpoint:{...req.endpoint}});
  },
  cancel(req){cancels.push(req);calls.push('cancel');return Promise.resolve(true)}
 };
 const controller=createMovementController({
  authority,coalesceMotion,canPredict,
  setTimer:c.setTimer,clearTimer:c.clearTimer,
  onEvent:event=>events.push(event)
 });
 const begin=(origin=point(0,0),selection=[{kind:'token',id:TOKEN}])=>
  controller.beginGesture({mapId:MAP,origin,pointer:origin,selection,mode,
   environmentRevision:7,permissionGeneration:4});
 return {c,events,calls,advances,begins,commits,cancels,controller,begin,
  pendingAdvance,pendingBegin,pendingCommit};
}
function approve(req,{blocked=false,accepted=null}={}){
 return {version:2,sessionId:SESSION,seq:req.seq,blocked,
  accepted:accepted??expandGestureRoute(req.from,req.targets)};
}

test('B05 coalesces rapid sampled drag into one server-validated ordered batch',async()=>{
 const h=harness();
 assert.equal(h.begin(),true);
 for(const x of [1,2,3,4,5])assert.equal(h.controller.updateGesture(point(x,0)),true);
 await settle();
 assert.equal(h.advances.length,0,'samples buffer in the 16ms window');
 assert.equal(h.c.count(16),1);
 h.c.fire(16);await settle();
 assert.equal(h.advances.length,1,'one RPC instead of five grid-cell RPCs');
 assert.deepEqual(h.advances[0].targets,[point(5,0)]);
 assert.equal(h.advances[0].seq,1);
 assert.deepEqual(h.events.findLast(x=>x.type==='approved').approved,point(5,0));
 const result=await h.controller.endGesture();
 assert.equal(result.status,'committed');
 assert.deepEqual(h.commits[0].endpoint,point(5,0));
 assert.deepEqual(h.calls,['begin','advance','commit']);
 assert.equal(h.c.size,0,'all flush/deadline timers retired');
 h.controller.dispose();
});

test('B05 detaches in-flight batch: new turn and reversal are never discarded by ACK',async()=>{
 const h=harness({deferAdvance:true});
 assert.equal(h.begin(),true);
 h.controller.updateGesture(point(2,0));
 await settle();h.c.fire(16);await settle();
 assert.deepEqual(h.advances[0].targets,[point(2,0)]);
 // These inputs arrive while batch 1 is on the wire; stale splice would
 // discard the turn or jump diagonally into the forbidden shortcut.
 h.controller.updateGesture(point(2,3));
 h.controller.updateGesture(point(0,3));
 const completion=h.controller.endGesture();
 h.pendingAdvance[0].resolve(approve(h.advances[0]));
 await settle();
 assert.equal(h.advances.length,2);
 assert.deepEqual(h.advances[1].from,point(2,0));
 assert.deepEqual(h.advances[1].targets,[point(2,3),point(0,3)]);
 assert.equal(h.advances[1].seq,2);
 h.pendingAdvance[1].resolve(approve(h.advances[1]));
 const done=await completion;
 assert.equal(done.status,'committed');
 assert.deepEqual(h.commits[0].endpoint,point(0,3));
 assert.deepEqual(h.calls,['begin','advance','advance','commit']);
 h.controller.dispose();
});

test('B05 70-cell sampled drag stays bounded at 24 cells per packet and preserves latest target',async()=>{
 const h=harness({deferAdvance:true});
 assert.equal(h.begin(),true);
 h.controller.updateGesture(point(60,0));
 await settle();h.c.fire(16);await settle();
 assert.deepEqual(h.advances[0].targets,[point(24,0)]);
 h.controller.updateGesture(point(70,0));
 const done=h.controller.endGesture();
 for(let i=0;i<3;i++){
  const req=h.advances[i];assert.ok(req,'expected batch '+(i+1));
  const route=expandGestureRoute(req.from,req.targets);
  assert.ok(route&&route.length<=24,'batch must obey server max24');
  h.pendingAdvance[i].resolve(approve(req));
  await settle();
 }
 assert.deepEqual(h.advances.map(x=>x.targets.at(-1)),
  [point(24,0),point(48,0),point(70,0)]);
 assert.equal(h.advances.length,3);
 assert.equal((await done).status,'committed');
 assert.deepEqual(h.commits[0].endpoint,point(70,0));
 h.controller.dispose();
});

test('B05 partial collision clears all later unapproved turns, committing only approved prefix',async()=>{
 const h=harness({deferAdvance:true});
 h.begin();
 h.controller.updateGesture(point(8,0));
 await settle();h.c.fire(16);await settle();
 h.controller.updateGesture(point(8,4));
 h.controller.updateGesture(point(0,4));
 const done=h.controller.endGesture();
 h.pendingAdvance[0].resolve(approve(h.advances[0],{
  blocked:true,accepted:[point(1,0),point(2,0)]
 }));
 assert.equal((await done).status,'committed');
 assert.equal(h.advances.length,1,'blocked route cannot resend unapproved future bends');
 assert.deepEqual(h.commits[0].endpoint,point(2,0));
 assert.ok(h.events.some(e=>e.type==='blocked'));
 assert.ok(!h.events.some(e=>e.type==='presented'),
  'no grant implies no speculative local position');
 h.controller.dispose();
});

test('B05 blocked-first-cell cannot invent movement or persist endpoint',async()=>{
 const h=harness({deferAdvance:true});
 h.begin();h.controller.updateGesture(point(4,0));
 await settle();h.c.fire(16);await settle();
 const done=h.controller.endGesture();
 h.pendingAdvance[0].resolve(approve(h.advances[0],{
  blocked:true,accepted:[]
 }));
 assert.equal((await done).status,'committed');
 assert.equal(h.commits.length,0,'zero approved cells is no-motion cancellation');
 assert.equal(h.cancels.length,1);
 h.controller.dispose();
});

test('B05 stalled begin has hard deadline, and late session is retired',async()=>{
 const h=harness({deferBegin:true});
 h.begin();h.controller.updateGesture(point(3,0));
 await settle();
 assert.equal(h.c.count(8000),1);
 h.c.fire(8000);await settle();
 assert.equal(h.controller.active,false);
 assert.ok(h.events.some(e=>e.type==='rejected'&&e.reason==='authority-timeout'));
 h.pendingBegin[0].resolve({version:2,sessionId:SESSION});
 await settle();
 assert.equal(h.cancels.length,1,'late session must be canceled at server');
 assert.equal(h.advances.length,0,'timed-out begin must never validate path');
 assert.equal(h.c.size,0);
 h.controller.dispose();
});

test('B05 stalled advance has hard deadline, cancels and ignores late ACK',async()=>{
 const h=harness({deferAdvance:true});
 h.begin();h.controller.updateGesture(point(3,0));
 await settle();h.c.fire(16);await settle();
 const finish=h.controller.endGesture();
 assert.equal(h.c.count(8000),1);
 h.c.fire(8000);
 assert.equal((await finish).status,'rejected');
 await settle();
 assert.equal(h.cancels.length,1);
 h.pendingAdvance[0].resolve(approve(h.advances[0]));
 await settle();
 assert.equal(h.commits.length,0);
 assert.equal(h.controller.active,false);
 h.controller.dispose();
});

test('B05 stalled final commit must fail closed without any second commit',async()=>{
 const h=harness({deferCommit:true});
 h.begin();h.controller.updateGesture(point(1,0));
 await settle();h.c.fire(16);await settle();
 const finish=h.controller.endGesture();
 assert.equal(h.commits.length,1);
 assert.equal(h.c.count(8000),1);
 h.c.fire(8000);
 assert.equal((await finish).status,'rejected');
 assert.equal(h.commits.length,1);
 h.pendingCommit[0].resolve({version:2,sessionId:SESSION,seq:h.commits[0].seq,
  endpoint:point(1,0)});
 await settle();
 assert.equal(h.controller.active,false);
 h.controller.dispose();
});

test('B05 explicit cancellation and newer gesture reject late old RPC result',async()=>{
 const h=harness({deferAdvance:true});
 h.begin();h.controller.updateGesture(point(3,0));
 await settle();h.c.fire(16);await settle();
 assert.equal(h.controller.cancelGesture('permission'),true);
 await settle();
 assert.equal(h.controller.active,false);
 assert.equal(h.begin(point(5,5)),true);
 h.controller.updateGesture(point(6,5));
 await settle();h.c.fire(16);await settle();
 h.pendingAdvance[0].resolve(approve(h.advances[0]));
 await settle();
 assert.equal(h.controller.active,true);
 assert.ok(!h.events.some(e=>e.gestureId===2&&e.approved.x===3));
 h.pendingAdvance[1].resolve(approve(h.advances[1]));
 await settle();
 assert.equal((await h.controller.endGesture()).status,'committed');
 assert.deepEqual(h.commits[0].endpoint,point(6,5));
 h.controller.dispose();
});

test('B05 invalid server prefix remains denied and cannot reach commit',async()=>{
 const h=harness({deferAdvance:true});
 h.begin();h.controller.updateGesture(point(3,0));
 await settle();h.c.fire(16);await settle();
 const finish=h.controller.endGesture();
 h.pendingAdvance[0].resolve({...approve(h.advances[0]),accepted:[point(3,0)]});
 assert.equal((await finish).status,'rejected');
 assert.equal(h.commits.length,0);
 assert.ok(h.events.some(e=>e.reason==='invalid-authority-ack'));
 h.controller.dispose();
});

test('B05 preview uses same bounded ordered path and NEVER persists canonical position',async()=>{
 const h=harness({mode:'preview',deferAdvance:true});
 h.begin(point(1,1));
 h.controller.updateGesture(point(2,1));
 h.controller.updateGesture(point(2,2));
 await settle();
 assert.equal(h.advances.length,1,'preview does not wait for remote batch throttle');
 assert.deepEqual(h.advances[0].targets,[point(2,1),point(2,2)]);
 const done=h.controller.endGesture();
 h.pendingAdvance[0].resolve(approve(h.advances[0]));
 assert.equal((await done).status,'committed');
 assert.equal(h.commits.length,0,'preview must use local-only finalization');
 assert.deepEqual(h.events.findLast(e=>e.type==='approved').approved,point(2,2));
 h.controller.dispose();
});

test('B05 legacy controller path is still the default, no coalescing timer or opt-in leak',async()=>{
 const h=harness({coalesceMotion:false});
 h.begin();h.controller.updateGesture(point(1,0));
 await settle();
 assert.equal(h.c.count(16),0);
 assert.equal(h.advances.length,1,'default still sends as soon as begin resolves');
 const result=await h.controller.endGesture();
 assert.equal(result.status,'committed');
 h.controller.dispose();
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(runtime,/coalesceMotion:import\.meta\.env\?\.VITE_WORLD_V2_COALESCE_MOTION==='1'/);
 assert.match(runtime,/createMovementController\(\{/);
});

test('B05 controlled prediction is never allowed past certified provider decision',async()=>{
 const h=harness({canPredict:()=>false});
 h.begin();h.controller.updateGesture(point(2.6,0));
 const before=h.events.at(-1);
 assert.equal(before.type,'sampled');
 assert.deepEqual(before.presented,point(0,0));
 await settle();h.c.fire(16);await settle();
 assert.deepEqual(h.events.findLast(x=>x.type==='approved').approved,point(3,0));
 h.controller.dispose();
});
