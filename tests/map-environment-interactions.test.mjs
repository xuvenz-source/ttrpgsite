import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBarrier,createLight,resizeBarrierEndpoint,normalizeEnvironment} from '../src/MapEnvironment.js';
import {previewVisionPolygon,pointInPolygon,previewViewer,
 raySegmentIntersection} from '../src/MapVisionPreview.js';

const map={width:1000,height:1000,grid_size:100};
const token=(x=2,y=5,field_values={})=>({id:'token',x:x-.5,y:y-.5,field_values,span_x:1,span_y:1,visible:true});
const viewer=(x=2,y=5,fields={})=>previewViewer(token(x,y,fields));
const polygon=(env,from=viewer())=>previewVisionPolygon({map,environment:env,viewer:from,maxFeet:60});
const wall=(x=5)=>createBarrier('wall',[{x,y:0},{x,y:10}]);

test('DM preview from a token hides space behind an opaque wall',()=>{
 const noWall=polygon(normalizeEnvironment());
 assert.equal(pointInPolygon({x:8,y:5},noWall),true);
 const blocked=polygon({objects:[wall()]});
 assert.equal(pointInPolygon({x:8,y:5},blocked),false);
 assert.equal(pointInPolygon({x:3,y:5},blocked),true);
});
test('doors open in prepared state let sight through; closed doors block it',()=>{
 const barrier=createBarrier('door',[{x:5,y:0},{x:5,y:10}]);
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[barrier]})),false);
 barrier.state='open';
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[barrier]})),true);
});
test('window curtains toggle vision in the DM preview',()=>{
 const window=createBarrier('window',[{x:5,y:0},{x:5,y:10}]);
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[window]})),true);
 window.curtains=true;
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[window]})),false);
 window.state='open';
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[window]})),true);
});
test('one-way wall side is calculated per viewer',()=>{
 const barrier=wall();
 barrier.vision='one-way';barrier.oneWay='a-to-b';
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[barrier]},viewer(2,5))),true);
 assert.equal(pointInPolygon({x:2,y:5},polygon({objects:[barrier]},viewer(8,5))),false);
});
test('elevation is read from the viewer token rather than changing the wall globally',()=>{
 const barrier=wall();barrier.attributeField='elevation';barrier.visionAt=15;
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[barrier]},viewer(2,5,{elevation:0}))),false);
 assert.equal(pointInPolygon({x:8,y:5},polygon({objects:[barrier]},viewer(2,5,{elevation:20}))),true);
});
test('door endpoint drag allows fractional grid positions and rotation without changing other endpoint',()=>{
 const points=[{x:2.13,y:1.77},{x:4.23,y:1.77}];
 const adjusted=resizeBarrierEndpoint(points,1,{x:4.7135,y:3.1225});
 assert.deepEqual(adjusted[0],points[0]);
 assert.deepEqual(adjusted[1],{x:4.7135,y:3.1225});
 assert.equal(resizeBarrierEndpoint(points,1,points[0]),null);
 assert.deepEqual(points,[{x:2.13,y:1.77},{x:4.23,y:1.77}]);
});
test('near-parallel rays and malformed polygon checks are safe',()=>{
 assert.equal(raySegmentIntersection({x:1,y:1},0,{x:3,y:4},{x:8,y:4}),null);
 assert.equal(pointInPolygon({x:2,y:2},[]),false);
 assert.equal(previewVisionPolygon({map,viewer:null,environment:{objects:[]}}).length,0);
});
test('map UI is DM-only and shows quick marker controls and preview not player tooling',()=>{
 const board=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
 const overlay=readFileSync(new URL('../src/MapEnvironmentOverlay.jsx',import.meta.url),'utf8');
 const settings=readFileSync(new URL('../src/MapSettingPanel.jsx',import.meta.url),'utf8');
 const quick=readFileSync(new URL('../src/MapObjectQuickAdjust.jsx',import.meta.url),'utf8');
 assert.ok(board.includes('isDM&&environment&&<MapEnvironmentOverlay'));
 assert.ok(board.includes('previewVisionPolygon'));
 assert.ok(board.includes('MapPlayerPreviewOverlay'));
 assert.ok(board.includes('onPatchEnvironmentObject'));
 assert.ok(overlay.includes('resizeBarrierEndpoint'));
 assert.ok(overlay.includes("'map-env-marker map-env-marker-'+o.type"));
 assert.ok(settings.includes('Preview as player'));
 assert.ok(!settings.includes('Snap wall endpoints to the grid'));
 assert.ok(quick.includes('Curtains'));
 assert.ok(quick.includes('Locked '));
 assert.ok(quick.includes('Additional dim'));
});
