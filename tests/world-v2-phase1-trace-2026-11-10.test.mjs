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

test('A05 records first visible position paint only after a motion actually paints',()=>{
 let time=100;
 const t=createWorldV2Trace({enabled:true,now:()=>time});
 t.startMotion('local');
 t.event('movement.grabbed','drag');
 time=106;
 // An initial sprite mount, selection highlight or an unrelated observer
 // paint must not prematurely satisfy a local motion metric.
 t.positionPaint('remote');
 assert.equal(t.snapshot().durations['movement.local-first-position-paint'],undefined);
 time=137;
 t.positionPaint('local');
 let snap=t.snapshot();
 assert.equal(snap.durations['movement.local-first-position-paint'].samples,1);
 assert.equal(snap.durations['movement.local-first-position-paint'].p50Ms,37);
 assert.equal(snap.counts['renderer.position-local'],1);
 time=200;
 t.positionPaint('local');
 snap=t.snapshot();
 assert.equal(snap.durations['movement.local-first-position-paint'].samples,1);
 t.startMotion('local');time=220;t.endMotion('local');time=260;
 t.positionPaint('local');
 assert.equal(t.snapshot().durations['movement.local-first-position-paint'].samples,1,
  'cancelled gesture cannot be attributed to future unrelated movement');
});
test('A05 measures scoped remote path-to-position paint without exposing packet IDs',()=>{
 let time=0;
 const t=createWorldV2Trace({enabled:true,limit:16,now:()=>time});
 const secret='d2fe006f-a627-4b27-b5c0-4ae462d531bd';
 t.event('observer.sight-hold',secret);
 t.event('renderer.observer-await-vision',secret);
 for(let i=0;i<100;i++){
  t.startMotion('remote');
  time+=i%5+1;
  t.positionPaint('remote');
 }
 const snap=t.snapshot();
 assert.equal(snap.durations['movement.remote-first-position-paint'].samples,16);
 assert.equal(snap.counts['renderer.position-remote'],100);
 assert.equal(snap.counts['observer.sight-hold'],1);
 assert.equal(snap.counts['renderer.observer-await-vision'],1);
 assert.ok(snap.events.length<=16);
 assert.ok(!JSON.stringify(snap).includes(secret));
 assert.ok(snap.events.every(e=>e.detail===''||e.detail==='other'));
});
test('A05 distinguishes renderer work from frame spacing and skips background suspensions',()=>{
 const t=createWorldV2Trace({enabled:true,now:()=>0});
 const render=t.begin('render.frame');render('ok');
 for(const frame of [100,116,148,227,5227,5243,5242,5259])
  t.frameTick(frame);
 const snap=t.snapshot();
 assert.equal(snap.durations['render.frame'].samples,1);
 assert.equal(snap.durations['render.frame-interval'].samples,5);
 assert.equal(snap.durations['render.frame-interval'].p95Ms,79);
 assert.equal(snap.counts['render.frame-gap'],1);
 t.clear();
 assert.equal(t.snapshot().durations['render.frame-interval'],undefined);
 t.frameTick(999);
 assert.equal(t.snapshot().durations['render.frame-interval'],undefined,
  'clear resets the previous RAF timestamp');
});
test('A05 ignores disabled, malformed, and non-enumerated motion records',()=>{
 let time=0;
 const off=createWorldV2Trace({now:()=>time});
 off.startMotion('local');off.frameTick(10);time=10;
 off.positionPaint('local');
 assert.deepEqual(off.snapshot().durations,{});
 const t=createWorldV2Trace({enabled:true,limit:16,now:()=>time});
 t.startMotion('secret token ID');
 t.positionPaint('secret token ID');
 t.frameTick(NaN);
 t.frameTick(Infinity);
 t.frameTick(-Infinity);
 t.positionPaint('remote');
 t.event('renderer.mount','private user data');
 t.event('renderer.unmount','private map data');
 assert.deepEqual(t.snapshot().durations,{});
 assert.equal(t.snapshot().counts['renderer.mount'],1);
 assert.equal(t.snapshot().counts['renderer.unmount'],1);
 assert.ok(t.snapshot().events.every(e=>e.detail==='other'));
});
