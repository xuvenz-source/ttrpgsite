import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {
 createWorldFrameScheduler,createObserverPathBuffer,
 createVisibilityController,paintWorldFogLayer,paintWorldStaticLayer,createWorldRenderer,
 normalizeWorldVisibilityFrame,makeWorldFogMask
} from '../src/engine/v2/index.js';

const mapId='10000000-0000-4000-8000-000000000001';
const otherMap='10000000-0000-4000-8000-000000000002';
const viewerId='30000000-0000-4000-8000-000000000001';
const hero={kind:'token',id:'40000000-0000-4000-8000-000000000001',x:2,y:2};
const ally={kind:'token',id:'40000000-0000-4000-8000-000000000002',x:3,y:3};
const torch={kind:'tool',id:'50000000-0000-4000-8000-000000000001',x:1,y:4};
const allCells=Array.from({length:100},(_,i)=>i);
const wall={id:'wall',type:'wall',points:[{x:5,y:0},{x:5,y:10}],
 blocksMovement:true,blocksLight:true,vision:'block',oneWay:'a-to-b'};
const light={id:'lamp',type:'light',x:4,y:4,bright:4,dim:3,
 intensity:90,color:'#ffd699',enabled:true,effect:'steady'};
const scene=(o={})=>({
 version:2,mapId,scope:'viewer',published:true,revision:7,
 sceneGeneration:2,rulesRevision:5,collisionEnabled:true,
 fogEnabled:true,ambient:25,
 effects:{weather:'none',intensity:0},
 dimensions:{width:1000,height:1000,gridSize:100},
 environment:null,...o
});
const dm=()=>scene({scope:'dm',environment:{version:1,objects:[wall,light]}});
const sight=(o={})=>({
 version:2,mapId,viewerId,scope:'viewer',cursor:5,environmentRevision:7,
 permissionGeneration:4,sceneGeneration:2,visionEpoch:6,
 enabled:true,width:10,height:10,partyShared:false,
 visible:allCells,explored:allCells,visiblePieces:[hero,ally,torch],...o
});
function fakeClock(){
 let id=0,requests=0;
 const pending=new Map();
 return {
  requestFrame(cb){pending.set(++id,cb);requests++;return id},
  cancelFrame(h){pending.delete(h)},
  flush(now){const c=[...pending.values()];pending.clear();c.forEach(fn=>fn(now));return c.length},
  run(start=1000,step=30,limit=100){
   let n=0;while(pending.size&&n<limit){this.flush(start+n*step);n++}return n
  },
  get queued(){return pending.size},
  get requests(){return requests}
 };
}
function fakeCanvas(){
 const calls=[],gradients=[];
 const gradient=kind=>(...args)=>{
  const g={kind,args,stops:[],addColorStop(n,c){this.stops.push([n,c])}};
  gradients.push(g);return g
 };
 const ctx={
  save(){calls.push(['save'])},restore(){calls.push(['restore'])},
  setTransform(...a){calls.push(['transform',...a])},
  beginPath(){calls.push(['begin'])},clip(){calls.push(['clip'])},
  rect(...a){calls.push(['rect',...a])},
  clearRect(...a){calls.push(['clear',...a])},
  fillRect(...a){calls.push(['fillRect',...a,this.fillStyle])},
  moveTo(...a){calls.push(['move',...a])},lineTo(...a){calls.push(['line',...a])},
  stroke(){calls.push(['stroke'])},fill(){calls.push(['fill'])},
  arc(...a){calls.push(['arc',...a])},
  createLinearGradient:gradient('linear'),
  createRadialGradient:gradient('radial')
 };
 return {style:{},width:0,height:0,calls,gradients,getContext:()=>ctx};
}
function fakeSurfaces(){
 const spriteHost={
  style:{},children:[],ownerDocument:{createElement:()=>({
   style:{},dataset:{},parentNode:null
  })},
  appendChild(node){this.children.push(node);node.parentNode=this},
  removeChild(node){
   const i=this.children.indexOf(node);if(i<0)throw Error('missing node');
   this.children.splice(i,1);node.parentNode=null;
  }
 };
 return {terrain:{style:{},src:'',removeAttribute(){this.src=''}},
  staticCanvas:fakeCanvas(),fogCanvas:fakeCanvas(),spriteHost,
  viewport:{style:{}}};
}
function make(o={}){
 const clock=fakeClock(),surfaces=fakeSurfaces(),resync=[];
 const renderer=createWorldRenderer({mapId,viewerId,surfaces,
  requestFrame:clock.requestFrame.bind(clock),
  cancelFrame:clock.cancelFrame.bind(clock),
  onNeedResync:r=>resync.push(r),...o});
 return {clock,surfaces,renderer,resync};
}
function activate(ctx,s=scene(),f=sight()){
 assert.equal(ctx.renderer.adoptScene(s),true);
 assert.equal(ctx.renderer.adoptVisibility(f),true);
 ctx.clock.flush(1000);
}
const path=(piece,route)=>({kind:piece.kind,id:piece.id,action:'path',
 path:route.map(([x,y])=>({x,y}))});
const motion=(type,point,more={})=>({
 type,mapId,gestureId:1,selection:[hero],
 approved:point,presented:point,pointer:point,...more
});
const position=node=>node.style.translate;

