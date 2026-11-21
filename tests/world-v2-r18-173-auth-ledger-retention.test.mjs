import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-173-auth-deletion-ledger-cascade/manifest.json','utf8'));
test('R173 is exact R172 child and cannot authorize hosted changes',()=>{
 assert.equal(m.workPackage,'B10-R18-173');assert.equal(m.parentPr,281);assert.equal(m.parentSha,'55ac87f0a82ca984bef63347693750a1d020962c');
 assert.equal(m.decision,'NO_GO');
 for(const k of ['noHostedWrites','noOriginalSqlExport','noAppRuntimeChanges','noVersionedMigrationChanges','noMerge','noDeploy','noPaidInfrastructure'])assert.equal(m[k],true,k);
 for(const k of ['allTestsExecuted','original83SemanticAuditCompleted','all67PrivilegedRpcAuditCompleted','qaOnlyInstallApproved','signedQaExecuted','originalDatabasePatched','productionReleaseApproved'])assert.equal(m[k],false,k);
});
test('R173 uses existing scratch dependencies, never production SQL',()=>{
 assert.deepEqual(m.reusedScratchCandidates,['R120','R122','R148','R150']);
 assert.equal(m.candidateContracts.revocationUserFkOnDeleteCascade,true);
 assert.equal(m.candidateContracts.stampMemberDeletionSkipsMissingAuthUser,true);
 assert.equal(m.candidateContracts.dmRemovalStillTombstonesCurrentAccount,true);
 assert.equal(m.candidateContracts.approvedDataRetentionPolicy,false);
 assert.equal(m.candidateContracts.exactOriginal83Migrated,false);
 const source=readFileSync(m.newScratchCandidate,'utf8');
 assert.match(source,/NOT a migration/);
 assert.match(source,/FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
 assert.match(source,/IF NOT EXISTS\(SELECT 1 FROM auth\.users/);
 assert.match(source,/REVOKE ALL ON FUNCTION forge_security\.stamp_campaign_member_deletion/);
 assert.equal(m.syntheticCases.length,8);
 assert.ok(m.syntheticCases.every(x=>x.result==='NOT_RUN'));
});
test('R173 rejects unintended hosted targets',()=>{
 const s=readFileSync('tests/world-v2-r18-173-postgres/run.sh','utf8');
 assert.match(s,/GITHUB_ACTIONS/);assert.match(s,/R173_ISOLATED/);
 assert.match(s,/remote environment forbidden/);
 assert.match(s,/DELETE FROM auth\.users/);
 assert.match(s,/staging\/world-v2-b10-r18-173/);
});
