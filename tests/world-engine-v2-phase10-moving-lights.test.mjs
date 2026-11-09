import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeWorldVisibilityFrame}
 from '../src/engine/v2/VisibilityFrame.js';
import {paintWorldMovingLightLayer}
 from '../src/engine/v2/WorldLayerPainter.js';

const mapId='10000000-0000-4000-8000-000000000001';
const viewerId='30000000-0000-4000-8000-000000000001';
const id='40000000-0000-4000-8000-000000000001';
const raw=(more={})=>({
 version:2,mapId,viewerId,scope:'viewer',cursor:5,
 environmentRevision:9,permissionGeneration:4,sceneGeneration:6,
 visionEpoch:7,enabled:true,width:10,height:10,partyShared:false,
 visible:[22,23,32,33],explored:[22,23,32,33],
 visiblePieces:[{kind:'token',id,x:2,y:2}],
 lightCells:[[22,3],[23,1]],dmMovingLights:[],...more
});
function canvas(){
 const actions=[];
 const ctx={
  clearRect(...args){actions.push(['clear',...args])},
  fillRect(...args){actions.push(['fill',...args,this.fillStyle])},
  save(){actions.push(['save'])},restore(){actions.push(['restore'])},
  setTransform(...args){actions.push(['transform',...args])},
  beginPath(){actions.push(['begin'])},
  moveTo(...args){actions.push(['move',...args])},
  lineTo(...args){actions.push(['line',...args])},
  closePath(){actions.push(['close'])},clip(){actions.push(['clip'])},
  arc(...args){actions.push(['arc',...args])},fill(){actions.push(['glow'])},
  createRadialGradient(){return{addColorStop(){}}}
 };
 return {style:{},width:0,height:0,actions,getContext:()=>ctx};
}
const dimensions={width:1000,height:1000,gridSize:100};
test('player intensity is strictly a subset of already authorized visible cells',()=>{
 const frame=normalizeWorldVisibilityFrame(raw(),mapId,viewerId);
 assert.ok(frame);
 assert.deepEqual(frame.lightCells,[[22,3],[23,1]]);
 assert.equal(normalizeWorldVisibilityFrame(raw({
  lightCells:[[22,3],[24,3]]
 }),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(raw({
  lightCells:[[23,1],[22,3]]
 }),mapId,viewerId),null);
 assert.equal(normalizeWorldVisibilityFrame(raw({
  dmMovingLights:[{x:3,y:3,reach:6}]
 }),mapId,viewerId),null);
});
test('one retained light canvas repaints only changed player cells',()=>{
 const scene={scope:'viewer',dimensions},surface=canvas();
 const first=normalizeWorldVisibilityFrame(raw(),mapId,viewerId);
 const result=paintWorldMovingLightLayer({
  canvas:surface,frame:first,scene
 });
 assert.equal(result.ok,true);
 assert.equal(result.painted,2);
 const idle=paintWorldMovingLightLayer({
  canvas:surface,frame:first,previousFrame:first,scene
 });
 assert.equal(idle.painted,0);
 const next=normalizeWorldVisibilityFrame(raw({
  lightCells:[[22,3],[32,2]]
 }),mapId,viewerId);
 const diff=paintWorldMovingLightLayer({
  canvas:surface,frame:next,previousFrame:first,scene
 });
 assert.equal(diff.painted,1);
 const filled=surface.actions.filter(a=>a[0]==='fill');
 assert.equal(filled.length,3);
 assert.ok(filled.every(a=>[16,24].includes(a[1])));
});
test('DM moving light is clipped to published wall geometry',()=>{
 const map={scope:'dm',dimensions,published:true,
  environment:{objects:[{type:'wall',blocksLight:true,
   points:[{x:4,y:0},{x:4,y:10}]}]}};
 const frame={scope:'dm',dmMovingLights:[{x:2,y:5,reach:5}]};
 const surface=canvas();
 const outcome=paintWorldMovingLightLayer({
  canvas:surface,scene:map,frame
 });
 assert.equal(outcome.ok,true);
 assert.equal(outcome.painted,1);
 assert.ok(surface.actions.some(a=>a[0]==='clip'));
 const player=paintWorldMovingLightLayer({
  canvas:surface,scene:map,frame:{...frame,scope:'viewer',
   enabled:true,width:10,height:10,lightCells:[]},
  playerPreview:true
 });
 assert.equal(player.ok,true);
 assert.equal(player.painted,0);
});
test('the V2 stack keeps one moving light canvas under the authorized fog',async()=>{
 const stack=await readFile(new URL(
  '../src/engine/v2/WorldCanvasStack.jsx',import.meta.url),'utf8');
 const runtime=await readFile(new URL(
  '../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(stack,/movingCanvas:moving.current/);
 assert.match(stack,/ref={moving}/);
 assert.match(runtime,/scheduleDmLightRefresh/);
 assert.match(runtime,/dm-approved-motion-light/);
});

test('fog-disabled maps, including large maps, clear light cosmetics without errors',()=>{
 const surface=canvas(),scene={scope:'viewer',dimensions};
 const lit=normalizeWorldVisibilityFrame(raw(),mapId,viewerId);
 paintWorldMovingLightLayer({canvas:surface,scene,frame:lit});
 const cleared=paintWorldMovingLightLayer({canvas:surface,scene,
  frame:normalizeWorldVisibilityFrame(raw({
   enabled:false,visible:[],explored:[],lightCells:[]
  }),mapId,viewerId),previousFrame:lit});
 assert.deepEqual(cleared,{ok:true,painted:0,full:true});
 assert.equal(surface.width,1);
 assert.equal(surface.height,1);
 const huge=paintWorldMovingLightLayer({
  canvas:surface,scene,frame:{scope:'viewer',enabled:false,
   width:200,height:200,lightCells:[]}
 });
 assert.equal(huge.ok,true);
 assert.equal(huge.painted,0);
});

test('DM moving-light painter treats a safely unpublished map as empty, not failed',()=>{
 const surface=canvas(),scene={scope:'dm',published:false,
  fogEnabled:false,collisionEnabled:false,environment:null,dimensions};
 const frame={scope:'dm',dmMovingLights:[]};
 const outcome=paintWorldMovingLightLayer({canvas:surface,scene,frame});
 assert.equal(outcome.ok,true);
 assert.equal(outcome.painted,0);
 assert.equal(surface.width,1);
 assert.equal(surface.height,1);
});