test('scheduler coalesces 1000 invalidations into one RAF and goes idle',()=>{
 const clock=fakeClock(),calls=[];
 const f=createWorldFrameScheduler({
  requestFrame:clock.requestFrame.bind(clock),
  cancelFrame:clock.cancelFrame.bind(clock),
  onFrame:value=>{calls.push(value);return false}
 });
 for(let i=0;i<1000;i++)f.invalidate();
 assert.equal(clock.queued,1);clock.flush(100);
 assert.equal(calls.length,1);assert.equal(clock.queued,0);f.dispose();
});
test('scheduler uses one recurring RAF, caps dt and pauses/resumes',()=>{
 const clock=fakeClock(),calls=[];
 const f=createWorldFrameScheduler({
  requestFrame:clock.requestFrame.bind(clock),
  cancelFrame:clock.cancelFrame.bind(clock),
  onFrame:x=>{calls.push(x);return true}
 });
 f.wake();clock.flush(1000);clock.flush(2000);
 assert.equal(calls[1].deltaMs,80);
 f.pause();assert.equal(clock.queued,0);
 f.resume();clock.flush(100000);
 assert.equal(calls[2].deltaMs,0);
 f.dispose();assert.equal(clock.queued,0);
});
test('observer roster refresh preserves approved bent paths, not teleports',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero]);
 b.applyPath(path(hero,[[2,2],[3,2],[4,2],[4,3],[4,4]]));
 b.tick(1000);b.tick(1040);
 const previous=b.getPosition('token',hero.id);
 assert.ok(previous.x>2&&previous.x<4);
 b.reconcilePieces([{...hero,x:4,y:4}]);
 assert.deepEqual(b.getPosition('token',hero.id),previous);
 b.tick(1080);assert.ok(b.getPosition('token',hero.id).y<4);
 for(let t=1120;t<=1600;t+=40)b.tick(t);
 assert.deepEqual(b.getPosition('token',hero.id),{x:4,y:4});
 b.dispose();
});
test('observer roster revokes removed pieces, resets discontinuities and clocks',()=>{
 const b=createObserverPathBuffer();b.authorizePieces([hero,torch]);
 b.applyPath(path(hero,[[2,2],[3,2]]));
 b.tick(1000);b.tick(1020);b.resetClock();
 const old=b.getPosition('token',hero.id);
 b.tick(1000000);assert.deepEqual(b.getPosition('token',hero.id),old);
 b.reconcilePieces([{...hero,x:8,y:8}]);
 assert.equal(b.getPosition('tool',torch.id),null);
 assert.deepEqual(b.getPosition('token',hero.id),{x:8,y:8});
 assert.equal(b.pendingCount,0);b.dispose();
});
test('fog painter limits updates to changed cells and adjacent feather areas',()=>{
 const canvas=fakeCanvas();
 const a=normalizeWorldVisibilityFrame(sight({
  visible:[11,12,21,22,23,31,32],
  explored:[10,11,12,21,22,23,31,32],
  visiblePieces:[hero]
 }),mapId,viewerId);
 const b=normalizeWorldVisibilityFrame(sight({
  visible:[11,12,21,22,23,31,32,33],
  explored:[10,11,12,21,22,23,31,32,33],
  visiblePieces:[hero]
 }),mapId,viewerId);
 const m1=makeWorldFogMask(a),m2=makeWorldFogMask(b);
 assert.equal(paintWorldFogLayer({canvas,frame:a,mask:m1,
  widthPx:1000,heightPx:1000}).cells,100);
 const changed=paintWorldFogLayer({canvas,frame:b,mask:m2,
  previousMask:m1,widthPx:1000,heightPx:1000});
 assert.equal(changed.cells,9);assert.equal(changed.full,false);
 assert.equal(paintWorldFogLayer({canvas,frame:b,mask:m2,
  previousMask:m2,widthPx:1000,heightPx:1000}).cells,0);
 assert.equal(canvas.width,80);
});
test('feather paints only inside already visible cell',()=>{
 const canvas=fakeCanvas();
 const f=normalizeWorldVisibilityFrame(sight({visible:[55],explored:[55],
  visiblePieces:[]}),mapId,viewerId);
 const mask=makeWorldFogMask(f);
 paintWorldFogLayer({canvas,frame:f,mask,widthPx:1000,heightPx:1000});
 assert.ok(canvas.gradients.some(x=>x.kind==='linear'));
 const gradients=canvas.calls.filter(x=>x[0]==='fillRect'&&x[5]?.kind==='linear');
 assert.ok(gradients.length>0);
 for(const p of gradients){
  assert.ok(p[1]>=40&&p[2]>=40);
  assert.ok(p[1]+p[3]<=48&&p[2]+p[4]<=48);
 }
 assert.equal(mask[56],0);
});
test('unavailable sight blackens persistent canvas; large fogless map uses 1 pixel',()=>{
 const c=fakeCanvas();
 paintWorldFogLayer({canvas:c,frame:null,widthPx:1000,heightPx:1000});
 assert.equal(c.style.backgroundColor,'#040914');
 assert.equal(c.width,1);
 paintWorldFogLayer({canvas:c,frame:sight({enabled:false,
  width:5000,height:4000,visible:[],explored:[],visiblePieces:[]}),
  widthPx:500000,heightPx:400000});
 assert.equal(c.width,1);assert.equal(c.style.backgroundColor,'transparent');
});
test('static layer paints DM-authored walls and lamps but not viewer secrets',()=>{
 const canvas=fakeCanvas();
 assert.ok(paintWorldStaticLayer({canvas,scene:dm()}).objects>=2);
 assert.ok(canvas.calls.some(x=>x[0]==='stroke'));
 assert.ok(canvas.gradients.some(x=>x.kind==='radial'));
 const noChanges=paintWorldStaticLayer({canvas,scene:dm(),
  dirty:{full:false,regions:[]}});
 assert.equal(noChanges.objects,0);
 const viewer=fakeCanvas();
 assert.equal(paintWorldStaticLayer({canvas:viewer,scene:scene()}).objects,0);
 assert.equal(viewer.calls.some(x=>x[0]==='stroke'),false);
});
test('initial scene+view mounts once then becomes idle without animation',()=>{
 const ctx=make();activate(ctx);
 assert.equal(ctx.surfaces.spriteHost.children.length,3);
 assert.equal(ctx.renderer.stats.spriteCreates,3);
 assert.equal(ctx.renderer.stats.spriteRemoves,0);
 assert.equal(ctx.renderer.stats.fogDraws,1);
 assert.equal(ctx.renderer.stats.staticDraws,1);
 assert.equal(ctx.clock.queued,0);
 ctx.renderer.dispose();
});
test('25 visibility revisions reuse all sprite nodes and map bitmap',()=>{
 const ctx=make();activate(ctx);
 ctx.renderer.setTerrainSource('https://example.test/map.png');
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 const before=ctx.renderer.stats;
 for(let i=1;i<=25;i++){
  assert.equal(ctx.renderer.adoptVisibility(sight({
   cursor:5+i,visionEpoch:6+i})),true);
  ctx.clock.flush(1000+i*20);
 }
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 assert.equal(ctx.renderer.stats.spriteCreates,3);
 assert.equal(ctx.renderer.stats.spriteRemoves,0);
 assert.equal(ctx.renderer.stats.staticDraws,1);
 assert.equal(ctx.renderer.stats.fogDraws,before.fogDraws);
 assert.equal(ctx.renderer.stats.terrainAssignments,1);
 ctx.renderer.dispose();
});
test('three token/tool paths share one frame scheduler',()=>{
 const ctx=make();activate(ctx);
 for(const p of [hero,ally,torch]){
  assert.equal(ctx.renderer.applyObserverPath(path(p,[
   [p.x,p.y],[p.x+1,p.y],[p.x+2,p.y]
  ]),{mapId,seq:6}),true);
 }
 assert.equal(ctx.clock.queued,1);
 ctx.clock.flush(1040);
 assert.equal(ctx.clock.queued,1);
 assert.equal(ctx.renderer.stats.sprites,3);
 ctx.renderer.dispose();
});
test('bent observer path follows actual approved corners, not wall chord',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.applyObserverPath(path(hero,[
  [2,2],[3,2],[4,2],[4,3],[4,4]
 ]),{mapId,seq:6}),true);
 ctx.clock.flush(1000);ctx.clock.flush(1040);
 assert.equal(position(node).split(' ')[1],'200px');
 ctx.clock.flush(1080);
 assert.equal(position(node).split(' ')[0],'400px');
 assert.notEqual(position(node).split(' ')[1],'400px');
 ctx.clock.run(1120,40);
 assert.equal(position(node),'400px 400px');
 assert.equal(ctx.clock.queued,0);ctx.renderer.dispose();
});
test('canonical roster at remote endpoint never resets in-flight interpolation',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 ctx.renderer.applyObserverPath(path(hero,[[2,2],[3,2],[4,2]]),{mapId,seq:6});
 ctx.clock.flush(1000);ctx.clock.flush(1030);
 assert.equal(ctx.renderer.adoptVisibility(sight({cursor:6,visionEpoch:7,
  visiblePieces:[{...hero,x:4,y:2}]})),true);
 ctx.clock.flush(1040);
 assert.notEqual(position(node),'400px 200px');
 ctx.clock.run(1080,30);
 assert.equal(position(node),'400px 200px');
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 ctx.renderer.dispose();
});
test('unrostered NPC and hidden-cell routes cannot make new sprites',()=>{
 const ctx=make();activate(ctx,scene(),sight({
  visible:[22,23],explored:[22,23],visiblePieces:[hero]
 }));
 assert.equal(ctx.renderer.applyObserverPath(path(ally,[[3,3],[4,3]]),{
  mapId,seq:6}),false);
 assert.equal(ctx.renderer.getSpriteElement('token',ally.id),null);
 assert.equal(ctx.renderer.applyObserverPath(path(hero,[
  [2,2],[3,2],[4,2]]),{mapId,seq:6}),false);
 assert.equal(ctx.renderer.stats.sprites,0);
 assert.equal(ctx.renderer.authorized,false);
 ctx.renderer.dispose();
});
test('hide immediately removes known sprite and old cursor cannot revive it',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const original=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.applyObserverHide({
  kind:'token',id:hero.id,action:'hide'
 },{mapId,seq:6}),true);
 assert.equal(original.parentNode,null);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:5,visiblePieces:[hero]})),false);
 assert.equal(ctx.renderer.authorized,true,
  'same-authority stale sight does not undo an authorized hide');
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),null);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:6,visionEpoch:7,visiblePieces:[]})),true);
 assert.equal(ctx.renderer.stats.sprites,0);ctx.renderer.dispose();
});
test('duplicate sequence or a sequence gap fails closed',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero,ally]}));
 assert.equal(ctx.renderer.applyObserverPath(
  path(hero,[[2,2],[3,2]]),{mapId,seq:6}),true);
 assert.equal(ctx.renderer.applyObserverPath(
  path(hero,[[2,2],[3,2]]),{mapId,seq:6}),false);
 assert.equal(ctx.renderer.applyObserverPath(
  path(ally,[[3,3],[4,3]]),{mapId,seq:8}),false);
 assert.equal(ctx.renderer.authorized,false);
 ctx.renderer.dispose();
});
test('immediate local grab highlights without awaiting RPC',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.applyLocalMovement(
  motion('grabbed',{x:2,y:2})),true);
 assert.equal(node.style.outline,'2px solid rgba(145,211,255,0.95)');
 ctx.clock.flush(1016);assert.equal(position(node),'200px 200px');
 ctx.renderer.dispose();
});
test('local prediction does not snap backward for older approved ACK',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 ctx.renderer.applyLocalMovement(motion('grabbed',{x:2,y:2}));
 ctx.renderer.applyLocalMovement(motion('presented',{x:4.2,y:2},{
  approved:{x:2,y:2},predicted:true
 }));
 ctx.clock.flush(1040);
 assert.ok(parseFloat(position(node))>419);
 ctx.renderer.applyLocalMovement(motion('approved',{x:3,y:2},{
  blocked:false
 }));
 ctx.clock.flush(1060);
 assert.ok(parseFloat(position(node))>419);
 ctx.renderer.applyLocalMovement(motion('committed',{x:4,y:2}));
 ctx.clock.flush(1080);
 assert.equal(position(node),'400px 200px');
 assert.ok(ctx.resync.includes('canonical-commit'));
 ctx.renderer.adoptVisibility(sight({cursor:7,visionEpoch:7,
  visiblePieces:[{...hero,x:4,y:2}]}));
 ctx.clock.flush(1100);
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 assert.equal(node.style.outline,'');
 ctx.renderer.dispose();
});
test('server denial clamps local presentation to last accepted cell',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 ctx.renderer.applyLocalMovement(motion('grabbed',{x:2,y:2}));
 ctx.renderer.applyLocalMovement(motion('presented',{x:4,y:2},{
  approved:{x:2,y:2},predicted:true
 }));
 ctx.clock.flush(1020);
 ctx.renderer.applyLocalMovement(motion('blocked',{x:3,y:2},{
  blocked:true
 }));
 ctx.clock.flush(1040);
 assert.equal(position(node),'300px 200px');
 ctx.renderer.dispose();
});
test('rejected local drag restores node without remount or ghost',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 ctx.renderer.applyLocalMovement(motion('grabbed',{x:2,y:2}));
 ctx.renderer.applyLocalMovement(motion('presented',{x:3,y:2},{
  approved:{x:2,y:2},predicted:true
 }));
 ctx.clock.flush(1020);
 ctx.renderer.applyLocalMovement(motion('rejected',{x:2,y:2}));
 ctx.clock.flush(1040);
 assert.equal(position(node),'200px 200px');
 assert.equal(node.style.outline,'');
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 ctx.renderer.dispose();
});
test('DM preview draws no secret guides; revocation clears all map surfaces',()=>{
 const ctx=make({playerPreview:true});activate(ctx,dm());
 assert.equal(ctx.surfaces.staticCanvas.calls.some(x=>x[0]==='stroke'),false);
 ctx.renderer.setTerrainSource('https://example.test/private.png');
 ctx.renderer.revoke('permission-revoked');
 assert.equal(ctx.renderer.authorized,false);
 assert.equal(ctx.renderer.stats.sprites,0);
 assert.equal(ctx.surfaces.terrain.src,'');
 assert.equal(ctx.surfaces.staticCanvas.width,1);
 assert.equal(ctx.surfaces.fogCanvas.style.backgroundColor,'#040914');
 ctx.renderer.dispose();
});
test('map switch discards old sprite keys and wrong viewer visibility',()=>{
 const ctx=make();activate(ctx);
 const previous=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.changeContext({mapId:otherMap,
  viewerId:'30000000-0000-4000-8000-000000000002'}),true);
 assert.equal(previous.parentNode,null);
 assert.equal(ctx.renderer.adoptVisibility(sight()),false);
 const newMap=scene({mapId:otherMap});
 assert.equal(ctx.renderer.adoptScene(newMap),true);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  mapId:otherMap,viewerId:'30000000-0000-4000-8000-000000000002'
 })),true);
 ctx.clock.flush(1050);
 assert.notEqual(ctx.renderer.getSpriteElement('token',hero.id),previous);
 ctx.renderer.dispose();
});
test('scene publication preserves stable terrain DOM, cancels stale sprites',()=>{
 const ctx=make();activate(ctx);
 const terrain=ctx.surfaces.terrain;
 ctx.renderer.setTerrainSource('https://example.test/map.png');
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.adoptScene(scene({revision:8,
  sceneGeneration:3})),true);
 assert.equal(ctx.renderer.authorized,false);
 assert.equal(node.parentNode,null);
 assert.equal(terrain.src,'https://example.test/map.png');
 assert.equal(ctx.renderer.adoptVisibility(sight({
  environmentRevision:8,sceneGeneration:3,cursor:0
 })),true);
 ctx.clock.flush(1050);
 assert.equal(ctx.renderer.stats.terrainAssignments,1);
 assert.equal(ctx.renderer.stats.staticDraws,2);
 ctx.renderer.dispose();
});
test('CSS zoom pan does not reallocate fog or cause map repaint',()=>{
 const ctx=make();activate(ctx);
 const width=ctx.surfaces.fogCanvas.width;
 const before=ctx.renderer.stats;
 assert.equal(ctx.renderer.setCamera({x:140,y:75,zoom:1.75}),true);
 assert.equal(ctx.clock.queued,0);
 assert.equal(ctx.surfaces.fogCanvas.width,width);
 assert.equal(ctx.renderer.stats.staticDraws,before.staticDraws);
 assert.equal(ctx.renderer.stats.fogDraws,before.fogDraws);
 ctx.renderer.dispose();
});
test('500 visible pieces mount in one frame and all release on dispose',()=>{
 const ctx=make();
 const items=Array.from({length:500},(_,i)=>({
  kind:'token',id:'40000000-0000-4000-8000-'+String(i).padStart(12,'0'),
  x:i%10,y:Math.floor(i/10)%10
 }));
 assert.equal(ctx.renderer.adoptScene(scene()),true);
 assert.equal(ctx.renderer.adoptVisibility(sight({visiblePieces:items})),true);
 assert.equal(ctx.clock.queued,1);
 ctx.clock.flush(1000);
 assert.equal(ctx.renderer.stats.sprites,500);
 assert.equal(ctx.renderer.stats.spriteCreates,500);
 assert.equal(ctx.clock.queued,0);
 ctx.renderer.dispose();
 assert.equal(ctx.surfaces.spriteHost.children.length,0);
});
test('dispose cancels pending RAF and forbids a late update',()=>{
 const ctx=make();activate(ctx);
 ctx.renderer.applyObserverPath(path(hero,[[2,2],[3,2]]),{mapId,seq:6});
 assert.equal(ctx.clock.queued,1);
 ctx.renderer.dispose();assert.equal(ctx.clock.queued,0);
 assert.equal(ctx.renderer.adoptVisibility(sight()),false);
 assert.equal(ctx.renderer.stats.sprites,0);
});


