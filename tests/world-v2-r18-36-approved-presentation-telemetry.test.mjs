import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('R18-36 prediction signal is cell-change bounded and never exposes private data',async()=>{
 let now=0;
 const trace=createWorldV2Trace({enabled:true,now:()=>now,limit:32});
 const events=[],calls=[];
 const authority={
  async begin(){return {version:2,sessionId:SESSION}},
  async advance(req){calls.push(req);
   return {version:2,sessionId:SESSION,seq:req.seq,blocked:false,
    accepted:expandGestureRoute(req.from,req.targets)}},
  async commit(req){return {version:2,sessionId:SESSION,seq:req.seq,
    endpoint:req.endpoint}},
  async cancel(){return true}
 };
 const movement=createMovementController({authority,trace,
  canPredict:request=>request.pointer.x<=3,
  onEvent:event=>events.push(event)});
 try{
  assert.equal(movement.beginGesture({mapId:MAP,mode:'drag',
   selection:[{kind:'token',id:TOKEN}],origin:{x:2,y:2},
   pointer:{x:2,y:2},environmentRevision:1,
   permissionGeneration:1}),true);
  // Multiple samples within one grid cell must not flood diagnostic events.
  for(let i=0;i<100;i++)
   assert.equal(movement.updateGesture({x:3.01+i/10000,y:2}),true);
  assert.equal(movement.updateGesture({x:4.15,y:2}),true);
  const result=await movement.endGesture();
  assert.equal(result.status,'committed');
  assert.equal(trace.snapshot().counts['movement.prediction'],2);
  const grant=trace.snapshot().events.filter(e=>e.event==='movement.prediction');
  assert.deepEqual(grant.map(e=>e.detail),['granted','denied']);
  assert.ok(events.some(e=>e.type==='presented'&&e.mode==='drag'));
  const serialized=JSON.stringify(trace.snapshot());
  assert.equal(serialized.includes(MAP),false);
  assert.equal(serialized.includes(TOKEN),false);
  assert.equal(serialized.includes(SESSION),false);
  assert.ok(calls.length>0);
 }finally{movement.dispose()}
});
test('R18-36 rejected predictive path never authors an unapproved movement',async()=>{
 const events=[],trace=createWorldV2Trace({enabled:true});
 let commit=0;
 const authority={
  async begin(){return {version:2,sessionId:SESSION}},
  async advance(req){return {version:2,sessionId:SESSION,seq:req.seq,
   accepted:[],blocked:true}},
  async commit(){commit++;throw Error('Unexpected Commit')},
  async cancel(){return true}
 };
 const movement=createMovementController({authority,trace,
  canPredict:()=>false,onEvent:event=>events.push(event)});
 try{
  movement.beginGesture({mapId:MAP,mode:'drag',
   selection:[{kind:'token',id:TOKEN}],origin:{x:2,y:2},
   pointer:{x:2,y:2},environmentRevision:1,permissionGeneration:1});
  movement.updateGesture({x:3,y:2});
  const result=await movement.endGesture();
  assert.equal(result.noMotion,true);
  assert.equal(commit,0);
  assert.equal(events.some(e=>e.type==='presented'),false);
  assert.equal(events.at(-1).approved.x,2);
  assert.equal(trace.snapshot().counts['movement.prediction'],1);
 }finally{movement.dispose()}
});
test('R18-36 trace ignores arbitrary private event names and raw coordinates',()=>{
 const trace=createWorldV2Trace({enabled:true});
 trace.event('movement.prediction','granted');
 trace.event('movement.prediction',MAP);
 trace.event('movement.presentation','snap');
 trace.event('movement.secret',TOKEN);
 const snapshot=trace.snapshot();
 assert.deepEqual(snapshot.events.map(e=>[e.event,e.detail]),[
  ['movement.prediction','granted'],
  ['movement.prediction','other'],
  ['movement.presentation','snap']
 ]);
 assert.equal(JSON.stringify(snapshot).includes(MAP),false);
 assert.equal(JSON.stringify(snapshot).includes(TOKEN),false);
});
