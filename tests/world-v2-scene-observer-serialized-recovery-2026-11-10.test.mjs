import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneTransport} from '../src/engine/v2/SceneTransport.js';
import {createVisibilityController} from '../src/engine/v2/VisibilityController.js';
import {createWorldV2TabletopRuntime} from '../src/engine/v2/WorldV2TabletopRuntime.js';

const MAP='11111111-1111-4111-8111-111111111111';
const DM='22222222-2222-4222-8222-222222222222';
const PLAYER='44444444-4444-4444-8444-444444444444';
const TOKEN='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
const scene=()=>({
 version:2,mapId:MAP,scope:'dm',published:true,revision:38,
 sceneGeneration:6,rulesRevision:1,fogEnabled:false,collisionEnabled:false,
 ambient:25,effects:{weather:'none',intensity:0},
 dimensions:{width:1400,height:1400,gridSize:100},
 environment:{version:1,objects:[]}
});
const sight=(preview=false)=>({
 version:2,mapId:MAP,viewerId:preview?PLAYER:DM,
 scope:preview?'viewer':'dm',cursor:0,
 environmentRevision:38,permissionGeneration:0,
 sceneGeneration:6,visionEpoch:0,enabled:false,width:14,height:14,
 partyShared:false,visible:[],explored:[],visiblePieces:[
  {kind:'token',id:TOKEN,x:2,y:2}
 ],predictionGrants:[],lightCells:[],dmMovingLights:[]
});

function harness({delaySecond=null,denyAfterBootstrap=false,preview=false,
 bootstrapOnPrivateSubscription=false}={}){
 const channels=new Map(),errors=[],states=[];
 let sightRequests=0,sceneRequests=0;
 const renderer={
  currentScene:null,currentVisibility:null,authorized:false,
  sightAdoptions:0,revocations:[],
  adoptScene(s){this.currentScene=s;return true},
  adoptVisibility(s){
   if(!this.currentScene||this.currentScene.revision!==s.environmentRevision||
    this.currentScene.sceneGeneration!==s.sceneGeneration||
    s.scope!==(preview?'viewer':'dm'))return false;
   this.currentVisibility=s;this.authorized=true;this.sightAdoptions++;return true
  },
  revoke(reason,hard=false){
   this.revocations.push({reason,wasAuthorized:this.authorized});
   this.authorized=false;
   if(hard)this.currentScene=null;
  },
  applyLocalMovement(){return true},
  applyObserverPath(){return true},
  applyObserverHide(){return true}
 };
 const db={
  rpc:async name=>{
   if(name==='get_world_scene_v2'){sceneRequests++;return {data:scene(),error:null}}
   if(name==='get_world_visibility_v2'||
      name==='preview_world_visibility_v2'){
    sightRequests++;
    if(delaySecond&&sightRequests===2)return delaySecond.promise;
    return {data:denyAfterBootstrap&&sightRequests>1?null:sight(preview),error:null}
   }
   throw Error('Unexpected RPC '+name);
  },
  realtime:{setAuth:async()=>{}},
  channel:(topic)=>{
   let status=null;
   const channel={
    on(){return this},
    subscribe(callback){status=callback;return this},
    status(value){status?.(value)}
   };
   channels.set(topic,channel);return channel;
  },
  removeChannel:async channel=>{
   for(const [topic,c] of channels)if(c===channel)channels.delete(topic);
  }
 };
 const runtime=createWorldV2TabletopRuntime({
  db,mapId:MAP,viewerId:DM,renderer,isDM:true,
  dmPreview:preview,previewViewerId:preview?PLAYER:null,
  bootstrapOnPrivateSubscription,
  getAuthorizedPieces:()=>[{kind:'token',id:TOKEN,x:2,y:2,spanX:1,spanY:1}],
  onError:error=>errors.push(error.message),
  onState:state=>states.push(state)
 });
 return {
  runtime,renderer,errors,states,channels,
  sceneChannel:()=>channels.get('forge-world-scene-v2:'+MAP),
  observerChannel:()=>channels.get('forge-world-v2:'+MAP+':'+DM),
  get sightRequests(){return sightRequests},
  get sceneRequests(){return sceneRequests}
 };
}

