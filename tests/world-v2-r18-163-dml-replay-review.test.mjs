import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-163-historical-dml-replay-review/manifest.json','utf8'));
test('R163 is exact source-only child and not a QA install approval',()=>{
 assert.equal(m.parentPr,270);assert.equal(m.parentSha,'e3bfc9097c794bc2beea7f19ff4f6bfae6dd745a');
 assert.equal(m.workPackage,'B10-R18-163');assert.equal(m.decision,'NO_GO');
 assert.ok(Object.values(m.immutability).every(x=>x===true));
 for(const key of ['all83HistorySemanticallyApproved','all67PrivilegedFunctionsApproved','signedQaPassed','ownerRiskAcceptanceGranted','productionReleaseAuthorized']) assert.equal(m[key],false);
});
test('R163 historical DML boundaries cannot turn ON CONFLICT into approval',()=>{
 assert.equal(m.historicalDataStatements.length,4);
 assert.equal(m.historicalDataStatements.filter(x=>x.operation==='INSERT'&&x.target==='storage.buckets'&&x.onConflictDoNothing&&!x.upsertOverwrite).length,3);
 const update=m.historicalDataStatements.find(x=>x.operation==='UPDATE');
 assert.equal(update.target,'public.battle_maps');
 assert.equal(update.hasWhere,true);assert.equal(update.hasNullCheck,true);assert.equal(update.hasCoalesce,true);
 assert.equal(m.bucketPostconditions.originalPrivateBuckets,3);
 assert.equal(m.bucketPostconditions.originalPublicBuckets,0);
 assert.equal(m.bucketPostconditions.qaBucketCount,0);
 assert.equal(m.bucketPostconditions.postReplayConfigurationProven,false);
 assert.equal(m.triggerBoundary.allNotDirectlyExecutableByAnonOrAuthenticated,true);
 assert.equal(m.triggerBoundary.triggerEffectsAndOwnerUpdatePathsSemanticallyReviewed,false);
});
