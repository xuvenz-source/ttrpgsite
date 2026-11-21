import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir='staging/world-v2-b10-r18-158-storage-write-boundaries/';
const m=JSON.parse(readFileSync(join(root,dir+'manifest.json'),'utf8'));
const sql=readFileSync(join(root,'tests/world-v2-r18-158-postgres/synthetic-storage-writes.sql'),'utf8');
const runner=readFileSync(join(root,'tests/world-v2-r18-158-postgres/run.sh'),'utf8');
const doc=readFileSync(join(root,'docs/testing/world-v2-r18-158-storage-write-boundaries-2026-11-21.md'),'utf8');

test('R158 preserves exact green R157 parent, read-only original evidence and NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-158');
 assert.equal(m.parentPr,265);
 assert.equal(m.parentSha,'67c5b62597fa5f1a0786565c21ce12993da184f6');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.fictionalPostgres17Only,true);
 const p=m.originalReadOnlyCatalog;
 assert.equal(p.rlsEnabled,true);
 assert.equal(p.authenticatedUpdateGrant,true);
 assert.equal(p.authenticatedInsertGrant,true);
 assert.equal(p.authenticatedDeleteGrant,true);
 assert.equal(p.selectPolicies,3);
 assert.equal(p.insertPolicies,3);
 assert.equal(p.deletePolicies,2);
 assert.equal(p.updatePolicies,0);
 assert.equal(p.allPolicies,0);
 assert.equal(p.writeScopes.length,5);
 assert.ok(p.writeScopes.every(x=>x.bucketScoped));
 assert.equal(m.upsertFunctionalityActuallyTested,false);
 assert.equal(m.originalPrivatePolicySourceCopied,false);
 assert.equal(m.originalUserDataQueried,false);
 assert.equal(m.original83SemanticReviewApprovals,0);
 assert.equal(m.original67DefinerCallPathsApproved,false);
 assert.equal(m.actualSignedQaTestsPassed,0);
 assert.equal(m.original83MigrationHistoryQaReplayed,false);
 assert.equal(m.issuedSignedUrlsRevocationVerified,false);
 assert.equal(m.oldRealtimeSubscriptionsRevocationVerified,false);
 assert.equal(m.r127ProductionOwnerApproval,false);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.equal(m.noHostedSqlWrites,true);
 assert.equal(m.noVersionedMigrationChanges,true);
 assert.equal(m.noRuntimeChanges,true);
 assert.equal(m.noBrowserGrants,true);
 assert.equal(m.noMerge,true);
 assert.equal(m.noDeployment,true);
 assert.equal(m.noPaidServices,true);
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
});

test('R158 original 3 INSERT / 2 DELETE categories and missing UPDATE policy remain exact',()=>{
 const policies=m.originalReadOnlyCatalog.writeScopes;
 assert.deepEqual(policies.map(x=>x.operation),['DELETE','DELETE','INSERT','INSERT','INSERT']);
 assert.deepEqual(policies.map(x=>x.assetCategory),[
  'map-images','personal-account-files','map-images','personal-account-files','campaign-assets-and-tokens'
 ]);
 assert.equal(m.potentialFunctionalConstraint,
  'AUTHENTICATED_STORAGE_REPLACEMENT_UPSERT_MAY_BE_DENIED_WITHOUT_UPDATE_POLICY');
});

test('R158 isolated permission SQL has scoped write guards and NO upsert policy by default',()=>{
 for(const marker of [
  'DROP POLICY r152_insert_campaign_file',
  'DROP POLICY r152_delete_campaign_file',
  'GRANT UPDATE ON forge_test.file_objects TO authenticated',
  'CREATE POLICY r158_map_insert',
  'CREATE POLICY r158_map_delete',
  'CREATE POLICY r158_personal_insert',
  'CREATE POLICY r158_personal_delete',
  'CREATE POLICY r158_token_insert',
  "bucket_id='MAPS'",
  "bucket_id='TOKENS'",
  "bucket_id='USER'",
  "split_part(object_path,'/',3)=auth.uid()::text",
  'public.synthetic_is_campaign_member(campaign_id)',
  'public.synthetic_is_campaign_dm(campaign_id)',
  'There is deliberately NO UPDATE policy',
 ])assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/CREATE\s+POLICY[\s\S]*?\bON\s+storage\.objects\b/i);
});

test('R158 PG17 runner tests deny/allow/write and tears down scratch-only UPDATE candidate',()=>{
 for(const marker of [
  'GITHUB_ACTIONS','R158_ISOLATED','world_v2_r18_158','127.0.0.1',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN',
  'foreign-DM-map-upload','player-cannot-map-upload',
  'map-path-cannot-be-other-campaign',
  'player-cannot-write-dm-token-namespace',
  'player-cannot-spoof-other-owner-folder',
  'member-cannot-insert-foreign-token',
  'token deletion denied without bucket DELETE policy',
  'foreign-user-personal-upload',
  'UPDATE 0',
  'r158_scrap_update_candidate',
  'WITH CHECK',
  'scratch-candidate-prevents-cross-campaign-path-change',
  'DROP POLICY r158_scrap_update_candidate',
  'revoked-portrait-upload',
  'revoked-personal-still-owned',
  'NO_GO'
 ])assert.ok(runner.includes(marker),marker);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:link|db|migration|deploy)\b/i);
});

test('R158 explanation distinguishes metadata, synthetic behavior and product functionality',()=>{
 for(const marker of ['83','67','R127','NO_GO','signed','Realtime',
  'SOURCE-ONLY','upsert','UPDATE','USING','WITH CHECK',
  'not confirmed','synthetic'])
  assert.ok(doc.toLowerCase().includes(marker.toLowerCase()),marker);
});
