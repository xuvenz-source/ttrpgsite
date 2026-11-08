import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planAuthorizedGridRoute} from '../src/AuthorizedMovementPlanner.js';
import {NAV_DIRECTIONS,createAuthorizedNavigation} from '../src/AuthorizedNavigation.js';
import {appendMovementWaypoint,movementPathDeltas,MAX_MOTION_WAYPOINTS}
 from '../src/MapMovementPath.js';
import {checkTokenMovement} from '../src/MapCollision.js';
import {traceAuthorizedGroupOffset,traceSolidGroupOffset}
 from '../src/DragCollisionGuard.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const mapId='00000000-0000-4000-8000-000000000001';
const tokenId='00000000-0000-4000-8000-000000000002';
const sheet={STR:{current:14}};
const wall=(type='wall',state='closed')=>({
 id:'barrier',type,state,blocksMovement:true,blocksLight:true,
 vision:'block',points:[{x:2,y:0},{x:2,y:6}]
});
const board={grid_size:70,width:700,height:700};

test('keyboard and sidebar routes are legal one-cell moves and can turn around a wall',()=>{
 const accessible=new Set(['0:1','0:2','1:2','2:2','2:1']);
 const canStep=(from,to)=>{
  const cardinal=Math.abs(from.x-to.x)+Math.abs(from.y-to.y)===1;
  return cardinal&&accessible.has(to.x+':'+to.y);
 };
 const route=planAuthorizedGridRoute({
  origin:{x:0,y:1},destination:{x:2,y:1},canStep
 });
 assert.deepEqual(route,[
  {dx:0,dy:1},{dx:1,dy:1},{dx:2,dy:1},{dx:2,dy:0}
 ]);
 const steps=movementPathDeltas(route);
 assert.equal(steps.length,4);
 assert.deepEqual(steps,[{dx:0,dy:1},{dx:1,dy:0},
  {dx:1,dy:0},{dx:0,dy:-1}]);
 assert.equal(steps.reduce((n,s)=>n+s.dx,0),2);
 assert.equal(steps.reduce((n,s)=>n+s.dy,0),0);
 assert.equal(planAuthorizedGridRoute({
  origin:{x:0,y:1},destination:{x:1,y:1},canStep
 }),null,'no speculative step through a wall');
});

test('single-cell keyboard movement avoids any unnecessary graph search',()=>{
 const calls=[];
 const result=planAuthorizedGridRoute({
  origin:{x:3,y:3},destination:{x:4,y:3},
  canStep:(a,b)=>{calls.push([a,b]);return true}
 });
 assert.deepEqual(result,[{dx:1,dy:0}]);
 assert.equal(calls.length,1);
 assert.deepEqual(planAuthorizedGridRoute({
  origin:{x:3,y:3},destination:{x:3,y:3},canStep:()=>true
 }),[]);
});

test('bounded planner cannot teleport, exceed 64 steps or invent a diagonal',()=>{
 const orthogonal=(from,to)=>Math.abs(from.x-to.x)+Math.abs(from.y-to.y)===1;
 assert.equal(planAuthorizedGridRoute({
  origin:{x:0,y:0},destination:{x:100,y:0},
  canStep:orthogonal
 }),null,'longer than SQL 64-leg maximum');
 assert.equal(planAuthorizedGridRoute({
  origin:{x:0,y:0},destination:{x:0,y:65},
  canStep:orthogonal
 }),null);
 assert.equal(planAuthorizedGridRoute({
  origin:{x:0,y:0},destination:{x:2,y:2},
  canStep:()=>false
 }),null,'never route around a denied edge using unseen geometry');
 assert.equal(planAuthorizedGridRoute({
  origin:{x:0,y:0},destination:{x:129,y:0},
  canStep:()=>true
 }),null,'server total movement is bounded to 128 cells');
 assert.equal(planAuthorizedGridRoute({
  origin:{x:0,y:0},destination:{x:1.5,y:0},
  canStep:()=>true
 }),null,'fractional grid destinations are not authorized');
 assert.equal(NAV_DIRECTIONS.length,8);
});

test('wide creatures are checked by the same swept collision as the server',()=>{
 const scene={objects:[wall()]};
 const narrow={x:0,y:1,span_x:1,span_y:1};
 assert.equal(checkTokenMovement({
  token:narrow,destination:{x:1,y:1},map:board,environment:scene
 }).allowed,true);
 const wide={x:0,y:1,span_x:2,span_y:2};
 assert.equal(checkTokenMovement({
  token:wide,destination:{x:1,y:1},map:board,environment:scene
 }).allowed,false,'the leading edge of a 2x2 unit cannot clip a wall');
});

