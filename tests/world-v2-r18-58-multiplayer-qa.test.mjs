import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR58MultiplayerQa} from
 '../scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(join(ROOT,
 'scripts/release/validate-world-v2-r18-58-multiplayer-qa.mjs'),'utf8');
const BUILD='54aa1964ae54a55f6637a1ddaa9c8ac210aa6128';
const OLD='5ca8c83bdef4a5d9870020b0f2b16723f7790e38';
const NOW='2026-11-13T12:00:00.000Z';
const CHECKS={
 dm:['fastArrow','fastDrag','cornerSnap','solidWall','notePinNoLag',
  'fogEditStable','revocationAction','canonicalConvergence','noMapFlash'],
 p1:['fastArrow','fastDrag','cornerSnap','solidWall','instantRegrab',
  'privateFog','revocationDenied','safeReconnect','canonicalConvergence','noMapFlash'],
 p2:['passiveObserver','privateFog','revocationNoLeak','safeReconnect',
  'canonicalConvergence','noMapFlash']
};
const ids={dm:'a'.repeat(20),p1:'b'.repeat(20),p2:'c'.repeat(20)};
function valid(role){
 return {
  schema:1,runCode:'R58-20261113-001',role,captureTag:ids[role],
  capturedAt:NOW,buildSha:BUILD,
  independentSignInDeclared:true,independentBrowserDeclared:true,
  previewMode:false,
  checks:Object.fromEntries(CHECKS[role].map(x=>[x,'pass'])),
  trace:{
   enabled:true,limit:256,
   events:role==='p2'?
    [{ms:1,event:'observer.frame-accepted',detail:'ok'}]:
    [{ms:1,event:'movement.grabbed',detail:'grabbed'},
     {ms:8,event:'movement.committed',detail:'ok'}],
   counts:role==='p2'?{'observer.frame-accepted':10}:{'movement.committed':6},
   durations:role==='p2'?{'render.frame':{
    samples:15,p50Ms:0.3,p95Ms:2,maxMs:3}}:{
     'authority.advance':{samples:6,p50Ms:31,p95Ms:45,maxMs:60},
     'authority.commit':{samples:6,p50Ms:50,p95Ms:90,maxMs:95},
     'movement.release-to-terminal':{
      samples:6,p50Ms:90,p95Ms:200,maxMs:250}
    }
  }
 };
}
const all=()=>['dm','p1','p2'].map(valid);
const verify=(receipts,extra={})=>validateR58MultiplayerQa({
 receipts,expectedBuildSha:BUILD,now:new Date(NOW),...extra});
