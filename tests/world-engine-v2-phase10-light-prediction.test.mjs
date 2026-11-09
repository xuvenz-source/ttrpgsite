import test from 'node:test';
import assert from 'node:assert/strict';
import {occludedLightFan} from '../src/engine/v2/LightOcclusion.js';
import {canPredictWithinWorldGrants}
 from '../src/engine/v2/PredictionGrants.js';
import {normalizeWorldVisibilityFrame}
 from '../src/engine/v2/VisibilityFrame.js';

const mapId='10000000-0000-4000-8000-000000000001';
const viewerId='30000000-0000-4000-8000-000000000001';
const tokenId='40000000-0000-4000-8000-000000000001';
const hero={kind:'token',id:tokenId,x:2,y:2};
const scene={version:2,mapId,scope:'viewer',published:true,
 revision:9,sceneGeneration:4};
const data=({predictionGrants=[
 {kind:'token',id:tokenId,x:2,y:2,quadrants:[[1,1]]}
],...extra}={})=>({
 version:2,mapId,viewerId,scope:'viewer',cursor:5,
 environmentRevision:9,permissionGeneration:3,sceneGeneration:4,
 visionEpoch:2,enabled:true,width:10,height:10,partyShared:false,
 visible:[22,23,32,33],explored:[22,23,32,33],
 visiblePieces:[hero],predictionGrants,...extra
});
const request=(pointer,extra={})=>({
 mapId,selection:[{kind:'token',id:tokenId}],from:{x:2,y:2},
 pointer,environmentRevision:9,permissionGeneration:3,
 ...extra
});
test('server-certified safe quadrant authorizes fractional player motion',()=>{
 const frame=normalizeWorldVisibilityFrame(data(),mapId,viewerId);
 assert.ok(frame);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request({x:2.6,y:2.3})
 }),true);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request({x:2.8,y:2})
 }),true);
});
test('unknown edge, jump, permission drift and forged grants fail closed',()=>{
 const frame=normalizeWorldVisibilityFrame(data(),mapId,viewerId);
 for(const p of [{x:1.8,y:2.3},{x:2.2,y:1.7},
   {x:4,y:2.4},{x:2.1,y:0}])
  assert.equal(canPredictWithinWorldGrants({
   frame,scene,request:request(p)
  }),false);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request({x:2.3,y:2.3},{
   permissionGeneration:4})
 }),false);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request({x:2.3,y:2.3},{
   from:{x:3,y:2}})
 }),false);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:request({x:2.3,y:2.3},{
   selection:[{kind:'token',id:tokenId},
    {kind:'token',id:'40000000-0000-4000-8000-000000000002'}]})
 }),false);
 assert.equal(normalizeWorldVisibilityFrame(data({
  predictionGrants:[{kind:'token',id:tokenId,x:2,y:2,
   quadrants:[[1,1]],secretWall:{x:3,y:3}}]
 }),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(data({
  predictionGrants:[{kind:'token',id:tokenId,x:5,y:2,
   quadrants:[[1,1]]}]
 }),mapId,viewerId),null);
});
test('opaque wall clips the radial light at the obstacle',()=>{
 const wall={type:'wall',blocksLight:true,
  points:[{x:4,y:0},{x:4,y:10}]};
 const origin={x:2,y:5};
 const fan=occludedLightFan([wall],origin,5);
 assert.ok(fan?.length>=128);
 const east=fan.find(p=>Math.abs(p.y-5)<1e-6&&p.x>origin.x);
 assert.ok(east&&Math.abs(east.x-4)<1e-5,
  'east light is blocked by the wall');
 const withoutWall=occludedLightFan([{...wall,blocksLight:false}],
  origin,5);
 assert.ok(withoutWall.some(p=>p.x>6.9&&Math.abs(p.y-5)<1e-5));
});
test('open doors pass light; curtained windows block it',()=>{
 const portal={type:'window',blocksLight:false,curtains:true,
  points:[{x:4,y:0},{x:4,y:10}]};
 const origin={x:2,y:5};
 const closed=occludedLightFan([portal],origin,5);
 const open=occludedLightFan([{...portal,state:'open'}],origin,5);
 const east=a=>a.find(p=>p.x>origin.x&&Math.abs(p.y-5)<1e-5)?.x;
 assert.ok(east(closed)<5);
 assert.ok(east(open)>6.9);
});
test('malformed or excessively complex occlusion geometry never shows a full glow',()=>{
 assert.equal(occludedLightFan([{
  type:'wall',points:[{x:2,y:3},{x:NaN,y:4}]
 }],{x:2,y:2},4),null);
 const many=Array.from({length:120},(_,i)=>({
  type:'wall',points:[{x:2+i/100,y:2},{x:2+i/100,y:3},
   {x:2+i/100,y:4}]
 }));
 assert.equal(occludedLightFan(many,{x:2,y:3},2),null);
});

test('server-granted loose tools and mixed token/tool groups predict only safe fractions',()=>{
 const toolId='50000000-0000-4000-8000-000000000001';
 const tool={kind:'tool',id:toolId,x:3,y:2};
 const frame=normalizeWorldVisibilityFrame(data({
  visiblePieces:[hero,tool],
  predictionGrants:[
   {kind:'token',id:tokenId,x:2,y:2,quadrants:[[1,1]]},
   {kind:'tool',id:toolId,x:3,y:2,quadrants:[[1,1]]}
  ]
 }),mapId,viewerId);
 assert.ok(frame);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:{
   ...request({x:3.35,y:2.25}),
   selection:[{kind:'tool',id:toolId}],from:{x:3,y:2}
  }
 }),true);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:{
   ...request({x:2.35,y:2.25}),
   selection:[{kind:'token',id:tokenId},{kind:'tool',id:toolId}]
  }
 }),true);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:{
   ...request({x:2.35,y:2.25}),
   selection:[{kind:'token',id:tokenId},
    {kind:'tool',id:'50000000-0000-4000-8000-000000000002'}]
  }
 }),false);
 assert.equal(canPredictWithinWorldGrants({
  frame,scene,request:{
   ...request({x:2.35,y:1.75}),
   selection:[{kind:'token',id:tokenId},{kind:'tool',id:toolId}]
  }
 }),false);
 assert.equal(normalizeWorldVisibilityFrame(data({
  visiblePieces:[hero],
  predictionGrants:[{kind:'tool',id:toolId,x:3,y:2,quadrants:[[1,1]]}]
 }),mapId,viewerId),null);
});
