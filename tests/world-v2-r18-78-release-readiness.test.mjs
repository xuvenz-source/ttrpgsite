import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR78ReleaseStatus} from
 '../scripts/release/validate-world-v2-r18-78-release-readiness.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const source=read('scripts/release/validate-world-v2-r18-78-release-readiness.mjs');
const valid=JSON.parse(read('staging/world-v2-b10-r18-78-release-readiness.json'));
const NOW=new Date('2026-11-14T15:14:00.000Z');
const check=(snapshot=valid,opts={})=>validateR78ReleaseStatus({
 snapshot,repoRoot:ROOT,now:NOW,...opts
});
const tamper=mutate=>{
 const copy=structuredClone(valid);mutate(copy);
 assert.throws(()=>check(copy),/R78 RELEASE NO-GO/);
};

test('R78 valid recorded source metadata only produces NO_GO with all original external gates unresolved',()=>{
 const x=check();
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.safeToDeploy,false);
 assert.equal(x.safeToApplySql,false);
 assert.equal(x.reportType,'READ_ONLY_STAGING_TRIAGE_NOT_RELEASE_PROOF');
 assert.equal(x.expectedPendingMigrations,8);
 assert.equal(x.recordedRemoteMigrations,83);
 assert.equal(x.recordedMatchingHistory,83);
 assert.equal(x.recordedMatchingAuthorityFunctions,10);
 assert.equal(x.canonicalReceiptUiAvailable,false);
 assert.equal(x.nextReleaseLedgerReconciled,false);
 assert.equal(x.signedIndependentQaAvailable,false);
 assert.equal(x.linkedCliInvocationIndependentlyAttested,false);
 assert.equal(x.freeTierRamUnderLoadMeasured,false);
 assert.equal(x.freshReadOnlyReceiptValidation,'NOT_SUPPLIED');
 assert.equal(x.snapshotCurrentlyFresh,true);
 assert.equal(x.blockers.length,8);
 assert.ok(x.blockers.every(s=>/^[A-Z0-9_]+$/.test(s)));
});
test('R78 recorded source snapshot becomes stale, never implicitly approved',()=>{
 const later=check(valid,{now:new Date('2026-11-15T12:00:00.000Z')});
 assert.equal(later.snapshotCurrentlyFresh,false);
 assert.equal(later.decision,'NO_GO');
 assert.equal(later.safeToApplySql,false);
 const future=check(valid,{now:new Date('2026-11-14T14:00:00.000Z')});
 assert.equal(future.snapshotCurrentlyFresh,false);
 assert.equal(future.decision,'NO_GO');
});

test('R78 forbids fake deploy approval, hidden writes, unrecognized schema and arbitrary source fields',()=>{
 tamper(x=>x.productionApproval=true);
 tamper(x=>x.sqlApproval=true);
 tamper(x=>x.safeToDeploy=true);
 tamper(x=>x.releaseDecision='GO');
 tamper(x=>x.operationPerformed='DEPLOYED');
 tamper(x=>x.schema=2);
 tamper(x=>x.playerEmail='test@example.com');
 tamper(x=>x.source.actorId='private');
});
test('R78 refuses migration count/hash drift and speculative R18-26/27 release entry',()=>{
 tamper(x=>x.liveReadOnly.migrationCount=91);
 tamper(x=>x.liveReadOnly.historicalSqlBodiesMatched=82);
 tamper(x=>x.liveReadOnly.criticalAuthoritySourcesMatched=9);
 tamper(x=>x.liveReadOnly.latestVersion='20261113024116');
 tamper(x=>x.liveReadOnly.r05Installed=true);
 tamper(x=>x.pendingNarrowRelease.pendingTotal=9);
 tamper(x=>x.pendingNarrowRelease.versions.push('20261113021015'));
 tamper(x=>x.pendingNarrowRelease.versions[1]='20261113021017');
 tamper(x=>x.pendingNarrowRelease.excluded=[]);
 tamper(x=>x.pendingNarrowRelease.officialLinkedCli='COMPLETE');
});

test('R78 refuses canonical alias/main/QA interface reconciliation fakes',()=>{
 tamper(x=>x.canonicalDeployment.gitSha='23d1d39b0f9f01b50c3c801a783e39371fdd7e80');
 tamper(x=>x.canonicalDeployment.mainSha=x.source.sourceParentSha);
 tamper(x=>x.canonicalDeployment.r18_58ReceiptPanelInCanonicalBuild=true);
 tamper(x=>x.canonicalDeployment.targetBuildForFutureQa=x.source.sourceParentSha);
 tamper(x=>x.canonicalDeployment.separateNewerProductionTarget.canonicalAliasAttached=true);
 tamper(x=>x.releaseLedger.fullNextReleaseBundleReviewed=true);
 tamper(x=>x.releaseLedger.lastTrackedStep='R18-77');
 tamper(x=>x.releaseLedger.untrackedLaterStagingRequiresReconciliation=false);
});
test('R78 refuses forged multi-account, CLI or memory acceptance on its own',()=>{
 tamper(x=>x.outstanding.officialLinkedFetchListDryRun='VERIFIED');
 tamper(x=>x.outstanding.independentSignedDmP1PassiveP2='COMPLETE');
 tamper(x=>x.outstanding.reviewedRevocationAndHiddenSight='PASS');
 tamper(x=>x.outstanding.trueWallCollisionAndInstantRegrab='PASS');
 tamper(x=>x.outstanding.browserMovementInputToCommitP95='80MS');
 tamper(x=>x.outstanding.freeTierPhysicalRamAndLocksUnderMultiplayerLoad='PASS');
 tamper(x=>x.outstanding.explicitOperatorApproval=true);
 tamper(x=>x.outstanding.releaseLedgerReconciled=true);
});
test('R78 hostile or self-declared fresh R50 receipts cannot bypass source-real R50 validation',()=>{
 assert.throws(()=>check(valid,{freshReadOnlyReceipt:{
  release_receipt:{schema:1,kind:'B10-R18-50-live-readonly',
   releaseDecision:'GO',observed_at:NOW.toISOString()}
 }}),/R50 READONLY NO-GO/);
 assert.throws(()=>check(valid,{freshReadOnlyReceipt:{schema:1,kind:'synthetic-approval'}}),
  /R50 READONLY NO-GO/);
});
test('R78 legacy all-true self-reported QA cannot certify independent authentication',()=>{
 assert.match(source,/validateR58MultiplayerQa/);
 assert.match(source,/receipts:\[\]/);
 assert.match(source,/missingRoles/);
 assert.match(source,/signedIndependentQaAvailable:false/);
 assert.match(source,/linkedCliInvocationIndependentlyAttested:false/);
 assert.match(source,/freshReadOnlyReceiptValidation:'NOT_SUPPLIED'/);
 assert.match(source,/decision:'NO_GO',safeToDeploy:false,safeToApplySql:false/);
});
test('R78 offline status validator never calls networks, SQL, subprocess or writes files',()=>{
 assert.doesNotMatch(source,/\b(?:fetch|request|https|http)\s*\(/);
 assert.doesNotMatch(source,/child_process|execFile|spawn\(|writeFile|appendFile|unlinkSync/);
 assert.doesNotMatch(source,/supabase db push|migration repair|apply_migration/);
 assert.match(source,/statSync\(p\)\.size>200000/);
 assert.match(source,/JSON\.stringify\(report,null,2\)/);
 assert.match(source,/R78 RELEASE NO-GO: invalid, stale or unsafe evidence/);
});
