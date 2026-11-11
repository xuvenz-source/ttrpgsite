import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {classifyWorldMovementRejection,createMovementController}
 from '../src/engine/v2/MovementController.js';
const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const request=()=>({mapId:MAP,selection:[{kind:'token',id:TOKEN}],
 origin:{x:1,y:1},pointer:{x:1,y:1},mode:'drag',
 environmentRevision:1,permissionGeneration:1});
const authority={
 begin:async()=>({version:2,sessionId:SESSION}),
 advance:async()=>({version:2,sessionId:SESSION,seq:1,
  blocked:false,accepted:[{x:2,y:1}]}),
 commit:async()=>({version:2,sessionId:SESSION,seq:2,endpoint:{x:2,y:1}}),
 cancel:async()=>true
};
function setup(overrides={}){
 const trace=createWorldV2Trace({enabled:true});
 const controller=createMovementController({
  authority:{...authority,...overrides},trace});
 return {controller,trace,flush:async()=>{await tick();await tick();await tick()}};
}
const rejected=trace=>trace.snapshot().events.filter(e=>
 e.event.startsWith('movement.reject-')).map(e=>[e.event,e.detail]);
test('R11 rejection classes always ignore arbitrary private server data',()=>{
 const cases=[
 ['Invalid world movement response','invalid-server-reply'],
 ['World movement server unavailable','rpc-unavailable'],
 ['Invalid V2 begin request','client-contract'],
 ['Invalid V2 movement batch','client-contract'],
 ['Invalid V2 commit','client-contract'],
 ['V2 movement cancelled','session-cancelled'],
 ['invalid-authority-ack','invalid-authority-ack'],
 ['invalid-commit','invalid-commit'],
 ['path-limit','path-limit'],
 ['secret: bearer jwt, map id, x=12','other']
 ];
 for(const [message,category] of cases)
  assert.equal(classifyWorldMovementRejection(message),category);
 const t=createWorldV2Trace({enabled:true});
 t.event('movement.reject-reason','token=SECRET');
 t.event('movement.reject-reason','invalid-server-reply');
 assert.deepEqual(t.snapshot().events.map(e=>e.detail),
  ['other','invalid-server-reply']);
 assert.equal(JSON.stringify(t.snapshot()).includes('SECRET'),false);
});
test('R11 NULL/invalid begin response reports begin phase, not raw RPC text',async()=>{
 const h=setup({begin:async()=>{throw Error('Invalid world movement response')}});
 try{
  assert.equal(h.controller.beginGesture(request()),true);
  await h.flush();
  assert.deepEqual(rejected(h.trace),[
   ['movement.reject-phase','begin'],
   ['movement.reject-reason','invalid-server-reply']
  ]);
  assert.equal(h.controller.active,false);
 }finally{h.controller.dispose()}
});
test('R11 invalid advance ACK remains denied and reports phase',async()=>{
 const h=setup({advance:async()=>({version:2,sessionId:SESSION,seq:1,
  blocked:false,accepted:[{x:9,y:9}]})});
 try{
  assert.equal(h.controller.beginGesture(request()),true);
  h.controller.updateGesture({x:2,y:1});
  await h.flush();
  assert.deepEqual(rejected(h.trace),[
   ['movement.reject-phase','advance'],
   ['movement.reject-reason','invalid-authority-ack']
  ]);
  assert.equal(h.controller.active,false);
 }finally{h.controller.dispose()}
});
test('R11 denied commit RPC reports phase without changing rejection authority',async()=>{
 const h=setup({commit:async()=>{throw Error('World movement server unavailable')}});
 try{
  assert.equal(h.controller.beginGesture(request()),true);
  h.controller.updateGesture({x:2,y:1});
  const result=await h.controller.endGesture();
  assert.equal(result.status,'rejected');
  assert.deepEqual(rejected(h.trace),[
   ['movement.reject-phase','commit'],
   ['movement.reject-reason','rpc-unavailable']
  ]);
 }finally{h.controller.dispose()}
});
test('R11 unknown exception text is redacted from bounded memory trace',async()=>{
 const secret='token=SECRET x=9999 hidden NPC';
 const h=setup({begin:async()=>{throw Error(secret)}});
 try{
  h.controller.beginGesture(request());
  await h.flush();
  assert.deepEqual(rejected(h.trace),[
   ['movement.reject-phase','begin'],
   ['movement.reject-reason','other']
  ]);
  assert.equal(JSON.stringify(h.trace.snapshot()).includes(secret),false);
 }finally{h.controller.dispose()}
});
