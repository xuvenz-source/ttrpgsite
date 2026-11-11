import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const plan=JSON.parse(read('staging/world-v2-b10-r18-06-release-readiness.json'));
const ledger=JSON.parse(read('staging/next-release-ledger.json'));
const shaOf=source=>{
 const bytes=Buffer.from(source,'utf8');
 return createHash('sha1')
  .update(Buffer.from('blob '+bytes.length+'\0')).update(bytes)
  .digest('hex');
};

test('R18-06 release readiness is NO-GO and never silently authorizes production or database change',()=>{
 assert.equal(plan.releaseDecision,'NO_GO');
 assert.equal(plan.productionApproved,false);
 assert.equal(plan.databaseApproved,false);
 assert.equal(plan.source.productionBaseSha,
  '90df8c960e79e8d66c322095611427da7bb09de4');
 assert.equal(plan.source.sourcePR,107);
 assert.equal(plan.migration.applied,false);
 assert.equal(plan.migration.applicationAndHistoryRegistrationVerified,false);
 assert.equal(plan.migration.bulkDbPushAllowed,false);
 assert.deepEqual(plan.migration.sourceOrder,['B03','B07','B08','R01','R03']);
 assert.equal(plan.phases.length,5);
 assert.ok(plan.phases.every(x=>x.status!=='COMPLETE'));
 assert.ok(plan.phases.every(x=>x.status!=='APPROVED'));
 assert.equal(plan.phases.find(x=>x.id==='G2').status,'BLOCKED');
 assert.equal(plan.phases.find(x=>x.id==='G4').status,'DEFERRED');
 assert.equal(ledger.upcomingRelease.databaseReleaseVersion,null);
 assert.equal(ledger.features.find(x=>x.id===
  'world-v2-b10-r18-06-release-readiness-and-canary')?.releaseReady,false);
});
test('R18-06 staged live preflight is exact, source-frozen and never a generic db push',()=>{
 const migration=read(plan.migration.file);
 const preflight=read(plan.migration.preflight);
 const recovery=read(plan.migration.originalFunctionRecovery);
 assert.equal(shaOf(migration),plan.migration.exactGitBlobSha);
 assert.equal(plan.migration.expectedMigrationVersion,'20261111023204');
 assert.equal(plan.liveReadOnlySnapshot.migrationCount,83);
 assert.equal(plan.liveReadOnlySnapshot.latestVersion,'20261109171247');
 assert.equal(plan.liveReadOnlySnapshot.authoritySourceFingerprintsMatched,7);
 assert.equal(plan.liveReadOnlySnapshot.partialInstallDetected,false);
 assert.equal(plan.liveReadOnlySnapshot.activeMotionSessions,0);
 assert.match(preflight,/migration_count<>83/);
 assert.match(preflight,/latest<>'20261109171247'/);
 assert.match(preflight,/source drift in %/);
 assert.match(preflight,/active_count>0/);
 assert.match(migration,/VITE_WORLD_V2_OBSERVER_RECOVERY=1 must already/);
 assert.match(migration,/motion_r05_function_backup/);
 assert.match(recovery,/md5\(current_body\)<>digest/);
 assert.ok(plan.doc.endsWith('.md'));
 assert.doesNotMatch(read(plan.doc),/\bsupabase db push\b\s*(?:--\S+\s*)?\n?\s*as a deployment command/i);
});
test('R18-06 confirms observer signed-client-before-SQL, guarded recovery OFF, and build-time gates',()=>{
 assert.equal(plan.liveReadOnlySnapshot.productionBuildFlags.VITE_WORLD_V2_OBSERVER_RECOVERY,'ABSENT');
 assert.equal(plan.liveReadOnlySnapshot.productionBuildFlags.VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY,'ABSENT');
 assert.equal(plan.flags.gate1ClientBeforeDatabase.VITE_WORLD_V2_OBSERVER_RECOVERY,'1');
 assert.equal(plan.flags.gate1ClientBeforeDatabase.VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY,'UNSET');
 assert.equal(plan.flags.gate1ClientBeforeDatabase.enabledInLive,false);
 assert.equal(plan.flags.gate3GuardedRollout.enabledInLive,false);
 assert.equal(plan.flags.gate3GuardedRollout.explicitSecurityApprovalRequired,true);
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_RECOVERY==='1'/);
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY==='1'/);
 assert.match(runtime,/guardedObserverEnabled=!dmPreview/);
 const doc=read(plan.doc);
 for(const marker of ['Gate 0','Gate 1','Gate 2','Gate 3','W01','W24',
  'R18-04','700ms','12-second','83','0 active'])
  assert.ok(doc.includes(marker),'missing release runbook safeguard: '+marker);
});
test('R18-06 preserves every independently reviewed input plus one consolidated branch',()=>{
 const wanted=[...plan.source.originalUnmergedPRs,107];
 assert.deepEqual(wanted,[102,103,104,105,106,107]);
 for(const number of wanted){
  assert.ok(ledger.branches.some(x=>x.linkedPullRequest===number&&x.status==='staged'),
   'cannot silently exclude unreleased source PR '+number);
 }
 assert.ok(ledger.upcomingRelease.outstandingBranches.length>=7);
 assert.equal(new Set(ledger.upcomingRelease.outstandingBranches).size,
  ledger.upcomingRelease.outstandingBranches.length);
 for(const b of ledger.upcomingRelease.outstandingBranches)
  assert.equal(ledger.branches.find(x=>x.name===b)?.status,'staged');
 assert.ok(ledger.upcomingRelease.outstandingBranches.includes(
  plan.source.stagingBranch),
  'later release steps must never discard the R18-06 canary plan');
 assert.equal(ledger.branches.find(x=>x.name===plan.source.stagingBranch)?.linkedPullRequest,108);
});
