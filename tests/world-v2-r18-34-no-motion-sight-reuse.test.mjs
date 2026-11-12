import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createWorldKeyboardStepper,canReuseWorldNoMotionSight
} from '../src/engine/v2/KeyboardStepper.js';

const MAP='11111111-1111-4111-8111-111111111111';
const PIECE='22222222-2222-4222-8222-222222222222';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function make(){
 const piece={kind:'token',id:PIECE,x:1,y:1};
 const frame={mapId:MAP,scope:'viewer',environmentRevision:4,
  permissionGeneration:3,sceneGeneration:2,visiblePieces:[piece]};
 const scene={mapId:MAP,scope:'viewer',revision:4,sceneGeneration:2};
 let moving=false,allowed=true,issued=0,refreshes=0;
 const done=[],updates=[];
 const movement={
  get active(){return moving},
  beginGesture(){moving=true;issued++;return true},
  updateGesture(p){updates.push(p);return true},
  endGesture(){return new Promise(resolve=>done.push(result=>{
   moving=false;resolve(result)
  }))},
  cancelGesture(){moving=false;return true}
 };
 const runtime={
  get active(){return allowed},
  renderer:{authorized:true},
  stream:{locked:false},
  sceneManager:{displayedScene:scene,stale:false},
  visibility:{frame},movement,
  async refreshVisibility(){refreshes++;return true}
 };
 let scheduled=null;
 const stepper=createWorldKeyboardStepper({
  getRuntime:()=>runtime,
  makePick:()=>({mapId:MAP,mode:'keyboard',origin:{x:1,y:1},
   selection:[{kind:'token',id:PIECE}]}),
  setTimer:cb=>{scheduled=cb;return 1},
  clearTimer:()=>{scheduled=null}
 });
 return {runtime,frame,scene,stepper,done,updates,
  get issued(){return issued},
  get refreshes(){return refreshes},
  get scheduled(){return scheduled},
  revoke(){allowed=false}
 };
}
async function runQueued(h,result){
 assert.equal(h.stepper.step(1,0),true);
 assert.equal(h.stepper.step(0,0,{release:true}),true);
 assert.ok(h.scheduled);
 h.scheduled();
 await tick();
 assert.equal(h.stepper.step(0,1),true,
  'queued direction must not be lost while terminal result is pending');
 assert.equal(h.stepper.queueLength,1);
 h.done[0](result);
 for(let i=0;i<6;i++)await tick();
}
test('R18-34 a signed blocked no-motion result reuses sight and drains lateral key',async()=>{
 const h=make();
 try{
  await runQueued(h,{status:'committed',noMotion:true});
  assert.equal(h.refreshes,0,'no redundant signed-sight HTTP call');
  assert.equal(h.issued,2);
  assert.deepEqual(h.updates.at(-1),{x:1,y:2});
 }finally{h.stepper.dispose()}
});
test('R18-34 a real committed movement still requires signed canonical continuation',async()=>{
 const h=make();
 try{
  await runQueued(h,{status:'committed',endpoint:{x:2,y:1}});
  assert.equal(h.refreshes,1);
  assert.equal(h.issued,2);
 }finally{h.stepper.dispose()}
});
test('R18-34 a revocation or rejection cannot take no-motion reuse path',async()=>{
 for(const outcome of [
  {status:'revoked',noMotion:true},{status:'rejected',noMotion:true},
  {status:'cancelled',noMotion:true}
 ]){
  const h=make();
  try{
   await runQueued(h,outcome);
   assert.equal(h.refreshes,1,outcome.status);
  }finally{h.stepper.dispose()}
 }
});
test('R18-34 reuse demands same frame, scene, signed anchor and authority state',()=>{
 const h=make();
 const proof={frame:h.frame,scene:h.scene,mapId:MAP,mode:'keyboard',
  environmentRevision:4,permissionGeneration:3,sceneGeneration:2,
  piece:{kind:'token',id:PIECE,x:1,y:1}};
 const result={status:'committed',noMotion:true};
 try{
  assert.equal(canReuseWorldNoMotionSight({runtime:h.runtime,proof,result}),true);
  const denied=[
   {...proof,mode:'preview'}, {...proof,permissionGeneration:99},
   {...proof,environmentRevision:99},{...proof,sceneGeneration:3},
   {...proof,piece:{...proof.piece,id:'wrong'}},
   {...proof,piece:{...proof.piece,x:2}}
  ];
  for(const candidate of denied)
   assert.equal(canReuseWorldNoMotionSight({
    runtime:h.runtime,proof:candidate,result
   }),false,'candidate must not bypass certification');
  h.runtime.stream.locked=true;
  assert.equal(canReuseWorldNoMotionSight({runtime:h.runtime,proof,result}),false);
  h.runtime.stream.locked=false;
  h.runtime.sceneManager.stale=true;
  assert.equal(canReuseWorldNoMotionSight({runtime:h.runtime,proof,result}),false);
  h.runtime.sceneManager.stale=false;
  h.runtime.renderer.authorized=false;
  assert.equal(canReuseWorldNoMotionSight({runtime:h.runtime,proof,result}),false);
  h.runtime.renderer.authorized=true;
  h.runtime.visibility.frame={...h.frame};
  assert.equal(canReuseWorldNoMotionSight({runtime:h.runtime,proof,result}),false);
  h.runtime.visibility.frame=h.frame;
  h.runtime.sceneManager.displayedScene={...h.scene};
  assert.equal(canReuseWorldNoMotionSight({runtime:h.runtime,proof,result}),false);
 }finally{h.stepper.dispose()}
});
test('R18-34 queued movement must refresh when signed sight changed during wall response',async()=>{
 const h=make();
 try{
  assert.equal(h.stepper.step(1,0),true);
  assert.equal(h.stepper.step(0,0,{release:true}),true);
  h.scheduled();await tick();
  h.stepper.step(0,1);
  h.runtime.visibility.frame={...h.frame,
   permissionGeneration:h.frame.permissionGeneration+1};
  h.done[0]({status:'committed',noMotion:true});
  for(let i=0;i<6;i++)await tick();
  assert.equal(h.refreshes,1);
 }finally{h.stepper.dispose()}
});
test('R18-34 zero-motion real runtime does not signal a canonical Commit or visibility RPC',()=>{
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 const renderer=readFileSync(new URL('../src/engine/v2/WorldRenderer.js',
  import.meta.url),'utf8');
 assert.match(runtime,/if\(event\.type==='committed'&&!dmPreview&&!event\.noMotion\)/);
 assert.match(runtime,/if\(event\.type==='committed'&&!event\.noMotion&&/);
 assert.match(renderer,/if\(event\.noMotion===true\)/);
 assert.match(renderer,/clearLocal\(\);scheduler\.invalidate\(\);return true/);
});
