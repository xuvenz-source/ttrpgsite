import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {certifyViewerMotion,certifiedMotionMatchesSight,
 certifiedMotionPaintAllowed}
 from '../src/engine/v2/CertifiedMotionPresentation.js';
import {createMovementController}
 from '../src/engine/v2/MovementController.js';
import {createWorldRenderer} from '../src/engine/v2/WorldRenderer.js';

const MAP='10000000-0000-4000-8000-000000000001';
const VIEWER='30000000-0000-4000-8000-000000000001';
const TOKEN='40000000-0000-4000-8000-000000000001';
const TOOL='50000000-0000-4000-8000-000000000001';
const OTHER='40000000-0000-4000-8000-000000000002';
const point=(x,y)=>({x,y}),sel=[{kind:'token',id:TOKEN}];
const cells=Array.from({length:100},(_,i)=>i);
const allQuads=[[1,1],[1,-1],[-1,1],[-1,-1]];
const baseScene=()=>({
 version:2,mapId:MAP,scope:'viewer',published:true,
 revision:7,sceneGeneration:2,rulesRevision:5,
 fogEnabled:true,collisionEnabled:true,ambient:25,
 effects:{weather:'none',intensity:0},
 dimensions:{width:1000,height:1000,gridSize:100},environment:null
});
function sight({cursor=4,visionEpoch=5,permissionGeneration=3,
 predictionGrants,visiblePieces}={}){
 return {version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',
  cursor,visionEpoch,environmentRevision:7,permissionGeneration,
  sceneGeneration:2,enabled:true,width:10,height:10,partyShared:false,
  visible:cells,explored:cells,
  visiblePieces:visiblePieces??[
   {kind:'token',id:TOKEN,x:2,y:2},
   {kind:'tool',id:TOOL,x:4,y:4}
  ],
  predictionGrants:predictionGrants??[
   {kind:'token',id:TOKEN,x:2,y:2,quadrants:[[1,1],[1,-1]]},
   {kind:'tool',id:TOOL,x:4,y:4,quadrants:allQuads}
  ]
 };
}
const req=(pointer,selection=sel,from=point(2,2))=>({
 mapId:MAP,selection,from,pointer,mode:'drag',
 environmentRevision:7,permissionGeneration:3
});
const certify=(pointer,selection=sel,frame=sight(),from=point(2,2))=>
 certifyViewerMotion({frame,scene:baseScene(),request:req(pointer,selection,from)});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function surfaces(){
 const canvas=()=>({
  width:0,height:0,style:{},
  getContext:()=>({
   clearRect(){},fillRect(){},save(){},restore(){},setTransform(){},
   beginPath(){},clip(){},rect(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},
   createLinearGradient(){return {addColorStop(){}}},
   createRadialGradient(){return {addColorStop(){}}}
  })
 });
 const host={style:{},children:[],ownerDocument:{
  createElement:()=>({style:{},dataset:{},parentNode:null})
 },appendChild(node){node.parentNode=this;this.children.push(node)},
 removeChild(node){const i=this.children.indexOf(node);if(i>=0)this.children.splice(i,1);node.parentNode=null}};
 return {terrain:{style:{},src:'',removeAttribute(){}},
  staticCanvas:canvas(),fogCanvas:canvas(),spriteHost:host,
  viewport:{style:{}}};
}
function rendererFixture(){
 const frames=[],s=surfaces(),r=createWorldRenderer({
  mapId:MAP,viewerId:VIEWER,surfaces:s,
  requestFrame:fn=>{frames.push(fn);return frames.length},
  cancelFrame:()=>{}
 });
 const flush=now=>{while(frames.length)frames.shift()(now)};
 assert.equal(r.adoptScene(baseScene()),true);
 assert.equal(r.adoptVisibility(sight()),true);
 flush(1000);
 const sprite=r.getSpriteElement('token',TOKEN);
 assert.ok(sprite);
 return {r,s,flush,sprite};
}
const grabbed=(gestureId=1)=>({
 type:'grabbed',mapId:MAP,gestureId,selection:sel,
 approved:point(2,2),presented:point(2,2)
});
const predicted=(cert,gestureId=1)=>({
 type:'presented',mapId:MAP,gestureId,selection:sel,
 predicted:true,approved:point(2,2),presented:cert.position,
 from:point(2,2),certificate:cert
});

