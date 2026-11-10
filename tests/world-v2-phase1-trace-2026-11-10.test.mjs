import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

test('tracing is disabled unless explicitly enabled',()=>{
 const t=createWorldV2Trace({now:()=>1});
 t.event('renderer.seal','scene-publication');
 t.begin('authority.begin')('error');
 assert.deepEqual(t.snapshot().events,[]);
 assert.deepEqual(t.snapshot().durations,{});
});
test('trace bounds timeline and duration samples',()=>{
 let clock=0;
 const t=createWorldV2Trace({enabled:true,limit:16,now:()=>clock});
 for(let i=0;i<100;i++){
  t.event('renderer.seal','scene-publication');clock++;
  const done=t.begin('authority.advance');clock+=2;done('ok');
 }
 const s=t.snapshot();
 assert.equal(s.events.length,16);
 assert.equal(s.counts['renderer.seal'],100);
 assert.equal(s.durations['authority.advance'].samples,16);
 assert.equal(s.durations['authority.advance'].p95Ms,2);
});
test('trace discards arbitrary names and sanitizes dynamic details',()=>{
 let clock=0;
 const t=createWorldV2Trace({enabled:true,now:()=>clock});
 const secret='never-record-user-identifier';
 t.event(secret,secret);
 t.event('observer.resync',secret);
 t.event('renderer.seal','observer-sequence-gap');
 clock=15;
 const s=t.snapshot();
 assert.equal(s.events.length,2);
 assert.equal(s.events[0].detail,'other');
 assert.equal(s.events[1].detail,'observer-sequence-gap');
 assert.ok(!JSON.stringify(s).includes(secret));
 t.clear();
 assert.deepEqual(t.snapshot().counts,{});
 assert.equal(t.snapshot().events.length,0);
});
test('snapshot is detached, and RPC error latency is tracked',()=>{
 let clock=0;
 const t=createWorldV2Trace({enabled:true,now:()=>clock});
 t.event('input.pointer.status','selection');
 t.begin('arbitrary.metric')('error');
 const done=t.begin('visibility.rpc');clock=15;done('error');
 const s=t.snapshot();s.events[0].detail='tampered';
 assert.equal(t.snapshot().events[0].detail,'selection');
 assert.equal(t.snapshot().counts['visibility.rpc.error'],1);
 assert.equal(t.snapshot().durations['visibility.rpc'].p50Ms,15);
});
