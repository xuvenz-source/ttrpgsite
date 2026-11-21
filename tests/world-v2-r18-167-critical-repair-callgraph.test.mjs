import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const m=JSON.parse(readFileSync('staging/world-v2-b10-r18-167-critical-repair-callgraph/manifest.json','utf8'));
const blobSha=(s)=>createHash('sha1').update('blob '+Buffer.byteLength(s)).update(Buffer.from([0])).update(s).digest('hex');

test('R167 exact parent and source-only no-go gate',()=>{
 assert.equal(m.workPackage,'B10-R18-167');
 assert.equal(m.parentPr,274); assert.equal(m.parentSha,'cdccf275c7347b5eee6a3ccb2db812ef99c118d9');
 assert.equal(m.decision,'NO_GO'); assert.equal(m.sourceOnly,true);
 for(const key of ['productionReleaseAuthorized','noOriginalOrQaWrites','noOriginalSqlExport','noRootMigrationChanges','noRuntimeChanges','noMerge','noDeploy','noPaidResources']){
  assert.equal(m[key],key==='productionReleaseAuthorized'?false:true,key);
 }
 assert.ok(Object.values(m.dependencies).every(x=>x===false));
});
test('R167 critical original vulnerable source and fog consumer are not declared repaired',()=>{
 const a=m.originalReadOnlySource.revokedSheetOwner,f=m.originalReadOnlySource.fogMetadata;
 assert.equal(a.sourceMd5,'5a8fed2bdc8427c884f89440c0eebe03');
 assert.equal(a.currentOwnerBranchRequiresMembership,false);
 assert.equal(a.syntheticSourceExploitReproduced,true);
 assert.equal(a.signedHostedExploitObserved,false);
 assert.equal(f.sourceMd5,'084a62df8ed72d3e5fffbfce9507ff0f');
 assert.equal(f.checksCurrentMapAuthorization,false);
 assert.equal(f.authenticatedDirectExecute,true);
 const policy=m.fogConsumer;
 assert.equal(policy.table,'public.map_combats');
 assert.equal(policy.policyUsesFogStatus,true);
 assert.equal(policy.policyUsesCanViewCampaignMap,true);
 assert.equal(policy.requiresSignatureAndAuthenticatedExecutePreservation,true);
});
test('R167 exact candidate file blob SHA and security predicates are pinned',()=>{
 assert.deepEqual(m.existingCandidatePins.map(x=>x.issue),[220,212]);
 const [sheet,fog]=m.existingCandidatePins;
 for(const c of m.existingCandidatePins){
  const sql=readFileSync(join(process.cwd(),c.path),'utf8');
  assert.equal(blobSha(sql),c.gitBlobSha,c.path);
  assert.equal(c.sourceOnly,true);assert.equal(c.signedQa,'NOT_RUN');
  assert.match(sql,/source-only|DO NOT APPLY/i);
 }
 const sheetSql=readFileSync(sheet.path,'utf8');
 assert.match(sheetSql,/not exists\s*\(\s*select 1 from public\.campaign_members/i);
 assert.match(sheetSql,/REVOKE ALL ON FUNCTION public\.can_edit_campaign_sheet/i);
 const fogSql=readFileSync(fog.path,'utf8');
 assert.match(fogSql,/public\.can_view_campaign_map\(m\.campaign_id,m\.id\)/i);
 assert.match(fogSql,/GRANT EXECUTE ON FUNCTION public\.is_map_fog_published\(uuid\)/i);
});
test('R167 does not overstate transfer or any signed QA result',()=>{
 assert.equal(m.privilegedSheetCallers.length,6);
 const transfer=m.privilegedSheetCallers.find(x=>x.name==='transfer_campaign_inventory_item');
 assert.equal(transfer.hasOwnMembershipCheck,true);
 assert.equal(transfer.checkLocatedBeforeTopLevelMutation,true);
 assert.equal(transfer.permissionRisk,'ADDITIONAL_MEMBERSHIP_GATE_SOURCE_OBSERVED_STILL_NEEDS_SIGNED_QA');
 assert.equal(m.signedQaMatrix.length,16);
 assert.ok(m.signedQaMatrix.every(x=>x.result==='NOT_RUN'));
 assert.deepEqual(m.otherSecurityIssues,[218,223,229,231]);
 assert.equal(m.privateGrantHardeningIssue,275);
});
