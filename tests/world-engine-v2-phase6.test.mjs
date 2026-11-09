import test from 'node:test';
import assert from 'node:assert/strict';
import {
 normalizeWorldSceneSnapshot,worldSceneDirtyRegions,
 createSceneSpatialIndex,createSceneManager,createSceneTransport,
 worldSceneTopic,WORLD_SCENE_EVENT,fetchWorldSceneV2,
 compileCollisionScene,solveCollisionPath
} from '../src/engine/v2/index.js';

const mapId='10000000-0000-4000-8000-000000000001';
const otherMap='10000000-0000-4000-8000-000000000002';
const viewerId='30000000-0000-4000-8000-000000000001';
const otherViewer='30000000-0000-4000-8000-000000000002';
const p=(x,y)=>({x,y});
const wall=(state='closed',x=4)=>({
 id:'barrier-one',type:'door',points:[p(x,0),p(x,10)],
 state,blocksMovement:true,blocksLight:true,
 vision:'block',oneWay:'a-to-b',attributeField:'',movementAt:null
});
const light=(x=7)=>({
 id:'hidden-light',type:'light',x,y:5,bright:2,dim:3,
 intensity:80,color:'#ffce7a',enabled:true,effect:'steady'
});
const manifest=({map=mapId,scope='dm',revision=7,sceneGeneration=2,
 rulesRevision=1,published=true,collisionEnabled=true,fogEnabled=true,
 ambient=25,effects={weather:'none',intensity:0},
 objects=[wall(),light()],width=1000,height=1000,gridSize=100,
 environment=undefined}={})=>({
 version:2,mapId:map,scope,revision,sceneGeneration,rulesRevision,
 published,collisionEnabled,fogEnabled,ambient,effects,
 dimensions:{width,height,gridSize},
 environment:environment===undefined?
  scope==='dm'&&published?{version:1,objects}:null:environment
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{
 resolve=ok;reject=no});return {promise,resolve,reject}};

test('published DM map is immutable and preserves geometry/lights separately',()=>{
 const scene=normalizeWorldSceneSnapshot(manifest(),mapId);
 assert.equal(scene.scope,'dm');
 assert.equal(scene.environment.objects.length,2);
 assert.equal(scene.environment.objects[0].type,'door');
 assert.equal(scene.environment.objects[1].bright,2);
 assert.equal(Object.isFrozen(scene.environment.objects[0].points[0]),true);
 assert.throws(()=>{scene.environment.objects[0].points[0].x=9},TypeError);
 assert.throws(()=>{scene.effects.weather='rain'},TypeError);
});

test('viewer sees only sanctioned ambient/weather and published flags',()=>{
 const raw=manifest({scope:'viewer',ambient:35,
  effects:{weather:'rain',intensity:60}});
 const scene=normalizeWorldSceneSnapshot(raw,mapId);
 assert.equal(scene.environment,null);
 assert.equal(scene.ambient,35);
 assert.deepEqual(scene.effects,{weather:'rain',intensity:60});
 assert.equal(JSON.stringify(scene).includes('hidden-light'),false);
 assert.equal(normalizeWorldSceneSnapshot({
  ...raw,environment:{version:1,objects:[wall()]}
 },mapId),null);
 assert.equal(normalizeWorldSceneSnapshot({
  ...raw,scope:'dm',environment:null
 },mapId),null);
});

test('unpublished map cannot claim enabled fog/collision with no scene',()=>{
 assert.equal(normalizeWorldSceneSnapshot(
  manifest({published:false,collisionEnabled:false,fogEnabled:false}),
  mapId)?.environment,null);
 assert.equal(normalizeWorldSceneSnapshot(
  manifest({published:false,collisionEnabled:true,fogEnabled:false}),
  mapId),null);
 assert.equal(normalizeWorldSceneSnapshot(
  manifest({environment:{version:1,objects:[{...wall(),points:[p(NaN,0),p(4,4)]}]}}),
  mapId),null);
 assert.equal(normalizeWorldSceneSnapshot(
  manifest({objects:Array.from({length:121},(_,i)=>({...wall(),id:'wall'+i}))}),
  mapId),null);
});

