import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir='staging/world-v2-b10-r18-156-map-visibility-auth-contract/';
const m=JSON.parse(readFileSync(join(root,dir+'manifest.json'),'utf8'));
const py=readFileSync(join(root,'scripts/release/r156_private_map_binding.py'),'utf8');
const sql=readFileSync(join(root,'tests/world-v2-r18-156-postgres/synthetic-map-visibility.sql'),'utf8');
const runner=readFileSync(join(root,'tests/world-v2-r18-156-postgres/run.sh'),'utf8');
const doc=readFileSync(join(root,'docs/testing/world-v2-r18-156-map-visibility-2026-11-21.md'),'utf8');
test('R156 exact green R155 parent and no release authority',()=>{
 assert.equal(m.workPackage,'B10-R18-156');
 assert.equal(m.parentPr,263);
 assert.equal(m.parentSha,'b7eff8a085db90c2eaaff718dcc1c71e94feba3c');
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.fixtureOnly,true);
 assert.equal(m.r155SanitizedOperatorInput.verifiedMigrations,83);
 assert.equal(m.r155SanitizedOperatorInput.r111ReviewIndex,29);
 assert.equal(m.r155SanitizedOperatorInput.approval,false);
 assert.equal(m.historicalExactSqlSemanticallyApproved,false);
 assert.equal(m.historicalMatchesLiveExactSqlProven,false);
 assert.equal(m.otherPermissiveStorageSelectPoliciesReviewed,false);
 assert.equal(m.original83IndependentlyApproved,false);
 assert.equal(m.original67DefinersReviewed,false);
 assert.equal(m.signedDMPlayerCrossCampaignQaExecuted,false);
 assert.equal(m.issuedSignedUrlsRevoked,false);
 assert.equal(m.joinedRealtimeSocketsRevoked,false);
 assert.equal(m.qaHistoryAuthorized,false);
 assert.equal(m.qaHistoryInstalled,false);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.equal(m.noOriginalOrQaSqlWrites,true);
 assert.equal(m.noVersionedMigrations,true);
 assert.equal(m.noRuntimeChanges,true);
 assert.equal(m.noBrowserGrants,true);
 assert.equal(m.noMerge,true);
 assert.equal(m.noDeployment,true);
 assert.equal(m.noPaidResources,true);
 assert.deepEqual(m.unresolvedIssues,[220,223,229,231]);
});
test('R156 live original observations recorded as bounded metadata, not approvals',()=>{
 const live=m.liveOriginalReadOnly;
 for(const k of ['storagePolicyUsesBattleMaps','storageObjectPathMatchesMapStoragePath',
  'storagePolicyCallsCanViewCampaignMapWithSameAlias','battleMapsRlsEnabled',
  'battleMapsStoragePathUniqueIndexPresent','canViewFunctionChecksAuthUid',
  'canViewFunctionReferencesCampaignMembership','canViewFunctionUsesCurrentActiveOrOverrideMap',
  'canViewFunctionRunsSecurityDefiner','canViewFunctionSearchPathBound'])
  assert.equal(live[k],true,k);
 assert.equal(live.duplicateStoragePathGroups,0);
 assert.equal(live.crossCampaignStoragePathCollisionGroups,0);
});
test('R156 imaginary PG17 contract binds map, campaign and exact requested path',()=>{
 for(const item of ['forge_test.visible_maps','storage_path text NOT NULL UNIQUE',
  'player_map_overrides','active_map_id','auth.uid()',
  'public.synthetic_can_view_campaign_map(vm.campaign_id,vm.id)',
  'vm.campaign_id=forge_test.file_objects.campaign_id',
  'vm.storage_path=forge_test.file_objects.object_path',
  'FOR SELECT TO authenticated',
  'DROP POLICY r152_read_campaign_file'])
  assert.ok(sql.includes(item),item);
 assert.doesNotMatch(sql,/CREATE\s+POLICY[\s\S]*?\bON\s+storage\.objects\b/i);
 for(const item of ['R156_ISOLATED','world_v2_r18_156','127.0.0.1',
  'SUPABASE_SERVICE_ROLE_KEY','player-A-cannot-see-inactive-map',
  'P1-sees-own-overridden-map','P1-loses-prior-active-map-on-override',
  'foreign-map-override-no-B-access','storage-path-duplicate-prohibited',
  'unsafe-unbound-map-id-leaks-foreign-file',
  'removing-unbound-map-policy-denies-foreign-file',
  'revoked-player-loses-map-access',
  'reinstated-player-restores-scoped-map','NO_GO'])
  assert.ok(runner.includes(item),item);
});
test('R156 Python auditor keeps local SQL and arbitrary names private',()=>{
 for(const item of ['from r155_private_policy_focus import',
  'r155_report(root)','r111-private-review-docket.json','INDEX=29',
  'same_alias_storage_path_equals_requested_object_name',
  'same_alias_campaign_id_and_map_id_to_helper',
  'all_expected_binding_markers_present',
  'policy_semantically_approved','private_sql_exported',
  'production_release_authorized','PRIVATE_AUDIT_NO_GO'])
  assert.ok(py.includes(item),item);
 assert.doesNotMatch(py,/^\s*(?:import|from)\s+(?:subprocess|socket|urllib|requests|http|psycopg|supabase)\b/m);
 assert.doesNotMatch(py,/https?:\/\/|write_text\(|write_bytes\(|print\(sql\)/);
 for(const item of ['83','29','NO_GO','signed','R127','private','Realtime',
  'cross-campaign','source-only','can_view_campaign_map'])
  assert.ok(doc.toLowerCase().includes(item.toLowerCase()),item);
});
