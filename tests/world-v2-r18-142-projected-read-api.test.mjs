import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditR141,describeFailClosedCutover} from
 '../staging/world-v2-b10-r18-141-projection-cutover-audit/ProjectionCutoverAudit.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const prefix='staging/world-v2-b10-r18-142-projected-read-api/';
const sql=read(prefix+'unapplied-private-projected-read-v3.sql');
const manifest=JSON.parse(read(prefix+'manifest.json'));
const fixture=read('tests/world-v2-r18-142-postgres/setup-projected-original-fixture.sql');
const verify=read('tests/world-v2-r18-142-postgres/verify-projected-private-read.sql');
const runner=read('tests/world-v2-r18-142-postgres/run.sh');
const handoff=read('docs/testing/world-v2-r18-142-projected-read-api-2026-11-21.md');
const names=[
 'get_authorized_character_sheet_v3',
 'get_authorized_handout_v3',
 'get_authorized_tool_issue_v3',
 'get_authorized_map_metadata_v3'
];

test('R142 inherits verified closed R141 original source projection and parent',()=>{
 const r=auditR141({root});
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.hostedTablesInspected,10);
 assert.equal(r.originalPrivilegedRpcInventory,67);
 assert.equal(r.postgresChangesListeners,19);
 assert.equal(r.publishedRealtimeTables,17);
 assert.equal(r.privateStorageBuckets,3);
 assert.equal(describeFailClosedCutover({allChecksPassed:true}).readyToDeploy,false);
 assert.equal(manifest.parentPr,249);
 assert.equal(manifest.parentSha,'0b09cf5c66994b4082d17058699f9d54141adee3');
 assert.equal(manifest.originalMigrationCount,83);
 assert.equal(manifest.qaMigrationCount,0);
});
test('R142 exactly four default-denied private DEFInER plus INVOKER contracts',()=>{
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_internal\./gm)||[]).length,4);
 assert.equal((sql.match(/^CREATE FUNCTION forge_v3_api\./gm)||[]).length,4);
 assert.equal((sql.match(/^REVOKE ALL ON FUNCTION\s+forge_v3_internal\./gm)||[]).length,4);
 assert.equal((sql.match(/^REVOKE ALL ON FUNCTION forge_v3_api\./gm)||[]).length,4);
 assert.equal((sql.match(/RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''/g)||[]).length,4);
 assert.equal((sql.match(/RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''/g)||[]).length,4);
 assert.doesNotMatch(sql,/^\s*GRANT\s/mi);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION/i);
 assert.doesNotMatch(sql,/^\s*(?:CREATE|ALTER)\s+(?:TABLE|VIEW|POLICY|PUBLICATION)\b/mi);
 assert.doesNotMatch(sql,/pg_catalog\.coalesce\(/);
 for(const name of names){
  assert.ok(sql.includes('forge_v3_internal.'+name+'('),name);
  assert.ok(sql.includes('forge_v3_api.'+name+'('),name);
 }
 assert.match(sql,/R142 expects 13 inherited V3 API routines/);
 assert.match(sql,/R142 exactly 17 plus 17 closed V3 routines required/);
 assert.match(sql,/R142 existing experimental gameplay privilege leak/);
 assert.match(sql,/R142 raw V2 token\/public schema exposure/);
 assert.ok((sql.match(/forge_scene_drain\.scene_v3_publish_allowed\(\)/g)||[]).length>=5);
});
test('R142 owner/DM sheet never returns image path or foreign character raw row',()=>{
 assert.match(sql,/item\.user_id IS DISTINCT FROM actor/);
 assert.match(sql,/public\.is_campaign_member\(item\.campaign_id\)/);
 assert.match(sql,/public\.is_campaign_dm\(item\.campaign_id\)/);
 assert.match(sql,/fieldValues'/);
 const part=sql.split('CREATE FUNCTION forge_v3_internal.get_authorized_character_sheet_v3(')[1]
  .split('REVOKE ALL ON FUNCTION')[0];
 assert.doesNotMatch(part,/item\.portrait_path|item\.token_path/);
 assert.match(verify,/R142 P1 saw another players private sheet/);
 assert.match(verify,/R142 DM private character projection invalid/);
});
test('R142 handout owner DM/revealed/visible-pin route is map-signed and fail closed',()=>{
 assert.match(sql,/pin\.handout_id=item\.id/);
 assert.match(sql,/pin\.visible IS TRUE/);
 assert.match(sql,/public\.can_view_campaign_map\(pin\.campaign_id,pin\.map_id\)/);
 assert.match(sql,/item\.revealed IS DISTINCT FROM TRUE/);
 assert.match(verify,/R142 P1 unrevealed or cross-map note leaked/);
 assert.match(verify,/R142 P1 visible-pin handout denied/);
 assert.match(verify,/R142 DM unrevealed handout denied/);
});
test('R142 party-shared tool cannot leak private owner/DM config or map location',()=>{
 assert.match(sql,/is_owner:=item\.owner_id IS NOT DISTINCT FROM actor/);
 assert.match(sql,/item\.party_shared IS DISTINCT FROM TRUE/);
 assert.match(sql,/public\.can_view_campaign_map\(item\.campaign_id,item\.map_id\)/);
 assert.match(sql,/IF is_dm OR is_owner THEN/);
 const shared=sql.split('CREATE FUNCTION forge_v3_internal.get_authorized_tool_issue_v3(')[1]
  .split('REVOKE ALL ON FUNCTION')[0];
 assert.ok(!shared.includes("'x',item.x")&&!shared.includes("'y',item.y"));
 assert.match(verify,/R142 shared tool disclosed DM\/owner private data/);
 assert.match(verify,/R142 P1 foreign tool or map leaked/);
});
test('R142 map metadata excludes raw Storage and unpublished scene',()=>{
 const part=sql.split('CREATE FUNCTION forge_v3_internal.get_authorized_map_metadata_v3(')[1]
  .split('REVOKE ALL ON FUNCTION')[0];
 assert.match(part,/public\.can_view_campaign_map\(item\.campaign_id,p_map\)/);
 assert.match(part,/public\.get_authorized_scene_channel_v3\(p_map\)/);
 assert.match(part,/'width',item\.width,'height',item\.height,'gridSize',item\.grid_size/);
 assert.doesNotMatch(part,/'storagePath'|'storage_path'|'environment'|'prepared'|'live'/);
 assert.match(verify,/R142 P1 unauthorized map field leak/);
});
test('R142 PG17 only and cannot legitimize hosted grants or real signed QA',()=>{
 for(const s of ['R138_ISOLATED','R140_ISOLATED','R142_ISOLATED',
  '127.0.0.1','r138_disposable_only','SUPABASE_SERVICE_ROLE_KEY',
  'tests/world-v2-r18-140-postgres/run.sh',
  'verify-projected-private-read.sql'])
  assert.ok(runner.includes(s),s);
 assert.doesNotMatch(runner,/\bsupabase\s+(?:link|db|migration|deploy)\b/);
 assert.match(verify,/R142 fenced gate returned private content/);
 assert.match(verify,/R142 revoked player retained current server projection/);
 assert.match(verify,/R142 transient authenticated grant not rolled back/);
 assert.match(verify,/R142 cross-campaign outsider saw protected content/);
 assert.match(verify,/R142 P2 read P1 private sheet/);
 assert.match(fixture,/ALTER TABLE public\.characters ENABLE ROW LEVEL SECURITY/);
 assert.match(fixture,/REVOKE ALL ON public\.characters/);
 assert.equal(manifest.newBrowserCallableFunctions,0);
 assert.equal(manifest.actualSignedActorsTested,false);
 assert.equal(manifest.realWorldAuthorizationVerified,false);
 assert.equal(manifest.originalCollisionLosVerified,false);
});
test('R142 explicit NO_GO release ledger and proposed next incremental step',()=>{
 assert.equal(manifest.workPackage,'B10-R18-142');
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.newApiInvokers,4);
 assert.equal(manifest.newPrivateDefiners,4);
 assert.equal(manifest.totalProposedV3ApiFunctions,17);
 assert.equal(manifest.stagedSourceImportedByLiveApp,false);
 assert.equal(manifest.productionReleaseAuthorized,false);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const key of ['noHostedWrites','noRuntimeSrcEdits','noVersionedMigrations',
  'noNewGrants','noMerge','noDeploy','noPaidResources','noDataApiExposure'])
  assert.equal(manifest[key],true,key);
 for(const term of ['R18-142','R128','R140','R18-141','NO_GO',
  'owner','DM','P1','P2','outsider','revoke','handout','Storage',
  'Realtime','signed','free-tier'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
});
