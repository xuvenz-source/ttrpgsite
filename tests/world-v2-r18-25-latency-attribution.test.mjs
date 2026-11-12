import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createWorldV2Trace,isWorldV2TraceEvent,isWorldV2TraceDetail,
 isWorldV2TraceMetric
} from '../src/engine/v2/WorldTrace.js';
import {createInputController} from '../src/engine/v2/InputController.js';
import {isWorldPointerTargetBlocked} from '../src/engine/v2/PointerHitTest.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('R18-25 uses one existing bounded opt-in telemetry recorder for CPU timings',()=>{
 let now=0;
 const trace=createWorldV2Trace({enabled:true,now:()=>now,limit:256});
 for(const name of ['input.pick-duration','input.pointer-handle','prediction.local']){
  assert.equal(isWorldV2TraceMetric(name),true);
  const end=trace.begin(name);
  now+=13;end();
  assert.equal(trace.snapshot().durations[name].samples,1);
  assert.equal(trace.snapshot().durations[name].p95Ms,13);
 }
 assert.equal(isWorldV2TraceEvent('input.pointer.intercept'),true);
 assert.equal(isWorldV2TraceDetail('pin'),true);
 trace.event('input.pointer.intercept','pin');
 assert.deepEqual(trace.snapshot().events.at(-1),{
  ms:39,event:'input.pointer.intercept',detail:'pin'
 });
 assert.equal(JSON.stringify(trace.snapshot()).includes('tokenId'),false);
});
test('R18-25 bounded timing samples never retain arbitrary event attributes',()=>{
 let now=0;
 const trace=createWorldV2Trace({enabled:true,limit:16,now:()=>now});
 for(let n=0;n<800;n++){
  const end=trace.begin('prediction.local');now+=1;end();
  trace.event('input.pointer.intercept','pin');
 }
 const result=trace.snapshot();
 assert.equal(result.durations['prediction.local'].samples,16);
 assert.equal(result.events.length,16);
 assert.equal(result.counts['input.pointer.intercept'],800);
 trace.event('input.pointer.intercept','SECRET_WORLD_GEOMETRY');
 assert.equal(result.events.some(e=>e.detail==='SECRET_WORLD_GEOMETRY'),false);
});
class Target{
 handlers=new Map();
 addEventListener(name,callback){this.handlers.set(name,callback)}
 removeEventListener(name){this.handlers.delete(name)}
 emit(name,event){this.handlers.get(name)?.(event)}
 setPointerCapture(){}
 hasPointerCapture(){return false}
 contains(){return false}
}
const event=(target,pointerId,point)=>({
 button:0,pointerId,isPrimary:true,pointerType:'mouse',target,
 p:point,preventDefault(){},
 getCoalescedEvents(){return []}
});
test('R18-25 pin interception never fabricates an active movement gesture',()=>{
 const node=new Target();let began=0,updates=0;
 const controller={
  active:false,
  beginGesture(){began++;this.active=true;return true},
  updateGesture(){updates++;return true},
  endGesture(){this.active=false;return Promise.resolve({status:'committed'})},
  cancelGesture(){this.active=false;return true}
 };
 const pin={closest:selector=>selector==='.map-handout-pin'?{}:null};
 assert.equal(isWorldPointerTargetBlocked({closest:selector=>
  selector.includes('.map-handout-pin')?{}:null}),true);
 const a=createInputController({
  target:node,keyboardTarget:node,blurTarget:node,controller,
  pointFromEvent:e=>e.p,resolveSelection:()=>null
 });
 a.mount();
 node.emit('pointerdown',event(pin,5,{x:2,y:2}));
 assert.equal(began,0);
 assert.equal(updates,0);
 a.unmount();
});
test('R18-25 an active pointer can cross a pin overlay without cancelling',()=>{
 const node=new Target(),calls=[];
 const controller={
  active:false,
  beginGesture(){calls.push('begin');this.active=true;return true},
  updateGesture(point){calls.push(['move',point]);return true},
  endGesture(){calls.push('end');this.active=false;return Promise.resolve({status:'committed'})},
  cancelGesture(){calls.push('cancel');this.active=false;return true}
 };
 const a=createInputController({
  target:node,keyboardTarget:node,blurTarget:node,controller,
  pointFromEvent:e=>e.p,
  resolveSelection:()=>({origin:{x:1,y:1},
   selection:[{kind:'token',id:'opaque'}],mapId:'opaque'})
 });
 a.mount();
 const normal={closest:()=>null};
 const pin={closest:selector=>selector==='.map-handout-pin'?{}:null};
 node.emit('pointerdown',event(normal,5,{x:1,y:1}));
 node.emit('pointermove',event(pin,5,{x:2,y:1}));
 node.emit('pointerup',event(pin,5,{x:2,y:1}));
 assert.equal(calls[0],'begin');
 assert.ok(calls.some(x=>Array.isArray(x)&&x[1].x===2));
 assert.ok(calls.includes('end'));
 assert.equal(calls.includes('cancel'),false);
 a.unmount();
});
test('R18-25 runtime measures local predictor in finally, without moving its authorization gate',()=>{
 const runtime=source('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.match(runtime,/canPredict:request=>\{[\s\S]*?worldV2Trace\.begin\('prediction\.local'\)/);
 assert.match(runtime,/if\(disposed\|\|!authorized\(\)\)return false/);
 assert.match(runtime,/return collisionAllowsStep\(\{[\s\S]*?finally\{endLocalPrediction\(\)\}/);
 assert.doesNotMatch(runtime,/prediction\.local[\s\S]{0,160}grantPrediction|allowUnknownFog/);
});
test('R18-25 pointer timings bracket only synchronous local work, never network latency',()=>{
 const input=source('src/engine/v2/InputController.js');
 assert.match(input,/worldV2Trace\.begin\('input\.pick-duration'\)/);
 assert.match(input,/try\{picked=resolveSelection\(event,p\)\}finally\{endPick\(\)\}/);
 assert.match(input,/worldV2Trace\.begin\('input\.pointer-handle'\)/);
 assert.match(input,/finally\{endHandle\(\)\}/);
 assert.match(input,/\.closest\?\.\('\.map-handout-pin'\)/);
 assert.doesNotMatch(input,/supabase|db\.rpc\(/);
});
