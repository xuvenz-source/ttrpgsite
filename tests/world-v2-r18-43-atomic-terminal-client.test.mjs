import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMovementController,validAtomicFinalizationAck} from '../src/engine/v2/MovementController.js';
import {createWorldAuthorityClient} from '../src/engine/v2/AuthorityClient.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';
import {createWorldV2Trace,isWorldV2TraceMetric} from '../src/engine/v2/WorldTrace.js';

const MAP='11111111-1111-4111-8111-111111111111';
const SID='22222222-2222-4222-8222-222222222222';
const TOKEN='33333333-3333-4333-8333-333333333333';
const selection=[{kind:'token',id:TOKEN}],origin={x:1,y:1};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const ack=(req,patch={})=>{
 const accepted=expandGestureRoute(req.from,req.targets);
 return {version:2,sessionId:SID,seq:req.seq,commitSeq:req.seq+1,
  finalized:true,blocked:false,accepted,endpoint:accepted.at(-1),...patch};
};
function harness({enabled=true,mode='drag',onFinalize=null,onAdvance=null}={}){
 const calls={begin:[],advance:[],finalize:[],commit:[],cancel:[]},events=[];
 const authority={
  async begin(req){calls.begin.push(req);return {version:2,sessionId:SID}},
  async advance(req){calls.advance.push(req);return onAdvance?onAdvance(req):{
   version:2,sessionId:SID,seq:req.seq,blocked:false,
   accepted:expandGestureRoute(req.from,req.targets)}},
  async finalize(req){calls.finalize.push(req);return onFinalize?onFinalize(req):ack(req)},
  async commit(req){calls.commit.push(req);return {
   version:2,sessionId:SID,seq:req.seq,endpoint:req.endpoint}},
  async cancel(req){calls.cancel.push(req);return true}
 };
 const controller=createMovementController({authority,enableAtomicFinalize:enabled,
  onEvent:event=>events.push(event)});
 const begin=(kind=mode,at=origin)=>controller.beginGesture({
  mapId:MAP,selection,mode:kind,origin:at,pointer:at,
  environmentRevision:1,permissionGeneration:1});
 return {controller,begin,calls,events};
}
test('R18-43 flag OFF keeps legacy Advance and Commit for closing short gestures',async()=>{
 const h=harness({enabled:false});h.begin();h.controller.updateGesture({x:3,y:1});
 const out=await h.controller.endGesture();
 assert.equal(out.status,'committed');assert.deepEqual(out.endpoint,{x:3,y:1});
 assert.equal(h.calls.advance.length,1);assert.equal(h.calls.commit.length,1);
 assert.equal(h.calls.finalize.length,0);h.controller.dispose();
});
test('R18-43 closing short gesture uses just one final RPC and no legacy Commit',async()=>{
 const h=harness();h.begin();h.controller.updateGesture({x:4,y:1});
 const out=await h.controller.endGesture();
 assert.equal(out.status,'committed');assert.deepEqual(out.endpoint,{x:4,y:1});
 assert.equal(h.calls.finalize.length,1);assert.equal(h.calls.advance.length,0);
 assert.equal(h.calls.commit.length,0);assert.equal(h.calls.finalize[0].seq,1);
 assert.equal(h.events.filter(e=>e.type==='committed').length,1);h.controller.dispose();
});
test('R18-43 long gesture sends bounded 24-cell Advance, then 5-cell final RPC',async()=>{
 const h=harness();h.begin();h.controller.updateGesture({x:30,y:1});
 const out=await h.controller.endGesture();
 assert.equal(out.status,'committed');assert.deepEqual(out.endpoint,{x:30,y:1});
 assert.deepEqual(h.calls.advance[0].targets,[{x:25,y:1}]);
 assert.deepEqual(h.calls.finalize[0].from,{x:25,y:1});
 assert.deepEqual(h.calls.finalize[0].targets,[{x:30,y:1}]);
 assert.equal(h.calls.finalize[0].seq,2);assert.equal(h.calls.commit.length,0);
 h.controller.dispose();
});
test('R18-43 open gesture uses ordinary Advance and Commit',async()=>{
 const h=harness();h.begin();await tick();h.controller.updateGesture({x:2,y:1});
 await tick();assert.equal(h.calls.advance.length,1);
 assert.equal((await h.controller.endGesture()).status,'committed');
 assert.equal(h.calls.finalize.length,0);assert.equal(h.calls.commit.length,1);
 h.controller.dispose();
});
test('R18-43 preview never uses persistent final or Commit',async()=>{
 const h=harness();h.begin('preview');h.controller.updateGesture({x:2,y:1});
 const out=await h.controller.endGesture();
 assert.equal(out.status,'committed');assert.equal(out.preview,true);
 assert.equal(h.calls.finalize.length,0);assert.equal(h.calls.commit.length,0);
 assert.equal(h.calls.advance.length,1);h.controller.dispose();
});
test('R18-43 a partially blocked batch commits ONLY the server-approved prefix',async()=>{
 const h=harness({onFinalize:req=>ack(req,{
  blocked:true,accepted:[{x:2,y:1}],endpoint:{x:2,y:1}})});
 h.begin();h.controller.updateGesture({x:4,y:1});
 const out=await h.controller.endGesture();
 assert.equal(out.status,'committed');assert.deepEqual(out.endpoint,{x:2,y:1});
 assert.deepEqual(h.events.find(e=>e.type==='blocked').blockedAt,{x:3,y:1});
 assert.equal(h.calls.commit.length,0);h.controller.dispose();
});
test('R18-43 NULL from final RPC fails closed with no blind legacy fallback',async()=>{
 const h=harness({onFinalize:()=>null});
 h.begin();h.controller.updateGesture({x:2,y:1});
 const out=await h.controller.endGesture();await tick();
 assert.equal(out.status,'rejected');assert.equal(h.calls.finalize.length,1);
 assert.equal(h.calls.advance.length,0);assert.equal(h.calls.commit.length,0);
 assert.ok(h.calls.cancel.length>=1);h.controller.dispose();
});
test('R18-43 exact terminal reply validation rejects forged endpoint or metadata',()=>{
 const r={from:{x:1,y:1},targets:[{x:3,y:1}],seq:1},valid=ack(r);
 assert.equal(validAtomicFinalizationAck(valid,SID,1,r.from,r.targets),true);
 const invalid=[
  {...valid,sessionId:MAP},{...valid,seq:2},{...valid,commitSeq:3},
  {...valid,finalized:false},{...valid,endpoint:{x:99,y:1}},
  {...valid,endpoint:{x:3,y:1,secret:true}},
  {...valid,accepted:[{x:2,y:1}],blocked:false,endpoint:{x:2,y:1}},
  {...valid,accepted:[],blocked:true,endpoint:{x:1,y:1}},
  {...valid,accepted:[{x:3,y:1}],endpoint:{x:3,y:1}},
  {...valid,accepted:[{x:2,y:1},{x:3,y:1,secret:true}]},
  {...valid,blocked:'true'},{...valid,hiddenNpc:'SECRET'},
  {...valid,endpoint:{x:3.5,y:1}}
 ];
 for(const forged of invalid)assert.equal(
  validAtomicFinalizationAck(forged,SID,1,r.from,r.targets),false,
  JSON.stringify(forged));
});
test('R18-43 malicious final ACK cannot trigger another Commit',async()=>{
 const h=harness({onFinalize:req=>ack(req,{endpoint:{x:99,y:99}})});
 h.begin();h.controller.updateGesture({x:3,y:1});
 assert.equal((await h.controller.endGesture()).status,'rejected');
 assert.equal(h.calls.commit.length,0);h.controller.dispose();
});
test('R18-43 permission revocation while final RPC is pending cannot adopt late ACK',async()=>{
 const gate=deferred(),h=harness({onFinalize:()=>gate.promise});
 h.begin();h.controller.updateGesture({x:3,y:1});
 const waiting=h.controller.endGesture();await tick();
 assert.equal(h.calls.finalize.length,1);
 assert.equal(h.controller.cancelGesture('permission'),true);
 const res=await waiting;gate.resolve(ack(h.calls.finalize[0]));await tick();
 assert.equal(res.status,'revoked');
 assert.equal(h.events.some(e=>e.type==='committed'),false);
 assert.equal(h.calls.commit.length,0);h.controller.dispose();
});
test('R18-43 guards missing final transport and invalid flag types',()=>{
 const authority={begin(){},advance(){},commit(){},cancel(){}};
 assert.throws(()=>createMovementController({
  authority,enableAtomicFinalize:true}),/atomic finalize feature gate/);
 assert.throws(()=>createMovementController({
  authority,enableAtomicFinalize:'true'}),/atomic finalize feature gate/);
 assert.throws(()=>createWorldAuthorityClient({
  db:{rpc(){}},atomicFinalizeEnabled:'true'}),/terminal feature gate/);
});
function transport(handler){
 const calls=[],db={async rpc(name,params){
  calls.push({name,params});return handler(name,params,calls.length);
 }};
 return {db,calls};
}
const beginReq={mapId:MAP,gestureId:1,selection,mode:'drag',origin,
 environmentRevision:1,permissionGeneration:1};
