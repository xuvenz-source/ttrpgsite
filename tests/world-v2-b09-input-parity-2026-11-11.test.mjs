import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldKeyboardStepper} from '../src/engine/v2/KeyboardStepper.js';
import {createInputController} from '../src/engine/v2/InputController.js';
import {worldGestureSelection} from '../src/engine/v2/GestureSelection.js';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {createPreviewAuthority} from '../src/engine/v2/PreviewAuthority.js';
import {compileCollisionScene} from '../src/engine/v2/CollisionSolver.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='10000000-0000-4000-8000-000000000001';
const TOKEN='40000000-0000-4000-8000-000000000001';
const SECOND='40000000-0000-4000-8000-000000000002';
const TOOL='50000000-0000-4000-8000-000000000001';
const SESSION='b0000000-0000-4000-8000-000000000001';
const point=(x,y)=>({x,y});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){
 let resolve;const promise=new Promise(done=>{resolve=done});
 return {promise,resolve};
}
function timer(){
 const timers=new Map();let id=0;
 return {setTimer:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key},
  clearTimer:key=>timers.delete(key),
  fire(ms){const entry=[...timers].find(([,v])=>v.ms===ms);
   assert.ok(entry,'expected '+ms+'ms timer');
   timers.delete(entry[0]);entry[1].fn();}
 };
}
const group=[{kind:'token',id:TOKEN},{kind:'token',id:SECOND},{kind:'tool',id:TOOL}];
function keyboardHarness({refresh=true,mode='keyboard',selection=[group[0]]}={}){
 const clock=timer(),calls=[],begins=[],ends=[],positions=[],finish=deferred();
 let active=false;let refreshCalls=0;
 const runtime={active:true,sceneManager:{displayedScene:{revision:9}},
  visibility:{frame:{permissionGeneration:4}},
  async refreshVisibility(){refreshCalls++;return refresh},
  movement:{
   get active(){return active},
   beginGesture(req){begins.push(req);active=true;return true},
   updateGesture(next){positions.push({...next});return true},
   endGesture(){calls.push('end');ends.push(finish);return finish.promise},
   cancelGesture(reason){calls.push(reason);active=false}
  }
 };
 const stepper=createWorldKeyboardStepper({
  getRuntime:()=>runtime,makePick:()=>({mapId:MAP,origin:point(2,2),
   selection,mode}),setTimer:clock.setTimer,clearTimer:clock.clearTimer,
  idleMs:180,maxQueued:2
 });
 return {runtime,stepper,clock,positions,begins,calls,
  get refreshCalls(){return refreshCalls},
  resolve(status='committed'){active=false;finish.resolve({status})}};
}
test('B09 rapid keyboard turns coalesce in one gesture and preserve mixed-group IDs',async()=>{
 const h=keyboardHarness({selection:group});
 assert.equal(h.stepper.step(1,0),true);
 assert.equal(h.stepper.step(0,1),true);
 assert.equal(h.stepper.step(-1,0),true);
 assert.deepEqual(h.positions,[point(3,2),point(3,3),point(2,3)]);
 assert.deepEqual(h.begins[0].selection,group);
 assert.equal(h.begins[0].mode,'keyboard');
 h.stepper.step(0,0,{release:true});h.clock.fire(180);
 assert.deepEqual(h.calls,['end']);
 h.resolve();await tick();h.stepper.dispose();
});
test('B09 queued rapid keys cannot replay across rejected or uncertain final commits',async()=>{
 for(const status of ['rejected','uncertain','revoked','cancelled']){
  const h=keyboardHarness();
  h.stepper.step(1,0);h.stepper.step(0,0,{release:true});h.clock.fire(180);
  assert.equal(h.stepper.step(0,1),true);
  assert.equal(h.stepper.step(1,0),true);
  assert.equal(h.stepper.step(1,0),false,'backlog must be bounded');
  h.resolve(status);await tick();await tick();
  assert.equal(h.stepper.queueLength,0);
  assert.equal(h.positions.length,1,'failed commit cannot silently advance the next gesture');
  assert.equal(h.refreshCalls,0);
  h.stepper.dispose();
 }
});
test('B09 queue continuation requires fresh canonical sight before any new Begin',async()=>{
 const h=keyboardHarness({refresh:false});
 h.stepper.step(1,0);h.stepper.step(0,0,{release:true});h.clock.fire(180);
 h.stepper.step(0,1);h.resolve('committed');
 await tick();await tick();
 assert.equal(h.refreshCalls,1);
 assert.equal(h.begins.length,1,'no new Begin after failed visibility authorization');
 assert.equal(h.positions.length,1);
 assert.equal(h.stepper.queueLength,0);
 h.stepper.dispose();
});
test('B09 keyboard queue never crosses replaced map runtime while prior commit is finishing',async()=>{
 const h=keyboardHarness();
 h.stepper.step(1,0);h.stepper.step(0,0,{release:true});h.clock.fire(180);
 h.stepper.step(0,1);
 h.runtime.active=false;
 h.resolve('committed');await tick();
 assert.equal(h.positions.length,1);assert.equal(h.stepper.queueLength,0);
 h.stepper.dispose();
});

