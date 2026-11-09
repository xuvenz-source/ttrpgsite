import test from 'node:test';
import assert from 'node:assert/strict';
import {createMovementController,createInputController,
 appendGestureBend,takeGestureBatch,expandGestureRoute,MAX_BATCH_CELLS}
 from '../src/engine/v2/index.js';

const mapId='map-v2',token={kind:'token',id:'hero'},selection=[token];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((y,n)=>{resolve=y;reject=n});return {promise,resolve,reject}};
const origin={x:0,y:0};
const config={mapId,selection,origin,pointer:origin};
const makeAuthority=(overrides={})=>{
 const calls={begin:[],advance:[],commit:[],cancel:[]};
 const authority={
  async begin(args){calls.begin.push(args);return {version:2,sessionId:'session-v2'}},
  async advance(args){
   calls.advance.push(args);
   return {version:2,sessionId:args.sessionId,seq:args.seq,blocked:false,
    accepted:expandGestureRoute(args.from,args.targets)};
  },
  async commit(args){
   calls.commit.push(args);
   return {version:2,sessionId:args.sessionId,seq:args.seq,
    endpoint:{...args.endpoint}};
  },
  async cancel(args){calls.cancel.push(args);return true},
  ...overrides
 };
 return {authority,calls};
};

test('grab feedback is synchronous, before an asynchronous begin reply',async()=>{
 const pending=deferred(),events=[];
 const {authority}=makeAuthority({begin:()=>pending.promise});
 const controller=createMovementController({authority,onEvent:event=>events.push(event)});
 assert.equal(controller.beginGesture(config),true);
 assert.equal(events[0].type,'grabbed');
 assert.equal(controller.state,'Grabbed');
 assert.equal(controller.beginGesture(config),false);
 controller.cancelGesture();
 pending.resolve({version:2,sessionId:'session-v2'});
 await tick();
 assert.equal(controller.state,'Cancelled');
});

test('actual bends and reversals remain ordered while straight samples coalesce',()=>{
 const path=[];
 for(const point of [{x:1,y:0},{x:8,y:0},{x:8,y:5},{x:2,y:5},{x:8,y:5}])
  assert.equal(appendGestureBend(path,point,origin),true);
 assert.deepEqual(path,[{x:8,y:0},{x:8,y:5},{x:2,y:5},{x:8,y:5}]);
});

test('rapid 60-cell intent splits into bounded requests, with no tile-by-tile input gate',()=>{
 let from={x:0,y:0},remaining=[{x:60,y:0}],batchCount=0;
 while(remaining.length){
  const batch=takeGestureBatch(from,remaining);
  assert.ok(batch);
  assert.ok(batch.targets.length);
  assert.ok(expandGestureRoute(from,batch.targets).length<=MAX_BATCH_CELLS);
  from=batch.targets.at(-1);remaining=batch.remaining;batchCount++;
  assert.ok(batchCount<10);
 }
 assert.deepEqual(from,{x:60,y:0});
 assert.equal(batchCount,3);
});

test('release drains all turns before one canonical commit',async()=>{
 const {authority,calls}=makeAuthority(),events=[];
 const controller=createMovementController({authority,onEvent:event=>events.push(event)});
 controller.beginGesture(config);
 controller.updateGesture({x:10,y:0});
 controller.updateGesture({x:10,y:10});
 controller.updateGesture({x:3,y:10});
 const result=await controller.endGesture();
 assert.equal(result.status,'committed');
 assert.deepEqual(calls.commit.map(x=>x.endpoint),[{x:3,y:10}]);
 assert.ok(calls.advance.length>=2);
 assert.equal(calls.advance[0].targets[0].y,0);
 assert.equal(events.at(-1).type,'committed');
});

test('pointer-up during a delayed session begin still commits intended route',async()=>{
 const begin=deferred(),{authority,calls}=makeAuthority({begin:()=>begin.promise});
 const controller=createMovementController({authority});
 controller.beginGesture(config);
 controller.updateGesture({x:12,y:0});
 const result=controller.endGesture();
 await tick();
 assert.equal(calls.commit.length,0);
 begin.resolve({version:2,sessionId:'session-v2'});
 assert.equal((await result).status,'committed');
 assert.deepEqual(calls.commit[0].endpoint,{x:12,y:0});
});

