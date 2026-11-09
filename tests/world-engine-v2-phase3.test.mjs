import test from 'node:test';
import assert from 'node:assert/strict';
import {
 compileCollisionScene,solveCollisionPath,collisionAllowsStep,
 segmentCrossesSweptFootprint,createCollisionPredictor,createMovementController
} from '../src/engine/v2/index.js';

const map={id:'map-one',width:1000,height:1000,grid_size:100};
const pos=(x,y)=>({x,y});
const hero={kind:'token',id:'hero',x:0,y:1,span_x:1,span_y:1};
const wall=(x=2,y0=0,y1=10,extras={})=>({
 type:'wall',id:'private-wall-id',points:[pos(x,y0),pos(x,y1)],
 blocksMovement:true,...extras
});
const door=(state='closed',extras={})=>({
 type:'door',points:[pos(2,0),pos(2,10)],state,
 blocksMovement:true,vision:'block',...extras
});
const scene=(objects=[],extra={})=>compileCollisionScene({
 map,environment:{objects},revision:7,collisionEnabled:true,scope:'dm',...extra
});
const attempt=(compiled,to,extra={})=>solveCollisionPath({
 scene:compiled,pieces:[hero],from:pos(0,1),to,allowSliding:false,...extra
});
const near=(value,want,eps=.00001)=>assert.ok(Math.abs(value-want)<eps,
 'expected '+value+' to be near '+want);
const blockedAt=(result,x,y)=>{
 assert.equal(result.blocked,true);
 assert.equal(result.complete,false);
 near(result.offset.x,x);near(result.offset.y,y);
};

