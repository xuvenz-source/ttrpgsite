/**
 * Phase 6: real V2 transport + authorized sight + renderer integration.
 * All network fixtures are deterministic and isolated; never claims that
 * a live Supabase project or authenticated browser was exercised.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createWorldRenderer} from '../src/engine/v2/WorldRenderer.js';
import {createVisibilityController} from '../src/engine/v2/VisibilityController.js';
import {createWorldRealtimeTransport,WORLD_MOTION_EVENT,worldObserverTopic}
 from '../src/engine/v2/RealtimeTransport.js';
import {compileCollisionScene,collisionAllowsStep,solveCollisionPath}
 from '../src/engine/v2/CollisionSolver.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

const MAP='10000000-0000-4000-8000-000000000001';
const viewer=n=>'30000000-0000-4000-8000-'+String(n).padStart(12,'0');
const token=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const cells=Array.from({length:100},(_,i)=>i);
const scene=()=>({
 version:2,mapId:MAP,scope:'viewer',published:true,
 revision:7,sceneGeneration:2,rulesRevision:5,
 fogEnabled:true,collisionEnabled:true,ambient:30,
 effects:{weather:'none',intensity:0},
 dimensions:{width:1000,height:1000,gridSize:100},environment:null
});
function surfaces(){
 const counts={cleared:0,filled:0,gradients:0};
 const canvas=()=>{
  const ctx={
   clearRect(){counts.cleared++},fillRect(){counts.filled++},
   save(){},restore(){},setTransform(){},beginPath(){},clip(){},rect(){},
   moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},
   createLinearGradient(){counts.gradients++;return {addColorStop(){}}},
   createRadialGradient(){return {addColorStop(){}}}
  };
  return {width:0,height:0,style:{},getContext:()=>ctx};
 };
 const host={
  style:{},children:[],ownerDocument:{
   createElement:()=>({style:{},dataset:{},parentNode:null})
  },
  appendChild(node){node.parentNode=this;this.children.push(node)},
  removeChild(node){
   const at=this.children.indexOf(node);
   if(at<0)throw Error('Missing sprite');
   this.children.splice(at,1);node.parentNode=null;
  }
 };
 return {
  counts,host,
  terrain:{style:{},src:'',removeAttribute(){this.src=''}},
  staticCanvas:canvas(),fogCanvas:canvas(),spriteHost:host,
  viewport:{style:{}}
 };
}
function clock(){
 const jobs=new Map();let id=0,requests=0;
 return {
  requestFrame(fn){jobs.set(++id,fn);requests++;return id},
  cancelFrame(id){jobs.delete(id)},
  flush(now){const tasks=[...jobs.values()];jobs.clear();for(const fn of tasks)fn(now)},
  get queued(){return jobs.size},get requests(){return requests}
 };
}
function client(index,{pieces=25}={}){
 const id=viewer(index),s=surfaces(),c=clock();
 const rows=Array.from({length:pieces},(_,i)=>({
  kind:'token',id:token(index*1000+i),
  x:i===0?2:(i%8),y:i===0?2:(Math.floor(i/8)+4)
 }));
 const server={cursor:5,epoch:6,permission:4,rows,visible:cells,position:{x:2,y:2}};
 let rpcCalls=0,authCalls=0,removed=0;
 const channels=[];
 const db={
  realtime:{async setAuth(){authCalls++}},
  async rpc(name){
   if(name!=='get_world_visibility_v2')
    throw Error('Unexpected authority RPC '+name);
   rpcCalls++;
   return {data:{
    version:2,mapId:MAP,viewerId:id,scope:'viewer',
    cursor:server.cursor,environmentRevision:7,
    permissionGeneration:server.permission,sceneGeneration:2,
    visionEpoch:server.epoch,enabled:true,width:10,height:10,
    partyShared:false,visible:[...server.visible],explored:cells,
    visiblePieces:server.rows.map((p,i)=>i===0?
     {...p,x:server.position.x,y:server.position.y}:{...p})
   },error:null};
  },
  channel(topic,config){
   const listeners=new Map();let callback=null;
   const channel={
    topic,config,
    on(type,filter,handler){listeners.set(filter.event,handler);return this},
    subscribe(handler){callback=handler;return this},
    status(value){callback?.(value)},
    emit(type,payload){listeners.get(type)?.({payload})}
   };
   channels.push(channel);return channel;
  },
  async removeChannel(){removed++}
 };
 const renderer=createWorldRenderer({
  mapId:MAP,viewerId:id,surfaces:s,
  requestFrame:c.requestFrame.bind(c),cancelFrame:c.cancelFrame.bind(c)
 });
 const reasons=[];
 const vision=createVisibilityController({
  db,mapId:MAP,viewerId:id,getScene:()=>renderer.currentScene,
  onSnapshot:frame=>renderer.adoptVisibility(frame),
  onRevoke:()=>renderer.revoke('visibility-revoked',false)
 });
 const transport=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:id,
  onResync:()=>vision.observerSnapshot(),
  onPath:(item,meta)=>{
   assert.equal(renderer.applyObserverPath(item,meta),true,
    'only sequential server-authorized path enters the renderer');
  },
  onHide:(item,meta)=>renderer.applyObserverHide(item,meta),
  onRevoke:reason=>{reasons.push(reason);renderer.revoke(reason,false)},
  onVisionDirty:notice=>vision.onVisionDirty(notice)
 });
 async function start(){
  assert.equal(renderer.adoptScene(scene()),true);
  assert.ok(await vision.refresh());
  renderer.setTerrainSource('https://example.test/safe-map.png');
  c.flush(1000);
  assert.equal(await transport.start(),true);
  assert.equal(channels.length,1);
  assert.equal(channels[0].config.config.private,true);
  assert.equal(channels[0].topic,worldObserverTopic(MAP,id));
  channels[0].status('SUBSCRIBED');
  assert.equal(await transport.whenSettled(),true);
  c.flush(1020);
  assert.equal(renderer.authorized,true);
 }
 async function stop(){
  await transport.dispose();vision.dispose();renderer.dispose();
  assert.equal(removed,1);
  assert.equal(s.host.children.length,0);
  assert.equal(c.queued,0);
 }
 return {id,renderer,vision,transport,server,channels,c,s,reasons,start,stop,
  get rpcCalls(){return rpcCalls},get authCalls(){return authCalls}
 };
}
const motion=(client,seq,from,to)=>({
 version:2,mapId:MAP,viewerId:client.id,seq,
 environmentRevision:7,permissionGeneration:client.server.permission,
 items:[{kind:'token',id:client.server.rows[0].id,action:'path',
  path:[{...from},{...to}]}]
});

test('6 recipient clients × 120 approved moves: no flash, remount, extra socket or cross-viewer leak',async()=>{
 const clients=Array.from({length:6},(_,i)=>client(i+1));
 try{
  for(const c of clients)await c.start();
  assert.equal(new Set(clients.map(c=>c.channels[0].topic)).size,6);
  const nodes=clients.map(c=>
   c.renderer.getSpriteElement('token',c.server.rows[0].id));
  const baseline=clients.map(c=>c.renderer.stats);
  // Every client receives only its own viewer-scoped path envelopes.
  // Every tenth move also fetches a new server-authorized vision epoch.
  for(let n=1;n<=120;n++){
   for(let i=0;i<clients.length;i++){
    const c=clients[i];
    const from={...c.server.position},to={x:from.x===2?3:2,y:2};
    const seq=5+n;
    c.server.cursor=seq;
    c.channels[0].emit(WORLD_MOTION_EVENT,motion(c,seq,from,to));
    c.server.position=to;
    const stamp=1020+n*70;
    c.c.flush(stamp);c.c.flush(stamp+25);c.c.flush(stamp+48);
    if(n%10===0){
     c.server.epoch++;
     c.server.visible=n%20===0?cells:cells.filter(v=>v!==99);
     assert.ok(await c.vision.refresh(),'current server fog remains authorized');
     c.c.flush(stamp+50);
    }
   }
  }
  for(let i=0;i<clients.length;i++){
   const c=clients[i],current=c.renderer.stats,start=baseline[i];
   assert.equal(c.renderer.authorized,true);
   assert.equal(c.renderer.getSpriteElement('token',c.server.rows[0].id),nodes[i]);
   assert.equal(current.spriteCreates,start.spriteCreates);
   assert.equal(current.spriteRemoves,start.spriteRemoves);
   assert.equal(current.terrainAssignments,start.terrainAssignments);
   assert.equal(current.staticDraws,start.staticDraws);
   assert.equal(current.fullFogDraws,start.fullFogDraws);
   assert.equal(current.rosterReconciliations,start.rosterReconciliations+
    12,'one canonical actor move per ten-frame visibility snapshot');
   assert.ok(current.fogPaintedCells-start.fogPaintedCells<=48);
   assert.equal(c.channels.length,1);
   assert.equal(c.authCalls,1);
   assert.equal(c.rpcCalls,14,
    'one initial sight, one subscribe reauthorization and twelve vision refreshes');
   assert.equal(c.reasons.filter(x=>x==='observer-sequence-gap').length,0);
   assert.equal(typeof c.transport.send,'undefined');
   assert.equal(c.c.queued,0);
  }
 }finally{for(const c of clients)await c.stop()}
});

test('forged viewer packets and unknown NPCs never grant sprites; reconnect requires fresh sight',async()=>{
 const a=client(30),b=client(31);
 try{
  await a.start();await b.start();
  const known=a.server.rows[0].id;
  const stolen={...motion(b,6,{x:2,y:2},{x:3,y:2}),viewerId:b.id};
  a.channels[0].emit(WORLD_MOTION_EVENT,stolen);
  assert.equal(a.transport.locked,true,
   'foreign viewer envelope immediately locks the stream');
  assert.equal(a.renderer.authorized,false);
  assert.equal(a.s.host.children.length,0);
  assert.equal(a.renderer.getSpriteElement('token',b.server.rows[0].id),null);
  assert.equal(await a.transport.whenSettled(),true);
  a.c.flush(1100);
  assert.equal(a.renderer.authorized,true);
  assert.ok(a.renderer.getSpriteElement('token',known));
  const hidden=token(399999);
  a.server.cursor=6;
  a.channels[0].emit(WORLD_MOTION_EVENT,{
   ...motion(a,6,{x:2,y:2},{x:3,y:2}),
   items:[{kind:'token',id:hidden,action:'path',
    path:[{x:2,y:2},{x:3,y:2}]}]
  });
  assert.equal(a.transport.locked,true,'unknown token demands fresh private roster');
  assert.equal(a.renderer.getSpriteElement('token',hidden),null);
  assert.equal(await a.transport.whenSettled(),true);
  assert.equal(a.renderer.getSpriteElement('token',hidden),null);
  a.channels[0].status('CHANNEL_ERROR');
  assert.equal(a.transport.locked,true);
  assert.equal(a.renderer.authorized,false);
  assert.equal(a.s.fogCanvas.style.backgroundColor,'#040914');
  a.server.cursor=8;
  a.channels[0].status('SUBSCRIBED');
  assert.equal(await a.transport.whenSettled(),true);
  a.c.flush(1200);
  assert.equal(a.renderer.authorized,true);
  assert.equal(a.transport.cursor,8);
  assert.equal(a.renderer.getSpriteElement('token',hidden),null);
  assert.equal(b.renderer.authorized,true,'other client remains unaffected');
 }finally{await a.stop();await b.stop()}
});

test('collision stress: no wall tunnelling, diagonal corner bypass, or unsafe group overrides',()=>{
 const wall={type:'wall',points:[{x:4,y:0},{x:4,y:10}],
  blocksMovement:true};
 const compiled=compileCollisionScene({
  map:{id:MAP,width:1000,height:1000,grid_size:100},
  environment:{objects:[wall]},revision:7,scope:'dm',
  collisionEnabled:true
 });
 assert.ok(compiled);
 const piece={kind:'token',id:token(1),x:2,y:2,spanX:1,spanY:1};
 for(let n=0;n<1000;n++){
  const start={x:2,y:2},end={x:5+(n%4),y:2+(n%3)};
  const result=solveCollisionPath({scene:compiled,pieces:[piece],
   anchor:start,from:start,to:end,allowSliding:false,maxSlides:0});
  assert.equal(result.complete,false);
  assert.ok(result.offset?.x<=3+1e-4);
  assert.equal(collisionAllowsStep({scene:compiled,pieces:[piece],
   anchor:start,from:start,to:end}),false);
 }
 assert.equal(collisionAllowsStep({
  scene:compiled,pieces:[piece],anchor:{x:2,y:2},
  from:{x:2,y:2},to:{x:3,y:2}
 }),true,'adjacent legal edge remains responsive');
 const group=[piece,{kind:'tool',id:token(99),x:3,y:2,spanX:1,spanY:1}];
 assert.equal(collisionAllowsStep({
  scene:compiled,pieces:group,anchor:{x:2,y:2},
  from:{x:2,y:2},to:{x:3,y:2}
 }),false,'a second piece touching the wall blocks the rigid group');
});

test('opt-in traces and resource topology remain bounded under a 25,000-event stress burst',()=>{
 let time=0;
 const trace=createWorldV2Trace({enabled:true,limit:256,now:()=>time});
 for(let i=0;i<25000;i++){
  time+=0.5;
  trace.event('renderer.fog-partial','secret player token 12345');
  const end=trace.begin('visibility.rpc');time+=0.2;end('ok');
 }
 const sample=trace.snapshot();
 assert.equal(sample.events.length,256);
 assert.equal(sample.durations['visibility.rpc'].samples,256);
 assert.equal(sample.counts['renderer.fog-partial'],25000);
 assert.ok(sample.events.every(item=>item.detail==='other'));
 assert.ok(!JSON.stringify(sample).includes('secret player token'));
 trace.clear();assert.equal(trace.snapshot().events.length,0);
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(app,/React\.lazy\(\(\)=>WORLD_V2_CUTOVER\?/);
 assert.match(app,/if\(WORLD_V2_CUTOVER\|\|!db\|\|!selectedMap\)return;/);
 assert.match(app,/if\(WORLD_V2_CUTOVER\|\|!db\|\|!activeId\|\|!selectedMap\|\|!user\)return;/);
 assert.match(app,/enabled:!WORLD_V2_CUTOVER/);
 assert.match(runtime,/createWorldRealtimeTransport/);
 assert.doesNotMatch(runtime,/createAuthorizedMotionTransport|observerMotionTopic|MapFogOverlay/);
 assert.doesNotMatch(board,/createRoot\(|BattlemapBoard|createTokenMotionRuntime/);
 const files=readdirSync(new URL('../src/engine/v2/',import.meta.url))
  .filter(x=>/\.js$/.test(x));
 for(const file of files){
  const source=readFileSync(new URL('../src/engine/v2/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/from\s+['"][^'"]*(BattlemapBoard|useAuthorizedMapFog|MapMovementPath|MapMotionRuntime)/,
   'V2 module must not import the retired active movement/fog path: '+file);
 }
});