test('slow canonical roster at original route cell never snaps an active observer backwards',()=>{
 const b=createObserverPathBuffer();b.authorizePieces([hero]);
 b.applyPath(path(hero,[[2,2],[3,2],[4,2],[4,3]]));
 b.tick(1000);b.tick(1040);
 const progress=b.getPosition('token',hero.id);
 assert.ok(progress.x>2&&progress.x<4);
 assert.equal(b.reconcilePieces([hero]),true);
 assert.deepEqual(b.getPosition('token',hero.id),progress);
 b.tick(1080);
 assert.ok(b.getPosition('token',hero.id).x>=progress.x);
 b.dispose();
});
test('stale canonical origin wins after route ends unless a newer authorization arrives',()=>{
 const b=createObserverPathBuffer();b.authorizePieces([hero]);
 b.applyPath(path(hero,[[2,2],[3,2]]));
 b.tick(1000);for(let t=1040;t<=1280;t+=40)b.tick(t);
 assert.equal(b.pendingCount,0);
 assert.deepEqual(b.getPosition('token',hero.id),{x:3,y:2});
 assert.equal(b.reconcilePieces([hero]),true);
 assert.deepEqual(b.getPosition('token',hero.id),{x:2,y:2});
 b.dispose();
});
test('authorized large token dimensions persist without remounting or revealing secrets',()=>{
 const ctx=make();
 activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.setSpriteDimensions('token',hero.id,
  {spanX:2.5,spanY:1.5}),true);
 assert.equal(node.style.width,'250px');
 assert.equal(node.style.height,'150px');
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 assert.equal(ctx.renderer.setSpriteDimensions('token',ally.id,
  {spanX:2,spanY:2}),false,'unknown piece cannot be created through metadata');
 assert.equal(ctx.renderer.setSpriteDimensions('token',hero.id,
  {spanX:50,spanY:1}),false);
 assert.equal(ctx.surfaces.spriteHost.children.length,1);
 ctx.renderer.dispose();
});
test('fog visibility for large authorized footprint follows its centre',()=>{
 const ctx=make();
 activate(ctx,scene(),sight({visible:[33],explored:[33],
  visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(node.style.visibility,'hidden',
  'top-left 2,2 is concealed before the server-owned dimensions arrive');
 assert.equal(ctx.renderer.setSpriteDimensions('token',hero.id,
  {spanX:2,spanY:2}),true);
 ctx.clock.flush(1020);
 assert.equal(node.style.visibility,'visible',
  'server-authorized 2x2 footprint centre 3,3 is visible');
 ctx.renderer.dispose();
});
test('large map with fog disabled never needs a giant canvas for 500 tokens',()=>{
 const ctx=make();
 const bigScene=scene({dimensions:{
  width:500000,height:400000,gridSize:100},fogEnabled:false});
 const distant=[{...hero,x:4000,y:3000}];
 assert.equal(ctx.renderer.adoptScene(bigScene),true);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  enabled:false,width:5000,height:4000,visible:[],explored:[],
  visiblePieces:distant
 })),true);
 ctx.clock.flush(1000);
 assert.equal(ctx.surfaces.fogCanvas.width,1);
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id).style.visibility,'visible');
 ctx.renderer.dispose();
});