test('conditional attributes, doors and broken portals agree with collision rules',()=>{
 const conditional={...wall(),attributeField:'STR',movementAt:12};
 const token={x:1,y:1,span_x:1,span_y:1,field_values:sheet};
 assert.equal(checkTokenMovement({
  token,destination:{x:2,y:1},map:board,environment:{objects:[conditional]}
 }).allowed,true);
 assert.equal(checkTokenMovement({
  token:{...token,field_values:{STR:{current:8}}},
  destination:{x:2,y:1},map:board,environment:{objects:[conditional]}
 }).allowed,false);
 assert.equal(checkTokenMovement({
  token:{...token,field_values:undefined,npc_values:sheet},
  destination:{x:2,y:1},map:board,environment:{objects:[conditional]}
 }).allowed,true,'issued tool attributes can use server-equivalent npc_values');
 assert.equal(checkTokenMovement({
  token,destination:{x:2,y:1},map:board,environment:{objects:[wall('door','closed')]}
 }).allowed,false);
 assert.equal(checkTokenMovement({
  token,destination:{x:2,y:1},map:board,environment:{objects:[wall('door','open')]}
 }).allowed,true);
 assert.equal(checkTokenMovement({
  token,destination:{x:2,y:1},map:board,environment:{objects:[wall('window','broken')]}
 }).allowed,true);
});

test('mixed group movement is atomic and rejects a step blocked for any member',()=>{
 const a={kind:'token',id:'a',x:0,y:1};
 const b={kind:'tool',id:'b',x:1,y:1};
 const permissions=(piece,from,to)=>piece.id==='a'?
  to.x<=1:to.x<=1;
 const result=traceAuthorizedGroupOffset({
  pieces:[a,b],previous:{dx:0,dy:0},
  desired:{dx:2,dy:0},canStep:permissions
 });
 assert.equal(result.dx,0,'the tool blocks the whole group, not only itself');
 const scene={objects:[wall()]};
 const blocked=traceSolidGroupOffset({
  pieces:[{x:0,y:1,span_x:1,span_y:1},
   {x:1,y:1,span_x:1,span_y:1}],
  map:board,environment:scene,previous:{dx:0,dy:0},
  desired:{dx:2,dy:0}
 });
 assert.equal(blocked.dx,0);
});

test('all curved-path waypoints survive compression without illegal teleport',()=>{
 let route=[];
 for(const [x,y] of [[1,0],[2,0],[2,1],[2,2],[1,2],[0,2]]){
  route=appendMovementWaypoint(route,x,y);
 }
 assert.deepEqual(route,[{dx:2,dy:0},{dx:2,dy:2},{dx:0,dy:2}]);
 const deltas=movementPathDeltas(route);
 assert.deepEqual(deltas,[{dx:2,dy:0},{dx:0,dy:2},{dx:-2,dy:0}]);
 assert.ok(deltas.length<=MAX_MOTION_WAYPOINTS);
});

test('all player entry points share final authoritative trajectory commit',()=>{
 const app=source('src/TabletopApp.jsx');
 const map=source('src/BattlemapBoard.jsx');
 assert.match(app,/async function commitPredictedPlayerMove/);
 assert.match(app,/const path=route\.length\?route:planAuthorizedGridRoute/);
 assert.match(app,/async function placeIssuedToolOnMap/);
 assert.match(app,/const route=planAuthorizedGridRoute\(/);
 assert.match(app,/navigationStore\.routeApproved\(\s*mapId,'tool',id,origin,route\)/);
 assert.doesNotMatch(app,/transport\.getApprovedPath\(mapId,'tool',id\)/);
 assert.match(app,/toolMovementPending\.current\.add\(tool\.issue_id\)/);
 assert.match(app,/toolMovementPending\.current\.delete\(tool\.issue_id\)/);
 assert.match(app,/const saved=data\?\.tools\?\.find/);
 assert.match(app,/const row=data\.tokens\.find/);
 assert.match(app,/const row=data\.tools\.find/);
 assert.match(app,/commit_map_trajectory/);
 assert.match(map,/traceAuthorizedGroupOffset/);
 assert.match(map,/traceSolidGroupOffset/);
});

test('interrupted and out-back drags clear pending fog and their visual preview',()=>{
 const map=source('src/BattlemapBoard.jsx');
 const app=source('src/TabletopApp.jsx');
 assert.match(map,/const cancelServerPreview=\(\)=>/);
 assert.match(map,/if\(!info\.path\?\.length&&!info\.persistedDuringDrag\)return/);
 assert.match(map,/if\(cancel\)\{[\s\S]*?cancelServerPreview\(\);\s*return/);
 assert.match(map,/if\(info\.dx===0&&info\.dy===0&&!info\.persistedDuringDrag\)/);
 assert.match(map,/cancelServerPreview\(\);\s*return/);
 assert.match(app,/onMovementCancel=\{\(\{mapId,tokenIds,toolIssueIds\}\)=>/);
 assert.match(app,/clearMapMovementPreview\(mapId,tokenIds,toolIds\)/);
});

test('DM movement/preview uses private attributes without returning them to players',()=>{
 const app=source('src/TabletopApp.jsx');
 const map=source('src/BattlemapBoard.jsx');
 assert.match(app,/isDM\?\s*projection\+',npc_values':projection/);
 assert.match(map,/sourcePreviewToken=useMemo/);
 assert.match(map,/field_values:values/);
 assert.match(map,/npc_values:toolIssued\.find/);
 assert.match(map,/environment:collisionScene,previous,desired:requested/);
 assert.match(app,/if\(isDM&&mapSettingEditor\.previewing\)return/);
});