test('door or light publication dirties bounded geometry only',()=>{
 const before=normalizeWorldSceneSnapshot(manifest(),mapId);
 const after=normalizeWorldSceneSnapshot(manifest({
  revision:8,sceneGeneration:3,
  objects:[wall('open'),light(8)]
 }),mapId);
 const dirty=worldSceneDirtyRegions(before,after);
 assert.equal(dirty.full,false);
 assert.equal(dirty.regions.length,4);
 assert.ok(dirty.regions.every(box=>
  box.left>=0&&box.top>=0&&box.right<=10&&box.bottom<=10));
});

test('ambient/weather/fog/rule changes invalidate full layer',()=>{
 const before=normalizeWorldSceneSnapshot(manifest(),mapId);
 for(const changed of [
  {ambient:30},{effects:{weather:'snow',intensity:60}},
  {collisionEnabled:false},{fogEnabled:false}
 ]){
  const next=normalizeWorldSceneSnapshot(manifest({...changed,
   revision:8,sceneGeneration:3}),mapId);
  assert.equal(worldSceneDirtyRegions(before,next).full,true);
 }
});

test('spatial hash returns exact nearby segments in stable authored order',()=>{
 const compiled=compileCollisionScene({
  map:{id:mapId,width:1000,height:1000,grid_size:100},
  environment:{objects:[wall('closed',2),{...wall('closed',8),id:'other'}]},
  revision:7,collisionEnabled:true,scope:'dm'
 });
 const index=createSceneSpatialIndex(compiled,{bucketSize:2});
 assert.equal(index.mode,'grid');
 assert.equal(index.query({minX:0,maxX:3,minY:0,maxY:2}).length,1);
 assert.equal(index.query({minX:6,maxX:9,minY:0,maxY:2}).length,1);
 const all=index.query({minX:0,maxX:10,minY:0,maxY:10});
 assert.equal(all[0],compiled.segments[0]);
 assert.equal(all[1],compiled.segments[1]);
});

test('indexed swept collision never weakens full-scan blocking',()=>{
 const compiled=compileCollisionScene({
  map:{id:mapId,width:1000,height:1000,grid_size:100},
  environment:{objects:[wall('closed',3),{...wall('closed',7),id:'right'}]},
  revision:7,collisionEnabled:true,scope:'dm'
 });
 const index=createSceneSpatialIndex(compiled,{bucketSize:2});
 const fast={...compiled,querySegments:index.query};
 const piece={kind:'token',id:'hero',x:0,y:2,spanX:1,spanY:1};
 for(let i=0;i<12;i++){
  const target=p(i,2+i/3);
  const args={pieces:[piece],from:p(0,2),to:target,
   allowSliding:false};
  const original=solveCollisionPath({scene:compiled,...args});
  const indexed=solveCollisionPath({scene:fast,...args});
  assert.deepEqual(indexed,original);
 }
 const fallback=createSceneSpatialIndex(compiled,{
  bucketSize:1,maxAssignments:256});
 assert.equal(fallback.mode,'grid');
 // A spanning object on a huge map exceeds index budget and falls back
 // to complete scanning rather than omitting far-away barriers.
 const huge=compileCollisionScene({
  map:{id:mapId,width:1000000,height:1000000,grid_size:100},
  environment:{objects:[{...wall(),points:[p(2,0),p(2,9000)]}]},
  revision:7,scope:'dm'
 });
 const fullScan=createSceneSpatialIndex(huge,{maxAssignments:256});
 assert.equal(fullScan.mode,'linear');
 assert.equal(fullScan.query({minX:999,maxX:1000,minY:5,maxY:10}).length,1);
});

