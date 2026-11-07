import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FEET_PER_CELL,pointOnBattlemap,measurementGeometry,
 validMeasurement,liveMeasurementPayload,
 acceptMeasurementEvent,applyMeasurementEventToVisible
} from '../src/MapMeasurements.js';

const mapId='ddc43132-9e87-4cce-a611-84aec6f4eacc';
const alice='99f26c54-7a8d-442d-b991-13f46980b014';
const bob='a8e14919-bac8-4aa7-8299-a2f24488d071';
const a='126cb044-c052-4029-a695-1eb5d3455cc8';
const b='d9d3f4e9-a811-4681-b44c-6c07c3f4672b';
const rect={left:120,top:220};
const measure={tool:'circle',start:{x:2.5,y:3.5},end:{x:5.5,y:7.5}};

test('pointer positions snap to the center of one cell at all map zoom levels',()=>{
 for(const zoom of [.25,.35,.5,1,1.5,2,3]){
  const grid=70*zoom;
  const nearTopLeft=pointOnBattlemap(rect.left+.1*grid,
   rect.top+.1*grid,rect,700,700,70,zoom);
  assert.deepEqual(nearTopLeft,{x:.5,y:.5});
  const other=pointOnBattlemap(rect.left+2.2*grid,
   rect.top+4.8*grid,rect,700,700,70,zoom);
  assert.deepEqual(other,{x:2.5,y:4.5});
  const next=pointOnBattlemap(rect.left+2.9*grid,
   rect.top+4.1*grid,rect,700,700,70,zoom);
  assert.deepEqual(next,other);
  const edge=pointOnBattlemap(rect.left+1300*grid,
   rect.top+1300*grid,rect,700,700,70,zoom);
  assert.deepEqual(edge,{x:10,y:10});
 }
 assert.equal(pointOnBattlemap(1,2,null,700,700,70,1),null);
});
test('every measurement displays a multiple of 5ft, including diagonal cells',()=>{
 const starts=[{x:.5,y:.5},{x:2.5,y:2.5},{x:4.5,y:6.5}];
 for(const start of starts){
  for(const offset of [{x:1,y:0},{x:1,y:1},{x:2,y:1},{x:3,y:4}]){
   for(const tool of ['line','circle','square','cone']){
    const g=measurementGeometry({tool,start,end:{
     x:start.x+offset.x,y:start.y+offset.y
    }});
    assert.equal(g.feet%FEET_PER_CELL,0,tool+' '+JSON.stringify(offset));
    assert.match(g.label,/^\d+ ft/);
   }
  }
 }
 const diagonal=measurementGeometry({tool:'line',
  start:{x:.5,y:.5},end:{x:1.5,y:1.5}});
 assert.equal(diagonal.feet,5);
 const circle=measurementGeometry({tool:'circle',
  start:{x:.5,y:.5},end:{x:2.5,y:1.5}});
 assert.equal(circle.radius,2);
 assert.equal(circle.feet,10);
});
test('pin, removal and clear events validate against the current map',()=>{
 const preview=liveMeasurementPayload(measure,a,alice,mapId,'preview',1001);
 const pin=liveMeasurementPayload(measure,a,alice,mapId,'pin',1002);
 const remove=liveMeasurementPayload(measure,a,alice,mapId,'remove',1003);
 const clear=liveMeasurementPayload(null,null,alice,mapId,'clear',1004);
 for(const event of [preview,pin,remove,clear])
  assert.equal(validMeasurement(event,mapId,10,10),true);
 assert.equal(validMeasurement(clear,'wrong-map'),false);
 assert.equal(validMeasurement({...clear,actor:'bad'},mapId),false);
 assert.equal(validMeasurement({...clear,seq:1001.3},mapId),false);
 assert.equal(validMeasurement({...remove,id:'not-a-uuid'},mapId),false);
 assert.equal(validMeasurement({...preview,tool:'not-a-tool'},mapId),false);
 assert.equal(validMeasurement({...preview,end:{x:11,y:1}},mapId,10,10),false);
});
test('left release immediately removes the live preview and rejects late frames',()=>{
 const versions=new Map(),clears=new Map();
 let remote={};
 const draw=liveMeasurementPayload(measure,a,alice,mapId,'preview',1001);
 const remove=liveMeasurementPayload(measure,a,alice,mapId,'remove',1003);
 assert.equal(acceptMeasurementEvent(draw,versions,clears),true);
 remote=applyMeasurementEventToVisible(remote,draw);
 assert.ok(remote[a]);
 assert.equal(acceptMeasurementEvent(remove,versions,clears),true);
 remote=applyMeasurementEventToVisible(remote,remove);
 assert.deepEqual(remote,{});
 assert.equal(acceptMeasurementEvent({...draw,seq:1002},versions,clears),false);
});
test('right-drag pin remains until the creator clears; never clears other users',()=>{
 const versions=new Map(),clears=new Map();
 let remote={};
 const one=liveMeasurementPayload(measure,a,alice,mapId,'pin',2001);
 const two=liveMeasurementPayload({...measure,tool:'square'},b,bob,mapId,'pin',2201);
 for(const event of [one,two]){
  assert.equal(acceptMeasurementEvent(event,versions,clears),true);
  remote=applyMeasurementEventToVisible(remote,event);
 }
 assert.equal(Object.keys(remote).length,2);
 const clearAlice=liveMeasurementPayload(null,null,alice,mapId,'clear',2301);
 assert.equal(acceptMeasurementEvent(clearAlice,versions,clears),true);
 remote=applyMeasurementEventToVisible(remote,clearAlice);
 assert.equal(remote[a],undefined);
 assert.equal(remote[b].actor,bob);
 assert.equal(acceptMeasurementEvent({...one,seq:2300},versions,clears),false);
 const clearBob=liveMeasurementPayload(null,null,bob,mapId,'clear',2401);
 assert.equal(acceptMeasurementEvent(clearBob,versions,clears),true);
 remote=applyMeasurementEventToVisible(remote,clearBob);
 assert.deepEqual(remote,{});
});
test('the board supports both right-drag and right-click while left-dragging',()=>{
 const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
 const bar=readFileSync(new URL('../src/MapMeasurementTools.jsx',import.meta.url),'utf8');
 assert.ok(main.includes('e.button!==0&&e.button!==2'));
 assert.ok(main.includes('pinned:e.button===2'));
 assert.ok(main.includes('measureDrag.current.pinned=true'));
 assert.ok(main.includes('onContextMenu={e=>{if(activeMeasureTool)e.preventDefault()}'));
 assert.ok(bar.includes('aria-label="Clear my pinned measurements"'));
 assert.ok(bar.includes('onClearPins'));
 assert.ok(bar.includes('onContextMenu={e=>e.preventDefault()}'));
 assert.ok(main.includes("onMeasurementPreview?.(done,'remove')"));
 assert.ok(main.includes("onMeasurementPreview?.(done,'pin')"));
 assert.ok(main.includes("onMeasurementPreview?.(null,'clear')"));
 assert.ok(!main.includes('},payload.final?12000:4500)'));
 assert.ok(!main.includes('measureTimers.current'));
 assert.ok(main.includes('if(payload.phase===\'preview\')'));
 assert.ok(main.includes('measureRevisions.current'));
});
