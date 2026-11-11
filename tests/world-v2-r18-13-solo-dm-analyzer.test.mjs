import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {
 SOLO_DM_PHASES,summarizeSoloDmTrace,analyzeSoloDmBatch
} from '../scripts/qa/world-v2-solo-dm-analyze.mjs';

function makePhase(events=[],timers=[]){
 let now=0;
 const trace=createWorldV2Trace({enabled:true,now:()=>now});
 for(const [type,detail] of events){trace.event(type,detail);now+=3}
 for(const [name,duration] of timers){
  const end=trace.begin(name);
  now+=duration;end();
 }
 return trace.snapshot();
}
test('R18-13 accepts authentic sanitized WorldTrace snapshot and omits IDs',()=>{
 const raw=makePhase([
  ['movement.grabbed','drag'],['movement.approved','ok'],
  ['movement.committed','committed']
 ],[['authority.begin',23],['authority.advance',64],['authority.commit',70]]);
 const report=summarizeSoloDmTrace(raw,{phase:'open'});
 assert.equal(report.phase,'open');
 assert.equal(report.level,'observed');
 assert.equal(report.counts['movement.approved'],1);
 assert.equal(report.durations['authority.advance'].samples,1);
 assert.equal(report.durations['authority.advance'].p95Ms,64);
 assert.deepEqual(report.durations['visibility.rpc'],{
  samples:0,p50Ms:null,p95Ms:null,maxMs:null
 });
 assert.equal(report.safeForSqlRelease,undefined);
 assert.equal(JSON.stringify(report).includes('00000000-'),false);
});
test('R18-13 idle with no paints/revocations is clean, even with sight refresh',()=>{
 const raw=makePhase([
  ['visibility.rpc-call','ok'],['visibility.snapshot','ok']
 ],[['visibility.rpc',40]]);
 const result=summarizeSoloDmTrace(raw,{phase:'idle'});
 assert.equal(result.level,'observed');
 assert.deepEqual(result.reasons,[]);
});
test('R18-13 alerts on idle terrain assignment, fog repaint, sprite churn',()=>{
 for(const event of ['renderer.terrain-assign','renderer.fog-full',
   'renderer.sprite-create','renderer.sprite-remove','renderer.seal',
   'observer.seal','visibility.revoke']){
  const result=summarizeSoloDmTrace(makePhase([[event,'']]),{phase:'idle'});
  assert.equal(result.level,'investigate',event);
  assert.match(result.reasons[0],/Unexpected idle/);
 }
});
test('R18-13 collision without blocked signal remains inconclusive',()=>{
 const result=summarizeSoloDmTrace(makePhase([
  ['movement.approved','ok']
 ]),{phase:'collision'});
 assert.equal(result.level,'inconclusive');
 assert.ok(result.notes.some(x=>/visual confirmation/.test(x)));
});
test('R18-13 collision seal is an investigation blocker',()=>{
 const result=summarizeSoloDmTrace(makePhase([
  ['movement.blocked','hit'],['renderer.seal','other']
 ]),{phase:'collision'});
 assert.equal(result.level,'investigate');
});
test('R18-13 DM preview uses local authority and does not authorize player delivery',()=>{
 const result=summarizeSoloDmTrace(makePhase([
  ['movement.approved','preview'],
  ['visibility.snapshot','ok']
 ]),{phase:'preview'});
 assert.equal(result.level,'observed');
 assert.match(result.notes.join(' '),/cannot establish real player/);
 assert.ok(result.limitations.some(x=>/independently authenticated/.test(x)));
});
test('R18-13 preview authority RPC timing indicates a local-preview regression',()=>{
 const result=summarizeSoloDmTrace(makePhase([],[['authority.advance',80]]),
  {phase:'preview'});
 assert.equal(result.level,'investigate');
 assert.match(result.reasons[0],/live movement RPC timing/);
});
test('R18-13 fog case identifies full redraw and high RPC tail as diagnostics',()=>{
 const result=summarizeSoloDmTrace(makePhase([
  ['renderer.fog-full','full'],['movement.blocked','hit']
 ],[['authority.advance',910],['visibility.rpc',1000]]),{phase:'fog'});
 assert.ok(result.notes.some(x=>/full fog repaint/i.test(x)));
 assert.ok(result.notes.some(x=>/Advance p95 above 750ms/.test(x)));
 assert.ok(result.notes.some(x=>/Sight RPC p95 above 750ms/.test(x)));
});
test('R18-13 refuses disabled or malformed traces and unknown phases',()=>{
 const a=makePhase();
 assert.throws(()=>summarizeSoloDmTrace({...a,enabled:false},{phase:'idle'}),
  /enabled, bounded/);
 assert.throws(()=>summarizeSoloDmTrace({...a,events:new Array(513).fill({})},
  {phase:'idle'}),/exceeds expected bounds/);
 assert.throws(()=>summarizeSoloDmTrace(a,{phase:'player'}),
  /Unknown solo-DM phase/);
 assert.throws(()=>summarizeSoloDmTrace({...a,counts:{'renderer.fog-full':-1}},
  {phase:'idle'}),/Invalid count/);
 assert.throws(()=>summarizeSoloDmTrace({...a,durations:{
  'visibility.rpc':{samples:1,p50Ms:40,p95Ms:20,maxMs:50}
 }},{phase:'idle'}),/Invalid bounded/);
});
test('R18-13 incomplete batch is permissible but never becomes live release approval',()=>{
 const report=analyzeSoloDmBatch({idle:makePhase(),open:makePhase([
  ['movement.approved','ok']
 ])});
 assert.equal(report.decision,'SOLO_DM_DIAGNOSTIC_ONLY');
 assert.equal(report.safeForSqlRelease,false);
 assert.equal(report.multiplayerSecurityAccepted,false);
 assert.equal(report.clientCanaryAccepted,false);
 assert.deepEqual(report.missingPhases,['collision','fog','preview']);
 assert.deepEqual(SOLO_DM_PHASES,['idle','open','collision','fog','preview']);
});
test('R18-15 solo-DM analyzer exposes bounded post-release lock time',()=>{
 const snapshot=makePhase([],[
  ['movement.release-to-terminal',1250],
  ['authority.commit',980]
 ]);
 const result=summarizeSoloDmTrace(snapshot,{phase:'collision'});
 assert.equal(result.durations['movement.release-to-terminal'].p95Ms,1250);
 assert.ok(result.notes.some(x=>/Post-release movement lock p95/.test(x)));
 assert.equal(JSON.stringify(result).includes('sessionId'),false);
});

test('R18-13 retains current production opt-in trace and prohibits unnecessary privileged surfaces',()=>{
 const trace=readFileSync(new URL(
  '../src/engine/v2/WorldTrace.js',import.meta.url),'utf8');
 const analyzer=readFileSync(new URL(
  '../scripts/qa/world-v2-solo-dm-analyze.mjs',import.meta.url),'utf8');
 assert.match(trace,/window\.__worldV2Trace/);
 assert.match(trace,/worldV2Trace/);
 assert.match(trace,/snapshot:\(\)=>worldV2Trace\.snapshot\(\)/);
 assert.match(trace,/clear:\(\)=>worldV2Trace\.clear\(\)/);
 assert.doesNotMatch(analyzer,/supabase\/supabase-js|createClient|fetch\(|XMLHttpRequest|process\.env\./);
 assert.match(analyzer,/safeForSqlRelease:false/);
 const ledger=JSON.parse(readFileSync(new URL(
  '../staging/next-release-ledger.json',import.meta.url),'utf8'));
 assert.equal(ledger.upcomingRelease.databaseReleaseVersion,null);
});