const invalid=(fn,pattern=/R58 MULTIPLAYER QA NO-GO:/)=>{
 const cases=all();fn(cases);
 assert.throws(()=>verify(cases),pattern);
};
test('R18-58 no receipts never becomes a release GO',()=>{
 const r=verify([]);
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.safeToDeploy,false);
 assert.deepEqual(r.missingRoles,['dm','p1','p2']);
 assert.equal(r.productionReleaseApproved,false);
});
test('R18-58 synthetically COMPLETE 3 distinct receipts remain self-reported, NOT independent proof',()=>{
 const r=verify(all());
 assert.equal(r.receiptCount,3);
 assert.equal(r.selfReportedEvidenceComplete,true);
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.safeToDeploy,false);
 assert.equal(r.differentSignedInAccountsIndependentlyVerified,false);
 assert.equal(r.authenticatedLinkedSupabaseCliDryRunVerified,false);
 assert.equal(r.fogRevocationIndependentlyObservedByReviewer,false);
 assert.equal(r.productionReleaseApproved,false);
 assert.equal(r.roleResults.p1.movementP95Ms.advance,45);
 assert.equal(r.roleResults.p2.movementP95Ms.advance,null);
});
test('R18-58 missing passive observer and incomplete/failed cases are blocking',()=>{
 const r=verify(all().slice(0,2));
 assert.deepEqual(r.missingRoles,['p2']);
 assert.equal(r.selfReportedEvidenceComplete,false);
 const x=all();x[1].checks.instantRegrab='fail';
 const rr=verify(x);
 assert.equal(rr.selfReportedEvidenceComplete,false);
 assert.deepEqual(rr.roleResults.p1.failures,['instantRegrab:fail']);
 const xx=all();xx[2].checks.revocationNoLeak='not_run';
 assert.equal(verify(xx).selfReportedEvidenceComplete,false);
});
test('R18-58 DM preview, same old build, no signed-in declaration or low event coverage block',()=>{
 const x=all();x[1].previewMode=true;
 assert.equal(verify(x).roleResults.p1.declaredIndependent,false);
 x[1].previewMode=false;x[1].independentSignInDeclared=false;
 assert.equal(verify(x).selfReportedEvidenceComplete,false);
 x[1].independentSignInDeclared=true;x[1].buildSha=OLD;
 assert.equal(verify(x).roleResults.p1.buildMatches,false);
 x[1].buildSha=BUILD;x[1].trace.durations['authority.advance'].samples=2;
 assert.equal(verify(x).roleResults.p1.traceCoverage,false);
});
test('R18-58 duplicate role, clone capture, mixed run, stale time and impossible future refuse',()=>{
 invalid(x=>{x[1].role='dm'},/duplicate role/);
 invalid(x=>{x[2].captureTag=x[0].captureTag},/duplicate role or capture tag/);
 invalid(x=>{x[2].runCode='R58-20261113-999'},/different test runs/);
 invalid(x=>{x[2].capturedAt='2026-11-13T09:00:00.000Z'},/over one hour apart/);
 invalid(x=>{x[0].capturedAt='2026-11-01T12:00:00.000Z'},/stale\/future/);
 invalid(x=>{x[0].capturedAt='2026-11-13T16:00:00.000Z'},/stale\/future/);
});
test('R18-58 reject account IDs, emails, signed frames, coordinates, spoofed browser fields',()=>{
 invalid(x=>{x[0].userId='123'},/identifying receipt fields/);
 invalid(x=>{x[1].email='private@example.com'},/identifying receipt fields/);
 invalid(x=>{x[1].trace.authorized_frame={visible:[3]}},/bounded trace/);
 invalid(x=>{x[2].trace.events[0].tokenId='a'},/unknown\/unsafe event/);
 invalid(x=>{x[0].trace.events[0].coords={x:1,y:1}},/unknown\/unsafe event/);
 invalid(x=>{x[0].trace.events[0].detail='hidden geometry'},/unknown\/unsafe event/);
 invalid(x=>{x[1].trace.counts['user-id']=1},/invalid trace count/);
 invalid(x=>{x[1].trace.durations['private-fog-frame']={samples:1,p50Ms:1,p95Ms:1,maxMs:1}},/invalid trace duration/);
});
test('R18-58 event order and p50-p95-max sanity are mandatory; no fabricated percentiles',()=>{
 invalid(x=>{x[0].trace.events[1].ms=0},/event time/);
 invalid(x=>{x[1].trace.durations['authority.commit'].p95Ms=30},/percentile order/);
 invalid(x=>{x[1].trace.durations['authority.commit'].samples=999},/invalid trace duration/);
 invalid(x=>{x[1].trace.events[0].event='pretend.release.approved'},/unknown\/unsafe event/);
});
test('R18-58 checker uses trace's real restricted API, never makes network, DB or file writes',()=>{
 assert.match(source,/isWorldV2TraceEvent/);
 assert.match(source,/isWorldV2TraceDetail/);
 assert.match(source,/isWorldV2TraceMetric/);
 assert.match(source,/differentSignedInAccountsIndependentlyVerified:false/);
 assert.match(source,/authenticatedLinkedSupabaseCliDryRunVerified:false/);
 assert.match(source,/decision:'NO_GO',safeToDeploy:false/);
 assert.doesNotMatch(source,/child_process|writeFileSync|appendFile|fetch\(|http\.request|https\.request|supabase db push/);
});