test('pending RPC cannot resurrect a cancelled gesture or commit stale state',async()=>{
 const advance=deferred();
 const {authority,calls}=makeAuthority({advance:async args=>{
  calls.advance.push(args);return advance.promise;
 }});
 const controller=createMovementController({authority});
 controller.beginGesture(config);
 controller.updateGesture({x:6,y:0});
 await tick();
 assert.equal(calls.advance.length,1);
 const cancelled=controller.cancelGesture('map-change');
 assert.equal(cancelled,true);
 advance.resolve({version:2,sessionId:'session-v2',seq:1,blocked:false,
  accepted:expandGestureRoute(origin,[{x:6,y:0}])});
 await tick();
 assert.equal(controller.state,'Cancelled');
 assert.equal(calls.commit.length,0);
 assert.equal(calls.cancel.length,1);
});

test('untrusted ACK containing hidden geometry is rejected, not rendered',async()=>{
 const {authority,calls}=makeAuthority({advance:async args=>{
  calls.advance.push(args);
  return {version:2,sessionId:args.sessionId,seq:args.seq,
   accepted:[{x:1,y:0}],blocked:false,privateWalls:['secret']};
 }});
 const events=[];
 const controller=createMovementController({authority,onEvent:e=>events.push(e)});
 controller.beginGesture(config);
 controller.updateGesture({x:1,y:0});
 const result=await controller.endGesture();
 assert.equal(result.status,'rejected');
 assert.equal(result.reason,'invalid-authority-ack');
 assert.equal(calls.commit.length,0);
 assert.ok(events.some(e=>e.type==='rejected'));
});

test('unknown geometry never grants local travel while approval is pending',async()=>{
 const gate=deferred(),{authority,calls}=makeAuthority({advance:async a=>{
  calls.advance.push(a);return gate.promise;
 }});
 const events=[];
 const controller=createMovementController({authority,onEvent:e=>events.push(e)});
 controller.beginGesture(config);
 controller.updateGesture({x:5.5,y:0});
 assert.equal(events.at(-1).presented.x,0);
 await tick();
 assert.equal(controller.state,'Moving');
 gate.resolve({version:2,sessionId:'session-v2',seq:1,blocked:false,
  accepted:expandGestureRoute(origin,[{x:6,y:0}])});
 await tick();
 assert.equal(events.at(-1).approved.x,6);
 controller.cancelGesture();
});

test('a caller-supplied known-edge grant can present immediate fractional dragging',()=>{
 const events=[];
 const {authority}=makeAuthority({begin:()=>new Promise(()=>{})});
 const controller=createMovementController({authority,onEvent:e=>events.push(e),
  canPredict:({to})=>to.x<=2});
 controller.beginGesture(config);
 controller.updateGesture({x:1.6,y:0.3});
 assert.deepEqual(events.at(-1).presented,{x:1.6,y:0.3});
 assert.equal(events.at(-1).predicted,true);
 controller.cancelGesture();
});

test('permission or scene change revokes gesture without persisting',async()=>{
 const {authority,calls}=makeAuthority(),events=[];
 const controller=createMovementController({authority,onEvent:e=>events.push(e)});
 controller.beginGesture({...config,permissionGeneration:1});
 await tick();
 controller.updateContext({permissionGeneration:2});
 await tick();
 assert.equal(controller.state,'Revoked');
 assert.equal(calls.commit.length,0);
 assert.ok(events.some(e=>e.type==='revoked'));
});

test('DM preview uses same path engine but never persists a commit',async()=>{
 const {authority,calls}=makeAuthority();
 const controller=createMovementController({authority});
 controller.beginGesture({...config,mode:'preview'});
 controller.updateGesture({x:3,y:2});
 const result=await controller.endGesture();
 assert.equal(result.status,'committed');
 assert.equal(result.preview,true);
 assert.equal(calls.commit.length,0);
 assert.equal(calls.cancel.length,1);
});

class FakeEvents {
 constructor(){this.handlers=new Map();this.captured=null}
 addEventListener(type,fn){const x=this.handlers.get(type)||[];x.push(fn);this.handlers.set(type,x)}
 removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)||[]).filter(x=>x!==fn))}
 dispatch(type,evt){for(const fn of [...(this.handlers.get(type)||[])])fn(evt)}
 setPointerCapture(id){this.captured=id}
 hasPointerCapture(id){return this.captured===id}
 releasePointerCapture(id){if(this.captured===id)this.captured=null}
}
const evt=(x,y,extra={})=>({clientX:x,clientY:y,pointerId:1,button:0,
 pointerType:'mouse',preventDefault(){this.defaultPrevented=true},...extra});