test('cursor-only visibility snapshots do not trigger idle RAF or sprite painting',()=>{
 const ctx=make();activate(ctx);
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 const before=ctx.renderer.stats;
 const requested=ctx.clock.requests;
 for(let i=1;i<=25;i++)
  assert.equal(ctx.renderer.adoptVisibility(sight({
   cursor:5+i,visionEpoch:6+i
  })),true);
 assert.equal(ctx.clock.queued,0);
 assert.equal(ctx.clock.requests,requested);
 assert.equal(ctx.renderer.stats.spritePaints,before.spritePaints);
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 ctx.renderer.dispose();
});
test('Phase 7 onSnapshot callback delivers every cursor for the Phase 8 renderer',async()=>{
 const ctx=make();
 assert.equal(ctx.renderer.adoptScene(scene()),true);
 let current=sight({visiblePieces:[hero]}),updates=0;
 const controller=createVisibilityController({
  db:{rpc:async()=>({data:current,error:null})},
  mapId,viewerId,
  onSnapshot:snapshot=>{
   updates++;
   assert.equal(ctx.renderer.adoptVisibility(snapshot),true);
  }
 });
 await controller.refresh();ctx.clock.flush(1000);
 const original=ctx.renderer.getSpriteElement('token',hero.id);
 const requests=ctx.clock.requests;
 current=sight({cursor:6,visionEpoch:7,visiblePieces:[hero]});
 await controller.refresh();
 assert.equal(updates,2);
 assert.equal(ctx.clock.requests,requests);
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),original);
 controller.dispose();ctx.renderer.dispose();
});


