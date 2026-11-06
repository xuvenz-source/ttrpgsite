import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FEET_PER_CELL,pointOnBattlemap,validMeasurement,measurementGeometry,
 liveMeasurementPayload,MEASUREMENT_TOOLS
} from '../src/MapMeasurements.js';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/MapMeasurementTools.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const uuid='2f5bc7db-af91-4dcb-9e14-faa34cf05f69';
const mapId='7b9328d0-3bbd-4c37-95ad-4f85d8408095';

test('every battlemap square represents exactly 5 ft',()=>{
 assert.equal(FEET_PER_CELL,5);
 assert.deepEqual(MEASUREMENT_TOOLS,['line','circle','square','cone']);
 for(const mode of MEASUREMENT_TOOLS){
  const g=measurementGeometry({tool:mode,start:{x:2,y:3},end:{x:5,y:7}});
  assert.equal(g.feet,25);
  assert.match(g.label,/25 ft/);
 }
});
test('line distance measures Euclidean grid distance at every zoom',()=>{
 const rect={left:100,top:200};
 for(const scale of [.25,.5,1,1.5,3]){
  const start=pointOnBattlemap(100+2*70*scale,200+3*70*scale,
   rect,700,700,70,scale);
  const end=pointOnBattlemap(100+5*70*scale,200+7*70*scale,
   rect,700,700,70,scale);
  assert.ok(Math.abs(measurementGeometry({tool:'line',start,end}).feet-25)<.0001);
 }
});
test('square has equal 5-ft radius in both axes; cone has its far-end width equal to its length',()=>{
 const g=measurementGeometry({tool:'square',start:{x:4,y:4},end:{x:6,y:5}});
 assert.equal(g.feet,10);
 assert.deepEqual(g.square,{x:2,y:2,width:4,height:4});
 const c=measurementGeometry({tool:'cone',start:{x:0,y:0},end:{x:0,y:6}});
 assert.equal(c.feet,30);
 assert.deepEqual(c.corners,[{x:0,y:0},{x:-3,y:6},{x:3,y:6}]);
});
test('measurement broadcasts are map-scoped and reject malformed data',()=>{
 const measure={tool:'circle',start:{x:1,y:2},end:{x:4,y:6}};
 const payload=liveMeasurementPayload(measure,uuid,'player_1',mapId,true);
 assert.equal(validMeasurement(payload,mapId,10,10),true);
 assert.equal(validMeasurement(payload,'other',10,10),false);
 assert.equal(validMeasurement({...payload,tool:'unknown'},mapId),false);
 assert.equal(validMeasurement({...payload,end:{x:NaN,y:6}},mapId),false);
 assert.equal(validMeasurement({...payload,end:{x:20,y:6}},mapId,10,10),false);
 assert.equal(validMeasurement({...payload,actor:''.padEnd(66,'a')},mapId),false);
});
test('map gesture integration keeps left marquee and middle-button pan',()=>{
 assert.ok(main.includes('onMeasurementPreview={sendLiveMeasurement}'));
 assert.ok(main.includes("event:'map-measure'"));
 assert.ok(main.includes('onPointerDownCapture={e=>{'));
 assert.ok(main.includes('startMeasurementCapture(e)'));
 assert.ok(main.includes('startPan(e)'));
 assert.ok(main.includes('if(activeMeasureTool||e.button!==0'));
 assert.ok(main.includes('onPointerDown={startMarquee}'));
 assert.ok(main.includes('onPointerDown={onToolPointerDown}'));
 assert.ok(main.includes('onToolPointerMove'));
 assert.ok(ui.includes('<MeasurementToolBar'));
 assert.ok(ui.includes("tool==='circle'"));
 assert.ok(ui.includes("tool==='cone'"));
 assert.ok(ui.includes('<MapMeasurementOverlay'));
 assert.ok(css.includes('.map-measure-toolbar{position:absolute'));
 assert.ok(css.includes('.map-measure-overlay{position:absolute'));
});
