import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-172-auth-cascade-retention/manifest.json','utf8'));
const gitBlob=(s)=>createHash('sha1').update('blob '+Buffer.byteLength(s)).update(Buffer.from([0])).update(s).digest('hex');
test('R172 exact R171 source-only parent, no production/QA change',()=>{
 assert.equal(m.workPackage,'B10-R18-172');assert.equal(m.parentPr,280);
 assert.equal(m.parentSha,'5126e8ccadac4095e2b08c89b66cb77468ecb6ef');assert.equal(m.decision,'NO_GO');
 for(const k of ['noOriginalOrQaSqlWrites','noVersionedMigrationEdit','noAppRuntimeEdit','noProductionOrQaDeploy','noMerge','noPaidResources','noRawOriginalSqlExport'])assert.equal(m[k],true,k);
 assert.ok(Object.values(m.securityGates).every(x=>x===false));
});
test('R172 pins exact pre-existing R120 R122 R148 R150 scratch SQL',()=>{
 assert.deepEqual(m.existingCandidateFiles.map(x=>x.step),['R120','R122','R148','R150']);
 for(const x of m.existingCandidateFiles)assert.equal(gitBlob(readFileSync(x.path,'utf8')),x.gitBlobSha,x.path);
});
test('R172 never converts synthetic account-deletion tombstone into approved data retention',()=>{
 assert.equal(m.syntheticSetup.addedAuthUsersTable,true);
 assert.equal(m.syntheticSetup.twoSyntheticForeignKeys.length,2);
 assert.ok(m.syntheticSetup.twoSyntheticForeignKeys.every(x=>x.onDelete==='CASCADE'));
 assert.equal(m.syntheticSetup.realSupabaseAuthTokensUsed,false);
 assert.equal(m.retentionDecision.separateRetentionPolicyRequired,true);
 assert.equal(m.retentionDecision.doNotClaimPrivacyCompliantUntilReviewed,true);
 assert.equal(m.testCases.length,10);
 assert.ok(m.testCases.every(x=>x.status==='NOT_YET_RUN'));
 const run=readFileSync('tests/world-v2-r18-172-postgres/run.sh','utf8');
 assert.match(run,/GITHUB_ACTIONS/);assert.match(run,/R172_ISOLATED/);
 assert.match(run,/remote environment forbidden/);
 assert.match(run,/DELETE FROM auth\.users/);
 assert.match(run,/retained synthetic tombstone/);
});