function emitter(){
 const listeners=new Map();
 return {
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());
   listeners.get(type).add(fn)},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
  emit(type,props={}){
   const e={type,button:0,isPrimary:true,preventDefault(){},
    pointerType:'touch',pointerId:1,target:{},point:point(2,2),...props};
   for(const fn of [...listeners.get(type)||[]])fn(e);
   return e;
  },
  setPointerCapture(){},hasPointerCapture(){return true},releasePointerCapture(){}
 };
}
test('B09 single-finger drag uses the same authority; second touch cancels safely',()=>{
 const root=emitter(),events=[],status=[];
 let active=false;
 const controller={
  get active(){return active},
  beginGesture(req){events.push(['begin',req]);active=true;return true},
  updateGesture(p){events.push(['move',p]);return true},
  endGesture(){events.push(['commit']);active=false;return Promise.resolve({status:'committed'})},
  cancelGesture(reason){events.push(['cancel',reason]);active=false}
 };
 const input=createInputController({
  target:root,keyboardTarget:root,blurTarget:root,controller,
  pointFromEvent:e=>e.point,
  resolveSelection:()=>({mapId:MAP,origin:point(2,2),selection:[group[0]]}),
  onPointerStatus:(_,code)=>status.push(code)
 });
 input.mount();
 root.emit('pointerdown',{pointerId:11});
 root.emit('pointermove',{pointerId:11,point:point(3,2)});
 assert.equal(events[0][1].mode,'touch');
 assert.deepEqual(events[1],[ 'move',point(3,2)]);
 root.emit('pointerdown',{pointerId:12,isPrimary:false,point:point(3,2)});
 assert.deepEqual(events.at(-1),['cancel','multi-touch']);
 root.emit('pointermove',{pointerId:11,point:point(4,2)});
 root.emit('pointerup',{pointerId:11});
 assert.equal(events.some(x=>x[0]==='commit'),false);
 root.emit('pointerdown',{pointerId:13,isPrimary:true});
 assert.equal(events.filter(x=>x[0]==='begin').length,1,'new touches blocked during pinch');
 root.emit('pointerup',{pointerId:12,isPrimary:false});
 root.emit('pointerup',{pointerId:13});
 root.emit('pointerdown',{pointerId:14,isPrimary:true});
 root.emit('pointerup',{pointerId:14});
 assert.equal(events.filter(x=>x[0]==='begin').length,2);
 assert.equal(events.filter(x=>x[0]==='commit').length,1);
 assert.ok(status.includes('multi-touch'));
 input.unmount();
});
test('B09 second finger outside viewport also cancels held touch drag',()=>{
 const root=emitter(),events=[];
 const viewport={
  ownerDocument:root,contains:element=>element?.inside===true,
  addEventListener:(name,fn)=>root.addEventListener(name,fn),
  removeEventListener:(name,fn)=>root.removeEventListener(name,fn),
  setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return true}
 };
 let active=false;
 const controller={
  get active(){return active},
  beginGesture(){active=true;events.push('begin');return true},
  updateGesture(){events.push('move');return true},
  endGesture(){active=false;events.push('commit');return Promise.resolve({status:'committed'})},
  cancelGesture(reason){active=false;events.push(reason)}
 };
 const input=createInputController({target:viewport,
  keyboardTarget:root,blurTarget:root,controller,
  pointFromEvent:e=>e.point,
  resolveSelection:()=>({mapId:MAP,origin:point(2,2),selection:[group[0]]})});
 input.mount();
 root.emit('pointerdown',{pointerId:41,target:{inside:true}});
 root.emit('pointerdown',{pointerId:42,isPrimary:false,target:{inside:false}});
 assert.deepEqual(events,['begin','multi-touch']);
 root.emit('pointermove',{pointerId:41,target:{inside:true},point:point(5,2)});
 root.emit('pointerup',{pointerId:41});
 root.emit('pointerup',{pointerId:42,isPrimary:false});
 assert.deepEqual(events,['begin','multi-touch'],'no commit after multi-finger gesture');
 input.unmount();
});
test('B09 keyboard/touch/drag share ordered server-approved route and atomic group commit',async()=>{
 for(const mode of ['keyboard','touch','drag']){
  const calls=[],events=[],origin=point(2,2);
  const authority={
   async begin(req){calls.push(['begin',req]);return {version:2,sessionId:SESSION}},
   async advance(req){calls.push(['advance',req]);return {
    version:2,sessionId:SESSION,seq:req.seq,blocked:false,
    accepted:expandGestureRoute(req.from,req.targets)}},
   async commit(req){calls.push(['commit',req]);return {
    version:2,sessionId:SESSION,seq:req.seq,endpoint:req.endpoint}},
   async cancel(req){calls.push(['cancel',req]);return true}
  };
  const movement=createMovementController({authority,coalesceMotion:true,
   coalesceWindowMs:0,onEvent:e=>events.push(e)});
  assert.equal(movement.beginGesture({mapId:MAP,selection:group,origin,pointer:origin,
   mode,environmentRevision:9,permissionGeneration:4}),true);
  movement.updateGesture(point(3,2));movement.updateGesture(point(3,3));
  const done=await movement.endGesture();
  assert.equal(done.status,'committed');
  assert.deepEqual(calls.map(x=>x[0]),['begin','advance','commit']);
  assert.deepEqual(calls[0][1].selection,group);
  assert.deepEqual(calls[1][1].targets,[point(3,2),point(3,3)]);
  assert.deepEqual(calls[2][1].endpoint,point(3,3));
  assert.equal(events.filter(x=>x.type==='committed').length,1);
  movement.dispose();
 }
});
test('B09 preview strictly tracks prior approved origin and never writes canonical state',async()=>{
 const scene=compileCollisionScene({map:{id:MAP,width:1500,height:1500,
  grid_size:100},environment:{objects:[]},revision:9,scope:'dm',
  collisionEnabled:true});
 const actor={kind:'token',id:TOKEN,x:2,y:2,spanX:1,spanY:1};
 let revision=scene,commitCalls=0,origin=point(2,2);
 const preview=createPreviewAuthority({
  getScene:()=>revision,getPieces:()=>[actor],getPosition:()=>origin
 });
 const s=await preview.begin({mode:'preview',mapId:MAP,selection:[group[0]],
  origin:point(2,2),environmentRevision:9});
 const a=await preview.advance({sessionId:s.sessionId,mapId:MAP,seq:1,
  from:point(2,2),targets:[point(3,2)],environmentRevision:9});
 assert.deepEqual(a.accepted,[point(3,2)]);
 await assert.rejects(preview.advance({sessionId:s.sessionId,mapId:MAP,seq:2,
  from:point(7,2),targets:[point(8,2)],environmentRevision:9}),
  /revoked/,'cannot teleport from a forged previous anchor');
 const b=await preview.advance({sessionId:s.sessionId,mapId:MAP,seq:2,
  from:point(3,2),targets:[point(3,3)],environmentRevision:9});
 assert.deepEqual(b.accepted,[point(3,3)]);
 revision={...scene,revision:10};
 await assert.rejects(preview.advance({sessionId:s.sessionId,mapId:MAP,seq:3,
  from:point(3,3),targets:[point(3,4)],environmentRevision:9}),/revoked/);
 await assert.rejects(preview.commit().then(()=>commitCalls++),/cannot commit/);
 assert.equal(commitCalls,0);
 await preview.cancel({sessionId:s.sessionId});preview.dispose();
});
test('B09 selection cannot append tool or extra token to player-effective preview',()=>{
 const picked=group[0];
 assert.deepEqual(worldGestureSelection({
  picked,selectedTokens:[TOKEN,SECOND],selectedTools:[TOOL],
  keyboard:true,preview:true}),[picked]);
 assert.deepEqual(worldGestureSelection({
  picked,selectedTokens:[TOKEN,SECOND],selectedTools:[TOOL],
  keyboard:true,preview:false}),group);
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(board,/const selection=selected;\s*if\(!selection\.length\|\|selection\.length>48/);
 assert.match(board,/!authorizeSelection\(selection\)\)return denied\('roster'\)/);
 assert.match(board,/selection:\[\{kind:'token',id:actor\.id\}\],mode:'preview'/);
});
