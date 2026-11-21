import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const d='staging/world-v2-b10-r18-152-storage-authorization-matrix/';
const m=JSON.parse(read(d+'manifest.json'));
const fixture=read('tests/world-v2-r18-152-postgres/synthetic-storage-permissions.sql');
const run=read('tests/world-v2-r18-152-postgres/run.sh');
const doc=read('docs/testing/world-v2-r18-152-cross-campaign-authorization-2026-11-21.md');
test('R152 parent is the verified R151 exact commit, not a release',()=>{
 assert.equal(m.workPackage,'B10-R18-152');
 assert.equal(m.parentPr,259);
 assert.equal(m.parentSha,'cf7d0d2a2af7dbc28fcf2bd48c36ccd95de99f86');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.deployablePolicy,false);
 assert.equal(m.originalOrQaDbWrites,0);
 assert.equal(m.versionedMigrationFilesAdded,0);
 assert.equal(m.runtimeSourceChanged,false);
 assert.equal(m.noGrantsToHostedBrowser,true);
 assert.equal(m.prodDeployed,false);
 assert.equal(m.mergePerformed,false);
 assert.equal(m.paidResourcesUsed,false);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
});
test('R152 all offline observations remain PENDING, no private SQL exposed',()=>{
 assert.equal(m.userOfflineEvidence.r111FilesHashMatched,83);
 assert.equal(m.userOfflineEvidence.reviewApproved,0);
 assert.equal(m.userOfflineEvidence.storagePoliciesInspected,8);
 assert.equal(m.userOfflineEvidence.indirectMembershipCases,4);
 assert.equal(m.userOfflineEvidence.helperAliasBindingsStructurallyResolved,2);
 assert.equal(m.userOfflineEvidence.policyExactSqlInspectedByAssistant,false);
 assert.equal(m.realSignedAuthUsed,false);
 assert.equal(m.originalStoragePolicySqlExecuted,false);
 assert.equal(m.exactOriginal83Replayed,false);
 assert.equal(m.signedUrlRevocationProved,false);
 assert.equal(m.realtimeRevocationProved,false);
 assert.equal(m.stillOpen.includes('independent_security_review'),true);
});
test('R152 synthetic RLS binds to each requested object campaign_id',()=>{
 for(const expression of [
  'CREATE SCHEMA forge_test',
  'ALTER TABLE forge_test.file_objects ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON forge_test.file_objects FROM PUBLIC,anon,authenticated',
  'access_class',
  'public.synthetic_is_campaign_member(campaign_id)',
  'public.synthetic_is_campaign_dm(campaign_id)',
  'FOR SELECT TO authenticated',
  'FOR INSERT TO authenticated',
  'FOR DELETE TO authenticated',
  'WITH CHECK (public.synthetic_is_campaign_dm(campaign_id))',
  'CREATE TABLE forge_test.fictional_signed_bearers',
  'synthetic_preissued_bearer_valid',
 ]) assert.ok(fixture.includes(expression),expression);
 assert.doesNotMatch(fixture,/CREATE\s+POLICY.*\bON\s+storage\.objects\b/is);
 assert.ok(fixture.includes('NOT real storage.objects'));
});
test('R152 runner covers real negative cases and guards against hosted SQL',()=>{
 for(const term of [
  'GITHUB_ACTIONS','R152_ISOLATED','127.0.0.1','world_v2_r18_152',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN',
  'dm-A-own-shared','player-A-dm-denied',
  'player-B-campaign-A-denied','outsider-A-denied',
  'anon-direct-table','path-spoof-does-not-rebind-campaign',
  'r152_intentionally_unsafe_or','unsafe-OR-leaks-cross-campaign',
  'unsafe-OR-removal-restores-denial','player-direct-upload',
  'foreign DM DELETE denied','revoked-P1-loses-new-storage-access',
  'revoked-P1-cannot-reuse-old-invite',
  'synthetic_preissued_bearer_valid',
  'reinstated-P1-shared-access','NO_GO',
 ]) assert.ok(run.includes(term),term);
 assert.doesNotMatch(run,/\bsupabase\s+(?:link|db|deploy|migration|functions\s+deploy)\b/);
});
test('R152 docs explicitly refuse policy parity and signed URL cutoff claims',()=>{
 for(const term of ['83','20','Storage','Realtime','signed URL','human',
 'R127','NO_GO','not original','cross-campaign','OR','revocation','QA'])
  assert.ok(doc.toLowerCase().includes(term.toLowerCase()),term);
});
