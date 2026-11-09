import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';
import {
 createWorldV2TabletopRuntime
} from '../src/engine/v2/WorldV2TabletopRuntime.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';
import {visibleWorldPins} from '../src/engine/v2/WorldPinVisibility.js';

const mapId='10000000-0000-4000-8000-000000000001';
const viewerId='30000000-0000-4000-8000-000000000001';
const dmId='30000000-0000-4000-8000-000000000003';
const heroId='40000000-0000-4000-8000-000000000001';
const hiddenId='40000000-0000-4000-8000-000000000002';
const sessionId='80000000-0000-4000-8000-000000000001';
const hero={kind:'token',id:heroId,x:2,y:2};
const offMap='10000000-0000-4000-8000-000000000002';
const scene=(scope='viewer',overrides={})=>({
 version:2,mapId,scope,published:true,revision:9,sceneGeneration:6,
 rulesRevision:4,collisionEnabled:true,fogEnabled:scope!=='dm',
 ambient:25,effects:{weather:'none',intensity:0},
 dimensions:{width:1000,height:1000,gridSize:100},
 environment:scope==='dm'?{version:1,objects:[]}:null,
 ...overrides
});
const frame=(scope='viewer',overrides={})=>({
 version:2,mapId,viewerId:scope==='dm'?dmId:viewerId,
 scope,cursor:5,environmentRevision:9,permissionGeneration:4,
 sceneGeneration:6,visionEpoch:7,
 enabled:scope!=='dm',width:10,height:10,partyShared:false,
 visible:scope==='dm'?[]:[22,23,32,33],
 explored:scope==='dm'?[]:[22,23,32,33],
 visiblePieces:[hero],...overrides
});
const nextTick=()=>new Promise(resolve=>setImmediate(resolve));
function fakeClient({dm=false,preview=false}={}){
 const scope=dm?'dm':'viewer',actor=dm?dmId:viewerId;
 const calls=[],channels=new Map();
 let sceneData=scene(scope),sightData=frame(preview?'viewer':scope,{
  viewerId:preview?viewerId:actor
 });
 let next=2,delayAdvance=null;
 const db={
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='get_world_scene_v2')
    return {data:sceneData,error:null};
   if(name==='get_world_visibility_v2'||
      name==='preview_world_visibility_v2')
    return {data:sightData,error:null};
   if(name==='begin_world_motion_v2')
    return {data:{version:2,sessionId},error:null};
   if(name==='advance_world_motion_v2'){
    if(delayAdvance)await delayAdvance;
    const accepted=expandGestureRoute(args.p_from,args.p_targets);
    return {data:{version:2,sessionId,seq:args.p_seq,
     accepted,blocked:false,revision:9},error:null};
   }
   if(name==='commit_world_motion_v2')
    return {data:{version:2,sessionId,seq:args.p_seq,
     endpoint:args.p_endpoint},error:null};
   if(name==='cancel_world_motion_v2')
    return {data:{version:2},error:null};
   throw Error('Unexpected RPC '+name);
  },
  realtime:{setAuth:async()=>{}},
  channel:(topic,config)=>{
   const events=new Map();let listener=null;
   const channel={
    topic,config,
    on(_type,filter,cb){events.set(filter.event,cb);return this},
    subscribe(cb){listener=cb;return this},
    status(value){listener?.(value)},
    emit(type,payload){events.get(type)?.({payload})},
    send(){throw Error('No browser-authored V2 Broadcast allowed')}
   };
   channels.set(topic,channel);return channel;
  },
  removeChannel:async(channel)=>{
   channels.delete(channel.topic);
   return 'ok'
  }
 };
 const renderer={
  scene:null,visibility:null,authorized:false,events:[],hidden:[],
  hardRevocations:0,
  adoptScene(data){this.scene=data;this.events.push(['scene',data.sceneGeneration]);return true},
  adoptVisibility(data){
   if(!this.scene||this.scene.revision!==data.environmentRevision||
    this.scene.sceneGeneration!==data.sceneGeneration)
    return false;
   this.visibility=data;this.authorized=true;
   this.events.push(['visibility',data.cursor]);return true;
  },
  applyLocalMovement(e){this.events.push(['local',e.type,e.approved]);return true},
  applyObserverPath(p,meta){this.events.push(['path',p.id,meta.seq]);return true},
  applyObserverHide(p,meta){this.hidden.push([p.id,meta.seq]);return true},
  revoke(reason,hard){
   this.events.push(['revoke',reason,hard]);
   this.authorized=false;
   if(hard){this.scene=null;this.hardRevocations++}
  },
  get currentScene(){return this.scene},
  get currentVisibility(){return this.visibility}
 };
 const config={
  db,mapId,viewerId:actor,renderer,isDM:dm,dmPreview:preview,
  previewViewerId:preview?viewerId:null
 };
 return {db,renderer,config,calls,channels,
  updateScene(value){sceneData=value},
  updateSight(value){sightData=value},
  delayMotion(promise){delayAdvance=promise}
 };
}
function fakeEventTarget(){
 const events=new Map();
 let pointer=null;
 return {
  addEventListener(name,callback){events.set(name,callback)},
  removeEventListener(name){events.delete(name)},
  emit(type,value={}){
   const event={button:0,pointerId:9,pointerType:'mouse',
    point:{x:2.5,y:2.5},target:{tagName:'DIV'},
    preventDefault(){this.prevented=true},...value};
   events.get(type)?.(event);return event
  },
  setPointerCapture(id){pointer=id},hasPointerCapture(id){return pointer===id},
  releasePointerCapture(id){if(pointer===id)pointer=null},
  get listening(){return [...events.keys()]}
 };
}
const select=()=>({mapId,selection:[{kind:'token',id:heroId}],
 origin:{x:2,y:2}});