test('B06 permits instant one-cell fractional movement only inside signed quadrant',()=>{
 const certificate=certify(point(2.66,2.35));
 assert.ok(certificate);
 assert.deepEqual(certificate.position,point(2.66,2.35));
 assert.deepEqual(certificate.from,point(2,2));
 assert.equal(Object.isFrozen(certificate),true);
 assert.equal(Object.isFrozen(certificate.position),true);
 assert.equal(certifiedMotionPaintAllowed({
  certificate,frame:sight(),scene:baseScene(),mapId:MAP,
  selection:sel,approved:point(2,2),presented:point(2.66,2.35)
 }),true);
 assert.equal(certify(point(1.6,2.3)),null,
  'westward movement is not in the server-authorized quadrant set');
 assert.equal(certify(point(3.2,2)),null,
  'cannot extrapolate beyond one cell even when grant is eastward');
 assert.equal(certify(point(2,2)),null,'no-op must not manufacture permission');
});

test('B06 rejects stale permission, scene, viewer, cursor, epoch and wrong session anchor',()=>{
 const c=certify(point(2.5,2.2));
 assert.ok(c);
 for(const frame of [
  {...sight(),cursor:5},{...sight(),visionEpoch:6},
  {...sight(),permissionGeneration:4},
  {...sight(),viewerId:'30000000-0000-4000-8000-000000000099'},
  {...sight(),environmentRevision:8},
  {...sight(),sceneGeneration:3}
 ])assert.equal(certifiedMotionMatchesSight(c,frame,baseScene()),false);
 assert.equal(certifiedMotionPaintAllowed({
  certificate:c,frame:sight(),scene:baseScene(),mapId:MAP,
  selection:sel,approved:point(3,2),presented:c.position
 }),false);
 assert.equal(certifyViewerMotion({frame:sight(),
  scene:{...baseScene(),revision:8},request:req(point(2.3,2.3))}),null);
 assert.equal(certifyViewerMotion({frame:sight(),
  scene:{...baseScene(),published:false},request:req(point(2.3,2.3))}),null);
});

test('B06 missing grants and hidden/unowned actor are never locally predicted',()=>{
 const c=point(2.3,2.25);
 assert.equal(certify(c,sel,sight({predictionGrants:[]})),null);
 assert.equal(certify(c,[{kind:'token',id:OTHER}]),null);
 assert.equal(certify(c,sel,sight({visiblePieces:[{kind:'token',id:OTHER,x:2,y:2}]})),null);
 assert.equal(certify(c,sel,sight({predictionGrants:[
  {kind:'token',id:TOKEN,x:3,y:2,quadrants:[[1,1]]}
 ]})),null);
 assert.equal(certifyViewerMotion({frame:sight(),
  scene:baseScene(),request:{...req(c),mapId:OTHER}}),null);
});

test('B06 group needs separate signed grant for every piece, cannot infer DM exception',()=>{
 const group=[{kind:'token',id:TOKEN},{kind:'tool',id:TOOL}];
 assert.ok(certify(point(2.4,2.1),group),
  'two signed grant records authorize one rigid fractional translation');
 const withoutTool=sight({predictionGrants:[
  {kind:'token',id:TOKEN,x:2,y:2,quadrants:[[1,1]]}
 ]});
 assert.equal(certify(point(2.4,2.1),group,withoutTool),null);
 assert.equal(certify(point(2.4,2.1),[
  ...group,{kind:'token',id:TOKEN}
 ]),null,'duplicate group member cannot reuse a single grant');
 assert.equal(certifyViewerMotion({frame:{...sight(),scope:'dm'},
  scene:{...baseScene(),scope:'dm'},request:req(point(2.4,2.1))}),null);
});

