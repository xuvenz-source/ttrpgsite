import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateWallEdgeClearance,RESEARCH_WALL_CLEARANCE_CELLS}
 from '../scripts/qa/world-v2-wall-edge-clearance-research.mjs';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

const vertical=(x,a=0,b=1)=>({wallStart:{x,y:a},wallEnd:{x,y:b}});
const check=(x,{from={x:0,y:0},to={x:1,y:0},...rest}={})=>
 evaluateWallEdgeClearance({...vertical(x),from,to,...rest});

test('R18-16 live SQL reproduced 5% destination-wall intrusion: strict blocks, prototype inset does not',()=>{
 const a=check(1.95);
 assert.equal(RESEARCH_WALL_CLEARANCE_CELLS,0.1);
 assert.equal(a.baselineBlocked,true);
 assert.equal(a.candidateBlocked,false);
 assert.equal(a.changed,true);
 assert.equal(a.researchOnly,true);
});
test('R18-16 20% destination-wall intrusion remains blocked in prototype',()=>{
 const a=check(1.8);
 assert.equal(a.baselineBlocked,true);
 assert.equal(a.candidateBlocked,true);
});
test('R18-16 crossing a real wall from the opposite side still blocks, even with a small penetration',()=>{
 // Moving right through a wall near the LEFT edge of destination cell
 // is physically crossing that wall, not a harmless far-edge overlap.
 const a=check(1.05);
 assert.equal(a.baselineBlocked,true);
 assert.equal(a.candidateBlocked,true);
 const b=check(1.95,{from:{x:1,y:0},to:{x:2,y:0}});
 assert.equal(b.candidateBlocked,true);
});
test('R18-16 boundary-only contact remains allowed without any safety regression',()=>{
 const a=check(2);
 assert.equal(a.baselineBlocked,false);
 assert.equal(a.candidateBlocked,false);
});
test('R18-16 thin wall through token middle cannot be bypassed by margin',()=>{
 for(const x of [0.5,0.9,1.0,1.45,1.5]){
  const a=check(x);
  assert.equal(a.candidateBlocked,true,x);
 }
});
test('R18-16 edge prototype respects large footprint with fixed cell-size margin',()=>{
 const a=check(2.95,{spanX:2,spanY:2});
 assert.equal(a.baselineBlocked,true);
 assert.equal(a.candidateBlocked,false);
 assert.equal(a.insetX,0.1);
 const b=check(2.75,{spanX:2,spanY:2});
 assert.equal(b.candidateBlocked,true);
});
test('R18-16 invalid geometry and nonrepresentable tolerance NEVER produce an allow result',()=>{
 for(const change of [
  {clearanceCells:-.01},{clearanceCells:.100001},
  {spanX:0},{spanY:0},{spanX:Infinity},{spanX:13},
  {from:{x:NaN,y:0}},{wallEnd:{x:Infinity,y:1}}
 ])assert.equal(evaluateWallEdgeClearance({
   ...vertical(1.95),from:{x:0,y:0},to:{x:1,y:0},...change
 }),null);
});
test('R18-16 wall edge model is QA-only and not imported into any live collision/authority module',()=>{
 const root=new URL('../src/engine/v2/',import.meta.url);
 for(const filename of [
  'CollisionGeometry.js','CollisionSolver.js','CollisionPreflight.js',
  'MovementController.js','WorldV2TabletopRuntime.js',
  'RealtimeTransport.js','WorldV2Board.jsx'
 ]){
  const body=readFileSync(new URL(filename,root),'utf8');
  assert.doesNotMatch(body,/world-v2-wall-edge-clearance-research|evaluateWallEdgeClearance/);
 }
 const research=readFileSync(new URL(
  '../scripts/qa/world-v2-wall-edge-clearance-research.mjs',import.meta.url),'utf8');
 assert.match(research,/RESEARCH MODEL ONLY/);
 assert.doesNotMatch(research,/supabase|\.rpc\(|fetch\(|localStorage|process\.env/);
});

function traceHarness({enabled=true,limit=256}={}){
 let t=0;
 const trace=createWorldV2Trace({enabled,limit,now:()=>t});
 return {trace,advance:n=>{t+=n},time:()=>t};
}
test('R18-16 emits only fixed bounded timing buckets for movement authority and post-release lock',()=>{
 const h=traceHarness();
 for(const [metric,ms,detail] of [
  ['authority.begin',120,'under-250ms'],
  ['authority.advance',450,'250-750ms'],
  ['authority.commit',1350,'over-750ms'],
  ['movement.release-to-terminal',2450,'over-2s'],
  ['authority.commit',5050,'over-5s']
 ]){
  const finish=h.trace.begin(metric);h.advance(ms);finish();
  const event=h.trace.snapshot().events.at(-1);
  assert.equal(event.event,metric+'.sample');
  assert.equal(event.detail,detail);
  assert.equal(typeof event.ms,'number');
 }
 const a=h.trace.snapshot();
 assert.equal(a.events.length,5);
 assert.deepEqual(Object.keys(a.events[0]).sort(),['detail','event','ms']);
 assert.equal(a.durations['authority.commit'].samples,2);
});
test('R18-16 does NOT emit sample events for every renderer frame',()=>{
 const h=traceHarness();
 for(let i=0;i<2000;i++){
  const finish=h.trace.begin('render.frame');h.advance(0.2);finish();
 }
 const a=h.trace.snapshot();
 assert.equal(a.events.length,0);
 assert.equal(a.durations['render.frame'].samples,256);
});
test('R18-16 trace remains private, bounded, and opt-in under high movement volume',()=>{
 const h=traceHarness({limit:256});
 for(let i=0;i<1200;i++){
  const done=h.trace.begin('authority.advance');h.advance(i%3===0?1000:200);done();
 }
 const a=h.trace.snapshot();
 assert.equal(a.events.length,256);
 assert.equal(a.counts['authority.advance.sample'],1200);
 assert.equal(a.events.some(x=>x.id||x.x||x.y||x.sessionId||x.tokenId),false);
 assert.equal(a.durations['authority.advance'].samples,256);
 const disabled=traceHarness({enabled:false});
 const finish=disabled.trace.begin('authority.advance');
 disabled.advance(5000);finish();
 assert.equal(disabled.trace.snapshot().events.length,0);
});
test('R18-16 trace.clear drops preceding samples and any in-flight old timer',()=>{
 const h=traceHarness(),stale=h.trace.begin('authority.advance');
 h.advance(200);h.trace.clear();h.advance(1300);stale();
 assert.deepEqual(h.trace.snapshot().counts,{});
 assert.deepEqual(h.trace.snapshot().durations,{});
});