const finalReq={mapId:MAP,sessionId:SID,gestureId:1,seq:1,from:origin,
 targets:[{x:2,y:1}],environmentRevision:1,permissionGeneration:1};
test('R18-43 default transport gate never calls uninstalled SQL RPC',async()=>{
 const t=transport(name=>({data:name==='begin_world_motion_v2'?
  {version:2,sessionId:SID}:null,error:null}));
 const a=createWorldAuthorityClient({db:t.db});
 await a.begin(beginReq);
 await assert.rejects(a.finalize(finalReq),/atomic terminal disabled/);
 assert.deepEqual(t.calls.map(x=>x.name),['begin_world_motion_v2']);
 a.dispose();
});
test('R18-43 dropped response replays exact final request ONCE without legacy fallback',async()=>{
 let times=0;
 const t=transport((name,p)=>{
  if(name==='begin_world_motion_v2')return {data:{version:2,sessionId:SID},error:null};
  if(name==='finalize_world_motion_v2'){
   if(++times===1)throw Error('network dropped response');
   return {data:ack({seq:p.p_seq,from:p.p_from,targets:p.p_targets}),error:null};
  }
  throw Error('No legacy RPC expected');
 });
 const a=createWorldAuthorityClient({db:t.db,atomicFinalizeEnabled:true});
 await a.begin(beginReq);const result=await a.finalize(finalReq);
 assert.equal(result.finalized,true);assert.equal(times,2);
 assert.deepEqual(t.calls.map(x=>x.name),['begin_world_motion_v2',
  'finalize_world_motion_v2','finalize_world_motion_v2']);
 assert.strictEqual(t.calls[1].params,t.calls[2].params);
 assert.equal(a.sessionCount,0);a.dispose();
});
test('R18-43 NULL or explicit RPC error never causes automatic retry or legacy Commit',async()=>{
 for(const failure of [
  {data:null,error:{message:'function missing'}},
  {data:null,error:null},
  {data:{version:1},error:null}
 ]){
  const t=transport(name=>name==='begin_world_motion_v2'?
   {data:{version:2,sessionId:SID},error:null}:failure);
  const a=createWorldAuthorityClient({db:t.db,atomicFinalizeEnabled:true});
  await a.begin(beginReq);await assert.rejects(a.finalize(finalReq));
  assert.deepEqual(t.calls.map(x=>x.name),[
   'begin_world_motion_v2','finalize_world_motion_v2']);
  assert.equal(a.sessionCount,0);a.dispose();
 }
});
test('R18-43 repeat network error stops after one identical retry',async()=>{
 const t=transport(name=>name==='begin_world_motion_v2'?
  {data:{version:2,sessionId:SID},error:null}:Promise.reject(Error('offline')));
 const a=createWorldAuthorityClient({db:t.db,atomicFinalizeEnabled:true});
 await a.begin(beginReq);await assert.rejects(a.finalize(finalReq),/offline/);
 assert.equal(t.calls.filter(c=>c.name==='finalize_world_motion_v2').length,2);
 assert.equal(t.calls.some(c=>c.name==='commit_world_motion_v2'),false);
 a.dispose();
});
test('R18-43 cancelled transport cannot retry after late network rejection',async()=>{
 const gate=deferred();
 const t=transport(name=>{
  if(name==='begin_world_motion_v2')return {data:{version:2,sessionId:SID},error:null};
  if(name==='finalize_world_motion_v2')return gate.promise;
  if(name==='cancel_world_motion_v2')return {data:true,error:null};
  throw Error('Unexpected RPC');
 });
 const a=createWorldAuthorityClient({db:t.db,atomicFinalizeEnabled:true});
 await a.begin(beginReq);const promise=a.finalize(finalReq);await tick();
 await a.cancel({mapId:MAP,sessionId:SID,gestureId:1});
 gate.reject(Error('network failed'));
 await assert.rejects(promise,/movement cancelled/);
 assert.equal(t.calls.filter(c=>c.name==='finalize_world_motion_v2').length,1);
 a.dispose();
});
test('R18-43 bounded trace authorizes only the named terminal latency metric',()=>{
 assert.equal(isWorldV2TraceMetric('authority.finalize'),true);
 let now=0;const trace=createWorldV2Trace({enabled:true,now:()=>now});
 const done=trace.begin('authority.finalize');now=10;done('ok');
 const data=trace.snapshot();
 assert.equal(data.durations['authority.finalize'].samples,1);
 assert.deepEqual(data.events,[],'duration sampling must not insert private RPC events');
 assert.equal(JSON.stringify(data).includes(TOKEN),false);
});
test('R18-43 runtime activation is default-OFF and forbidden in DM preview',()=>{
 const source=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 assert.match(source,/atomicFinalizeEnabled=!dmPreview&&\s+import\.meta\.env\?\.VITE_WORLD_V2_ATOMIC_FINALIZE==='1'/);
 assert.match(source,/VITE_WORLD_V2_ATOMIC_FINALIZE_READY==='1'/);
 assert.match(source,/createWorldAuthorityClient\(\{db,atomicFinalizeEnabled\}\)/);
 assert.match(source,/enableAtomicFinalize:atomicFinalizeEnabled/);
});


