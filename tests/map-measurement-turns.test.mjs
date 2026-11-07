import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addLineTurn,shouldBendLineOnRightPress,MAX_LINE_TURNS,FEET_PER_CELL,measurementGeometry,
 liveMeasurementPayload,validMeasurement,acceptMeasurementEvent,
 applyMeasurementEventToVisible} from '../src/MapMeasurements.js';

const actor='afa1637d-bcf1-4526-b351-11497a89b666',
 mapId='7b9328d0-3bbd-4c37-95ad-4f85d8408095',
 id='c9f171c5-d2c2-47ae-9021-02f9a6713c97';
const point=(x,y)=>({x,y});
test('right click while dragging creates a turning waypoint and cumulative 5ft legs',()=>{
 const initial={tool:'line',start:point(.5,.5),end:point(2.5,.5)};
 const first=addLineTurn(initial,point(2.5,.5));
 assert.deepEqual(first.via,[point(2.5,.5)]);
 const afterTurn={...first,end:point(2.5,3.5)};
 assert.deepEqual(measurementGeometry(afterTurn).path,
  [point(.5,.5),point(2.5,.5),point(2.5,3.5)]);
 assert.equal(measurementGeometry(afterTurn).feet,25);
 assert.equal(measurementGeometry(afterTurn).label,'25 ft');
 assert.equal(measurementGeometry(initial).feet,10);
 assert.equal(measurementGeometry({...initial,end:point(2.5,3.5)}).feet,20);
 assert.equal(measurementGeometry(afterTurn).feet%FEET_PER_CELL,0);
 const second=addLineTurn(afterTurn,point(2.5,3.5));
 const final={...second,end:point(1.5,3.5)};
 assert.equal(measurementGeometry(final).feet,30);
 assert.equal(final.via.length,2);
});
test('duplicate turns are ignored, and circular return routes still have distance',()=>{
 const initial={tool:'line',start:point(.5,.5),end:point(2.5,.5)};
 assert.equal(addLineTurn(initial,point(.5,.5)),initial);
 const first=addLineTurn(initial,point(2.5,.5));
 assert.equal(addLineTurn(first,point(2.5,.5)),first);
 const returning={...first,end:point(.5,.5)};
 assert.equal(measurementGeometry(returning).feet,20);
 assert.equal(addLineTurn({...initial,tool:'circle'},point(2.5,.5)).via,undefined);
});
test('paths have a fixed max waypoint count to prevent invalid remote drawings',()=>{
 let route={tool:'line',start:point(.5,.5),end:point(.5,.5)};
 for(let i=1;i<=MAX_LINE_TURNS;i++)route=addLineTurn(route,point(i+.5,.5));
 assert.equal(route.via.length,MAX_LINE_TURNS);
 assert.equal(addLineTurn(route,point(100.5,.5)),route);
 assert.equal(measurementGeometry({...route,via:[...route.via,point(99.5,.5)]}),null);
});
test('realtime pin and preview preserve turns; missing via remains backwards compatible',()=>{
 const measure={tool:'line',start:point(.5,.5),end:point(2.5,3.5),
  via:[point(2.5,.5)]};
 const preview=liveMeasurementPayload(measure,id,actor,mapId,'preview',111);
 const pin=liveMeasurementPayload(measure,id,actor,mapId,'pin',112);
 assert.deepEqual(preview.via,measure.via);
 assert.equal(validMeasurement(preview,mapId,10,10),true);
 assert.equal(validMeasurement(pin,mapId,10,10),true);
 assert.equal(validMeasurement({...preview,via:[point(12,.5)]},mapId,10,10),false);
 assert.equal(validMeasurement({...preview,via:[{x:NaN,y:2}]},mapId,10,10),false);
 assert.equal(validMeasurement({...preview,via:'bad'},mapId,10,10),false);
 assert.equal(validMeasurement({...preview,tool:'circle'},mapId,10,10),false);
 const original=liveMeasurementPayload({...measure,via:undefined},id,actor,mapId,'preview',113);
 assert.equal(validMeasurement(original,mapId,10,10),true);
 const revisions=new Map(),clearByActor=new Map();
 assert.equal(acceptMeasurementEvent(preview,revisions,clearByActor),true);
 const live=applyMeasurementEventToVisible({},preview);
 assert.equal(measurementGeometry(live[id]).feet,25);
 const remove=liveMeasurementPayload(measure,id,actor,mapId,'remove',114);
 assert.deepEqual(applyMeasurementEventToVisible(live,remove),{});
});
test('ruler turn classification tracks the original left drag, independent of e.buttons',()=>{
 const drag={sourceButton:0,pinned:false,measure:{tool:'line'}};
 assert.equal(shouldBendLineOnRightPress(drag,2),true);
 assert.equal(shouldBendLineOnRightPress({...drag,sourceButton:2},2),false);
 assert.equal(shouldBendLineOnRightPress({...drag,pinned:true},2),false);
 assert.equal(shouldBendLineOnRightPress({...drag,measure:{tool:'cone'}},2),false);
 assert.equal(shouldBendLineOnRightPress(drag,0),false);
 assert.equal(shouldBendLineOnRightPress(null,2),false);
});
test('board keeps right-drag pin but uses primary+secondary chord to bend line',()=>{
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('../src/MapMeasurementTools.jsx',import.meta.url),'utf8');
 assert.ok(source.includes("shouldBendLineOnRightPress(current,e.button)"));
 assert.ok(source.includes("const next=addLineTurn(current.measure,mapPointInCells(e)||current.measure.end)"));
 assert.ok(source.includes("measureDrag.current.pinned=true"));
 assert.ok(source.includes("if(!cancel&&e.button===2&&current.sourceButton===0)return"));
 assert.ok(source.includes("onMeasurementPreview?.(next,'preview',true)"));
 assert.ok(source.includes("window.addEventListener('mousedown',onMouseDown,true)"));
 assert.ok(source.includes("if(e.button===2&&measureDrag.current)pinCurrentMeasurementOnRightClick(e)"));
 assert.ok(source.includes("window.addEventListener('mouseup',onMouseUp,true)"));
 assert.ok(overlay.includes('g.path.map(p=>p.x'));
 assert.ok(overlay.includes('g.via.map((p,i)'));
});