test('DM-to-player scope mismatch fails closed and clears all cached DM layers',()=>{
 const ctx=make();
 const dmScene=dm();
 const dmSight=sight({scope:'dm',enabled:false,
  visible:[],explored:[],visiblePieces:[hero]});
 activate(ctx,dmScene,dmSight);
 ctx.renderer.setTerrainSource('https://example.test/secret-dm-map.png');
 const stale=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  scope:'viewer',enabled:true,visible:allCells,explored:allCells,
  visiblePieces:[hero],cursor:6,permissionGeneration:5,visionEpoch:7
 })),false);
 assert.equal(ctx.renderer.authorized,false);
 assert.equal(ctx.renderer.currentScene,null);
 assert.equal(ctx.surfaces.terrain.src,'');
 assert.equal(ctx.surfaces.staticCanvas.width,1);
 assert.equal(stale.parentNode,null);
 ctx.renderer.dispose();
});
test('new permission generation requires a freshly authorized published scene',()=>{
 const ctx=make();activate(ctx);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  permissionGeneration:5,visionEpoch:7,cursor:6
 })),false);
 assert.equal(ctx.renderer.currentScene,null);
 assert.equal(ctx.renderer.authorized,false);
 assert.ok(ctx.resync.includes('permission-generation-changed'));
 assert.equal(ctx.renderer.adoptScene(scene()),true);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  permissionGeneration:5,cursor:6,visionEpoch:7
 })),true);
 ctx.renderer.dispose();
});


test('authorized clear fog cells remain actually transparent over terrain',()=>{
 const canvas=fakeCanvas();
 const f=normalizeWorldVisibilityFrame(sight({
  visible:[22],explored:[22],visiblePieces:[hero]
 }),mapId,viewerId);
 const m=makeWorldFogMask(f);
 const result=paintWorldFogLayer({
  canvas,frame:f,mask:m,widthPx:1000,heightPx:1000
 });
 assert.equal(result.ok,true);
 assert.equal(canvas.style.backgroundColor,'transparent');
 // Hidden cell x9,y9 is still filled opaque in the canvas pixel data.
 assert.ok(canvas.calls.some(call=>call[0]==='fillRect'&&
  call[1]===72&&call[2]===72&&call[5]==='#040914'));
 // Visible cell x2,y2 is cleared; gradients never paint behind it.
 assert.ok(canvas.calls.some(call=>call[0]==='clear'&&
  call[1]===16&&call[2]===16));
});


test('explicit security revocation never recursively asks for another resync',()=>{
 const ctx=make();activate(ctx);
 const before=ctx.resync.length;
 ctx.renderer.revoke('private-stream-disconnected',false);
 ctx.renderer.revoke('map-authorization-revoked',true);
 assert.equal(ctx.resync.length,before,
  'security owner already controls reauthorization; renderer must not loop');
 assert.equal(ctx.renderer.authorized,false);
 assert.equal(ctx.renderer.currentScene,null);
 ctx.renderer.dispose();
});

