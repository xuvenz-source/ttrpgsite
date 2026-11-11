import test from 'node:test';
import assert from 'node:assert/strict';
import {validWorldBroadcastId} from '../src/engine/v2/BroadcastEnvelope.js';
import {createWorldRealtimeTransport,validWorldMotionFrame} from '../src/engine/v2/RealtimeTransport.js';
import {createSceneTransport} from '../src/engine/v2/SceneTransport.js';
import {createVisibilityController} from '../src/engine/v2/VisibilityController.js';

const MAP='11111111-1111-4111-8111-111111111111';
const VIEWER='22222222-2222-4222-8222-222222222222';
const OTHER='44444444-4444-4444-8444-444444444444';
const TOKEN='33333333-3333-4333-8333-333333333333';
const DELIVERY='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const motion=(extra={})=>({version:2,mapId:MAP,viewerId:VIEWER,seq:1,
 environmentRevision:9,permissionGeneration:4,
 items:[{kind:'token',id:TOKEN,action:'path',path:[{x:1,y:1},{x:2,y:1}]}],
 ...extra});
const sight=()=>({version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',
 cursor:0,environmentRevision:9,permissionGeneration:4,
 sceneGeneration:1,visionEpoch:0,enabled:false,width:10,height:10,
 partyShared:false,visible:[],explored:[],
 visiblePieces:[{kind:'token',id:TOKEN,x:1,y:1}],
 predictionGrants:[],lightCells:[],dmMovingLights:[]});

test('R10 UUID delivery metadata is optional, strictly typed, never a grant',()=>{
 assert.equal(validWorldBroadcastId({}),true);
 assert.equal(validWorldBroadcastId({id:DELIVERY}),true);
 for(const id of [null,123,{},[],'','not-a-uuid'])
  assert.equal(validWorldBroadcastId({id}),false);
 assert.equal(validWorldMotionFrame(motion({id:DELIVERY}),MAP,VIEWER),true);
 assert.equal(validWorldMotionFrame(motion(),MAP,VIEWER),true);
 assert.equal(validWorldMotionFrame(motion({id:'bad'}),MAP,VIEWER),false);
 assert.equal(validWorldMotionFrame(motion({id:DELIVERY,unexpected:true}),MAP,VIEWER),false);
 assert.equal(validWorldMotionFrame(motion({id:DELIVERY,viewerId:OTHER}),MAP,VIEWER),false);
 assert.equal(validWorldMotionFrame(motion({id:DELIVERY,seq:0}),MAP,VIEWER),false);
 assert.equal(validWorldMotionFrame(motion({id:DELIVERY,items:[
  {kind:'token',id:TOKEN,action:'path',path:[{x:1,y:1},{x:9,y:9}]}
 ]}),MAP,VIEWER),false);
});

test('R10 Supabase-id motion advances authorized roster without an invalid-frame seal',async()=>{
 let subscriber;const callbacks={},paths=[],revokes=[];
 const channel={on(_kind,filter,fn){callbacks[filter.event]=fn;return this},
  subscribe(fn){subscriber=fn;return this}};
 const transport=createWorldRealtimeTransport({
  db:{channel:()=>channel,removeChannel:async()=>{},
   realtime:{setAuth:async()=>{}}},
  mapId:MAP,viewerId:VIEWER,
  onResync:async()=>({version:2,mapId:MAP,viewerId:VIEWER,cursor:0,
   environmentRevision:9,permissionGeneration:4,
   visiblePieces:[{kind:'token',id:TOKEN,x:1,y:1}]}),
  onPath:x=>paths.push(x),onRevoke:x=>revokes.push(x)
 });
 try{
  await transport.start();subscriber('SUBSCRIBED');await tick();await tick();
  assert.equal(transport.locked,false);
  const prior=revokes.length;
  callbacks['world-motion-v2']({payload:motion({id:DELIVERY})});
  assert.equal(paths.length,1);
  assert.equal(transport.cursor,1);
  assert.equal(revokes.length,prior,'valid delivery metadata may not seal scene');
  callbacks['world-motion-v2']({payload:motion({id:DELIVERY,viewerId:OTHER,seq:2})});
  assert.equal(paths.length,1);
  assert.equal(transport.locked,true,'wrong viewer still fails closed');
 }finally{await transport.dispose()}
});

test('R10 scene notice accepts server ID but rejects malformed ID',async()=>{
 let subscriber,notice;const publications=[],invalidations=[];
 const manager={mapId:MAP,stale:false,sceneGeneration:1,
  load:async()=>true,invalidate:r=>invalidations.push(r),
  notifyPublication:x=>{publications.push(x);manager.sceneGeneration=x.sceneGeneration}};
 const channel={on(_k,filter,fn){if(filter.event==='scene-revision-v2')notice=fn;return this},
  subscribe(fn){subscriber=fn;return this}};
 const transport=createSceneTransport({
  db:{rpc:async()=>({}),channel:()=>channel,removeChannel:async()=>{},
   realtime:{setAuth:async()=>{}}},mapId:MAP,sceneManager:manager
 });
 try{
  await transport.start();subscriber('SUBSCRIBED');await tick();
  notice({payload:{version:2,mapId:MAP,sceneGeneration:2,id:DELIVERY}});
  assert.equal(publications.length,1);
  const n=invalidations.length;
  notice({payload:{version:2,mapId:MAP,sceneGeneration:3,id:'bad'}});
  assert.equal(publications.length,1);
  assert.ok(invalidations.length>n);
 }finally{await transport.dispose()}
});

test('R10 signed fog notice accepts delivery ID; unsafe ID still revokes',async()=>{
 const revocations=[];
 const controller=createVisibilityController({
  db:{rpc:async()=>({data:sight(),error:null})},
  mapId:MAP,viewerId:VIEWER,onRevoke:x=>revocations.push(x)
 });
 try{
  assert.ok(await controller.refresh('initial'));
  const notice={version:2,mapId:MAP,viewerId:VIEWER,visionEpoch:0,
   environmentRevision:9,permissionGeneration:4,sceneGeneration:1,id:DELIVERY};
  assert.equal(controller.onVisionDirty(notice),false);
  assert.equal(controller.authorized,true);
  assert.deepEqual(revocations,[]);
  assert.equal(controller.onVisionDirty({...notice,id:'bad'}),false);
  assert.equal(controller.authorized,false);
  assert.deepEqual(revocations.map(x=>x.reason),['invalid-vision-notice']);
 }finally{controller.dispose()}
});
