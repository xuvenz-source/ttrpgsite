import test from 'node:test';
import assert from 'node:assert/strict';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {createWorldKeyboardStepper} from '../src/engine/v2/KeyboardStepper.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const position=(x,y)=>({x,y});

test('R17 real controller ACK rebases keyboard to approved cell and permits a lateral turn',async()=>{
 const calls=[],events=[],scene={revision:4};
 let active=true,stepper,commit=null;
 const authority={
  begin:async()=>({version:2,sessionId:SESSION}),
  advance:async req=>{
   calls.push(req);
   const path=expandGestureRoute(req.from,req.targets);
   const deniedIndex=path.findIndex(p=>p.x===3&&p.y===1);
   return {version:2,sessionId:SESSION,seq:req.seq,
    blocked:deniedIndex>=0,accepted:deniedIndex>=0?
     path.slice(0,deniedIndex):path};
  },
  commit:async req=>{commit=req;return {
   version:2,sessionId:SESSION,seq:req.seq,endpoint:req.endpoint}},
  cancel:async()=>true
 };
 const controller=createMovementController({authority,onEvent:event=>{
  events.push(event);
  if(event.type==='blocked')stepper?.onBlocked(event);
 }});
 const runtime={
  get active(){return active},
  sceneManager:{displayedScene:scene},
  visibility:{frame:{permissionGeneration:3}},
  movement:controller,refreshVisibility:async()=>true
 };
 let timer=null;
 stepper=createWorldKeyboardStepper({
  getRuntime:()=>runtime,
  makePick:()=>({mapId:MAP,origin:position(1,1),
   selection:[{kind:'token',id:TOKEN}],mode:'keyboard'}),
  setTimer:fn=>{timer=fn;return 1},clearTimer:()=>{timer=null}
 });
 try{
  assert.equal(stepper.step(1,0),true);
  assert.equal(stepper.step(1,0),true);
  assert.equal(stepper.step(1,0),true);
  for(let i=0;i<5;i++)await tick();
  const denied=events.find(e=>e.type==='blocked');
  assert.ok(denied,'the server must deny the exact wall crossing');
  assert.deepEqual(denied.approved,position(2,1));
  assert.deepEqual(denied.blockedAt,position(3,1));
  const before=calls.length;
  for(let i=0;i<15;i++)assert.equal(stepper.step(1,0),true);
  for(let i=0;i<3;i++)await tick();
  assert.equal(calls.length,before,
   'holding the already denied key must not repeat server requests');
  assert.equal(stepper.step(0,1),true);
  for(let i=0;i<5;i++)await tick();
  assert.equal(calls.length,before+1,
   'turning around a blocked edge must immediately reach the server');
  assert.deepEqual(calls.at(-1).from,position(2,1));
  assert.deepEqual(calls.at(-1).targets,[position(2,2)]);
  assert.equal(stepper.step(0,0,{release:true}),true);
  assert.ok(timer);timer();
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(commit?.endpoint,position(2,2));
  assert.ok(!events.some(e=>e.type==='rejected'));
 }finally{active=false;stepper.dispose();controller.dispose()}
});

test('R17 invalid or absent denied cell never creates a local collision grant',()=>{
 let active=true,updates=[],movementActive=false;
 const runtime={get active(){return active},
  sceneManager:{displayedScene:{revision:1}},
  visibility:{frame:{permissionGeneration:1}},
  movement:{
   get active(){return movementActive},
   beginGesture(){movementActive=true;return true},
   updateGesture:p=>{updates.push(p);return true},
   endGesture:()=>Promise.resolve({status:'committed'}),
   cancelGesture(){movementActive=false}
  }};
 const stepper=createWorldKeyboardStepper({
  getRuntime:()=>runtime,
  makePick:()=>({mapId:MAP,origin:position(1,1),
   selection:[{kind:'token',id:TOKEN}],mode:'keyboard'}),
  setTimer:()=>1,clearTimer:()=>{}
 });
 try{
  assert.equal(stepper.step(1,0),true);
  assert.equal(stepper.onBlocked({type:'blocked',approved:position(2,1),
   blockedAt:position(900,900)}),true);
  assert.equal(stepper.step(1,0),true);
  assert.deepEqual(updates.at(-1),position(3,1),
   'non-adjacent denial must not be cached');
  assert.equal(stepper.onBlocked({type:'approved',approved:position(3,1),
   blockedAt:position(4,1)}),false);
  assert.equal(stepper.onBlocked({type:'blocked',approved:{x:'secret',y:0},
   blockedAt:position(4,1)}),false);
  movementActive=false;
  assert.equal(stepper.onBlocked({type:'blocked',approved:position(3,1),
   blockedAt:position(4,1)}),false);
 }finally{active=false;stepper.dispose()}
});

test('R17 board routes server-side blocked ACK only to local keyboard owner',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(src,/if\(event\.type==='blocked'\)keyboardStepperRef\.current\?\.onBlocked\(event\)/);
 assert.match(src,/keyboardStepperRef\.current=stepper/);
 assert.match(src,/if\(keyboardStepperRef\.current===stepper\)keyboardStepperRef\.current=null/);
});