test('high-speed mouse drag does not tunnel through a solid vertical wall',()=>{
 const hit=attempt(scene([wall()]),pos(8,1));
 blockedAt(hit,1,1);
 assert.equal(hit.reason,'blocked');
 assert.equal(JSON.stringify(hit).includes('private-wall-id'),false);
});
test('transparent glass still blocks movement even when it passes vision/light',()=>{
 const hit=attempt(scene([wall(2,0,10,{vision:'pass',blocksLight:false})]),pos(5,1));
 blockedAt(hit,1,1);
});
test('moving parallel along a wall face never rubber-bands',()=>{
 const compiled=scene([wall()]);
 const result=solveCollisionPath({
  scene:compiled,pieces:[{...hero,x:1}],from:pos(1,1),to:pos(1,8),
  allowSliding:false
 });
 assert.equal(result.complete,true);
 assert.deepEqual(result.offset,pos(1,8));
});
test('fast diagonal movement stops at last legal swept footprint',()=>{
 const hit=attempt(scene([wall()]),pos(4,5));
 assert.equal(hit.blocked,true);
 near(hit.offset.x,1);
 assert.ok(hit.offset.y>=1&&hit.offset.y<5);
});
test('wall sliding resolves blocked diagonal movement along a straight wall',()=>{
 const compiled=scene([wall()]);
 const result=solveCollisionPath({scene:compiled,pieces:[hero],
  from:pos(0,1),to:pos(5,6)});
 assert.equal(result.blocked,true);
 near(result.offset.x,1);
 near(result.offset.y,6);
 assert.ok(result.waypoints.length>=2);
});
test('horizontal wall sliding preserves permitted sideways displacement',()=>{
 const flatWall={type:'wall',points:[pos(0,3),pos(9,3)],blocksMovement:true};
 const piece={...hero,x:0,y:0};
 const r=solveCollisionPath({scene:scene([flatWall]),pieces:[piece],
  from:pos(0,0),to:pos(5,6)});
 assert.equal(r.blocked,true);
 near(r.offset.y,2);
 near(r.offset.x,5);
});
test('a blocked corner cannot be cut by a diagonal or slide through either wall',()=>{
 const horizontal={type:'wall',points:[pos(0,2),pos(2,2)],blocksMovement:true};
 const vertical=wall(2,0,2);
 const piece={...hero,x:0,y:0};
 const r=solveCollisionPath({scene:scene([horizontal,vertical]),
  pieces:[piece],from:pos(0,0),to:pos(5,5),allowSliding:false});
 assert.equal(r.blocked,true);
 assert.ok(r.offset.x<=1.00001&&r.offset.y<=1.00001);
});
test('closed door blocks, opening or breaking it invalidates only the published scene',()=>{
 const closed=scene([door('closed')]);
 const open=scene([door('open')],{revision:8});
 const broken=scene([door('broken')],{revision:9});
 blockedAt(attempt(closed,pos(6,1)),1,1);
 assert.equal(attempt(open,pos(6,1)).complete,true);
 assert.equal(attempt(broken,pos(6,1)).complete,true);
 assert.notEqual(open.revision,closed.revision);
});
test('closed windows block movement independently of see-through vision',()=>{
 const glass=door('closed',{type:'window',vision:'pass',blocksLight:false});
 blockedAt(attempt(scene([glass]),pos(4,1)),1,1);
 assert.equal(attempt(scene([{...glass,state:'open'}]),pos(4,1)).complete,true);
});
test('wall collision disabled still enforces map bounds',()=>{
 const disabled=scene([wall()],{collisionEnabled:false});
 assert.equal(attempt(disabled,pos(6,1)).complete,true);
 const edge=attempt(disabled,pos(20,1));
 assert.equal(edge.blocked,true);
 near(edge.offset.x,9);
});
test('boundary sliding works on the map edge',()=>{
 const edgePiece={...hero,x:9,y:1};
 const r=solveCollisionPath({scene:scene(),
  pieces:[edgePiece],from:pos(9,1),to:pos(13,5)});
 assert.equal(r.blocked,true);
 near(r.offset.x,9);near(r.offset.y,5);
});
test('mixed token and tool group is stopped atomically by whichever footprint hits first',()=>{
 const pieces=[hero,{kind:'tool',id:'mule',x:2,y:4,span:1}];
 const result=solveCollisionPath({scene:scene([wall(4)]),pieces,
  from:pos(0,1),to:pos(7,1),allowSliding:false});
 blockedAt(result,1,1);
});
test('wide 3x2 token collides with the entire swept rectangle',()=>{
 const big={...hero,x:0,y:1,span_x:3,span_y:2};
 const r=solveCollisionPath({scene:scene([wall(5)]),pieces:[big],
  from:pos(0,1),to:pos(7,1),allowSliding:false});
 blockedAt(r,2,1);
});
test('conditional wall permits movement only when the expected attribute satisfies threshold',()=>{
 const conditional=wall(2,0,10,{movementAt:15,attributeField:'strength'});
 const allowed={...hero,field_values:{strength:{current:16}}};
 const denied={...hero,field_values:{strength:{current:14}}};
 const good=solveCollisionPath({scene:scene([conditional]),pieces:[allowed],
  from:pos(0,1),to:pos(4,1),allowSliding:false});
 assert.equal(good.complete,true);
 const bad=solveCollisionPath({scene:scene([conditional]),pieces:[denied],
  from:pos(0,1),to:pos(4,1),allowSliding:false});
 blockedAt(bad,1,1);
});
test('vision-only one-way setting is not misinterpreted as a movement bypass',()=>{
 const object=wall(2,0,10,{vision:'one-way',oneWay:'a-to-b'});
 blockedAt(attempt(scene([object]),pos(4,1)),1,1);
});
test('wall marked non-blocking does not obstruct movement',()=>{
 const object=wall(2,0,10,{blocksMovement:false});
 assert.equal(attempt(scene([object]),pos(4,1)).complete,true);
});
test('touching a barrier at its edge is permitted, crossing its interior is not',()=>{
 const a=pos(2,0),b=pos(2,10);
 assert.equal(segmentCrossesSweptFootprint(a,b,pos(1,1),pos(1,7),1,1),false);
 assert.equal(segmentCrossesSweptFootprint(a,b,pos(0,1),pos(4,1),1,1),true);
});
test('malformed or excessive published geometry fails closed',()=>{
 assert.equal(scene([wall()],{scope:'player-unverified'}),null);
 assert.equal(scene([wall()],{map:{id:'map-one',width:0,height:0,grid_size:0}}),null);
 assert.equal(scene([{...wall(),points:[pos(2,0),{x:NaN,y:3}]}]),null);
 assert.equal(scene(Array.from({length:121},()=>wall())),null);
 assert.equal(attempt(null,pos(2,1)).offset,null);
});
test('invalid footprint, duplicate mixed IDs and initial out-of-bounds cannot move',()=>{
 const s=scene();
 assert.equal(solveCollisionPath({scene:s,pieces:[{...hero,span_x:13}],
  from:pos(0,1),to:pos(2,1)}).offset,null);
 assert.equal(solveCollisionPath({scene:s,pieces:[hero,hero],
  from:pos(0,1),to:pos(2,1)}).offset,null);
 assert.equal(solveCollisionPath({scene:s,pieces:[hero],
  from:pos(-1,1),to:pos(2,1)}).offset,null);
 assert.equal(solveCollisionPath({scene:s,pieces:[hero],
  from:pos(0,1),to:pos(1000,1)}).offset,null);
});
test('unpublished or missing geometry never becomes an optimistic pass',()=>{
 assert.equal(collisionAllowsStep({scene:null,pieces:[hero],
  from:pos(0,1),to:pos(1,1)}),false);
 assert.equal(collisionAllowsStep({scene:scene([wall()]),pieces:[hero],
  from:pos(0,1),to:pos(2,1)}),false);
});
test('collision predictor refuses paths without a separate authorized-edge grant',()=>{
 const s=scene([wall()]);
 const predict=createCollisionPredictor({scene:s,mapId:map.id,
  pieces:[hero],permissionGeneration:3,authorizePath:()=>false});
 assert.equal(predict({mapId:map.id,selection:[hero],from:pos(0,1),
  pointer:pos(1,1),environmentRevision:7,permissionGeneration:3}),false);
});
test('collision predictor checks fractional footprint, revision and group identities',()=>{
 const s=scene([wall()]);
 let grants=0;
 const predict=createCollisionPredictor({scene:s,mapId:map.id,
  pieces:[hero],permissionGeneration:3,
  authorizePath:()=>{grants++;return true}});
 const input={mapId:map.id,selection:[hero],from:pos(0,1),
  pointer:pos(0.5,1.25),environmentRevision:7,permissionGeneration:3};
 assert.equal(predict(input),true);
 assert.equal(predict({...input,pointer:pos(1.5,1.25)}),false,
  'integer landing at 1 could be legal while fractional sprite penetrates the wall');
 assert.equal(predict({...input,environmentRevision:8}),false);
 assert.equal(predict({...input,permissionGeneration:4}),false);
 assert.equal(predict({...input,selection:[{kind:'token',id:'unknown'}]}),false);
 assert.equal(grants,2);
});
test('controller receives collision gating without importing legacy modules',async()=>{
 const s=scene([wall()]);
 const predictor=createCollisionPredictor({scene:s,mapId:map.id,
  pieces:[hero],permissionGeneration:0,authorizePath:()=>true});
 const events=[];
 const authority={begin:async()=>new Promise(()=>{}),
  advance:async()=>{throw Error('not-used')},commit:async()=>{},cancel:async()=>{}};
 const controller=createMovementController({authority,
  canPredict:predictor,onEvent:e=>events.push(e)});
 controller.beginGesture({mapId:map.id,selection:[hero],
  origin:pos(0,1),pointer:pos(0,1),environmentRevision:7});
 controller.updateGesture(pos(0.5,1.25));
 assert.equal(events.at(-1).type,'presented');
 controller.updateGesture(pos(1.6,1.25));
 assert.notEqual(events.at(-1).type,'presented');
 controller.cancelGesture();
});