test('scene manager compiles static geometry once and ignores token-position churn',async()=>{
 const changes=[];let requests=0;
 const dm=manifest();
 const manager=createSceneManager({mapId,viewerId,
  fetchManifest:async()=>{requests++;return dm},
  onChange:(scene,dirty)=>changes.push({scene,dirty})});
 assert.equal(await manager.load(),true);
 const compiled=manager.collisionScene;
 assert.equal(manager.statistics.builds,1);
 assert.equal(manager.sceneIndex.mode,'grid');
 assert.equal(await manager.load(),true);
 assert.equal(manager.collisionScene,compiled);
 assert.equal(requests,2);
 assert.equal(changes.length,1);
 // Token coordinates are not an input to SceneManager. Only a verified
 // server-side publication notification may invalidate the compiled map.
 assert.equal(manager.notifyPublication({
  version:2,mapId,sceneGeneration:2
 }),false);
 assert.equal(manager.collisionScene,compiled);
 manager.invalidate('reconnect');
 assert.equal(manager.collisionScene,null,'stale geometry cannot authorize travel');
 assert.equal(manager.displayedScene.environment.objects.length,2,
  'static background stays retained to avoid black flashes');
 assert.equal(await manager.load(),true);
 assert.equal(manager.collisionScene,compiled,
  'same generation reuses the exact compiled collision scene');
 assert.equal(manager.statistics.builds,1);
 manager.dispose();
});

test('new published scene changes only changed regions, blocking old predictions',async()=>{
 let latest=manifest();const dirty=[];
 const manager=createSceneManager({mapId,viewerId,
  fetchManifest:async()=>latest,onChange:(s,d)=>dirty.push(d)});
 await manager.load();
 const original=manager.collisionScene;
 latest=manifest({revision:8,sceneGeneration:3,objects:[wall('open'),light()]});
 assert.equal(manager.notifyPublication({
  version:2,mapId,sceneGeneration:3
 }),true);
 assert.equal(manager.collisionScene,null);
 assert.equal(await manager.load(),true);
 assert.notEqual(manager.collisionScene,original);
 assert.equal(manager.collisionScene.revision,8);
 assert.equal(dirty.at(-1).full,false);
 assert.ok(dirty.at(-1).regions.length>=1);
 assert.equal(manager.statistics.builds,2);
 manager.dispose();
});

test('rule-only disable bumps scene generation without rebuilding on token ticks',async()=>{
 let current=manifest(),changes=0;
 const manager=createSceneManager({mapId,viewerId,
  fetchManifest:async()=>current,onChange:()=>changes++});
 await manager.load();const before=manager.collisionScene;
 current=manifest({sceneGeneration:3,revision:7,collisionEnabled:false});
 manager.notifyPublication({version:2,mapId,sceneGeneration:3});
 assert.equal(await manager.load(),true);
 assert.equal(manager.collisionScene.collisionEnabled,false);
 assert.notEqual(manager.collisionScene,before);
 assert.equal(changes,2);
 manager.dispose();
});

test('authorization revocation and map switch clear secret DM environment',async()=>{
 const dm=manifest();const manager=createSceneManager({
  mapId,viewerId,fetchManifest:async()=>dm
 });
 await manager.load();
 manager.revokeAuthorization();
 assert.equal(manager.displayedScene,null);
 assert.equal(manager.collisionScene,null);
 assert.equal(manager.changeContext({mapId:otherMap,viewerId:otherViewer}),true);
 assert.equal(manager.mapId,otherMap);
 assert.equal(await manager.load(),false,'wrong-map response must not be accepted');
 assert.equal(manager.displayedScene,null);
 manager.dispose();
});

test('late/out-of-order map loads cannot reintroduce stale scene geometry',async()=>{
 const first=deferred();let count=0;
 const manager=createSceneManager({mapId,viewerId,
  fetchManifest:()=>++count===1?first.promise:
   Promise.resolve(manifest({revision:8,sceneGeneration:5}))
 });
 const loading=manager.load();
 await tick();
 manager.notifyPublication({version:2,mapId,sceneGeneration:5});
 first.resolve(manifest({revision:7,sceneGeneration:2}));
 assert.equal(await loading,false);
 assert.equal(manager.collisionScene,null);
 assert.equal(await manager.load(),true);
 assert.equal(manager.sceneGeneration,5);
 manager.dispose();
});

