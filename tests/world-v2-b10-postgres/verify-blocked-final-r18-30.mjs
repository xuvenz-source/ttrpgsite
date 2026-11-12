// R18-30: actual disposable PG17-authorized reply bytes -> real JS
// MovementController and exact wire validator. Never use a live Supabase URL.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMovementController,validAtomicFinalizationAck}
 from '../../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../../src/engine/v2/GesturePath.js';

const path=process.argv[2];
assert.equal(path,'/tmp/world_v2_b10_r18_30_wire.jsonl',
 'R30 must only consume fixed CI-generated fixture path');
const records=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
assert.deepEqual(records.map(x=>x.scenario),[
 'no-motion','no-motion-retry','normal','prior-approved','prior-approved-retry'
]);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const row of records){
 const reply=row.reply,sessionId=reply.sessionId;
 const valid=validAtomicFinalizationAck(
  reply,sessionId,row.seq,row.from,row.targets,row.previousMotion);
 assert.equal(valid,true,'actual PG17 server ACK invalid for '+row.scenario);
 assert.equal(reply.finalized,true);
 assert.equal(reply.endpoint.x,row.canonicalPosition.x);
 assert.equal(reply.endpoint.y,row.canonicalPosition.y);
 assert.equal(reply.noMotion===true,row.noMotion);
 assert.equal(validAtomicFinalizationAck(
  {...reply,endpoint:{x:99,y:99}},sessionId,row.seq,row.from,
  row.targets,row.previousMotion),false,'cannot fabricate endpoint');
 if(!reply.accepted.length){
  assert.equal(validAtomicFinalizationAck(
   reply,sessionId,row.seq,row.from,row.targets,!row.previousMotion),false,
   'blocked-only terminal cannot interchange no-motion and prior commit');
  assert.equal(reply.blocked,true);
 }
 const events=[],calls={begin:0,advance:0,finalize:0,commit:0,cancel:0};
 const authority={
  async begin(){calls.begin++;return {version:2,sessionId}},
  async advance(req){
   calls.advance++;
   assert.equal(row.previousMotion,true,
    'ordinary Advance is expected only for earlier pre-approved cells');
   assert.equal(req.seq,1);
   return {version:2,sessionId,seq:1,blocked:false,
    accepted:expandGestureRoute(req.from,req.targets)};
  },
  async finalize(req){
   calls.finalize++;
   assert.equal(req.seq,row.seq);
   assert.deepEqual(req.from,row.from);
   assert.deepEqual(req.targets,row.targets);
   return reply;
  },
  async commit(){calls.commit++;throw Error('duplicate canonical Commit forbidden')},
  async cancel(){calls.cancel++;return true}
 };
 const controller=createMovementController({
  authority,enableAtomicFinalize:true,onEvent:event=>events.push(event)
 });
 const origin=row.previousMotion?{x:1,y:1}:row.from;
 assert.equal(controller.beginGesture({
  mapId:'11111111-1111-4111-8111-111111111111',
  selection:[{kind:'token',id:'00000000-0000-4000-8000-000000000101'}],
  mode:'drag',origin,pointer:origin,
  environmentRevision:1,permissionGeneration:1
 }),true,row.scenario);
 // The real controller starts its ordinary Advance as soon as it has
 // both a session ID and pending input. To exercise the closing final RPC
 // on a short drag, release before the asynchronous Begin ACK arrives.
 // Only the prior-approved scenario intentionally waits before first input.
 if(row.previousMotion){
  await tick(); // complete Begin before first, ordinary Advance
  controller.updateGesture({x:3,y:1});
  await tick();await tick(); // ordinary Advance must settle
  assert.equal(calls.advance,1,'one real earlier authorized batch');
 }
 controller.updateGesture(row.targets.at(-1));
 const done=await controller.endGesture();
 assert.equal(done.status,'committed',JSON.stringify({
  scenario:row.scenario,reason:done.reason,events:events.map(e=>({
   type:e.type,reason:e.reason,seq:e.seq,approved:e.approved,
   blockedAt:e.blockedAt
  })),calls,expected:row.reply
 }));
 assert.deepEqual(done.endpoint,row.canonicalPosition,row.scenario);
 assert.equal(done.noMotion===true,row.noMotion,row.scenario);
 assert.equal(calls.finalize,1,row.scenario);
 assert.equal(calls.commit,0,row.scenario);
 assert.equal(calls.advance,row.previousMotion?1:0,row.scenario);
 assert.equal(events.filter(e=>e.type==='committed').length,1);
 assert.equal(events.some(e=>e.type==='blocked'),reply.blocked);
 assert.equal(events.at(-1).noMotion===true,row.noMotion);
 controller.dispose();
}
// Synthetic request-count comparison, not a production latency measurement.
// At equal transport RTT and backend execution cost, one HTTP terminal RPC
// removes exactly one serial round trip; do not infer a percentage speedup.
const sampleRoundTripsMs=[100,225,450];
for(const rtt of sampleRoundTripsMs){
 const classic=2*rtt,atomic=1*rtt;
 assert.equal(classic-atomic,rtt);
}
console.log('R18-30 CROSS-LAYER PASS: 5 authentic PG17 wire shapes accepted only in their matching source-authorized client state; no extra Commit');