test('stale scene load is retried even when retained scene has the target generation',async()=>{
 let count=0,current=false,statusCallback=null;
 const manager={
  mapId:MAP,sceneGeneration:6,
  get stale(){return !current},
  invalidate(){current=false},
  async load(){count++;if(count===1)return false;current=true;return true}
 };
 const db={
  realtime:{setAuth:async()=>{}},
  rpc:async()=>{},
  channel:()=>({
   on(){return this},subscribe(callback){statusCallback=callback;return this}
  }),
  removeChannel:async()=>{}
 };
 const states=[],errors=[];
 const transport=createSceneTransport({db,mapId:MAP,sceneManager:manager,
  onState:state=>states.push(state.reason),onError:error=>errors.push(error.message)});
 try{
  await transport.start();
  statusCallback('SUBSCRIBED');
  await tick();await tick();await tick();
  assert.equal(count,2,'a retained scene generation is not proof of current authorization');
  assert.equal(manager.stale,false);
  assert.ok(states.includes('scene-current'));
  assert.deepEqual(errors,[]);
 }finally{await transport.dispose()}
});

test('DM recovers when scene subscription cancels the initial observer sight request',async()=>{
 const pending=deferred(),h=harness({delaySecond:pending});
 try{
  assert.equal(await h.runtime.start(),true);
  h.observerChannel().status('SUBSCRIBED');
  await tick();await tick();
  assert.equal(h.sightRequests,2);
  h.sceneChannel().status('SUBSCRIBED');
  await tick();await tick();
  pending.resolve({data:sight(),error:null});
  await wait(60);
  assert.equal(h.runtime.sceneManager.stale,false);
  assert.equal(h.runtime.stream.locked,false);
  assert.equal(h.runtime.active,true);
  assert.equal(h.sightRequests,3,
   'one authorized recovery after settling the superseded observer request');
  assert.deepEqual(h.errors,[],
   'an intermediate invalidated sight should not report a lasting DM error');
 }finally{pending.resolve({data:sight(),error:null});await h.runtime.dispose()}
});

test('permanently unavailable DM sight is never unlocked or silently bypassed',async()=>{
 const h=harness({denyAfterBootstrap:true});
 try{
  assert.equal(await h.runtime.start(),true);
  h.observerChannel().status('SUBSCRIBED');
  h.sceneChannel().status('SUBSCRIBED');
  await wait(850);
  assert.equal(h.runtime.stream.locked,true);
  assert.equal(h.runtime.active,false);
  assert.ok(h.errors.length>=1,'permanent sight errors must remain observable');
 }finally{await h.runtime.dispose()}
});

test('DM player-preview scene resubscription restores player-effective sight with no player stream',async()=>{
 const h=harness({preview:true});
 try{
  assert.equal(await h.runtime.start(),true);
  assert.equal(h.runtime.active,true);
  assert.equal(h.runtime.effectiveViewer,PLAYER);
  assert.equal(h.channels.size,1,'DM preview never joins the player observer topic');
  h.sceneChannel().status('SUBSCRIBED');
  await tick();await tick();await tick();
  assert.equal(h.runtime.sceneManager.stale,false);
  assert.equal(h.runtime.active,true);
  assert.equal(h.runtime.visibility.frame.scope,'viewer');
  assert.equal(h.runtime.visibility.frame.viewerId,PLAYER);
  assert.equal(h.sightRequests,2,'preview refetches authorized player-effective sight after scene join');
  assert.deepEqual(h.errors,[]);
 }finally{await h.runtime.dispose()}
});

