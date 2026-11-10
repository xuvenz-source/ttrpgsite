import test from 'node:test';
import assert from 'node:assert/strict';
import {
 normalizeWorldVisibilityFrame,makeWorldFogMask,
 diffWorldFogMasks,diffWorldVisiblePieces,fogEdgeWeight,
 createVisibilityController,WORLD_VISION_EVENT
} from '../src/engine/v2/index.js';

const mapId='10000000-0000-4000-8000-000000000001';
const viewerId='30000000-0000-4000-8000-000000000001';
const otherId='30000000-0000-4000-8000-000000000002';
const otherMap='10000000-0000-4000-8000-000000000002';
const hero={kind:'token',id:'40000000-0000-4000-8000-000000000001',
 x:2,y:2};
const torch={kind:'tool',id:'50000000-0000-4000-8000-000000000001',
 x:1,y:3};
const frame=(overrides={})=>({
 version:2,mapId,viewerId,scope:'viewer',cursor:5,
 environmentRevision:9,permissionGeneration:4,
 sceneGeneration:6,visionEpoch:7,
 enabled:true,width:10,height:10,partyShared:false,
 visible:[11,12,21,22,23,31,32],
 explored:[10,11,12,21,22,23,31,32],
 visiblePieces:[hero,torch],
 ...overrides
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;
 const promise=new Promise(res=>{resolve=res});
 return {promise,resolve}};
const fakeDb=(initial=frame())=>{
 let response=initial;const calls=[];
 return {
  calls,put:data=>{response=data},
  db:{rpc:async(name,args)=>{
   calls.push([name,args]);return {data:response,error:null}
  }}
 };
};

test('strict server scope rejects raw walls, light source details and wrong viewer',()=>{
 assert.ok(normalizeWorldVisibilityFrame(frame(),mapId,viewerId));
 assert.equal(normalizeWorldVisibilityFrame(frame({mapId:otherMap}),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({viewerId:otherId}),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({hiddenWalls:[]}),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({secretLights:[]}),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({
  visiblePieces:[{...hero,npc_values:{secret:true}}]
 }),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({visible:[12,11]}),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({explored:[11,11]}),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({width:129}),mapId,viewerId),null);
});

test('DM bypass frame has no fog mask cells but renders all map light',()=>{
 const raw=frame({scope:'dm',enabled:false,visible:[],explored:[]});
 const normalized=normalizeWorldVisibilityFrame(raw,mapId,viewerId);
 assert.deepEqual([...makeWorldFogMask(normalized)],Array(100).fill(2));
 assert.equal(normalizeWorldVisibilityFrame(frame({
  enabled:false,visible:[1],explored:[1]
 }),mapId,viewerId),null);
});

test('fog layers distinguish currently visible, explored and hidden cells',()=>{
 const normalized=normalizeWorldVisibilityFrame(frame(),mapId,viewerId);
 const mask=makeWorldFogMask(normalized);
 assert.equal(mask[22],2);
 assert.equal(mask[10],1);
 assert.equal(mask[90],0);
 assert.ok(mask instanceof Uint8Array);
});

test('smooth fog weights change appearance only, never authorize hidden cells',()=>{
 const mask=makeWorldFogMask(normalizeWorldVisibilityFrame(frame(),mapId,viewerId));
 assert.equal(fogEdgeWeight(mask,10,10,0,0),0);
 assert.ok(fogEdgeWeight(mask,10,10,2,2)>0);
 assert.ok(fogEdgeWeight(mask,10,10,2,2)<1);
 assert.equal(mask[10],1,'feather does not reveal explored cells');
});

test('dirty regions contain only changed fog cells, not whole map remount',()=>{
 const before=makeWorldFogMask(normalizeWorldVisibilityFrame(frame(),mapId,viewerId));
 const after=makeWorldFogMask(normalizeWorldVisibilityFrame(frame({
  visible:[11,12,21,22,23,31,32,33],
  explored:[10,11,12,21,22,23,31,32,33]
 }),mapId,viewerId));
 const dirty=diffWorldFogMasks(before,after,10,10);
 assert.equal(dirty.full,false);
 assert.deepEqual(dirty.rects,[{x:3,y:3,width:1,height:1}]);
 assert.deepEqual(diffWorldFogMasks(after,after,10,10),{full:false,rects:[]});
 assert.equal(diffWorldFogMasks(null,after,10,10).full,true);
});

test('roster diff keeps stable sprite identity for unchanged tokens',()=>{
 const diff=diffWorldVisiblePieces([hero,torch],
  [hero,{...torch,x:2}, {kind:'token',id:otherId,x:6,y:6}]);
 assert.equal(diff.unchanged[0],hero);
 assert.equal(diff.moved.length,1);
 assert.equal(diff.added.length,1);
 assert.equal(diff.removed.length,0);
 const removal=diffWorldVisiblePieces([hero,torch],[hero]);
 assert.deepEqual(removal.removed,[torch]);
});

test('initial authorized sight loads one coherent cursor and fog snapshot',async()=>{
 const {db,calls}=fakeDb();const fog=[],roster=[];
 const ctl=createVisibilityController({db,mapId,viewerId,
  onFog:e=>fog.push(e),onRoster:e=>roster.push(e)});
 const accepted=await ctl.refresh();
 assert.equal(accepted.cursor,5);
 assert.equal(ctl.authorized,true);
 assert.equal(ctl.visiblePieces.length,2);
 assert.equal(fog.length,1);
 assert.equal(roster.length,1);
 assert.deepEqual(calls,[['get_world_visibility_v2',{p_map:mapId}]]);
 const observer=await ctl.observerSnapshot();
 assert.equal(observer.cursor,5);
 assert.equal(observer.visiblePieces[0].id,hero.id);
 ctl.dispose();
});

test('same frame does not rebuild fog or recreate unchanged tokens',async()=>{
 const {db}=fakeDb();let fog=0,roster=0;
 const ctl=createVisibilityController({db,mapId,viewerId,
  onFog:()=>fog++,onRoster:()=>roster++});
 await ctl.refresh();
 await ctl.refresh();
 assert.equal(fog,1);
 assert.equal(roster,1);
 ctl.dispose();
});

test('token movement updates sprite coordinates without static fog redraw',async()=>{
 const {db,put}=fakeDb();const fog=[],roster=[];
 const ctl=createVisibilityController({db,mapId,viewerId,
  onFog:p=>fog.push(p),onRoster:p=>roster.push(p)});
 await ctl.refresh();
 put(frame({visionEpoch:8,cursor:6,
  visiblePieces:[{...hero,x:3,y:2},torch]}));
 const accepted=await ctl.refresh();
 assert.equal(accepted.visionEpoch,8);
 assert.equal(fog.length,1,'no fog mask change');
 assert.equal(roster.length,2);
 assert.deepEqual(roster[1].moved,[{...hero,x:3,y:2}]);
 assert.equal(roster[1].unchanged[0].id,torch.id);
 ctl.dispose();
});

test('new sight update modifies only dirty cells and key-specific rosters',async()=>{
 const {db,put}=fakeDb();const fog=[];
 const ctl=createVisibilityController({db,mapId,viewerId,
  onFog:e=>fog.push(e)});
 await ctl.refresh();
 put(frame({visionEpoch:8,cursor:6,
  visible:[11,12,21,22,23,31,32,33],
  explored:[10,11,12,21,22,23,31,32,33]}));
 await ctl.refresh();
 assert.equal(fog.length,2);
 assert.deepEqual(fog[1].dirty.rects,[{x:3,y:3,width:1,height:1}]);
 ctl.dispose();
});

test('private dirty notice uses same observer socket and no direct geometry',async()=>{
 const {db,put,calls}=fakeDb();const ctl=createVisibilityController({db,mapId,viewerId});
 await ctl.refresh();
 assert.equal(WORLD_VISION_EVENT,'world-vision-v2');
 put(frame({visionEpoch:8,cursor:6}));
 const changed=ctl.onVisionDirty({version:2,mapId,viewerId,
  visionEpoch:8,environmentRevision:9,
  permissionGeneration:4,sceneGeneration:6});
 assert.equal(changed,true);
 await tick();await tick();
 assert.equal(ctl.frame.visionEpoch,8);
 assert.equal(calls.length,2);
 assert.equal(ctl.onVisionDirty({version:2,mapId,viewerId,
  visionEpoch:8,environmentRevision:9,
  permissionGeneration:4,sceneGeneration:6}),false);
 ctl.dispose();
});

test('permission-generation mismatch invalidates old entity grants first',async()=>{
 const {db,put}=fakeDb();const revocations=[];
 const ctl=createVisibilityController({db,mapId,viewerId,
  onRevoke:r=>revocations.push(r.reason)});
 await ctl.refresh();
 put(frame({permissionGeneration:5,visionEpoch:8,cursor:6}));
 ctl.onVisionDirty({version:2,mapId,viewerId,
  visionEpoch:8,environmentRevision:9,
  permissionGeneration:5,sceneGeneration:6});
 assert.equal(ctl.authorized,false);
 assert.ok(revocations.includes('vision-version-change'));
 await tick();await tick();
 assert.equal(ctl.authorized,true);
 assert.equal(ctl.frame.permissionGeneration,5);
 ctl.dispose();
});

test('malformed sight or explicit revocation clears confidential roster',async()=>{
 const {db,put}=fakeDb();const revoked=[];
 const ctl=createVisibilityController({db,mapId,viewerId,
  onRevoke:r=>revoked.push(r)});
 await ctl.refresh();
 put(frame({visiblePieces:[{...hero,x:NaN}]}));
 assert.equal(await ctl.refresh(),null);
 assert.equal(ctl.authorized,false);
 assert.deepEqual(ctl.visiblePieces,[]);
 assert.equal(ctl.mask,null);
 assert.ok(revoked.some(r=>r.reason==='invalid-snapshot'));
 ctl.dispose();
});

test('DM preview uses viewer-effective server RPC without mutating scene',async()=>{
 const {db,calls}=fakeDb();
 const ctl=createVisibilityController({db,mapId,viewerId,dmPreview:true});
 await ctl.refresh();
 assert.deepEqual(calls,[['preview_world_visibility_v2',
  {p_map:mapId,p_viewer:viewerId}]]);
 ctl.dispose();
});

test('stale scene generation cannot revive an obsolete fog snapshot',async()=>{
 const {db}=fakeDb();
 const ctl=createVisibilityController({db,mapId,viewerId,
  getScene:()=>({mapId,published:true,revision:9,sceneGeneration:7})});
 assert.equal(await ctl.refresh(),null);
 assert.equal(ctl.authorized,false);
 ctl.dispose();
});

test('late disconnected response cannot resurrect another map viewer',async()=>{
 const d=deferred();let count=0;
 const db={rpc:async()=>{
  count++;
  return count===1?d.promise:{data:frame({
   mapId:otherMap,viewerId:otherId,
   cursor:0,visible:[],explored:[],visiblePieces:[]
  }),error:null};
 }};
 const ctl=createVisibilityController({db,mapId,viewerId});
 const old=ctl.refresh();
 await tick();
 ctl.changeContext({mapId:otherMap,viewerId:otherId});
 d.resolve({data:frame(),error:null});
 assert.equal(await old,null);
 assert.equal(ctl.authorized,false);
 const next=await ctl.refresh();
 assert.equal(next.mapId,otherMap);
 ctl.dispose();
});


test('large unfogged maps retain rosters without huge fog bitmap allocation',()=>{
 const large=frame({
  enabled:false,width:5000,height:4000,
  visible:[],explored:[],visiblePieces:[
   {...hero,x:4000,y:3000},{...torch,x:4999,y:3999}
  ]
 });
 const normalized=normalizeWorldVisibilityFrame(large,mapId,viewerId);
 assert.ok(normalized);
 assert.equal(normalized.visiblePieces.length,2);
 assert.equal(makeWorldFogMask(normalized),null);
 assert.equal(normalizeWorldVisibilityFrame({
  ...large,enabled:true
 },mapId,viewerId),null,'automatic fog is bounded to 128 cells per axis');
});


test('V2 sight frame rejects missing viewer scope and DM scope with enabled fog',()=>{
 assert.equal(normalizeWorldVisibilityFrame(frame({scope:null}),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(frame({
  scope:'dm',enabled:true
 }),mapId,viewerId),null);
 const dm=normalizeWorldVisibilityFrame(frame({
  scope:'dm',enabled:false,visible:[],explored:[]
 }),mapId,viewerId);
 assert.equal(dm.scope,'dm');
});

test('unpublished map with explicitly disabled rules allows authorized sight, protected map does not',async()=>{
 const valid={mapId,revision:9,sceneGeneration:6,published:false,
  fogEnabled:false,collisionEnabled:false,environment:null};
 const unfogged=frame({enabled:false,visible:[],explored:[],
  visiblePieces:[hero],lightCells:[],dmMovingLights:[]});
 const {db}=fakeDb(unfogged);
 const controller=createVisibilityController({db,mapId,viewerId,
  getScene:()=>valid});
 assert.equal((await controller.refresh())?.scope,'viewer');
 assert.equal(controller.authorized,true);
 controller.dispose();
 const invalid=createVisibilityController({db,mapId,viewerId,
  getScene:()=>({...valid,collisionEnabled:true})});
 assert.equal(await invalid.refresh(),null);
 assert.equal(invalid.authorized,false);
 invalid.dispose();
});

test('overlapping sight refresh waits for queued authorized result, not null',async()=>{
 const started=deferred();
 let count=0;
 const db={rpc:async()=>{
  count++;
  if(count===1)await started.promise;
  return {data:frame({cursor:count+5}),error:null};
 }};
 const ctl=createVisibilityController({db,mapId,viewerId});
 const first=ctl.refresh('initial');
 await tick();
 const second=ctl.refresh('queued');
 started.resolve();
 const [oldResult,newResult]=await Promise.all([first,second]);
 assert.ok(oldResult);
 assert.ok(newResult,'queued refresh must not resemble an engine failure');
 assert.equal(newResult.cursor,7);
 assert.equal(count,2);
 ctl.dispose();
});

test('late same-authority sight keeps last authorized fog and roster',async()=>{
 const {db,put}=fakeDb(),revoke=[],errors=[],rosters=[];
 const ctl=createVisibilityController({db,mapId,viewerId,
  onRevoke:r=>revoke.push(r.reason),onError:e=>errors.push(e),
  onRoster:diff=>rosters.push(diff)
 });
 try{
  assert.equal((await ctl.refresh()).cursor,5);
  put(frame({cursor:8,visionEpoch:10,visiblePieces:[hero]}));
  assert.equal((await ctl.refresh()).cursor,8);
  const stable=ctl.frame,mask=ctl.mask;
  put(frame({cursor:6,visionEpoch:8,visiblePieces:[hero,torch]}));
  assert.equal(await ctl.refresh(),null);
  assert.equal(ctl.frame,stable);assert.equal(ctl.mask,mask);
  assert.equal(ctl.authorized,true);
  assert.equal(ctl.visiblePieces.length,1);
  assert.equal(rosters.length,2);
  assert.deepEqual(revoke,[]);assert.deepEqual(errors,[]);
 }finally{ctl.dispose()}
});
test('older dirty notice cannot revoke new sight; future permission still does',async()=>{
 const {db,put}=fakeDb(),revoke=[];
 const ctl=createVisibilityController({db,mapId,viewerId,
  onRevoke:r=>revoke.push(r.reason)
 });
 try{
  await ctl.refresh();
  put(frame({cursor:9,visionEpoch:10,permissionGeneration:5}));
  assert.equal(ctl.onVisionDirty({version:2,mapId,viewerId,
   visionEpoch:10,environmentRevision:9,
   permissionGeneration:5,sceneGeneration:6}),true);
  await tick();await tick();
  assert.equal(ctl.frame.permissionGeneration,5);
  assert.equal(ctl.onVisionDirty({version:2,mapId,viewerId,
   visionEpoch:8,environmentRevision:9,
   permissionGeneration:4,sceneGeneration:6}),false);
  assert.equal(ctl.authorized,true);
  assert.equal(revoke.filter(r=>r==='vision-version-change').length,1);
  assert.equal(ctl.onVisionDirty({version:2,mapId,viewerId,
   visionEpoch:11,environmentRevision:9,
   permissionGeneration:6,sceneGeneration:6}),true);
  assert.equal(ctl.authorized,false);
 }finally{ctl.dispose()}
});
test('renderer stale sentinel rolls back provisional controller state',async()=>{
 const {db,put}=fakeDb(),revoke=[],errors=[];
 let calls=0;
 const ctl=createVisibilityController({db,mapId,viewerId,
  onSnapshot:()=>++calls===1?true:'stale',
  onRevoke:r=>revoke.push(r.reason),onError:error=>errors.push(error)
 });
 try{
  await ctl.refresh();
  const prior=ctl.frame,mask=ctl.mask;
  put(frame({cursor:6,visionEpoch:8,visiblePieces:[]}));
  assert.equal(await ctl.refresh(),null);
  assert.equal(ctl.frame,prior);assert.equal(ctl.mask,mask);
  assert.equal(ctl.authorized,true);
  assert.deepEqual(revoke,[]);assert.deepEqual(errors,[]);
 }finally{ctl.dispose()}
});
