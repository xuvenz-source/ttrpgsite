import test from 'node:test';
import assert from 'node:assert/strict';
import {sweptTokenHull,barrierCrossesSweptHull,blockingBarrierSegments,
 checkTokenMovement} from '../src/MapCollision.js';
import {normalizeAuthorizedFogFrame,fogCellState,fogMasks,
 FOG_UNEXPLORED,FOG_EXPLORED,FOG_VISIBLE,MAX_FOG_CELLS} from '../src/MapFogModel.js';
const map={width:700,height:700,grid_size:70};
const token=(x=1,y=1,span_x=1,span_y=1)=>({x,y,span_x,span_y,field_values:{}});
const wall=(x=3,y0=0,y1=10,overrides={})=>({
 id:'wall1',type:'wall',blocksMovement:true,points:[{x,y:y0},{x,y:y1}],...overrides
});
const env=(...objects)=>({objects});
const move=(t,d,e)=>checkTokenMovement({token:t,destination:d,map,environment:e});

test('swept footprint blocks jumps through walls rather than endpoint-only checks',()=>{
 const barrier=env(wall(3));
 assert.deepEqual(move(token(1,2),{x:4,y:2},barrier),
  {allowed:false,reason:'barrier',blockerId:'wall1'});
 assert.deepEqual(move(token(1,2),{x:2,y:2},barrier),
  {allowed:true,reason:'ok'});
 assert.deepEqual(move(token(4,2),{x:5,y:2},barrier),
  {allowed:true,reason:'ok'});
});
test('diagonal motion and larger token footprints cannot cut through corners',()=>{
 const barrier=env(wall(4,2,6));
 const result=move(token(1,1,2,2),{x:5,y:4},barrier);
 assert.equal(result.reason,'barrier');
 const hull=sweptTokenHull(token(1,1,2,2),{x:5,y:4});
 assert.equal(barrierCrossesSweptHull({x:4,y:2},{x:4,y:6},hull),true);
 assert.equal(barrierCrossesSweptHull({x:0,y:8},{x:4,y:8},hull),false);
});
test('map limits respect full footprint and reject malformed coordinates',()=>{
 assert.equal(move(token(7,1,2,2),{x:9,y:3},env()).allowed,false);
 assert.equal(move(token(1,1,2,2),{x:8,y:3},env()).allowed,true);
 assert.equal(move(token(1,1),{x:-1,y:1},env()).reason,'bounds');
 assert.equal(move(token(1,1),{x:NaN,y:1},env()).reason,'invalid');
 assert.equal(move(token(1,1,20,1),{x:1,y:1},env()).reason,'invalid');
});
test('opened/broken door and window permit passage; locked closed door blocks',()=>{
 for(const type of ['door','window']){
  const closed=wall(3,0,10,{type,state:'closed',locked:true});
  const opened={...closed,state:'open'};
  const broken={...closed,state:'broken'};
  assert.equal(move(token(1,1),{x:4,y:1},env(closed)).allowed,false);
  assert.equal(move(token(1,1),{x:4,y:1},env(opened)).allowed,true);
  assert.equal(move(token(1,1),{x:4,y:1},env(broken)).allowed,true);
 }
});
test('elevation attribute and invisible/transparent barriers remain movement rules',()=>{
 const barrier=wall(3,0,10,{attributeField:'elevation',movementAt:15});
 assert.equal(move(token(1,1),{x:4,y:1},env(barrier)).allowed,false);
 assert.equal(move({...token(1,1),field_values:{elevation:15}},
  {x:4,y:1},env(barrier)).allowed,true);
 assert.equal(blockingBarrierSegments(env({...barrier,blocksMovement:false}),token()).length,0);
});
const mapId='map-for-test';
const packet=(extra={})=>({mapId,width:3,height:2,revision:3,
 enabled:true,partyShared:false,visible:[1],explored:[1,2,4],...extra});
test('sanitized fog distinguishes unexplored, remembered and visible cells',()=>{
 const frame=normalizeAuthorizedFogFrame(packet(),mapId);
 assert.ok(frame);
 assert.equal(fogCellState(frame,1,0),FOG_VISIBLE);
 assert.equal(fogCellState(frame,2,0),FOG_EXPLORED);
 assert.equal(fogCellState(frame,0,0),FOG_UNEXPLORED);
 assert.deepEqual(fogMasks(frame),[0,2,1,0,1,0]);
 assert.equal(fogCellState(null,1,1),FOG_UNEXPLORED);
 assert.equal(fogCellState(frame,6,1),FOG_UNEXPLORED);
});
test('fog frame requires server-provided map scope and rejects secret geometry',()=>{
 assert.equal(normalizeAuthorizedFogFrame(packet({mapId:'other'}),mapId),null);
 assert.equal(normalizeAuthorizedFogFrame(packet({prepared:{objects:[]}}),mapId),null);
 assert.equal(normalizeAuthorizedFogFrame(packet({objects:[]}),mapId),null);
 assert.equal(normalizeAuthorizedFogFrame(packet({tokens:[{name:'hidden'}]}),mapId),null);
 assert.equal(normalizeAuthorizedFogFrame(packet({visible:[1,5],explored:[1,2]}),mapId),null);
 assert.equal(normalizeAuthorizedFogFrame(packet({visible:[-1]}),mapId),null);
 assert.equal(normalizeAuthorizedFogFrame(packet({width:257}),mapId),null);
 assert.equal(MAX_FOG_CELLS,65536);
});
test('fog disabled is a server decision; client must never infer it from missing state',()=>{
 const off=normalizeAuthorizedFogFrame(packet({enabled:false,visible:[],explored:[]}),mapId);
 assert.deepEqual(fogMasks(off),Array(6).fill(FOG_VISIBLE));
 assert.equal(fogMasks(null),null);
});