test('a rejected renderer frame revokes controller sight rather than reporting success',async()=>{
 const errors=[];
 const controller=createVisibilityController({
  db:{rpc:async()=>({data:sight(),error:null})},
  mapId:MAP,viewerId:DM,onSnapshot:()=>false,
  onError:error=>errors.push(error.message)
 });
 try{
  assert.equal(await controller.refresh('test'),null);
  assert.equal(controller.authorized,false);
  assert.equal(controller.frame,null);
  assert.ok(errors.some(message=>message.includes('renderer rejected')));
 }finally{controller.dispose()}
});

test('R09 opt-in first sight waits for private subscribe; scene ready cannot prepaint or resubscribe seal',async()=>{
 const h=harness({bootstrapOnPrivateSubscription:true});
 try{
  assert.equal(await h.runtime.start(),true);
  assert.equal(h.sightRequests,0);
  assert.equal(h.renderer.authorized,false);
  assert.equal(h.runtime.active,false);
  assert.equal(h.runtime.stream.locked,true);
  h.sceneChannel().status('SUBSCRIBED');
  await tick();await tick();await tick();
  assert.equal(h.sightRequests,0);
  h.observerChannel().status('SUBSCRIBED');
  await tick();await tick();await tick();
  assert.equal(h.runtime.stream.locked,false);
  assert.equal(h.runtime.active,true);
  assert.equal(h.renderer.sightAdoptions,1);
  assert.equal(h.sightRequests,1);
  assert.equal(h.renderer.revocations.filter(r=>r.wasAuthorized).length,0,
   'no initial subscription may revoke a frame that was already painted');
  assert.deepEqual(h.errors,[]);
  h.observerChannel().status('CLOSED');
  assert.equal(h.runtime.stream.locked,true);
  assert.equal(h.renderer.authorized,false,'disconnect must revoke previous sight');
  assert.ok(h.renderer.revocations.some(r=>r.wasAuthorized),
   'real channel loss still revokes a previously authorized frame');
 }finally{await h.runtime.dispose()}
});
test('R09 DM player preview retains direct signed sight and never joins player channel',async()=>{
 const h=harness({bootstrapOnPrivateSubscription:true,preview:true});
 try{
  assert.equal(await h.runtime.start(),true);
  assert.equal(h.runtime.active,true);
  assert.equal(h.sightRequests,1);
  assert.equal(h.channels.size,1);
  assert.equal(h.renderer.sightAdoptions,1);
  assert.equal(h.runtime.effectiveViewer,PLAYER);
  assert.deepEqual(h.errors,[]);
 }finally{await h.runtime.dispose()}
});

test('R09 opposite subscription order waits for BOTH signed scene and observer',async()=>{
 const h=harness({bootstrapOnPrivateSubscription:true});
 try{
  assert.equal(await h.runtime.start(),true);
  h.observerChannel().status('SUBSCRIBED');
  await tick();await tick();await tick();
  assert.equal(h.sightRequests,0,
   'an observer subscribing first cannot paint before scene-current');
  assert.equal(h.renderer.authorized,false);
  h.sceneChannel().status('SUBSCRIBED');
  await tick();await tick();await tick();await tick();
  assert.equal(h.sightRequests,1);
  assert.equal(h.renderer.sightAdoptions,1);
  assert.equal(h.runtime.stream.locked,false);
  assert.equal(h.renderer.revocations.filter(r=>r.wasAuthorized).length,0);
  assert.deepEqual(h.errors,[]);
 }finally{await h.runtime.dispose()}
});
test('R09 a never-ready scene keeps private observer locked and grants no sprite',async()=>{
 const h=harness({bootstrapOnPrivateSubscription:true});
 try{
  assert.equal(await h.runtime.start(),true);
  h.observerChannel().status('SUBSCRIBED');
  await tick();await tick();
  assert.equal(h.runtime.active,false);
  assert.equal(h.sightRequests,0);
  assert.equal(h.renderer.sightAdoptions,0);
  assert.equal(h.runtime.stream.locked,true);
 }finally{await h.runtime.dispose()}
});