const pieceData=()=>[{...hero,spanX:1,spanY:1}];

test('integrated runtime boots only from the server scene plus atomic viewer sight',async()=>{
 const x=fakeClient(),rosters=[];
 const runtime=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData,
  onAuthorizedRoster:rows=>rosters.push(rows)
 });
 assert.equal(await runtime.start(),true);
 assert.equal(runtime.active,true);
 assert.equal(runtime.sceneManager.stale,false);
 assert.equal(runtime.visibility.frame.sceneGeneration,6);
 assert.ok(rosters.some(list=>list.some(row=>row.id===heroId)));
 assert.equal(x.channels.size,2,'one scene topic plus one private observer topic');
 assert.ok(x.calls.some(([name])=>name==='get_world_scene_v2'));
 assert.ok(x.calls.some(([name])=>name==='get_world_visibility_v2'));
 assert.equal(x.calls.some(([name])=>name.startsWith('get_authorized_map_fog')),false);
 await runtime.dispose();
 assert.equal(x.channels.size,0);
});
test('runtime only receives private movement; never sends browser position broadcast',async()=>{
 const x=fakeClient(),r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 for(const channel of x.channels.values())
  assert.equal(channel.config.config.private,true);
 assert.equal(x.calls.some(([name])=>name==='move_map_group'),false);
 assert.equal(x.calls.some(([name])=>name==='commit_map_trajectory'),false);
 await r.dispose();
});
test('private observer subscription obtains a viewer-scoped roster plus cursor',async()=>{
 const x=fakeClient(),r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 const channel=x.channels.get('forge-world-v2:'+mapId+':'+viewerId);
 assert.ok(channel);
 channel.status('SUBSCRIBED');
 await nextTick();await nextTick();await nextTick();
 assert.ok(x.renderer.events.some(e=>e[0]==='visibility'&&e[1]===5));
 await r.dispose();
});
test('movement on a hidden NPC packet cannot create new renderer artwork',async()=>{
 const x=fakeClient(),r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 const channel=x.channels.get('forge-world-v2:'+mapId+':'+viewerId);
 channel.status('SUBSCRIBED');
 await nextTick();await nextTick();await nextTick();
 channel.emit('world-motion-v2',{
  version:2,mapId,viewerId,seq:6,
  environmentRevision:9,permissionGeneration:4,items:[
   {kind:'token',id:hiddenId,action:'path',
    path:[{x:2,y:2},{x:3,y:2}]}
  ]
 });
 await nextTick();await nextTick();
 assert.equal(x.renderer.events.some(e=>e[0]==='path'&&e[1]===hiddenId),false);
 await r.dispose();
});
test('approved server path reaches the renderer with exact private sequence',async()=>{
 const x=fakeClient(),r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 const channel=x.channels.get('forge-world-v2:'+mapId+':'+viewerId);
 channel.status('SUBSCRIBED');
 await nextTick();await nextTick();await nextTick();
 channel.emit('world-motion-v2',{
  version:2,mapId,viewerId,seq:6,
  environmentRevision:9,permissionGeneration:4,items:[
   {kind:'token',id:heroId,action:'path',
    path:[{x:2,y:2},{x:3,y:2}]}
  ]
 });
 assert.ok(x.renderer.events.some(e=>e[0]==='path'&&e[1]===heroId&&e[2]===6));
 await r.dispose();
});
test('server-authorized hide removes known sprite but does not invent coordinates',async()=>{
 const x=fakeClient(),r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 const channel=x.channels.get('forge-world-v2:'+mapId+':'+viewerId);
 channel.status('SUBSCRIBED');
 await nextTick();await nextTick();await nextTick();
 channel.emit('world-motion-v2',{
  version:2,mapId,viewerId,seq:6,
  environmentRevision:9,permissionGeneration:4,items:[
   {kind:'token',id:heroId,action:'hide'}
  ]
 });
 assert.deepEqual(x.renderer.hidden,[[heroId,6]]);
 await r.dispose();
});
test('DM prediction uses known scene while a player never speculates into hidden geometry',async()=>{
 const d=fakeClient({dm:true});
 const dm=createWorldV2TabletopRuntime({
  ...d.config,getAuthorizedPieces:pieceData
 });
 await dm.start();
 assert.equal(dm.movement.beginGesture({
  mapId,selection:[{kind:'token',id:heroId}],
  origin:{x:2,y:2},pointer:{x:2,y:2},mode:'drag',
  environmentRevision:9,permissionGeneration:4
 }),true);
 assert.equal(dm.movement.updateGesture({x:3,y:2}),true);
 assert.ok(d.renderer.events.some(e=>e[0]==='local'&&e[1]==='presented'),
  'DM knows published collision geometry and can show a safe local step');
 dm.movement.cancelGesture('test');await dm.dispose();
 const x=fakeClient();
 const user=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await user.start();
 user.movement.beginGesture({
  mapId,selection:[{kind:'token',id:heroId}],
  origin:{x:2,y:2},pointer:{x:2,y:2},mode:'drag',
  environmentRevision:9,permissionGeneration:4
 });
 user.movement.updateGesture({x:3,y:2});
 assert.equal(x.renderer.events.some(e=>e[0]==='local'&&e[1]==='presented'),
  false,'unknown hidden-wall boundary must not be predicted');
 user.movement.cancelGesture('test');await user.dispose();
});
test('input adapter preserves token grab offset, not top-left snapping',async()=>{
 const x=fakeClient({dm:true}),events=[];
 const r=createWorldV2TabletopRuntime({...x.config,
  getAuthorizedPieces:pieceData,onGesture:ev=>events.push(ev)
 });
 await r.start();
 const target=fakeEventTarget(),keyboard=fakeEventTarget();
 assert.equal(r.attachInput({target,keyboardTarget:keyboard,
  resolveSelection:select,pointFromEvent:event=>event.point}),true);
 target.emit('pointerdown',{point:{x:2.5,y:2.5}});
 assert.ok(events.some(e=>e.type==='grabbed'));
 target.emit('pointermove',{point:{x:3.5,y:2.5}});
 assert.ok(events.some(e=>e.type==='presented'&&e.presented.x===3),
  'moving one cell from a center grab should display x3, not x3.5');
 target.emit('pointerup',{point:{x:3.5,y:2.5}});
 await nextTick();await nextTick();
 assert.ok(x.calls.some(([name])=>name==='advance_world_motion_v2'));
 r.detachInput();await r.dispose();
 assert.equal(target.listening.length,0);
 assert.equal(keyboard.listening.length,0);
});
test('release of a tool onto an authorized carrier cancels normal movement',async()=>{
 const x=fakeClient({dm:true});
 const r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 const target=fakeEventTarget();
 let holds=0;
 r.attachInput({target,keyboardTarget:fakeEventTarget(),
  resolveSelection:select,pointFromEvent:event=>event.point,
  onPointerRelease:()=>{holds++;return true}
 });
 target.emit('pointerdown');
 target.emit('pointerup');
 await nextTick();await nextTick();
 assert.equal(holds,1);
 assert.equal(x.calls.some(([name])=>name==='commit_world_motion_v2'),false);
 await r.dispose();
});
test('real movement commits once and requests fresh canonical sight, never direct map_tokens write',async()=>{
 const x=fakeClient({dm:true}),commits=[];
 const r=createWorldV2TabletopRuntime({...x.config,
  getAuthorizedPieces:pieceData,onCommit:data=>commits.push(data)
 });
 await r.start();
 r.movement.beginGesture({
  mapId,selection:[{kind:'token',id:heroId}],
  origin:{x:2,y:2},pointer:{x:2,y:2},
  mode:'drag',environmentRevision:9,permissionGeneration:4
 });
 await nextTick();
 r.movement.updateGesture({x:3,y:2});
 await nextTick();await nextTick();
 const result=await r.movement.endGesture();
 assert.equal(result.status,'committed');
 assert.equal(commits.length,1);
 assert.ok(x.calls.some(([name])=>name==='commit_world_motion_v2'));
 assert.equal(x.calls.some(([name])=>name==='move_map_group'),false);
 await r.dispose();
});
test('scene publication does not reload terrain through token movement channel',async()=>{
 const x=fakeClient(),r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 const old=x.renderer.events.filter(e=>e[0]==='scene').length;
 const channel=x.channels.get('forge-world-scene-v2:'+mapId);
 assert.ok(channel);
 const revised=scene('viewer',{revision:10,sceneGeneration:7});
 const newSight=frame('viewer',{
  environmentRevision:10,sceneGeneration:7,cursor:6
 });
 x.updateScene(revised);x.updateSight(newSight);
 channel.status('SUBSCRIBED');
 await nextTick();await nextTick();await nextTick();
 assert.ok(x.renderer.events.some(e=>e[0]==='scene'&&e[1]===7));
 assert.ok(x.renderer.events.filter(e=>e[0]==='scene').length>old);
 await r.dispose();
});
test('DM preview uses actor-authorized preview RPC but never subscribes to player topic',async()=>{
 const x=fakeClient({dm:true,preview:true});
 const r=createWorldV2TabletopRuntime({...x.config,
  getAuthorizedPieces:pieceData
 });
 await r.start();
 assert.equal(r.active,true);
 assert.equal(x.calls.some(([name])=>name==='preview_world_visibility_v2'),true);
 assert.equal(x.channels.has('forge-world-v2:'+mapId+':'+viewerId),false);
 assert.equal(x.channels.size,1,'only DM-authorized scene publication socket');
 await r.dispose();
});
test('invalid or unassigned effective viewer fails closed and cannot mount engine',async()=>{
 const x=fakeClient();x.updateSight(null);
 const errors=[];
 const r=createWorldV2TabletopRuntime({...x.config,
  onError:e=>errors.push(e)
 });
 assert.equal(await r.start(),false);
 assert.equal(r.active,false);
 assert.equal(x.channels.size,0);
 await r.dispose();
});
test('missing permission or map change revokes the renderer and stops the gesture',async()=>{
 const x=fakeClient(),r=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 await r.start();
 r.movement.beginGesture({
  mapId,selection:[{kind:'token',id:heroId}],
  origin:{x:2,y:2},pointer:{x:2,y:2},mode:'drag',
  environmentRevision:9,permissionGeneration:4
 });
 r.revoke('player-reassigned',true);
 assert.equal(r.active,false);
 assert.equal(x.renderer.hardRevocations>0,true);
 assert.equal(r.movement.active,false);
 await r.dispose();
});
test('Phase 9 board and cutover gate compile with old board mutually exclusive',async()=>{
 const root=new URL('../src/TabletopApp.jsx',import.meta.url);
 const board=new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url);
 const app=await readFile(root,'utf8'),source=await readFile(board,'utf8');
 const result=await transformWithEsbuild(source,'WorldV2Board.jsx',{
  jsx:'automatic',target:'es2022'
 });
 assert.ok(result.code.includes('createWorldV2TabletopRuntime'));
 assert.ok(result.code.includes('MapPinLayer'));
 assert.ok(result.code.includes('MapEnvironmentOverlay'));
 assert.ok(result.code.includes('MapMeasurementOverlay'));
 assert.ok(result.code.includes('Artwork'));
 assert.ok(result.code.includes('TokenStatusBadges'));
 assert.ok(result.code.includes('onTokenEdit'));
 assert.ok(result.code.includes('onToolHold'));
 assert.ok(app.includes("VITE_WORLD_ENGINE_V2==='integrated'"));
 assert.ok(app.includes("VITE_WORLD_ENGINE_V2_READY==='true'"));
 assert.ok(app.includes('<BoardComponent db={db}'));
 assert.equal(app.includes('<WorldV2Board db={db}'),false);
});


