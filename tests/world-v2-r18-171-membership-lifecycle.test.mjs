import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-171-membership-lifecycle-source-contract/manifest.json','utf8'));
const gitBlobSha=(data)=>createHash('sha1').update('blob '+Buffer.byteLength(data)+'\0').update(data).digest('hex');

test('R171 exact parent and NO_GO before hosted writes or signoff',()=>{
 assert.equal(m.workPackage,'B10-R18-171');
 assert.equal(m.parentPr,279);assert.equal(m.parentSha,'9d3f86fb53bec655880b2c048cc3cefb1c411994');
 assert.equal(m.decision,'NO_GO');
 for(const k of ['sourceOnly','noOriginalOrQaWrites','noRawOriginalSqlExport','noRootMigrationEdits','noRuntimeSourceEdits','noMerge','noDeploy','noPaidResources'])assert.equal(m[k],true,k);
 assert.ok(Object.values(m.pending).every(x=>x===false));
});
test('R171 original membership direct ACL and FK cascade risks are explicitly modelled',()=>{
 const o=m.originalCatalogReadOnly;
 assert.equal(o.registeredMigrationRecords,83);
 assert.equal(o.qaRegisteredMigrationRecords,0);
 assert.equal(o.memberTableCurrentEnabledCustomTriggers,0);
 assert.equal(o.memberTableRlsEnabled,true);
 assert.equal(o.authenticated.insert,false);assert.equal(o.authenticated.delete,false);
 assert.equal(o.serviceRole.truncate,true);assert.equal(o.serviceRole.insert,true);
 assert.equal(o.foreignKeysToMemberTable.length,2);
 assert.ok(o.foreignKeysToMemberTable.some(x=>x.from==='auth.users(id)'&&x.onDelete==='CASCADE'));
 assert.ok(o.foreignKeysToMemberTable.some(x=>x.from==='public.campaigns(id)'&&x.onDelete==='CASCADE'));
 assert.equal(o.joinCampaign.sourceMd5,'9fd65eca8e3160acd7a674931aad51c5');
 assert.equal(o.joinCampaign.checksRemovalTombstone,false);
 assert.equal(o.joinCampaign.liveSignedExploitNotTested,true);
});
test('R171 reuses four byte-pinned prior source-only SQL candidates',()=>{
 assert.deepEqual(m.reconciledExistingCandidates.map(x=>x.step),['R120','R122','R148','R150']);
 for(const c of m.reconciledExistingCandidates){
  assert.equal(c.live,false);
  assert.equal(gitBlobSha(readFileSync(c.path,'utf8')),c.gitBlobSha,c.step);
 }
});
test('R171 never conflates DM removal, voluntary leave, user/campaign cascade or service-role threat',()=>{
 const d=m.deletionSemantics;
 assert.equal(d.dmRemovesPlayer.tombstoneRequired,true);
 assert.equal(d.dmRemovesPlayer.oldInviteMustNotRejoin,true);
 assert.equal(d.voluntaryLeave.mustBeDistinguishableFromDmRevocation,true);
 assert.equal(d.accountDeletionCascade.requiresExplicitTest,true);
 assert.equal(d.campaignDeletionCascade.requiresExplicitTest,true);
 assert.equal(d.privilegedTableOwnerCanDisableTriggers,true);
 assert.equal(d.noSingleTriggerSolvesAllPrivilegedWriterBypasses,true);
 assert.equal(m.qaActorCases.length,14);
 assert.ok(m.qaActorCases.every(x=>x.result==='NOT_RUN'));
});
