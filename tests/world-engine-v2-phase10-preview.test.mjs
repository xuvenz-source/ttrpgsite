import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileCollisionScene} from '../src/engine/v2/CollisionSolver.js';
import {createPreviewAuthority} from '../src/engine/v2/PreviewAuthority.js';
import {createVisibilityController} from '../src/engine/v2/VisibilityController.js';
import {createInputController} from '../src/engine/v2/InputController.js';

const mapId='10000000-0000-4000-8000-000000000001';
const viewerId='30000000-0000-4000-8000-000000000001';
const tokenId='40000000-0000-4000-8000-000000000001';
const piece={kind:'token',id:tokenId,x:2,y:2,spanX:1,spanY:1};
const makeScene=objects=>compileCollisionScene({
 map:{id:mapId,width:1000,height:1000,grid_size:100},
 environment:{objects},revision:9,scope:'dm',collisionEnabled:true
});
test('DM preview accepts only collision-safe local motion and never commits',async()=>{
 const scene=makeScene([]),p=createPreviewAuthority({
  getScene:()=>scene,getPieces:()=>[piece],getPosition:()=>null
 });
 const session=await p.begin({mode:'preview',mapId,origin:{x:2,y:2},
  selection:[{kind:'token',id:tokenId}]});
 const step=await p.advance({sessionId:session.sessionId,mapId,seq:1,
  from:{x:2,y:2},targets:[{x:3,y:2}]});
 assert.deepEqual(step.accepted,[{x:3,y:2}]);
 assert.equal(step.blocked,false);
 await assert.rejects(()=>p.commit(),/cannot commit/);
 await p.cancel({sessionId:session.sessionId});
 p.dispose();
 await assert.rejects(()=>p.begin({mode:'preview',mapId,
  origin:{x:2,y:2},selection:[{kind:'token',id:tokenId}]}));
});
test('virtual DM preview denies a solid wall crossing',async()=>{
 const wall={type:'wall',points:[{x:4,y:0},{x:4,y:10}],
  blocksMovement:true};
 const p=createPreviewAuthority({getScene:()=>makeScene([wall]),
  getPieces:()=>[piece],getPosition:()=>null});
 const s=await p.begin({mode:'preview',mapId,origin:{x:2,y:2},
  selection:[{kind:'token',id:tokenId}]});
 const result=await p.advance({sessionId:s.sessionId,mapId,seq:1,
  from:{x:2,y:2},targets:[{x:3,y:2},{x:4,y:2}]});
 assert.equal(result.blocked,true);
 assert.ok(result.accepted.length<2);
 p.dispose();
});
test('preview visibility RPC never uses player realtime or mutable motion RPC',async()=>{
 const calls=[],at={tokenId,x:4,y:5};
 const frame={version:2,mapId,viewerId,scope:'viewer',cursor:0,
  environmentRevision:9,permissionGeneration:1,sceneGeneration:1,
  visionEpoch:1,enabled:true,width:10,height:10,partyShared:false,
  visible:[54],explored:[54],visiblePieces:[
   {kind:'token',id:tokenId,x:4,y:5}
  ]};
 const db={rpc:async(name,params)=>{
  calls.push([name,params]);return {data:frame,error:null};
 }};
 const c=createVisibilityController({
  db,mapId,viewerId,dmPreview:true,getPreviewPosition:()=>at
 });
 assert.equal((await c.refresh()).visiblePieces[0].x,4);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'preview_world_visibility_at_v2');
 assert.deepEqual(calls[0][1],{
  p_map:mapId,p_viewer:viewerId,p_token:tokenId,p_x:4,p_y:5
 });
 assert.ok(calls.every(([name])=>!name.includes('motion')));
 c.dispose();
});
test('pointer grab captures the DOM board, not the coordinate object',()=>{
 const handlers=new Map(),keys=new Map(),captures=[];
 const target={
  addEventListener:(name,fn)=>handlers.set(name,fn),
  removeEventListener:(name)=>handlers.delete(name),
  setPointerCapture:id=>captures.push(id),
  hasPointerCapture:id=>captures.includes(id),
  releasePointerCapture:id=>captures.splice(captures.indexOf(id),1)
 };
 const keyboardTarget={
  addEventListener:(n,fn)=>keys.set(n,fn),
  removeEventListener:n=>keys.delete(n)
 };
 const received=[];
 const controller={
  active:false,
  beginGesture:e=>{received.push(['begin',e]);return true},
  updateGesture:p=>{received.push(['move',p]);return true},
  endGesture:()=>Promise.resolve(),cancelGesture:()=>{}
 };
 const input=createInputController({target,keyboardTarget,controller,
  pointFromEvent:e=>e.point,
  resolveSelection:()=>({mapId,origin:{x:2,y:2},
   selection:[{kind:'token',id:tokenId}]})
 });
 input.mount();
 handlers.get('pointerdown')({
  button:0,pointerId:17,pointerType:'mouse',
  point:{x:2.25,y:2.3},preventDefault(){}
 });
 assert.deepEqual(captures,[17]);
 handlers.get('pointermove')({pointerId:17,
  point:{x:3.25,y:2.3},preventDefault(){}});
 assert.ok(Math.abs(received[1][1].x-3)<0.00001);
 handlers.get('pointerup')({pointerId:17,
  point:{x:3.25,y:2.3},preventDefault(){}});
 assert.deepEqual(captures,[]);
 input.unmount();
});
test('preview SQL is player-token bounded and does not persist exploration',async()=>{
 const sql=await readFile(new URL(
  '../supabase/migrations/20261109102100_world_engine_v2_visibility_snapshots.sql',
  import.meta.url),'utf8');
 assert.match(sql,/preview_world_visibility_at_v2/);
 assert.match(sql,/t.owner_id=p_viewer AND t.visible/);
 assert.match(sql,/p_store_exploration OR/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.preview_world_visibility_at_v2/);
 const board=await readFile(new URL(
  '../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(board,/isDM&&!dmPreview&&environment&&<MapEnvironmentOverlay/);
 assert.match(board,/isDM&&!dmPreview&&editor\?\.enabled/);
});

test('V2 keybindings never dispatch the legacy movement writer',async()=>{
 const app=await readFile(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const board=await readFile(new URL(
  '../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(app,/if\(WORLD_V2_CUTOVER\)v2StepHandler\.current/);
 assert.match(app,/else if\(simulated\)previewStepHandler\.current/);
 assert.match(app,/registerV2Step=useCallback/);
 assert.match(board,/keyboardTarget:noDuplicateKeyboard/);
 assert.match(board,/registerV2Step\(\(dx,dy,options\)=>stepper\.step/);
 assert.match(board,/createWorldKeyboardStepper\(/);
 assert.match(board,/runtime\.visibility\.frame/);
 assert.match(board,/selection:\[\{kind:'token',id:actor\.id\}\],mode:'preview'/);
});