test('R18-43 previously approved path with blocked terminal batch requires canonical receipt',async()=>{
 const first=deferred();
 const h=harness({
  onAdvance:req=>req.seq===1?first.promise:{
   version:2,sessionId:SID,seq:req.seq,blocked:false,
   accepted:expandGestureRoute(req.from,req.targets)
  },
  onFinalize:req=>ack(req,{blocked:true,accepted:[],
   endpoint:{...req.from},noMotion:undefined})
 });
 try{
  h.begin();await tick();
  h.controller.updateGesture({x:2,y:1});await tick();
  assert.equal(h.calls.advance.length,1);
  // Last cell is supplied WHILE first Advance is in flight. Its
  // new final batch cannot start until the first ACK, after release.
  h.controller.updateGesture({x:3,y:1});
  const pending=h.controller.endGesture();
  assert.equal(h.calls.finalize.length,0);
  first.resolve({version:2,sessionId:SID,seq:1,blocked:false,
   accepted:[{x:2,y:1}]});
  const result=await pending;
  assert.equal(result.status,'committed');
  assert.deepEqual(result.endpoint,{x:2,y:1});
  assert.equal(result.noMotion,undefined);
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.finalize.length,1);
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-43 a first-step blocked atomic reply is only valid with explicit noMotion receipt',async()=>{
 const h=harness({onFinalize:req=>ack(req,{blocked:true,accepted:[],
  endpoint:{...req.from},noMotion:true})});
 try{
  h.begin();h.controller.updateGesture({x:2,y:1});
  const result=await h.controller.endGesture();
  assert.equal(result.status,'committed');
  assert.equal(result.noMotion,true);
  assert.equal(h.calls.finalize.length,1);
  assert.equal(h.calls.advance.length,0);
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-43 missing noMotion on a wholly blocked new session is rejected',async()=>{
 const h=harness({onFinalize:req=>ack(req,{blocked:true,accepted:[],
  endpoint:{...req.from}})});
 try{
  h.begin();h.controller.updateGesture({x:2,y:1});
  const result=await h.controller.endGesture();
  assert.equal(result.status,'rejected');
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-43 malformed route ACK is rejected without emitting authorized position',async()=>{
 const h=harness({onFinalize:req=>ack(req,{accepted:[{x:99,y:99}],
  endpoint:{x:99,y:99}})});
 try{
  h.begin();h.controller.updateGesture({x:4,y:1});
  const result=await h.controller.endGesture();
  assert.equal(result.status,'rejected');
  assert.equal(h.events.some(e=>e.type==='approved'||e.type==='committed'),false);
  assert.equal(h.calls.advance.length,0);
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
