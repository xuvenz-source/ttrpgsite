import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldAuthorityClient} from '../src/engine/v2/AuthorityClient.js';
import {createMovementController} from '../src/engine/v2/MovementController.js';

const MAP='10000000-0000-4000-8000-000000000001';
const TOKEN='40000000-0000-4000-8000-000000000001';
const SESSION='b0000000-0000-4000-8000-000000000001';
const point=(x,y)=>({x,y});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const begin={mapId:MAP,gestureId:1,selection:[{kind:'token',id:TOKEN}],
 mode:'drag',origin:point(0,0),environmentRevision:1,
 permissionGeneration:1};
const advance={mapId:MAP,sessionId:SESSION,gestureId:1,seq:1,
 from:point(0,0),targets:[point(1,0)],environmentRevision:1,
 permissionGeneration:1};
const commit={mapId:MAP,sessionId:SESSION,gestureId:1,seq:2,
 endpoint:point(1,0),environmentRevision:1,
 permissionGeneration:1};

test('B08 opt-in lost-ACK replay uses the identical commit tuple exactly twice',async()=>{
 const requests=[];let commits=0;
 const db={async rpc(name,params){
  if(name==='begin_world_motion_v2')return {data:{version:2,sessionId:SESSION},error:null};
  if(name==='advance_world_motion_v2')return {data:{
   version:2,sessionId:SESSION,seq:1,blocked:false,accepted:[point(1,0)]},error:null};
  if(name==='commit_world_motion_v2'){
   requests.push(structuredClone(params));commits++;
   if(commits===1)return {data:null,error:{message:'lost response'}};
   return {data:{version:2,sessionId:SESSION,seq:2,endpoint:point(1,0)},error:null};
  }
  throw Error('Unexpected RPC '+name);
 }};
 const authority=createWorldAuthorityClient({db,commitReconciliation:true});
 await authority.begin(begin);await authority.advance(advance);
 const result=await authority.commit(commit);
 assert.deepEqual(result.endpoint,point(1,0));
 assert.equal(commits,2);
 assert.deepEqual(requests[0],requests[1],'retry cannot change endpoint/seq/map scope');
 assert.equal(authority.sessionCount,0);
 authority.dispose();
});

test('B08 default mode is untouched and does not silently retry ambiguous writes',async()=>{
 let calls=0;const db={async rpc(name){
  if(name==='begin_world_motion_v2')return {data:{version:2,sessionId:SESSION}};
  if(name==='advance_world_motion_v2')return {data:{version:2,sessionId:SESSION,
   seq:1,blocked:false,accepted:[point(1,0)]}};
  if(name==='commit_world_motion_v2'){calls++;return {error:{message:'network'}}}
 }};
 const authority=createWorldAuthorityClient({db});
 await authority.begin(begin);await authority.advance(advance);
 await assert.rejects(authority.commit(commit),/World movement server unavailable/);
 assert.equal(calls,1);assert.equal(authority.sessionCount,0);
 authority.dispose();
});

function controllerHarness({onCommit}){
 const events=[],cancels=[];
 const authority={
  begin:async()=>({version:2,sessionId:SESSION}),
  advance:async req=>({version:2,sessionId:SESSION,seq:req.seq,
   blocked:false,accepted:[point(1,0)]}),
  commit:async req=>onCommit(req),
  cancel:async req=>{cancels.push(req);return true}
 };
 const c=createMovementController({authority,onEvent:e=>events.push(e),
  coalesceMotion:true,commitReconciliation:true,coalesceWindowMs:0});
 return {c,events,cancels};
}
const gesture={mapId:MAP,selection:[{kind:'token',id:TOKEN}],
 origin:point(0,0),pointer:point(0,0),environmentRevision:1,
 permissionGeneration:1};
test('B08 lost commit ACK is uncertain; certified endpoint awaits canonical sight',async()=>{
 const h=controllerHarness({onCommit:async()=>{throw Error('network')}});
 assert.equal(h.c.beginGesture(gesture),true);
 h.c.updateGesture(point(1,0));
 await settle();
 const done=await h.c.endGesture();
 assert.equal(done.status,'uncertain');
 assert.equal(h.c.state,'Uncertain');
 assert.deepEqual(h.events.findLast(e=>e.type==='uncertain').approved,point(1,0));
 assert.equal(h.cancels.length,0,'do not cancel an already-committed SQL session');
 h.c.dispose();
});

test('B08 rejects altered / extra-data commit ACK rather than moving sprites',async()=>{
 const h=controllerHarness({onCommit:async req=>({
  version:2,sessionId:SESSION,seq:req.seq,endpoint:point(1,0),
  leakedValue:'not-allowed'
 })});
 h.c.beginGesture(gesture);h.c.updateGesture(point(1,0));
 await settle();
 const result=await h.c.endGesture();
 assert.equal(result.status,'rejected');
 assert.equal(h.events.some(e=>e.type==='committed'),false);
 h.c.dispose();
});

test('B08 renderer has an explicit uncertain-to-authoritative handoff and flag defaults off',()=>{
 const renderer=readFileSync(new URL('../src/engine/v2/WorldRenderer.js',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/candidates/world_v2_b08_commit_reconciliation.sql',import.meta.url),'utf8');
 assert.match(renderer,/if\(local\.uncertain\)\{clearLocal\(\);return\}/);
 assert.match(renderer,/canonical-commit-uncertain/);
 assert.match(runtime,/VITE_WORLD_V2_COMMIT_RECONCILE==='1'/);
 assert.match(sql,/last_advance_request_b08/);
 assert.match(sql,/last_commit_request_b08/);
 assert.match(sql,/drain_committed_observers_b08/);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION forge_world_v2/);
});
