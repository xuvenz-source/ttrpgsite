import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 compileCollisionScene,collisionAllowsStep,solveCollisionPath
} from '../src/engine/v2/CollisionSolver.js';
import {
 segmentCrossesSweptFootprintWithClearance,
 WALL_EDGE_CLEARANCE_CELLS
} from '../src/engine/v2/CollisionGeometry.js';
import {
 evaluateWallEdgeClearance
} from '../scripts/qa/world-v2-wall-edge-clearance-research.mjs';

const pos=(x,y)=>({x,y});
const map={id:'map-R18-17-test',width:1000,height:1000,grid_size:100};
const wall=(x,start=0,end=10,extra={})=>({
 type:'wall',points:[pos(x,start),pos(x,end)],blocksMovement:true,...extra
});
const scene=(objects,wallClearanceCells=0,scope='dm')=>compileCollisionScene({
 map,environment:{objects},revision:8,collisionEnabled:true,
 scope,wallClearanceCells
});
const p=(x=0,y=0,extra={})=>({
 kind:'token',id:'token-R18-17',x,y,spanX:1,spanY:1,...extra
});
const allows=(s,from,to,pieces=[p(from.x,from.y)])=>
 collisionAllowsStep({scene:s,pieces,from,to});

test('R18-17 preserves strict-default wall collision until explicit opt-in',()=>{
 const strict=scene([wall(1.95)]),cleared=scene([wall(1.95)],0.10);
 assert.equal(WALL_EDGE_CLEARANCE_CELLS,0.10);
 assert.equal(strict.wallClearanceCells,0);
 assert.equal(cleared.wallClearanceCells,0.10);
 assert.equal(allows(strict,pos(0,0),pos(1,0)),false);
 assert.equal(allows(cleared,pos(0,0),pos(1,0)),true);
 assert.equal(scene([wall(1.95)],0.11),null);
 assert.equal(scene([wall(1.95)],-0.1),null);
 assert.equal(scene([wall(1.95)],NaN),null);
});
test('R18-17 never grants crossing a wall on the next step after shallow overlap',()=>{
 const s=scene([wall(1.95)],0.10);
 assert.equal(allows(s,pos(0,0),pos(1,0)),true);
 assert.equal(allows(s,pos(1,0),pos(2,0)),false);
 assert.equal(allows(s,pos(0,0),pos(8,0)),false,
  'full swept trajectory cannot skip the wall at high speed');
});
test('R18-17 ~20% near-far-edge overlap still blocks, genuine 5% front crossing blocks',()=>{
 assert.equal(allows(scene([wall(1.8)],0.10),pos(0,0),pos(1,0)),false);
 assert.equal(allows(scene([wall(1.05)],0.10),pos(0,0),pos(1,0)),false);
 assert.equal(allows(scene([wall(2)],0.10),pos(0,0),pos(1,0)),true);
});
test('R18-17 diagonal and thin solid intersecting interior stay blocked',()=>{
 const full=scene([wall(2,0,10)],0.10);
 assert.equal(allows(full,pos(0,0),pos(4,4)),false);
 const corner=scene([
  wall(2,0,2),{
   type:'wall',blocksMovement:true,
   points:[pos(0,2),pos(2,2)]
  }
 ],0.10);
 assert.equal(allows(corner,pos(0,0),pos(3,3)),false);
});
test('R18-17 shallow outer-graze change does not depend on private wall identity',()=>{
 const disclosed=scene([wall(1.95)],0.10,'disclosed');
 const blocked=scene([wall(1.5)],0.10,'disclosed');
 assert.equal(allows(disclosed,pos(0,0),pos(1,0)),true);
 assert.equal(allows(blocked,pos(0,0),pos(1,0)),false);
 assert.equal(scene([],0.10,'unknown'),null);
 // These are advisory calculations only, NEVER an authorization grant.
 assert.equal(JSON.stringify(solveCollisionPath({
  scene:blocked,pieces:[p()],from:pos(0,0),to:pos(2,0)
 })).includes('private-wall-id'),false);
});
test('R18-17 door, window and conditional passability remain identical',()=>{
 const closed={type:'door',state:'closed',blocksMovement:true,
  points:[pos(1.5,0),pos(1.5,10)]};
 assert.equal(allows(scene([closed],0.10),pos(0,0),pos(1,0)),false);
 assert.equal(allows(scene([{...closed,state:'open'}],0.10),pos(0,0),pos(1,0)),true);
 const window={...closed,type:'window',state:'closed',vision:'pass'};
 assert.equal(allows(scene([window],0.10),pos(0,0),pos(1,0)),false);
 assert.equal(allows(scene([{...window,state:'broken'}],0.10),pos(0,0),pos(1,0)),true);
 const conditional={...closed,attributeField:'STR',movementAt:15};
 assert.equal(allows(scene([conditional],0.10),pos(0,0),pos(1,0)),false);
 assert.equal(allows(scene([conditional],0.10),pos(0,0),pos(1,0),
  [p(0,0,{attributes:{STR:20}})]),true);
});
test('R18-17 large tokens, mixed group and unmodified map bounds remain safe',()=>{
 const s=scene([wall(2.95)],0.10);
 const wide=p(0,0,{spanX:2,spanY:2});
 assert.equal(allows(s,pos(0,0),pos(1,0),[wide]),true);
 assert.equal(allows(scene([wall(2.75)],0.10),pos(0,0),pos(1,0),[wide]),false);
 const group=[p(0,0),{kind:'tool',id:'other',x:1,y:0,spanX:1,spanY:1}];
 assert.equal(allows(scene([wall(2.75)],0.10),pos(0,0),pos(1,0),group),false,
  'one colliding group member blocks the whole rigid movement');
 const empty=scene([],0.10);
 assert.equal(allows(empty,pos(8,0),pos(10,0),[p(8,0)]),false,
  'wall clearance never shrinks the outer map bounds');
});
test('R18-17 research predicate and opt-in client result match for representative walls',()=>{
 for(const x of [0.25,0.5,0.95,1,1.05,1.5,1.8,1.89,1.9,1.95,1.99,2.0,2.1]){
  const original=evaluateWallEdgeClearance({
   wallStart:pos(x,0),wallEnd:pos(x,1),from:pos(0,0),to:pos(1,0)
  });
  const s=scene([wall(x,0,1)],0.10);
  assert.equal(allows(s,pos(0,0),pos(1,0)),!original.candidateBlocked,
   'mismatched research/swept client model at x='+x);
 }
});
test('R18-17 malformed scene or unexpected clearance fails closed',()=>{
 assert.equal(scene([{type:'wall',points:[pos(1,0)]}],0.10),null);
 assert.throws(()=>segmentCrossesSweptFootprintWithClearance(
  pos(1,0),pos(1,1),pos(0,0),pos(1,0),1,1,0.2),
  /Invalid R18-17 collision clearance contract/);
});
test('R18-17 runtime wall clearance is build-time opt-in and never installed merely by source staging',()=>{
 const runtime=readFileSync(new URL(
  '../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 const sceneMgr=readFileSync(new URL(
  '../src/engine/v2/SceneManager.js',import.meta.url),'utf8');
 const server=readFileSync(new URL(
  '../supabase/candidates/world_v2_r18_17_wall_clearance_parity.sql',import.meta.url),'utf8');
 const preserved=readFileSync(new URL(
  '../supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql',import.meta.url),'utf8');
 assert.match(runtime,/VITE_WORLD_V2_WALL_CLEARANCE==='1'/);
 assert.match(runtime,/mapId,viewerId,wallClearanceCells/);
 assert.match(sceneMgr,/wallClearanceCells=0/);
 assert.match(sceneMgr,/compileCollisionScene/);
 assert.match(server,/forge_world_v2\.swept_hits_segment/);
 assert.match(server,/forge_visibility\.swept_hits_segment/);
 assert.match(server,/SECURITY INVOKER SET search_path=''/);
 assert.doesNotMatch(server,/GRANT\s+(ALL|EXECUTE|USAGE)/i);
 assert.match(preserved,/R05 SOURCE 1\/5/);
 assert.doesNotMatch(runtime,/supabase\/candidates|apply_migration|db\.rpc\('wall_clearance'/);
});
