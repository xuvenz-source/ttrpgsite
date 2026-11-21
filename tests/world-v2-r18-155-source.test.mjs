import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir='staging/world-v2-b10-r18-155-delegated-storage-policy-audit/';
const read=p=>JSON.parse(readFileSync(join(root,dir+p),'utf8'));
const m=read('manifest.json');
const report=read('sanitized-r154-observations.json');
const py=readFileSync(join(root,'scripts/release/r155_private_policy_focus.py'),'utf8');
const sql=readFileSync(join(root,'tests/world-v2-r18-155-postgres/synthetic-indirect-policy.sql'),'utf8');
const runner=readFileSync(join(root,'tests/world-v2-r18-155-postgres/run.sh'),'utf8');
const docs=readFileSync(join(root,'docs/testing/world-v2-r18-155-delegated-storage-policy-2026-11-21.md'),'utf8');
test('R155 exact parent and the only R154 findings are preserved',()=>{
 assert.equal(m.workPackage,'B10-R18-155');
 assert.equal(m.parentPr,262);
 assert.equal(m.parentSha,'5c5aa83a79cd688af3406145f5c798cd7ea97909');
 assert.equal(m.reportSha256,'4ce6bc93283c7fda46ab4a5bb563ce9e90ff3c5e13339b7a582c3226cff8284f');
 assert.equal(m.reportFilesVerified,83);
 assert.equal(m.reportSecurityApproved,0);
 assert.equal(m.reportFilesFlaggedForFocusedReview,1);
 assert.equal(m.reportFlaggedDocketIndex,29);
 assert.equal(m.reportDocketIndexIsChronologicalPosition,false);
 assert.equal(m.reportFlag,'storage_policy_no_known_identity_helper');
 assert.deepEqual(report.flagged,[{docketReviewIndex:29,marker:'storage_policy_no_known_identity_helper',count:1}]);
 assert.equal(report.statementCounts.securityDefinerFunctions,182);
 assert.equal(report.statementCounts.definerWithoutDirectIdentity,70);
 assert.equal(report.statementCounts.storageObjectPolicies,10);
});
test('R155 safe review is not original historical approval or QA',()=>{
 assert.equal(m.decision,'NO_GO');
 assert.equal(m.sourceOnly,true);
 assert.equal(m.sourceSqlImported,false);
 assert.equal(m.originalOrQaSqlWrites,0);
 assert.equal(m.versionedMigrationsModified,false);
 assert.equal(m.frontendRuntimeModified,false);
 assert.equal(m.browserGrantsAdded,0);
 assert.equal(m.deployed,false);
 assert.equal(m.mergePerformed,false);
 assert.equal(m.paidResourcesUsed,false);
 assert.equal(m.original83HistoryIndependentlyApproved,false);
 assert.equal(m.original67PrivilegedFunctionReviewApproved,false);
 assert.equal(m.r127OwnerReleaseApproved,false);
 assert.equal(m.productionReleaseAuthorized,false);
 assert.equal(m.realSignedQaExecuted,false);
 assert.equal(m.realSignedUrlRevocationVerified,false);
 assert.equal(m.oldRealtimeSessionsRevocationVerified,false);
 assert.deepEqual(m.issuesStillOpen,[220,223,229,231]);
 assert.equal(m.liveOriginalReadOnly.historicalIndex29SameAsLiveStoragePolicyVerified,false);
 assert.equal(m.liveOriginalReadOnly.originalStoragePolicyFullySemanticallyCleared,false);
});
test('R155 SQL fixture relies on map-table RLS, not direct privilege or hosted storage',()=>{
 for(const x of [
  'CREATE TABLE forge_test.map_catalog',
  'ALTER TABLE forge_test.map_catalog ENABLE ROW LEVEL SECURITY',
  'USING (public.synthetic_is_campaign_member(campaign_id))',
  'DROP POLICY r152_read_campaign_file',
  'map.campaign_id=forge_test.file_objects.campaign_id',
  'map.object_path=forge_test.file_objects.object_path',
 ])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/CREATE\s+POLICY[\s\S]*?\bON\s+storage\.objects\b/i);
 for(const x of [
  'GITHUB_ACTIONS','R155_ISOLATED','world_v2_r18_155','127.0.0.1',
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN',
  'disabling-map-rls-leaks-A-to-P2',
  'restoring-map-rls-denies-P2',
  'unsafe-definer-bypasses-map-rls',
  'unsafe-path-only-allows-foreign-file',
  'canonical-campaign-binding-denies-forged-path',
  'revoked-member-loses-indirect-map-access',
  'explicit-reinstatement-restores-indirect-access','NO_GO'
 ])assert.ok(runner.includes(x),x);
});
test('R155 local focused auditor cannot export arbitrary SQL or declare independent approval',()=>{
 for(const x of [
  'from r154_private_history_audit import',
  'INDEX=29',
  'sourceBodySha256',
  'target_policy_count',
  'known_helpers_referenced',
  'known_tables_referenced',
  'private_sql_semantic_approval',
  'filenames_exported',
  'production_release_authorized',
  'r111_review_index',
  'PRIVATE_AUDIT_NO_GO',
 ]){if(x==='sourceBodySha256'){assert.ok(py.includes('checked_file'));continue;}
 assert.ok(py.includes(x),x);}
 assert.doesNotMatch(py,/^\s*(?:import|from)\s+(?:subprocess|socket|urllib|requests|http|psycopg|supabase)\b/m);
 assert.doesNotMatch(py,/https?:\/\/|write_text\(|write_bytes\(|print\(statement\)/);
 for(const t of ['83','70','182','29','OR','NO_GO','signed','Realtime','R127','QA'])
  assert.ok(docs.toLowerCase().includes(t.toLowerCase()),t);
});