test('unconfigured fogless maps boot renderer with server-authorized roster, not a black failed board',()=>{
 for(const scope of ['viewer','dm']){
  const ctx=make(),raw=scene({
   scope,published:false,collisionEnabled:false,fogEnabled:false,
   environment:null
  }),frame=sight({
   scope,enabled:false,visible:[],explored:[],visiblePieces:[hero],
   lightCells:[],dmMovingLights:[]
  });
  assert.equal(ctx.renderer.adoptScene(raw),true);
  assert.equal(ctx.renderer.adoptVisibility(frame),true);
  ctx.clock.flush(100);
  assert.equal(ctx.renderer.authorized,true);
  assert.equal(ctx.renderer.getSpriteElement('token',hero.id)?.style.visibility,'visible');
  assert.equal(ctx.surfaces.fogCanvas.style.backgroundColor,'transparent');
  ctx.renderer.dispose();
 }
 const ctx=make();
 assert.equal(ctx.renderer.adoptScene(scene({
  published:false,collisionEnabled:true,fogEnabled:false,
  environment:null
 })),false,'unpublished collision-protected map must remain blocked');
 ctx.renderer.dispose();
});

test('100 late same-authority sight frames never blacken or remount',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 const before=ctx.renderer.stats,oldFog=ctx.surfaces.fogCanvas.style.backgroundColor;
 ctx.renderer.setTerrainSource('https://example.test/map.png');
 for(let i=0;i<100;i++){
  const cursor=6+i;
  assert.equal(ctx.renderer.adoptVisibility(sight({
   cursor,visionEpoch:7+i,visiblePieces:[hero]
  })),true);
  assert.equal(ctx.renderer.adoptVisibility(sight({
   cursor:cursor-1,visionEpoch:7+i,visiblePieces:[hero,ally]
  })),false);
  assert.equal(ctx.renderer.authorized,true);
  assert.equal(ctx.renderer.getSpriteElement('token',ally.id),null);
 }
 ctx.clock.flush(1001);
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 assert.equal(ctx.renderer.stats.spriteCreates,1);
 assert.equal(ctx.renderer.stats.spriteRemoves,0);
 assert.equal(ctx.renderer.stats.staticDraws,before.staticDraws);
 assert.equal(ctx.renderer.stats.fogDraws,before.fogDraws);
 assert.equal(ctx.renderer.stats.fullFogDraws,before.fullFogDraws);
 assert.equal(ctx.renderer.stats.terrainAssignments,1);
 assert.equal(ctx.surfaces.fogCanvas.style.backgroundColor,oldFog);
 ctx.renderer.dispose();
});
test('late sight after private motion retains authorized sprite and fog',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 ctx.renderer.setTerrainSource('https://example.test/map.png');
 const before=ctx.renderer.stats;
 assert.equal(ctx.renderer.applyObserverPath(path(hero,[[2,2],[3,2]]),{
  mapId,seq:6}),true);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:5,visionEpoch:7,visiblePieces:[hero,ally]
 })),false);
 assert.equal(ctx.renderer.lastSightRejection,'observer-cursor-regression');
 assert.equal(ctx.renderer.authorized,true);
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 assert.equal(ctx.renderer.getSpriteElement('token',ally.id),null);
 assert.equal(ctx.renderer.stats.spriteRemoves,before.spriteRemoves);
 assert.equal(ctx.renderer.stats.fullFogDraws,before.fullFogDraws);
 assert.equal(ctx.renderer.stats.staticDraws,before.staticDraws);
 assert.equal(ctx.renderer.stats.terrainAssignments,1);
 ctx.renderer.dispose();
});

test('Phase 4 multi-tile local ACK follows approved corners, not a teleport',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 ctx.renderer.applyLocalMovement(motion('grabbed',{x:2,y:2}));
 const baseline=ctx.renderer.stats;
 assert.equal(ctx.renderer.applyLocalMovement(motion('approved',{x:4,y:4},{
  blocked:false,from:{x:2,y:2},
  accepted:[{x:3,y:2},{x:4,y:2},{x:4,y:3},{x:4,y:4}]
 })),true);
 ctx.clock.flush(1020);
 ctx.clock.flush(1050);
 const first=position(node).split(' ').map(parseFloat);
 assert.ok(first[0]>200&&first[0]<400);
 assert.equal(first[1],200,'local motion must follow authorized first leg');
 ctx.clock.run(1080,30);
 assert.equal(position(node),'400px 400px');
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 assert.equal(ctx.renderer.stats.spriteCreates,baseline.spriteCreates);
 assert.equal(ctx.renderer.stats.spriteRemoves,baseline.spriteRemoves);
 assert.equal(ctx.renderer.stats.fogDraws,baseline.fogDraws);
 assert.equal(ctx.renderer.stats.staticDraws,baseline.staticDraws);
 assert.equal(ctx.clock.queued,0);
 ctx.renderer.dispose();
});

test('Phase 4 prediction is held for older ACK and released when authority passes it',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 ctx.renderer.applyLocalMovement(motion('grabbed',{x:2,y:2}));
 ctx.renderer.applyLocalMovement(motion('presented',{x:3.7,y:2},{
  approved:{x:2,y:2},predicted:true
 }));
 ctx.clock.flush(1016);
 ctx.renderer.applyLocalMovement(motion('approved',{x:3,y:2}));
 ctx.clock.flush(1032);
 assert.ok(parseFloat(position(node))>369);
 ctx.renderer.applyLocalMovement(motion('approved',{x:4,y:2}));
 ctx.clock.flush(1048);
 assert.equal(position(node),'400px 200px',
  'authority reaching/passing the pointer must release stale prediction');
 ctx.renderer.applyLocalMovement(motion('blocked',{x:4,y:2},{blocked:true}));
 ctx.clock.flush(1064);
 assert.equal(position(node),'400px 200px');
 ctx.renderer.dispose();
});

test('Phase 4 remote burst never jumps more than 2.5 authorized cells per RAF',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 // Twenty-four server-approved cells remain within the 10x10 visible
 // mask, with bends so a direct chord would cut across unapproved cells.
 const route=[[2,2]];
 for(let x=3;x<=8;x++)route.push([x,2]);
 route.push([8,3]);
 for(let x=7;x>=2;x--)route.push([x,3]);
 route.push([2,4]);
 for(let x=3;x<=8;x++)route.push([x,4]);
 route.push([8,5]);
 for(let x=7;x>=5;x--)route.push([x,5]);
 assert.equal(ctx.renderer.applyObserverPath(path(hero,route),{mapId,seq:6}),true);
 ctx.clock.flush(1000);ctx.clock.flush(1120);
 const x=parseFloat(position(ctx.renderer.getSpriteElement('token',hero.id)));
 assert.ok(x>200&&x<=450.001,'bounded visual catchup, no 24-cell jump');
 assert.equal(ctx.renderer.stats.spriteCreates,1);
 ctx.renderer.dispose();
});

