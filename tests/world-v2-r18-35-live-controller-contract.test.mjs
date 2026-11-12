import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SID='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sel=[{kind:'token',id:TOKEN}];
const origin={x:2,y:2};

function setup({blockedOnly=false,blockedPrefix=false,beginGate=null}={}){
 const events=[],calls={begin:0,advance:[],commit:[],cancel:0};
 const authority={
  async begin(){calls.begin++;if(beginGate)await beginGate;
   return {version:2,sessionId:SID}},
  async advance(request){
   calls.advance.push(request);
   const accepted=expandGestureRoute(request.from,request.targets);
   if(blockedOnly)return {version:2,sessionId:SID,seq:request.seq,
    blocked:true,accepted:[]};
   if(blockedPrefix)return {version:2,sessionId:SID,seq:request.seq,
    blocked:true,accepted:accepted.slice(0,1)};
   return {version:2,sessionId:SID,seq:request.seq,
    blocked:false,accepted};
  },
  async commit(req){calls.commit.push(req);
   return {version:2,sessionId:SID,seq:req.seq,endpoint:req.endpoint}},
  async cancel(){calls.cancel++;return true}
 };
 const controller=createMovementController({authority,onEvent:e=>events.push(e)});
 assert.equal(controller.beginGesture({mapId:MAP,selection:sel,
  mode:'keyboard',origin,pointer:origin,environmentRevision:3,
  permissionGeneration:2}),true);
 return {controller,calls,events};
}
test('R18-35 signed wall denial emits noMotion event, cancels old session but never commits',async()=>{
 const h=setup({blockedOnly:true});
 try{
  h.controller.updateGesture({x:3,y:2});
  const result=await h.controller.endGesture();
  await tick();
  assert.equal(result.status,'committed');
  assert.equal(result.noMotion,true);
  assert.equal(h.events.filter(x=>x.type==='committed').length,1);
  const last=h.events.find(x=>x.type==='committed');
  assert.equal(last.noMotion,true);
  assert.deepEqual(last.approved,origin);
  assert.equal(h.calls.commit.length,0);
  assert.equal(h.calls.advance.length,1);
  assert.equal(h.calls.cancel,1);
 }finally{h.controller.dispose()}
});
test('R18-35 accepted prefix then blocked never mislabels a real canonical Commit as noMotion',async()=>{
 const h=setup({blockedPrefix:true});
 try{
  h.controller.updateGesture({x:4,y:2});
  const result=await h.controller.endGesture();
  assert.equal(result.status,'committed');
  assert.equal(result.noMotion,undefined);
  assert.deepEqual(result.endpoint,{x:3,y:2});
  const last=h.events.find(x=>x.type==='committed');
  assert.equal(last.noMotion,undefined);
  assert.deepEqual(last.approved,{x:3,y:2});
  assert.equal(h.calls.commit.length,1);
  assert.deepEqual(h.calls.commit[0].endpoint,{x:3,y:2});
 }finally{h.controller.dispose()}
});
test('R18-35 a no-input gesture carries the unchanged state without new movement authority',async()=>{
 const h=setup();
 try{
  const result=await h.controller.endGesture();
  assert.equal(result.noMotion,true);
  assert.equal(h.events.at(-1).noMotion,true);
  assert.equal(h.calls.advance.length,0);
  assert.equal(h.calls.commit.length,0);
 }finally{h.controller.dispose()}
});
test('R18-35 live canary retains R18-31 queue fix and excludes unreleased final RPC',()=>{
 const controller=readFileSync(new URL('../src/engine/v2/MovementController.js',
  import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 const authority=readFileSync(new URL('../src/engine/v2/AuthorityClient.js',
  import.meta.url),'utf8');
 const keyboard=readFileSync(new URL('../src/engine/v2/KeyboardStepper.js',
  import.meta.url),'utf8');
 assert.match(controller,/g\.pending\.splice\(0,batch\.consumed\)/);
 assert.match(controller,/g\.inFlightTarget=\{\.\.\.batch\.targets\.at\(-1\)\}/);
 assert.match(controller,/\.\.\.\(result\.noMotion===true\?\{noMotion:true\}:\{\}\)/);
 assert.doesNotMatch(controller,/finalize_world_motion_v2|enableAtomicFinalize/);
 assert.doesNotMatch(authority,/finalize_world_motion_v2/);
 assert.doesNotMatch(runtime,/VITE_WORLD_V2_ATOMIC_FINALIZE/);
 assert.match(runtime,/event\.type==='committed'&&!dmPreview&&!event\.noMotion/);
 assert.match(keyboard,/canReuseWorldNoMotionSight/);
});
