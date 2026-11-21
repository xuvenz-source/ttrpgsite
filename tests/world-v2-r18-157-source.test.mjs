import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const folder='staging/world-v2-b10-r18-157-storage-bucket-composition/';
const m=JSON.parse(readFileSync(join(root,folder+'manifest.json'),'utf8'));
const sql=readFileSync(join(root,'tests/world-v2-r18-157-postgres/synthetic-three-bucket-policies.sql'),'utf8');
const runner=readFileSync(join(root,'tests/world-v2-r18-157-postgres/run.sh'),'utf8');
const doc=readFileSync(join(root,'docs/testing/world-v2-r18-157-storage-bucket-composition-2026-11-21.md'),'utf8');

test('R157 preserves exact green R156 parent, report and NO_GO',()=>{
 assert.equal(m.workPackage,'B10-R18-157');
 assert.equal(m.parentPr,264);
 assert.equal(m.parentSha,'bbfc6a4caf20653ed96bb3217ddd1f5d1a8f6d03');
 assert.equal(m.receivedR156Report.sha256,'78e27c1172338ae77f6b75d2c32be33f023b7c488de8b50f88e2575e263332b9');
 assert.equal(m.receivedR156Report.reviewIndex,29);
 assert.equal(m.receivedR156Report.verifiedFiles,83);
 assert.equal(m.receivedR156Report.allExpectedBindingMarkersPresent,true);
 assert.equal(m.receivedR156Report.policySemanticallyApproved,false);
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.simulationOnly,true);
 assert.equal(m.allOriginalStoragePoliciesSemanticallyApproved,false);
 assert.equal(m.original83SecurityReviewed,false);
 assert.equal(m.original67SecurityDefinerPathsReviewed,false);
 assert.equal(m.originalHistoricalPolicyChronologicalParityProved,false);
 assert.equal(m.realSignedMultiActorQaDone,false);
 assert.equal(m.issuedSignedUrlsRevoked,false);
 assert.equal(m.joinedRealtimeSocketsRevoked,false);
 assert.equal(m.r127OwnerReleaseApproved,false);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.equal(m.noHostedSqlWrites,true);
 assert.equal(m.noMigrationChanges,true);
 assert.equal(m.noRuntimeChanges,true);
 assert.equal(m.noBrowserGrants,true);
 assert.equal(m.noMerge,true);
 assert.equal(m.noDeploy,true);
 assert.equal(m.noPaidResources,true);
 assert.deepEqual(m.openSecurityIssues,[220,223,229,231]);
});

test('R157 live SELECT policies are distinct literal private bucket scopes, no raw expressions',()=>{
 const x=m.liveReadOnlyOriginal;
 assert.equal(x.storageSelectPolicies,3);
 assert.equal(x.privateBuckets,3);
 assert.equal(x.selectBucketGroups,3);
 assert.equal(x.allSelectBranchesHaveBucketPredicate,true);
 assert.equal(x.selectBranchGroupsDisjoint,true);
 assert.equal(x.selectBranches.length,3);
 assert.deepEqual(x.selectBranches.map(y=>y.category),[
  'campaign-assets-and-tokens','map-images','personal-account-files'
 ]);
 assert.equal(x.canObserveMapToken.securityDefiner,true);
 assert.equal(x.canObserveMapToken.checksAuthUid,true);
 assert.equal(x.canObserveMapToken.checksMapVisibility,true);
 assert.equal(x.canObserveMapToken.hasFogSightQuery,true);
 assert.equal(m.privateOriginalPolicyTextExported,false);
 assert.equal(m.privateFunctionTextExported,false);
 assert.equal(m.originalUserRowsRead,false);
});

test('R157 mock SQL includes three independent PERMISSIVE bucket guards',()=>{
 for(const marker of [
  "bucket_id='MAPS' AND EXISTS",
  "bucket_id='TOKENS' AND EXISTS",
  "bucket_id='USER'",
  "public.synthetic_is_campaign_member(c.id)",
  'public.synthetic_can_observe_map_token(t.id)',
  'public.synthetic_can_view_campaign_map(t.campaign_id,t.map_id)',
  'owner_id=auth.uid()',
  "split_part(object_path,'/',1)=auth.uid()::text",
  'forge_test.synthetic_token_sight',
  'ALTER TABLE forge_test.synthetic_tokens ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON FUNCTION public.synthetic_can_observe_map_token(uuid)'
 ]) assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/CREATE\s+POLICY[\s\S]*?\bON\s+storage\.objects\b/i);
 assert.doesNotMatch(sql,/SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/);
});

test('R157 runner checks disjoint buckets, visibility, overrides, owner and revocation regressions',()=>{
 for(const marker of [
  'R157_ISOLATED','world_v2_r18_157','127.0.0.1',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN',
  'P1-hidden-other-token-denied','P1-visible-in-sight-token',
  'P1-cross-campaign-token-denied','P2-cross-campaign-portrait-denied',
  'P1-personal-avatar-only','DM-A-denied-player-avatar',
  'P1-player-override-removes-token-sight',
  'unsafe-unscoped-policy-leaks-hidden-token',
  'removing-unscoped-policy-restores-hidden-denial',
  'revoked-P1-cannot-use-campaign-portrait',
  'revoked-P1-retains-personal-avatar',
  'unsafe-owner-only-policy-after-revocation',
  'removing-owner-only-policy-restores-revocation',
  'reinstated-P1-authorized-token','reinstated-P1-denied-hidden-token',
  'NO_GO'
 ]) assert.ok(runner.includes(marker),marker);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:db|link|migration|deploy)\b/i);
});

test('R157 documentation never certifies original SQL or issued signed URLs',()=>{
 for(const marker of ['83','67','R127','NO_GO','private','OR','Realtime',
  'signed','cross-campaign','token','revoked','synthetic','source-only']){
  assert.ok(doc.toLowerCase().includes(marker.toLowerCase()),marker);
 }
});