test('handout pins cannot be clicked through unrevealed V2 fog',()=>{
 const pins=[
  {id:'visible-pin',x:2.2,y:2.1},
  {id:'hidden-pin',x:8.5,y:8.5},
  {id:'outside-map',x:99,y:99}
 ];
 assert.deepEqual(visibleWorldPins(pins,null),[],
  'unauthorized player cannot interact with any pin');
 const f=frame('viewer');
 assert.deepEqual(visibleWorldPins(pins,f).map(p=>p.id),['visible-pin']);
 assert.deepEqual(visibleWorldPins(pins,{...f,visible:[]}),[]);
 assert.deepEqual(visibleWorldPins(pins,{
  ...f,enabled:false,visible:[],explored:[]
 }),pins,'fog-disabled map preserves handout interactions');
});
test('staged app disables legacy fog and old private observer on V2 route',async()=>{
 const app=await readFile(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const hook=await readFile(new URL('../src/useAuthorizedMapFog.js',import.meta.url),'utf8');
 const board=await readFile(
  new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(app,/enabled:!WORLD_V2_CUTOVER/);
 assert.match(app,/if\(WORLD_V2_CUTOVER\|\|!db\|\|!selectedMap\)return;/);
 assert.match(app,/if\(WORLD_V2_CUTOVER\|\|!db\|\|!activeId\|\|!selectedMap\|\|!user\)return;/);
 assert.match(hook,/if\(!enabled\|\|!db\|\|!campaignId\|\|!mapId\|\|!userId\)/);
 assert.match(board,/visibleWorldPins\(handoutPins,authorizedSight\)/);
 assert.match(board,/createPortal/);
 assert.doesNotMatch(board,/createRoot\(/,
  'one existing React tree, not 500 independent token roots');
});

test('initial V2 scene boot requests one sight frame before subscribing',async()=>{
 const x=fakeClient();
 const runtime=createWorldV2TabletopRuntime({
  ...x.config,getAuthorizedPieces:pieceData
 });
 assert.equal(await runtime.start(),true);
 assert.equal(x.calls.filter(([name])=>name==='get_world_visibility_v2').length,1,
  'initial scene change must not race the bootstrap sight refresh');
 assert.equal(x.channels.size,2);
 assert.equal(runtime.active,true);
 await runtime.dispose();
});