test('Phase 5 100 token-vision revisions repaint only local fog and no unrelated sprite',()=>{
 const ctx=make();activate(ctx);
 ctx.renderer.setTerrainSource('https://example.test/map.png');
 const token=ctx.renderer.getSpriteElement('token',hero.id);
 const original=ctx.renderer.stats;
 for(let i=0;i<100;i++){
  const visible=i%2?allCells:allCells.filter(v=>v!==99);
  assert.equal(ctx.renderer.adoptVisibility(sight({
   cursor:6+i,visionEpoch:7+i,visible
  })),true);
  ctx.clock.flush(1020+i*16);
  assert.equal(ctx.renderer.authorized,true);
  assert.equal(ctx.renderer.getSpriteElement('token',hero.id),token);
 }
 const after=ctx.renderer.stats;
 assert.equal(after.fullFogDraws,original.fullFogDraws);
 assert.equal(after.staticDraws,original.staticDraws);
 assert.equal(after.spriteCreates,original.spriteCreates);
 assert.equal(after.spriteRemoves,original.spriteRemoves);
 assert.equal(after.spritePaints,original.spritePaints);
 assert.equal(after.rosterReconciliations,original.rosterReconciliations);
 assert.equal(after.terrainAssignments,1);
 assert.ok(after.fogPaintedCells-original.fogPaintedCells<=400,
  'single changed corner and feather may repaint at most 4 cells per update');
 ctx.renderer.dispose();
});
test('Phase 5 same roster may still hide and reveal a token only from certified fog',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const node=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(node.style.visibility,'visible');
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:6,visionEpoch:7,visiblePieces:[hero],
  visible:allCells.filter(x=>x!==22)
 })),true);
 ctx.clock.flush(1030);
 assert.equal(node.style.visibility,'hidden',
  'hidden centre must remain concealed even with unchanged roster');
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),node);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:7,visionEpoch:8,visiblePieces:[hero]
 })),true);
 ctx.clock.flush(1060);
 assert.equal(node.style.visibility,'visible');
 assert.equal(ctx.renderer.stats.spriteCreates,1);
 assert.equal(ctx.renderer.stats.spriteRemoves,0);
 assert.equal(ctx.renderer.stats.staticDraws,1);
 ctx.renderer.dispose();
});
test('Phase 5 multiple fog updates coalesce before RAF without stale pixels',()=>{
 const ctx=make();activate(ctx,scene(),sight({visiblePieces:[hero]}));
 const before=ctx.renderer.stats,requested=ctx.clock.requests;
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:6,visionEpoch:7,visiblePieces:[hero],
  visible:allCells.filter(x=>x!==99)
 })),true);
 assert.equal(ctx.clock.queued,1);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:7,visionEpoch:8,visiblePieces:[hero]
 })),true);
 ctx.clock.flush(1040);
 assert.equal(ctx.renderer.stats.fogDraws,before.fogDraws,
  'only the net difference from the already painted raster matters');
 assert.equal(ctx.renderer.stats.spritePaints,before.spritePaints);
 assert.equal(ctx.clock.queued,0);
 assert.equal(ctx.clock.requests,requested+1);
 ctx.renderer.dispose();
});
test('Phase 5 cursor-only and fog-only sight avoid observer roster reconciling',()=>{
 const ctx=make();activate(ctx);
 const base=ctx.renderer.stats;
 for(let i=0;i<100;i++){
  assert.equal(ctx.renderer.adoptVisibility(sight({
   cursor:6+i,visionEpoch:7+i
  })),true);
 }
 assert.equal(ctx.renderer.stats.rosterReconciliations,base.rosterReconciliations);
 assert.equal(ctx.renderer.stats.fogMaskReuses-base.fogMaskReuses,100);
 assert.equal(ctx.clock.queued,0);
 ctx.renderer.dispose();
});
test('Phase 5 dirty rectangles are bounded and cannot leave older bright pixels',()=>{
 const a=normalizeWorldVisibilityFrame(sight({
  visible:[22],explored:[22],visiblePieces:[]
 }),mapId,viewerId);
 const b=normalizeWorldVisibilityFrame(sight({
  visible:[],explored:[22],visiblePieces:[]
 }),mapId,viewerId);
 const canvas=fakeCanvas(),oldMask=makeWorldFogMask(a),mask=makeWorldFogMask(b);
 assert.equal(paintWorldFogLayer({canvas,frame:a,mask:oldMask,
  widthPx:1000,heightPx:1000}).full,true);
 const start=canvas.calls.length;
 const diff={full:false,rects:[{x:2,y:2,width:1,height:1}]};
 const result=paintWorldFogLayer({canvas,frame:b,mask,
  previousMask:oldMask,dirty:diff,widthPx:1000,heightPx:1000});
 assert.equal(result.cells,9);
 assert.equal(result.full,false);
 assert.ok(!canvas.calls.slice(start).some(call=>call[0]==='clear'&&
  call[1]===0&&call[2]===0),'unrelated pixels remain cached');
 const bad=paintWorldFogLayer({canvas,frame:b,mask,
  previousMask:oldMask,dirty:{full:false,rects:[{x:-1,y:0,width:1,height:1}]},
  widthPx:1000,heightPx:1000});
 assert.equal(bad.full,true,'invalid dirty metadata must repaint all known mask');
 assert.equal(bad.cells,100);
 assert.equal(canvas.style.backgroundColor,'transparent');
});

test('Phase 5 500-sprite fog change paints only affected authorized piece',()=>{
 const ctx=make();
 const rows=Array.from({length:500},(_,i)=>({
  kind:'token',id:'40000000-0000-4000-8000-'+String(i).padStart(12,'0'),
  x:i===0?8:1,y:i===0?8:1
 }));
 assert.equal(ctx.renderer.adoptScene(scene()),true);
 assert.equal(ctx.renderer.adoptVisibility(sight({visiblePieces:rows})),true);
 ctx.clock.flush(1000);
 ctx.renderer.setTerrainSource('https://example.test/map.png');
 const watched=ctx.renderer.getSpriteElement('token',rows[0].id);
 const unaffected=ctx.renderer.getSpriteElement('token',rows[1].id);
 const before=ctx.renderer.stats;
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:6,visionEpoch:7,visiblePieces:rows,
  visible:allCells.filter(cell=>cell!==88)
 })),true);
 ctx.clock.flush(1040);
 const after=ctx.renderer.stats;
 assert.equal(watched.style.visibility,'hidden',
  'server-concealed cell must hide the affected token immediately at RAF');
 assert.equal(unaffected.style.visibility,'visible');
 assert.equal(ctx.renderer.getSpriteElement('token',rows[0].id),watched);
 assert.equal(ctx.renderer.getSpriteElement('token',rows[1].id),unaffected);
 assert.equal(after.spritePaints-before.spritePaints,1,
  '499 unchanged sprites must never repaint on a distant fog change');
 assert.equal(after.rosterReconciliations,before.rosterReconciliations);
 assert.equal(after.spriteCreates,500);
 assert.equal(after.spriteRemoves,0);
 assert.equal(after.fullFogDraws,before.fullFogDraws);
 assert.equal(after.staticDraws,before.staticDraws);
 assert.equal(after.terrainAssignments,1);
 assert.ok(after.fogPaintedCells-before.fogPaintedCells<=9);
 ctx.renderer.dispose();
});