test('B06 altered one-way/hidden wall geometry is never supplied by the client',()=>{
 const requested={...req(point(2.4,2.4)),privateWalls:[],
  collisionOverride:true,hiddenNpc:{kind:'token',id:OTHER}};
 const certificate=certifyViewerMotion({
  frame:sight(),scene:baseScene(),request:requested
 });
 assert.ok(certificate,'only server-authorized sight + grant decide cosmetic movement');
 assert.equal(JSON.stringify(certificate).includes('privateWalls'),false);
 assert.equal(JSON.stringify(certificate).includes('hiddenNpc'),false);
 assert.equal(JSON.stringify(certificate).includes('collisionOverride'),false);
 const denied=sight({predictionGrants:[{
  kind:'token',id:TOKEN,x:2,y:2,quadrants:[[-1,1]]
 }]});
 assert.equal(certifyViewerMotion({
  frame:denied,scene:baseScene(),request:requested
 }),null,'client extra properties cannot override the denied quadrant');
});

test('B06 renderer validates source sight before moving an existing sprite, never mounts hidden NPC',()=>{
 const {r,s,flush,sprite}=rendererFixture();
 const c=certify(point(2.5,2.4));
 const old=r.stats;
 assert.equal(r.applyLocalMovement(grabbed()),true);
 assert.equal(r.applyLocalMovement(predicted(c)),true);
 flush(1100);
 assert.equal(sprite.style.translate,'250px 240px');
 assert.equal(r.getSpriteElement('token',OTHER),null);
 assert.equal(r.stats.spriteCreates,old.spriteCreates);
 assert.equal(r.stats.terrainAssignments,old.terrainAssignments);
 r.dispose();
});

test('B06 renderer rejects forged grant, wrong viewer and wrong approved anchor',()=>{
 const {r,flush,sprite}=rendererFixture();
 assert.equal(r.applyLocalMovement(grabbed()),true);
 const c=certify(point(2.8,2.2));
 assert.equal(r.applyLocalMovement(predicted({...c,viewerId:OTHER})),false);
 assert.equal(r.applyLocalMovement(predicted({...c,
  position:point(3.5,2.2)})),false);
 assert.equal(r.applyLocalMovement({
  ...predicted(c),approved:point(3,2)
 }),true,
  'the renderer validates local.approved against certificate, not caller-reported approved');
 flush(1100);
 assert.equal(sprite.style.translate,'280px 220px');
 assert.equal(r.applyLocalMovement({type:'presentation-reset',mapId:MAP,
  gestureId:1,approved:point(2,2),selection:sel}),true);
 flush(1120);
 assert.equal(sprite.style.translate,'200px 200px');
 r.dispose();
});

test('B06 renderer immediately retracts predicted sprite on newer sight epoch/cursor',()=>{
 const {r,flush,sprite}=rendererFixture();
 const c=certify(point(2.5,2.2));
 r.applyLocalMovement(grabbed());r.applyLocalMovement(predicted(c));
 flush(1100);
 assert.equal(sprite.style.translate,'250px 220px');
 assert.equal(r.adoptVisibility(sight({cursor:5,visionEpoch:6})),true);
 flush(1110);
 assert.equal(sprite.style.translate,'200px 200px');
 assert.equal(r.stats.spriteCreates,1,'no remount while the sight changes');
 r.dispose();
});

test('B06 renderer retracts position even if grant disappears with same sight cursor',()=>{
 const {r,flush,sprite}=rendererFixture();
 const c=certify(point(2.5,2.5));
 r.applyLocalMovement(grabbed());r.applyLocalMovement(predicted(c));
 flush(1100);
 assert.equal(sprite.style.translate,'250px 250px');
 assert.equal(r.adoptVisibility(sight({predictionGrants:[]})),true);
 flush(1110);
 assert.equal(sprite.style.translate,'200px 200px');
 r.dispose();
});

