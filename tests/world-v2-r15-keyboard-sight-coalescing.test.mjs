import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldV2TabletopRuntime} from '../src/engine/v2/WorldV2TabletopRuntime.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

const MAP='11111111-1111-4111-8111-111111111111';
const VIEWER='22222222-2222-4222-8222-222222222222';
const TOKEN='33333333-3333-4333-8333-333333333333';
const SESSION='44444444-4444-4444-8444-444444444444';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const scene=()=>({
 version:2,mapId:MAP,scope:'viewer',published:true,
 revision:9,sceneGeneration:6,rulesRevision:4,
 collisionEnabled:true,fogEnabled:true,ambient:25,
 effects:{weather:'none',intensity:0},
 dimensions:{width:1000,height:1000,gridSize:100},environment:null
});
const sight=(x=2,epoch=7)=>({
 version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',
 cursor:5+epoch-7,environmentRevision:9,permissionGeneration:4,
 sceneGeneration:6,visionEpoch:epoch,enabled:true,width:10,height:10,
 partyShared:false,visible:[22,23,32,33],explored:[22,23,32,33],
 visiblePieces:[{kind:'token',id:TOKEN,x,y:2}],
 predictionGrants:[],lightCells:[],dmMovingLights:[]
});
function fixture({commitSignedX=3,delayCommitSight=false}={}){
 let sightCalls=0,wasCommitted=false;
 const delayed=deferred(),channels=new Map();
 const rpcCalls=[];
 const db={
  rpc:async(name,params)=>{
   rpcCalls.push(name);
   if(name==='get_world_scene_v2')return {data:scene(),error:null};
   if(name==='get_world_visibility_v2'){
    sightCalls++;
    if(sightCalls===2&&delayCommitSight)return delayed.promise;
    return {data:sight(wasCommitted?commitSignedX:2,7+sightCalls-1),error:null};
   }
   if(name==='begin_world_motion_v2')
    return {data:{version:2,sessionId:SESSION},error:null};
   if(name==='advance_world_motion_v2')
    return {data:{version:2,sessionId:SESSION,seq:params.p_seq,
     accepted:params.p_targets,blocked:false,revision:9},error:null};
   if(name==='commit_world_motion_v2'){
    wasCommitted=true;
    return {data:{version:2,sessionId:SESSION,seq:params.p_seq,
     endpoint:params.p_endpoint},error:null};
   }
   if(name==='cancel_world_motion_v2')return {data:{version:2},error:null};
   throw Error('unexpected RPC: '+name);
  },
  realtime:{setAuth:async()=>{}},
  channel(topic){
   const channel={topic,on(){return this},subscribe(){return this}};
   channels.set(topic,channel);return channel;
  },
  removeChannel:async channel=>{channels.delete(channel.topic);return 'ok'}
 };
 const renderer={
  authorized:false,currentScene:null,currentVisibility:null,revoked:[],
  adoptScene(next){this.currentScene=next;return true},
  adoptVisibility(next){this.currentVisibility=next;this.authorized=true;return true},
  applyLocalMovement(){return true},
  applyObserverPath(){return true},
  applyObserverHide(){return true},
  revoke(reason){this.revoked.push(reason);this.authorized=false}
 };
 const runtime=createWorldV2TabletopRuntime({db,mapId:MAP,
  viewerId:VIEWER,renderer});
 return {
  runtime,renderer,rpcCalls,get sightCalls(){return sightCalls},
  resolveSight:(x=commitSignedX)=>delayed.resolve({
   data:sight(x,8),error:null
  })
 };
}
async function commitOne(runtime){
 assert.equal(runtime.movement.beginGesture({
  mapId:MAP,selection:[{kind:'token',id:TOKEN}],
  origin:{x:2,y:2},pointer:{x:2,y:2},
  mode:'keyboard',environmentRevision:9,permissionGeneration:4
 }),true);
 await tick();
 assert.equal(runtime.movement.updateGesture({x:3,y:2}),true);
 await tick();
 const result=await runtime.movement.endGesture();
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,{x:3,y:2});
}
test('R15 queued keyboard uses existing admitted commit sight, no second RPC',async()=>{
 const f=fixture({delayCommitSight:true}),r=f.runtime;
 try{
  assert.equal(await r.start(),true);
  assert.equal(f.sightCalls,1);
  await commitOne(r);
  await tick();
  assert.equal(f.sightCalls,2,'commit itself must fetch fresh signed sight');
  const continued=r.refreshVisibility('keyboard-continuation');
  await tick();
  assert.equal(f.sightCalls,2,
   'continuation waits for the exact commit request instead of queuing duplicate');
  f.resolveSight(3);
  assert.equal(await continued,true);
  assert.equal(f.sightCalls,2,'fully authorized exact endpoint covers continuation');
  assert.equal(r.visibility.frame.visiblePieces[0].x,3);
  assert.equal(r.active,true);
 }finally{await r.dispose()}
});
test('R15 stale canonical endpoint never replaces required continuation refresh',async()=>{
 const f=fixture({commitSignedX:2,delayCommitSight:true}),r=f.runtime;
 try{
  assert.equal(await r.start(),true);
  await commitOne(r);await tick();
  const continuation=r.refreshVisibility('keyboard-continuation');
  f.resolveSight(2);
  assert.equal(await continuation,true);
  assert.equal(f.sightCalls,3,
   'stale signed endpoint must trigger independent fallback authorization');
  assert.equal(r.visibility.frame.visiblePieces[0].x,2);
 }finally{await r.dispose()}
});
test('R15 a permission revoke while awaiting commit cannot restore visibility',async()=>{
 const f=fixture({delayCommitSight:true}),r=f.runtime;
 try{
  assert.equal(await r.start(),true);
  await commitOne(r);await tick();
  const continuation=r.refreshVisibility('keyboard-continuation');
  r.revoke('permission-revoked',true);
  f.resolveSight(3);
  assert.equal(await continuation,false);
  assert.equal(r.active,false);
  assert.equal(r.visibility.authorized,false);
  assert.equal(f.sightCalls,2,'revoked scope cannot start a new sight request');
 }finally{await r.dispose()}
});
test('R15 other scene and dirty-vision refreshes keep the original queue',async()=>{
 const f=fixture({delayCommitSight:true}),r=f.runtime;
 try{
  assert.equal(await r.start(),true);
  await commitOne(r);await tick();
  const other=r.refreshVisibility('scene-current');
  f.resolveSight(3);
  await other;
  for(let i=0;i<5;i++)await tick();
  assert.equal(f.sightCalls,3,
   'only the keyboard continuation can reuse a completed commit ticket');
 }finally{await r.dispose()}
});
test('R15 visibility continuation trace is fixed-label and never stores identities',()=>{
 const trace=createWorldV2Trace({enabled:true});
 trace.event('visibility.continuation','covered');
 trace.event('visibility.continuation','fallback');
 trace.event('visibility.continuation','secret token coordinate 99,33');
 assert.deepEqual(trace.snapshot().events.map(x=>x.detail),
  ['covered','fallback','other']);
 assert.ok(!JSON.stringify(trace.snapshot()).includes('secret token'));
});