test('live regression: observer walks into new vision before sight arrives; keep map fully mounted',()=>{
 const ctx=make();
 const old=sight({visible:[22,23],explored:[22,23],visiblePieces:[hero]});
 activate(ctx,scene(),old);
 ctx.renderer.setTerrainSource('https://example.test/map.png');
 const sprite=ctx.renderer.getSpriteElement('token',hero.id);
 const start=ctx.renderer.stats;
 assert.equal(sprite.style.visibility,'visible');
 assert.equal(ctx.renderer.applyObserverPath(path(hero,[[2,2],[3,2],[4,2]]),
  {mapId,seq:6}),true);
 assert.equal(ctx.renderer.awaitingFreshVision,true);
 assert.deepEqual(ctx.resync,['observer-path-await-vision']);
 assert.equal(ctx.renderer.authorized,true,'no security revocation on ordinary fog latency');
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),sprite);
 assert.equal(position(sprite),'200px 200px','never reveal new cell before server sight');
 assert.equal(ctx.renderer.stats.fullFogDraws,start.fullFogDraws);
 assert.equal(ctx.renderer.stats.spriteRemoves,start.spriteRemoves);
 assert.equal(ctx.renderer.stats.terrainAssignments,start.terrainAssignments);
 assert.equal(ctx.surfaces.fogCanvas.style.backgroundColor,'transparent');
 const fresh=sight({cursor:6,visionEpoch:7,
  visible:[22,23,24],explored:[22,23,24],
  visiblePieces:[{...hero,x:4,y:2}]});
 assert.equal(ctx.renderer.adoptVisibility(fresh),true);
 ctx.clock.flush(1060);
 assert.equal(ctx.renderer.awaitingFreshVision,false);
 assert.equal(ctx.renderer.getSpriteElement('token',hero.id),sprite);
 assert.equal(position(sprite),'400px 200px','new canonical position comes only from signed sight');
 assert.equal(ctx.renderer.stats.staticDraws,start.staticDraws);
 assert.equal(ctx.renderer.stats.spriteCreates,start.spriteCreates);
 assert.equal(ctx.renderer.stats.spriteRemoves,start.spriteRemoves);
 assert.equal(ctx.renderer.stats.fullFogDraws,start.fullFogDraws);
 assert.equal(ctx.renderer.stats.terrainAssignments,start.terrainAssignments);
 ctx.renderer.dispose();
});
test('live regression: burst of 100 ahead-of-sight paths triggers one sight refresh, never blacks the map',()=>{
 const ctx=make();activate(ctx,scene(),
  sight({visible:[22],explored:[22],visiblePieces:[hero]}));
 const sprite=ctx.renderer.getSpriteElement('token',hero.id);
 const base=ctx.renderer.stats;
 for(let i=0;i<100;i++){
  const route=i%2?[[3,2],[4,2]]:[[2,2],[3,2]];
  assert.equal(ctx.renderer.applyObserverPath(path(hero,route),
   {mapId,seq:6+i}),true);
 }
 ctx.clock.flush(1100);
 assert.equal(ctx.renderer.awaitingFreshVision,true);
 assert.deepEqual(ctx.resync,['observer-path-await-vision']);
 assert.equal(ctx.renderer.authorized,true);
 assert.equal(position(sprite),'200px 200px');
 assert.equal(ctx.renderer.stats.fullFogDraws,base.fullFogDraws);
 assert.equal(ctx.renderer.stats.spriteRemoves,base.spriteRemoves);
 assert.equal(ctx.renderer.stats.fogDraws,base.fogDraws);
 assert.equal(ctx.clock.queued,0);
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:105,visionEpoch:106,visible:[22,23],
  explored:[22,23],visiblePieces:[{...hero,x:3,y:2}]
 })),true);
 ctx.clock.flush(1160);
 assert.equal(ctx.renderer.awaitingFreshVision,false);
 assert.equal(ctx.renderer.authorized,true);
 assert.equal(position(sprite),'300px 200px');
 ctx.renderer.dispose();
});
test('live regression: waiting for vision never bypasses a genuine permission revoke',()=>{
 const ctx=make();activate(ctx,scene(),sight({
  visible:[22],explored:[22],visiblePieces:[hero]
 }));
 const sprite=ctx.renderer.getSpriteElement('token',hero.id);
 assert.equal(ctx.renderer.applyObserverPath(path(hero,[[2,2],[3,2]]),
  {mapId,seq:6}),true);
 assert.equal(ctx.renderer.awaitingFreshVision,true);
 ctx.renderer.revoke('disconnected',true);
 assert.equal(ctx.renderer.authorized,false);
 assert.equal(ctx.renderer.awaitingFreshVision,false);
 assert.equal(sprite.parentNode,null);
 assert.equal(ctx.surfaces.fogCanvas.style.backgroundColor,'#040914');
 assert.equal(ctx.renderer.adoptVisibility(sight({
  cursor:6,visionEpoch:7,visiblePieces:[hero]
 })),false,'sight alone cannot grant access without a new published scene');
 ctx.renderer.dispose();
});
test('live regression: DM editor overlay is mounted only in explicit edit mode',()=>{
 const source=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(source,/isDM&&!dmPreview&&editor\?\.enabled&&environment&&<MapEnvironmentOverlay/);
 assert.match(source,/if\(reason==='observer-path-await-vision'\)/);
 assert.match(source,/refreshVisibility\('observer-path-await-vision'\)/);
});