test('B06 blocked crossing cannot retain speculative position after server ACK',()=>{
 const {r,flush,sprite}=rendererFixture();
 const c=certify(point(2.55,2.4));
 r.applyLocalMovement(grabbed());r.applyLocalMovement(predicted(c));
 flush(1100);
 assert.equal(r.applyLocalMovement({
  type:'blocked',mapId:MAP,gestureId:1,
  approved:point(2,2),from:point(2,2),accepted:[]
 }),true);
 flush(1120);
 assert.equal(sprite.style.translate,'200px 200px');
 r.dispose();
});

test('B06 controller invalidates local certificate immediately on sight/permission loss',async()=>{
 let advance,beginCount=0,commits=0;const events=[];
 const authority={
  begin:async()=>{beginCount++;return {version:2,sessionId:'v2-b06'}},
  advance:()=>new Promise(resolve=>{advance=resolve}),
  commit:async()=>{commits++;return null},cancel:async()=>true
 };
 const c=createMovementController({
  authority,certifiedMotion:true,
  certifyPresentation:request=>certifyViewerMotion({
   frame:sight(),scene:baseScene(),request
  }),
  onEvent:event=>events.push(event)
 });
 c.beginGesture({mapId:MAP,origin:point(2,2),pointer:point(2,2),
  selection:sel,environmentRevision:7,permissionGeneration:3});
 assert.equal(c.updateGesture(point(2.5,2.25)),true);
 assert.equal(events.at(-1).type,'presented');
 assert.deepEqual(events.at(-1).presented,point(2.5,2.25));
 assert.equal(c.syncCertifiedSight({frame:sight({cursor:5}),scene:baseScene()}),false);
 assert.equal(events.at(-1).type,'presentation-reset');
 assert.deepEqual(events.at(-1).presented,point(2,2));
 await tick();
 assert.equal(beginCount,1);
 assert.equal(typeof advance,'function');
 advance({version:2,sessionId:'v2-b06',seq:1,blocked:true,accepted:[]});
 await tick();
 assert.equal(commits,0);
 c.cancelGesture('permission');c.dispose();
});

test('B06 controller never predicts outside the grant and rejects stale ACK updates',async()=>{
 const events=[];
 let resolveAdvance;
 const authority={begin:async()=>({version:2,sessionId:'v2-b06'}),
  advance:()=>new Promise(resolve=>{resolveAdvance=resolve}),
  commit:async()=>({version:2,sessionId:'v2-b06',seq:2,endpoint:point(2,2)}),
  cancel:async()=>true};
 const c=createMovementController({authority,certifiedMotion:true,
  certifyPresentation:request=>certifyViewerMotion({
   frame:sight(),scene:baseScene(),request
  }),onEvent:e=>events.push(e)});
 c.beginGesture({mapId:MAP,origin:point(2,2),pointer:point(2,2),
  selection:sel,environmentRevision:7,permissionGeneration:3});
 c.updateGesture(point(2.6,2.3));
 assert.equal(events.at(-1).type,'presented');
 c.updateGesture(point(4,2.3));
 assert.equal(events.at(-1).type,'presentation-reset');
 await tick();
 assert.equal(typeof resolveAdvance,'function');
 c.cancelGesture('permission');
 resolveAdvance({version:2,sessionId:'v2-b06',seq:1,
  blocked:false,accepted:[point(3,2)]});
 await tick();
 assert.equal(c.active,false);
 assert.equal(events.some(e=>e.type==='committed'),false);
 c.dispose();
});

test('B06 feature is disabled by default, no SQL/Realtime write or independent animation timer',()=>{
 const runtime=readFileSync(new URL(
  '../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 const controller=readFileSync(new URL(
  '../src/engine/v2/MovementController.js',import.meta.url),'utf8');
 const helper=readFileSync(new URL(
  '../src/engine/v2/CertifiedMotionPresentation.js',import.meta.url),'utf8');
 assert.match(runtime,/VITE_WORLD_V2_CERTIFIED_MOTION==='1'/);
 assert.match(controller,/certifiedMotion=false,certifyPresentation=\(\)=>null/);
 assert.doesNotMatch(helper,/\.rpc\(|realtime\.send|db\.channel|setInterval|setTimeout/);
 assert.match(runtime,/certifiedMotion:!isDM&&!dmPreview/);
});