test('one signed-in map gets its own sanitized scene RPC, no legacy fallback',async()=>{
 const calls=[];const scene=manifest({scope:'viewer'});
 const db={rpc:async(name,args)=>{
  calls.push([name,args]);return {data:scene,error:null}
 }};
 assert.equal((await fetchWorldSceneV2({db,mapId})).environment,null);
 assert.deepEqual(calls,[['get_world_scene_v2',{p_map:mapId}]]);
 await assert.rejects(fetchWorldSceneV2({
  mapId,db:{rpc:async()=>({data:{...scene,
   environment:{objects:[wall()]}}})}
 }),/Invalid/);
 await assert.rejects(fetchWorldSceneV2({
  mapId,db:{rpc:async()=>({error:{message:'RLS denied'}})}
 }),/unavailable/);
});

function fakeRealtime(){
 const state={calls:[],removed:[],auth:0};let handler,status;
 const channel={
  on(type,filter,callback){handler=callback;state.filter={type,filter};return this},
  subscribe(callback){status=callback;return this}
 };
 const db={
  realtime:{async setAuth(){state.auth++}},
  rpc:async()=>({data:manifest(),error:null}),
  channel:(topic,config)=>{state.calls.push({topic,config});return channel},
  removeChannel:async c=>{state.removed.push(c)}
 };
 return {db,state,emit:payload=>handler?.({payload}),
  subscribe:s=>status?.(s)};
}

test('scene realtime uses one private map topic; never transmits wall data',async()=>{
 const {db,state,emit,subscribe}=fakeRealtime(),noticed=[];
 let current=manifest();
 const manager=createSceneManager({mapId,viewerId,
  fetchManifest:async()=>current,
  onInvalidate:e=>noticed.push(e.reason)});
 const stream=createSceneTransport({db,mapId,sceneManager:manager});
 assert.equal(await stream.start(),true);
 assert.equal(state.calls.length,1);
 assert.equal(state.calls[0].topic,worldSceneTopic(mapId));
 assert.equal(state.calls[0].config.config.private,true);
 assert.equal(state.filter.filter.event,WORLD_SCENE_EVENT);
 assert.equal(typeof stream.send,'undefined');
 subscribe('SUBSCRIBED');await tick();await tick();
 assert.equal(manager.stale,false);
 const first=manager.displayedScene;
 emit({version:2,mapId,sceneGeneration:2});
 await tick();
 assert.equal(manager.displayedScene,first);
 current=manifest({revision:8,sceneGeneration:3});
 emit({version:2,mapId,sceneGeneration:3});
 await tick();await tick();
 assert.equal(manager.sceneGeneration,3);
 assert.ok(noticed.includes('published'));
 await stream.dispose();
 assert.equal(state.removed.length,1);
 manager.dispose();
});

test('scene channel reconnect loads persisted generation, no old grant reused',async()=>{
 const {db,subscribe}=fakeRealtime();
 let current=manifest();
 const manager=createSceneManager({mapId,viewerId,
  fetchManifest:async()=>current});
 const stream=createSceneTransport({db,mapId,sceneManager:manager});
 await stream.start();subscribe('SUBSCRIBED');await tick();await tick();
 assert.equal(manager.stale,false);
 subscribe('CHANNEL_ERROR');
 assert.equal(manager.stale,true);
 assert.equal(manager.collisionScene,null);
 current=manifest({revision:8,sceneGeneration:5,objects:[wall('open')]});
 subscribe('SUBSCRIBED');await tick();await tick();
 assert.equal(manager.sceneGeneration,5);
 assert.equal(manager.stale,false);
 await stream.dispose();manager.dispose();
});
