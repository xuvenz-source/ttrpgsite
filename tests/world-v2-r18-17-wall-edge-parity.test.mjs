import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 compileCollisionScene,solveCollisionPath,collisionAllowsStep
} from '../src/engine/v2/CollisionSolver.js';
import {
 segmentCrossesSweptFootprintWithClearance,
 WORLD_V2_WALL_EDGE_CLEARANCE_CELLS
} from '../src/engine/v2/CollisionGeometry.js';
import {createCollisionPredictor} from '../src/engine/v2/CollisionPreflight.js';

const map={id:'wall-r18-17-map',width:1000,height:1000,grid_size:100};
const pt=(x,y)=>({x,y});
const wall=(x,type='wall',other={})=>({
 type,points:[pt(x,0),pt(x,10)],blocksMovement:true,...other
});
const hero=(extra={})=>({kind:'token',id:'actor',x:0,y:1,spanX:1,spanY:1,...extra});
function scene(x,clearanceCells=0,opts={}){
 return compileCollisionScene({
  map,environment:{objects:[wall(x)]},
  revision:4,collisionEnabled:true,scope:'dm',
  clearanceCells,...opts
 });
}
function move(x,clearanceCells=0,from=pt(0,1),to=pt(1,1),pieces=[hero()]){
 return solveCollisionPath({scene:scene(x,clearanceCells),pieces,
  from,to,allowSliding:false,maxSlides:0});
}
test('R18-17 strict mode stays default and blocks a 5% wall edge contact',()=>{
 assert.equal(WORLD_V2_WALL_EDGE_CLEARANCE_CELLS,.1);
 assert.equal(move(1.95).blocked,true);
 assert.equal(scene(1.95).clearanceCells,0);
 assert.equal(collisionAllowsStep({scene:scene(1.95),pieces:[hero()],
  from:pt(0,1),to:pt(1,1)}),false);
});
test('R18-17 opt-in clearance accepts 5% far-edge clip but not 20%',()=>{
 assert.equal(move(1.95,.1).complete,true);
 assert.equal(move(1.8,.1).blocked,true);
 assert.equal(collisionAllowsStep({scene:scene(1.95,.1),pieces:[hero()],
  from:pt(0,1),to:pt(1,1)}),true);
});
test('R18-17 actual thin-wall crossing remains blocked at every speed',()=>{
 assert.equal(move(1.05,.1).blocked,true);
 assert.equal(move(1.95,.1,pt(0,1),pt(4,1)).blocked,true);
 assert.equal(move(1.95,.1,pt(1,1),pt(3,1),[hero({x:1})]).blocked,true);
 for(const x of [.5,1.0,1.3,1.5,1.8]){
  assert.equal(move(x,.1).blocked,true,'wall '+x+' must remain solid');
 }
});
test('R18-17 pure geometry denies diagonal thin-wall cross and allows boundary touch',()=>{
 const a=pt(1.5,0),b=pt(1.5,3);
 assert.equal(segmentCrossesSweptFootprintWithClearance(
  a,b,pt(0,0),pt(1,1),1,1,.1),true);
 assert.equal(segmentCrossesSweptFootprintWithClearance(
  pt(2,0),pt(2,3),pt(0,0),pt(1,0),1,1,.1),false);
});
test('R18-17 same 0.10-grid-unit clearance for large and mixed group pieces',()=>{
 const big=hero({spanX:2,spanY:2});
 assert.equal(move(2.95,.1,pt(0,1),pt(1,1),[big]).complete,true);
 assert.equal(move(2.75,.1,pt(0,1),pt(1,1),[big]).blocked,true);
 const token=hero();
 const tool={kind:'tool',id:'mule',x:0,y:1,spanX:2,spanY:1};
 const comp=scene(2.75,.1);
 const result=solveCollisionPath({scene:comp,pieces:[token,tool],
  from:pt(0,1),to:pt(1,1),allowSliding:false});
 assert.equal(result.blocked,true,'group moves atomically; wide tool blocks');
});
test('R18-17 open doors, conditional permissions and map bounds stay independent',()=>{
 const open=compileCollisionScene({map,environment:{objects:[
  wall(1.5,'door',{state:'open'})
 ]},revision:4,collisionEnabled:true,scope:'dm',clearanceCells:.1});
 const closed=compileCollisionScene({map,environment:{objects:[
  wall(1.5,'door',{state:'closed'})
 ]},revision:4,collisionEnabled:true,scope:'dm',clearanceCells:.1});
 assert.equal(collisionAllowsStep({scene:open,pieces:[hero()],
  from:pt(0,1),to:pt(2,1)}),true);
 assert.equal(collisionAllowsStep({scene:closed,pieces:[hero()],
  from:pt(0,1),to:pt(2,1)}),false);
 const border=solveCollisionPath({scene:scene(9.95,.1),
  pieces:[hero({x:9})],from:pt(9,1),to:pt(10,1),allowSliding:false});
 assert.equal(border.blocked,true,
  'wall clearance must not shrink the FULL footprint for map bounds');
});
test('R18-17 invalid or unsupported margin cannot silently authorize an unknown wall',()=>{
 for(const c of [-.1,.05,.1001,NaN,'0.1',Infinity]){
  assert.equal(scene(1.95,c),null);
  assert.equal(segmentCrossesSweptFootprintWithClearance(
   pt(1.95,0),pt(1.95,10),pt(0,1),pt(1,1),1,1,c),true);
 }
 assert.equal(segmentCrossesSweptFootprintWithClearance(
  pt(Infinity,0),pt(2,2),pt(0,1),pt(1,1),1,1,.1),true);
 assert.equal(segmentCrossesSweptFootprintWithClearance(
  pt(1.95,0),pt(1.95,10),pt(0,1),pt(1,1),-1,1,.1),true);
});
test('R18-17 disclosed private scene still needs independent signed grant',()=>{
 const opt=scene(1.95,.1, {scope:'disclosed'});
 const predictor=createCollisionPredictor({
  scene:opt,mapId:map.id,pieces:[hero()],
  permissionGeneration:6,authorizePath:()=>false
 });
 const request={mapId:map.id,selection:[{kind:'token',id:'actor'}],
  from:pt(0,1),pointer:pt(1,1),
  environmentRevision:4,permissionGeneration:6};
 assert.equal(predictor(request),false);
 assert.equal(predictor({...request,permissionGeneration:7}),false);
 assert.equal(predictor({...request,mapId:'private-map'}),false);
 assert.equal(predictor({...request,selection:[{kind:'token',id:'unseen'}]}),false);
});
test('R18-17 server-equivalent candidate is NO-MIGRATION and both helpers preserve SQL invoker semantics',()=>{
 const sql=readFileSync(new URL(
  '../supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql',import.meta.url),'utf8');
 for(const name of ['forge_world_v2','forge_visibility']){
  assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION '+name+
   '\\.swept_hits_segment\\('));
 }
 assert.equal((sql.match(/RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=''/g)||[]).length,2);
 assert.equal((sql.match(/least\\(0\\.10,w\\/4\\.0\\)/g)||[]).length,2);
 assert.doesNotMatch(sql,/CREATE TABLE|GRANT |DROP FUNCTION|ALTER POLICY|SECURITY DEFINER/i);
 assert.match(sql,/NOT A VERSIONED MIGRATION/);
});
test('R18-17 active runtime is still strict default until a real server compatibility gate',()=>{
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 const engine=readFileSync(new URL('../src/engine/v2/SceneManager.js',
  import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/clearanceCells:\s*0\\.1/);
 assert.doesNotMatch(engine,/clearanceCells:\s*0\\.1/);
 assert.equal(scene(1.95).clearanceCells,0);
});