test('pointer sampling preserves coalesced bends and releases captured pointer',async()=>{
 const surface=new FakeEvents(),keyboard=new FakeEvents(),{authority,calls}=makeAuthority();
 const controller=createMovementController({authority});
 const input=createInputController({target:surface,keyboardTarget:keyboard,controller,
  pointFromEvent:e=>({x:e.clientX,y:e.clientY}),
  resolveSelection:()=>({mapId,selection,origin})});
 input.mount();
 surface.dispatch('pointerdown',evt(0,0));
 surface.dispatch('pointermove',evt(9,9,{getCoalescedEvents:()=>[
  evt(9,0),evt(9,9)]}));
 surface.dispatch('pointerup',evt(9,9));
 await tick();
 await tick();
 assert.equal(surface.captured,null);
 assert.deepEqual(calls.commit[0].endpoint,{x:9,y:9});
 assert.equal(calls.advance[0].targets[0].y,0);
 input.unmount();
 assert.equal(surface.handlers.get('pointermove').length,0);
});

test('keyboard nudges share controller and ignore input fields',async()=>{
 const surface=new FakeEvents(),keyboard=new FakeEvents(),{authority,calls}=makeAuthority();
 const controller=createMovementController({authority});
 const timers=[];
 const input=createInputController({target:surface,keyboardTarget:keyboard,controller,
  keyboardIdleMs:0,
  setTimer:fn=>{timers.push(fn);return timers.length},
  clearTimer:id=>{timers[id-1]=null},
  pointFromEvent:e=>({x:e.clientX,y:e.clientY}),
  resolveSelection:()=>({mapId,selection,origin})});
 input.mount();
 keyboard.dispatch('keydown',{key:'ArrowRight',target:{tagName:'INPUT'},
  preventDefault(){}});
 assert.equal(controller.state,'Idle');
 keyboard.dispatch('keydown',{key:'ArrowRight',target:{tagName:'DIV'},
  preventDefault(){}});
 keyboard.dispatch('keydown',{key:'ArrowRight',repeat:true,target:{tagName:'DIV'},
  preventDefault(){}});
 keyboard.dispatch('keyup',{key:'ArrowRight',target:{tagName:'DIV'},
  preventDefault(){}});
 assert.equal(timers.filter(Boolean).length,1);
 timers.at(-1)();
 await tick();await tick();await tick();
 assert.deepEqual(calls.commit[0].endpoint,{x:2,y:0});
 assert.equal(calls.begin.length,1);
 input.unmount();
});

test('blur, pointer cancellation and unmount end captures cleanly',async()=>{
 const surface=new FakeEvents(),keyboard=new FakeEvents();
 const {authority}=makeAuthority();
 const controller=createMovementController({authority});
 const input=createInputController({target:surface,keyboardTarget:keyboard,controller,
  pointFromEvent:e=>({x:e.clientX,y:e.clientY}),
  resolveSelection:()=>({mapId,selection,origin})});
 input.mount();
 surface.dispatch('pointerdown',evt(0,0,{pointerType:'touch'}));
 keyboard.dispatch('blur',{});
 assert.equal(surface.captured,null);
 assert.equal(controller.state,'Cancelled');
 surface.dispatch('pointerdown',evt(0,0));
 surface.dispatch('pointercancel',evt(0,0));
 assert.equal(controller.state,'Cancelled');
 input.unmount();
 assert.equal(input.mounted,false);
});

test('group movement sends one gesture with all piece identities',async()=>{
 const {authority,calls}=makeAuthority();
 const members=[{kind:'token',id:'hero'},{kind:'tool',id:'torch'}];
 const controller=createMovementController({authority});
 assert.equal(controller.beginGesture({...config,selection:members}),true);
 controller.updateGesture({x:4,y:0});
 assert.equal((await controller.endGesture()).status,'committed');
 assert.deepEqual(calls.begin[0].selection,members);
 assert.deepEqual(calls.advance[0].selection,members);
 assert.equal(calls.commit.length,1);
});

test('scene revision invalidation and duplicate members fail safely',async()=>{
 const {authority,calls}=makeAuthority();
 const controller=createMovementController({authority});
 assert.equal(controller.beginGesture({...config,selection:[token,token]}),false);
 assert.equal(controller.beginGesture({...config,environmentRevision:7}),true);
 await tick();
 controller.updateContext({environmentRevision:8});
 await tick();
 assert.equal(controller.state,'Cancelled');
 assert.equal(calls.commit.length,0);
});

test('bounded gesture path refuses excessive turns instead of dropping bends',async()=>{
 const {authority}=makeAuthority({begin:()=>new Promise(()=>{})});
 const controller=createMovementController({authority});
 controller.beginGesture(config);
 for(let i=1;i<=130&&controller.active;i++){
  const x=i%2===1?1:0;
  controller.updateGesture({x,y:i});
 }
 assert.equal(controller.state,'Rejected');
});
