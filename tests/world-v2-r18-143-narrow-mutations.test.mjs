import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR143,R143_LIVE_ENABLED,R143_PROPOSED_MUTATIONS} from
 '../staging/world-v2-b10-r18-143-narrow-mutation-contracts/MutationContractAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const prefix='staging/world-v2-b10-r18-143-narrow-mutation-contracts/';
const sql=read(prefix+'unapplied-closed-mutation-v3.sql');
const manifest=JSON.parse(read(prefix+'manifest.json'));
const fixture=read('tests/world-v2-r18-143-postgres/setup-original-mutation-stubs.sql');
const verify=read('tests/world-v2-r18-143-postgres/verify-closed-mutation.sql');
const run=read('tests/world-v2-r18-143-postgres/run.sh');
const handoff=read('docs/testing/world-v2-r18-143-narrow-mutations-2026-11-21.md');

test('R143 binds exact R142 parent and inherits verified R141 19-change/67-definer scope',()=>{
 const report=auditR143({root});
 assert.equal(R143_LIVE_ENABLED,false);
 assert.equal(report.decision,'NO_GO');
 assert.equal(report.newApiInvokers,3);
 assert.equal(report.privateDefiners,3);
 assert.equal(report.publicBrowserGrants,0);
 assert.equal(report.inheritedR141ListenerCount,19);
 assert.equal(report.serverSideRevocationProven,false);
 assert.equal(manifest.parentPr,250);
 assert.equal(manifest.parentSha,'282927baca1f11014cfc03d10524546ea203f299');
 assert.equal(manifest.inheritedV3ApiFunctions,17);
 assert.equal(manifest.totalProposedV3ApiFunctions,20);
 assert.equal(manifest.totalPrivateDefiners,20);
});
test('R143 exactly 3 private definers and 3 ungranted invoker stubs; no broad SQL',()=>{
 assert.equal(R143_PROPOSED_MUTATIONS.length,3);
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_internal\./gm)||[]).length,3);
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_api\./gm)||[]).length,3);
 assert.equal((sql.match(/^REVOKE ALL ON FUNCTION\s+forge_v3_internal\./gm)||[]).length,3);
 assert.equal((sql.match(/^REVOKE ALL ON FUNCTION forge_v3_api\./gm)||[]).length,3);
 assert.equal((sql.match(/RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''/gm)||[]).length,3);
 assert.equal((sql.match(/RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''/gm)||[]).length,3);
 assert.doesNotMatch(sql,/^\s*GRANT\s/mi);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION/);
 assert.doesNotMatch(sql,/^\s*(?:CREATE|ALTER)\s+(?:TABLE|POLICY|VIEW|PUBLICATION)\b/mi);
 assert.match(sql,/R143 R128 legacy schema fence absent/);
 assert.match(sql,/R143 requires exactly 20 private \+ 20 API functions/);
 assert.match(sql,/R143 V3 browser mutation API privilege leak/);
 assert.equal(manifest.newBrowserCallableFunctions,0);
});
test('R143 denies character inventory, stale revisions, metadata mutation and raw row return',()=>{
 const start=sql.indexOf('CREATE FUNCTION forge_v3_internal.patch_authorized_character_v3(');
 const end=sql.indexOf('REVOKE ALL ON FUNCTION',start);
 const section=sql.slice(start,end);
 for(const token of ["item.updated_at IS DISTINCT FROM p_expected_updated_at",
  "item.user_id IS DISTINCT FROM actor",
  "public.is_campaign_member(item.campaign_id)",
  "public.can_edit_campaign_sheet(item.campaign_id,'character',p_character)",
  "f.field->>'type' IS DISTINCT FROM 'inventory'",
  "item.campaign_id,'character',p_character,p_values,'{}'::jsonb",
  "'changedKeys',keys"])
  assert.ok(section.includes(token),token);
 assert.doesNotMatch(section,/RETURN updated;|fieldValues',updated->'field_values'/);
 for(const s of ['R143 stale character revision accepted',
  'R143 inventory, identity or foreign edit allowed',
  'R143 P2 could edit P1 private sheet',
  'R143 temporary authenticated grants escaped rollback'])
  assert.ok(verify.includes(s),s);
});
test('R143 DM handout editing delegates original validation, tick and hide-pin triggers',()=>{
 assert.match(sql,/p_revealed IS NULL/);
 assert.match(sql,/public\.is_campaign_dm\(item\.campaign_id\)/);
 assert.match(sql,/UPDATE public\.campaign_handouts h SET/);
 assert.match(sql,/item\.updated_at IS DISTINCT FROM p_expected_updated_at/);
 assert.match(fixture,/CREATE TRIGGER r143_handout_validate/);
 assert.match(fixture,/CREATE TRIGGER r143_hide_handout_pins/);
 assert.match(verify,/R143 original handout hide-pin trigger not preserved/);
 assert.match(verify,/R143 stale DM authoring accepted/);
 assert.match(verify,/R143 player gained DM authoring/);
});
test('R143 collectible uses exactly original legacy signed function, not a generic mutation',()=>{
 const sec=sql.split('CREATE FUNCTION forge_v3_internal.collect_authorized_pin_v3(')[1]
  .split('REVOKE ALL ON FUNCTION')[0];
 assert.match(sec,/FOR UPDATE/);
 assert.match(sec,/item\.visible IS DISTINCT FROM TRUE/);
 assert.match(sec,/item\.collectable IS DISTINCT FROM TRUE/);
 assert.match(sec,/public\.is_campaign_member\(item\.campaign_id\)/);
 assert.match(sec,/public\.can_view_campaign_map\(item\.campaign_id,item\.map_id\)/);
 assert.match(sec,/public\.collect_campaign_map_pin\(p_pin\)/);
 assert.match(verify,/R143 hidden or other-map collection allowed/);
 assert.match(verify,/R143 old-map collection allowed after assignment change/);
 assert.match(verify,/R143 original collect\/reveal semantics failed/);
});
test('R143 CI synthetic-only guard rejects accidental broadened grants & missing gate',()=>{
 assert.throws(()=>auditR143({root,candidate:sql+"\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA forge_v3_api TO authenticated;\n"}),
  /unauthorized grant or object change/);
 assert.throws(()=>auditR143({root,candidate:sql.replace(
  'CREATE FUNCTION forge_v3_api.collect_authorized_pin_v3(',
  'CREATE FUNCTION forge_v3_api.collect_any_pin_v3(')}),/collect_authorized_pin_v3 missing API/);
 const tampered=sql.replace(
  "IF actor IS NULL OR p_pin IS NULL\n OR NOT forge_scene_drain.scene_v3_publish_allowed()",
  "IF actor IS NULL OR p_pin IS NULL");
 assert.notEqual(tampered,sql,'gate removal fixture changed');
 assert.throws(()=>auditR143({root,candidate:tampered}),/collect_authorized_pin_v3 gate/);
});
test('R143 fixture inherits exactly disposable R142 PG17 and test-only grants roll back',()=>{
 for(const s of ['GITHUB_ACTIONS','R138_ISOLATED','R140_ISOLATED',
  'R142_ISOLATED','R143_ISOLATED','127.0.0.1','world_v2_r18_138',
  'r138_disposable_only','SUPABASE_SERVICE_ROLE_KEY',
  'tests/world-v2-r18-142-postgres/run.sh',
  'tests/world-v2-r18-143-postgres/verify-closed-mutation.sql'])
  assert.ok(run.includes(s),s);
 assert.doesNotMatch(run,/\bsupabase\s+(?:link|db|migration|deploy)\b/);
 for(const s of ['R143 fenced mutation did not deny all changes',
  'R143 nonmember gained mutation capability',
  'R143 revoked actor still mutated private data',
  'R143 foreign-campaign DM escaped authorization',
  'R143 original handout hide-pin trigger not preserved'])
  assert.ok(verify.includes(s),s);
 assert.match(verify,/\bROLLBACK;/);
 assert.match(fixture,/CREATE FUNCTION public\.collect_campaign_map_pin/);
 assert.match(fixture,/CREATE FUNCTION public\.patch_campaign_sheet_noninventory/);
});
test('R143 release ledger and handoff remain unambiguous NO_GO',()=>{
 assert.equal(manifest.workPackage,'B10-R18-143');
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.productionReleaseAuthorized,false);
 assert.equal(manifest.humanR127ReleaseApproved,false);
 assert.equal(manifest.signedDmP1P2OutsiderQa,'NOT_RUN');
 assert.equal(manifest.oldSocketsServerEjected,false);
 assert.equal(manifest.storageSignedUrlsRevoked,false);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const key of ['noHostedWrites','noVersionedMigrations','noRuntimeSrcEdits',
  'noMerge','noDeploy','noPaidResources','noNewGrants','noDataApiExposure'])
  assert.equal(manifest[key],true,key);
 for(const term of ['R18-143','R18-142','R128','R132','R127','NO_GO',
  'DM','P1','P2','outsider','revoked','character','handout','inventory',
  'Storage','Realtime','free-tier','old socket'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
});
