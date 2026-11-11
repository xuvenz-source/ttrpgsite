import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('B10-R08 records six user reported live outcomes without inventing causes or telemetry',()=>{
 const b=JSON.parse(read('staging/world-v2-b10-r08-baseline-results.json'));
 assert.equal(b.step,'B10-R08');
 assert.equal(b.results.length,6);
 assert.equal(b.failCount,5);
 assert.equal(b.passCount,1);
 assert.deepEqual(b.results.map(x=>x.outcome),['FAIL','FAIL','FAIL','FAIL','FAIL','PASS']);
 assert.equal(b.evidenceKind,'BINARY_MANUAL_OUTCOMES_NO_TELEMETRY_OR_VIDEO');
 assert.equal(b.releaseDecision,'NO_GO');
 assert.equal(b.canaryDecision,'DEFER_R02_CANARY_AS_NOT_PRIMARY_MOTION_FIX');
 assert.equal(b.noLiveMutation,true);
 assert.ok(b.unconfirmedDimensions.length>=5);
});

test('B10-R08 links existing bounded, opt-in production trace; no private raw telemetry',()=>{
 const trace=read('src/engine/v2/WorldTrace.js');
 const plan=JSON.parse(read('staging/world-v2-b10-r08-trace-plan.json'));
 assert.match(trace,/get\('worldV2Trace'\)==='1'/);
 assert.match(trace,/window\.__worldV2Trace=Object\.freeze/);
 assert.match(trace,/snapshot:\(\)=>worldV2Trace\.snapshot\(\)/);
 assert.match(trace,/limit=256/);
 for(const family of Object.values(plan.traceCategories))
  for(const name of family)assert.match(trace,new RegExp("'"+name.replaceAll('.','\\.')+"'"));
 assert.equal(plan.enabledOnProdByQueryParam,true);
 assert.equal(plan.realAuthProtectedCases,'NOT_RUN');
 const progress=JSON.parse(read('staging/engineering-progress.json'));
 assert.equal(progress.steps.B10_R08.releaseDecision,'NO_GO');
 assert.equal(progress.steps.B10_R08.noProductionChanges,true);
 assert.equal(progress.steps.B10_R08.R05Sql,'UNAPPLIED_BLOCKED');
 assert.equal(progress.nextStep,'B10-R09');
 const gate=JSON.parse(read('staging/world-v2-b10-release-qualification.json'));
 assert.equal(gate.decision,'NO_GO');
 assert.equal(gate.stagedRemediations.B10_R08.R05MigrationApplied,false);
});
