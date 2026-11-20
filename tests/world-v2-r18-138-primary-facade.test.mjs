import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDynamicRouteReview,R138_LIVE_ENABLED} from
 '../staging/world-v2-b10-r18-138-primary-v3-facade/DynamicRouteReview.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir='staging/world-v2-b10-r18-138-primary-v3-facade/';
const read=p=>readFileSync(join(root,p),'utf8');
const manifest=JSON.parse(read(dir+'manifest.json'));
const sql=read(dir+'unapplied-closed-world-v3-facade.sql');
const fixture=read('tests/world-v2-r18-138-postgres/setup-original-world-stubs.sql');
const runner=read('tests/world-v2-r18-138-postgres/run.sh');
const verify=read('tests/world-v2-r18-138-postgres/verify-closed-primary-facade.sql');
const handoff=read('docs/testing/world-v2-r18-138-primary-facade-2026-11-21.md');
const audit=buildDynamicRouteReview({root});
test('R138 inherits final green R137 source-only lineage and retains NO_GO',()=>{
 assert.equal(R138_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-138');
 assert.equal(manifest.parentPr,245);
 assert.equal(manifest.parentSha,'1243cb822efadc85c65b20bc6513be237e757fc4');
 assert.equal(manifest.parentFinalCi.allPassed,true);
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.originalMigrations,83);
 assert.equal(manifest.qaMigrations,0);
 assert.equal(manifest.qaPublicApplicationTables,0);
 assert.equal(manifest.productionReleaseAuthorized,false);
 for(const f of ['noHostedWrites','noApplicationSourceEdits','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[f],true,f);
});
test('R138 all 26 actual R137 dynamic source call sites are EXPLICITLY classified',()=>{
 assert.equal(audit.count,26,'R137 census has drifted');
 assert.equal(audit.sourceClassified,26);
 assert.equal(audit.sourceClassificationLedgerKeys,26);
 assert.equal(audit.missingManualReviews,0);
 assert.deepEqual(audit.unobservedLedgerKeys,[]);
 assert.equal(audit.fullyAuthorized,0);
 assert.equal(new Set(audit.rows.map(x=>x.key)).size,26);
 for(const v of audit.rows){
  assert.equal(v.review.state,'SOURCE_CLASSIFIED_NO_AUTHORIZATION',v.key);
  assert.equal(v.review.authorizationProved,false,v.key);
  assert.equal(v.review.safeToExpose,false,v.key);
  assert.ok(v.review.evidence.length>=35,v.key);
  assert.ok(v.review.boundary.length>=10,v.key);
  assert.ok(v.sourceSnippet.length>=20,v.key);
  assert.ok(v.expression.length>=2,v.key);
 }
 assert.equal(manifest.dynamicSourceAudit.unresolvedSemanticAuthorization,26);
 assert.equal(manifest.dynamicSourceAudit.sourceClassificationsPermissionProven,0);
});
test('R138 dynamic access types cannot be silently promoted to safe public RPCs',()=>{
 const find=k=>audit.rows.find(x=>x.key===k)?.review;
 assert.equal(find('src/engine/v2/AuthorityClient.js:25:rpc').route,'world-authority');
 assert.equal(find('src/engine/v2/VisibilityController.js:136:rpc').route,'world-visibility');
 assert.equal(find('src/useAuthorizedMapLights.js:19:rpc').route,'viewer-light-masks');
 assert.equal(find('src/useMapCombat.js:77:rpc').route,'combat-command');
 assert.equal(find('src/useCampaignSheetInventory.js:34:relation').route,
  'inventory-source-table');
 assert.match(find('src/useCampaignSheetInventory.js:34:relation').evidence,
  /characters.*npc_templates.*map_tokens/);
 assert.equal(find('src/SignedAssetUrls.js:8:storageBucket').route,'caller-supplied-bucket');
 assert.equal(find('src/engine/v2/SceneTransport.js:85:channel').route,'map-wide-scene-v2');
 assert.ok(audit.rows.filter(v=>v.review.boundary==='realtime-old-socket').length>=4);
 assert.ok(audit.rows.filter(v=>v.review.boundary==='storage-bearer').length>=6);
 assert.ok(audit.rows.filter(v=>v.review.boundary==='realtime-pg-changes').length>=6);
 assert.equal(audit.oldPublicSchemaMayReopen,false);
});
test('R138 SQL creates exactly seven ungranted functions and no alternate public grants',()=>{
 assert.equal((sql.match(/^\s*CREATE FUNCTION forge_v3_api\./gm)||[]).length,7);
 assert.equal((sql.match(/^\s*REVOKE ALL ON FUNCTION forge_v3_api\./gm)||[]).length,7);
 assert.doesNotMatch(sql,/\bGRANT EXECUTE\b/);
 assert.doesNotMatch(sql,/\bGRANT USAGE\b/);
 assert.doesNotMatch(sql,/\bGRANT ALL\b/);
 assert.doesNotMatch(sql,/\bCREATE (?:TABLE|POLICY)\b/);
 assert.match(sql,/R138 blocked: R128 legacy public schema is not frozen/);
 assert.match(sql,/R138 blocked: old shared V2 scene receiver still installed/);
 assert.match(sql,/unexpected browser EXECUTE on experimental facade/);
 for(const sig of manifest.facadePrototype.functions){
  assert.ok(sql.includes(sig.split('(')[0]),sig);
 }
 assert.equal(manifest.facadePrototype.browserCallableNewFunctions,0);
 assert.equal(manifest.facadePrototype.projectCanExposeInDataAPI,false);
});
test('R138 original authoritative V2 collision, LOS and session semantics are delegated',()=>{
 for(const name of ['get_world_scene_v2','get_world_visibility_v2',
  'get_world_observer_cursor_v2','begin_world_motion_v2',
  'advance_world_motion_v2','commit_world_motion_v2',
  'cancel_world_motion_v2'])
  assert.ok(sql.includes('public.'+name+'('),name);
 assert.match(sql,/public\.get_authorized_scene_channel_v3\(p_map\)/);
 assert.match(sql,/forge_scene_drain\.scene_v3_publish_allowed\(\)/);
 assert.match(sql,/CREATE FUNCTION forge_v3_api\.begin_world_motion_v3/);
 assert.match(sql,/CREATE FUNCTION forge_v3_api\.advance_world_motion_v3/);
 assert.match(sql,/CREATE FUNCTION forge_v3_api\.commit_world_motion_v3/);
 const advance=sql.slice(sql.indexOf('CREATE FUNCTION forge_v3_api.advance_world_motion_v3'),
  sql.indexOf('REVOKE ALL ON FUNCTION forge_v3_api.advance_world_motion_v3'));
 const commit=sql.slice(sql.indexOf('CREATE FUNCTION forge_v3_api.commit_world_motion_v3'),
  sql.indexOf('REVOKE ALL ON FUNCTION forge_v3_api.commit_world_motion_v3'));
 for(const piece of [advance,commit]){
  assert.doesNotMatch(piece,/get_authorized_scene_channel_v3/);
  assert.match(piece,/scene_v3_publish_allowed\(\)/);
 }
 assert.equal(manifest.facadePrototype.perMovementNetworkRPCAdded,0);
 assert.equal(manifest.facadePrototype.additionalPerMovementDatabaseLockCostUnmeasured,true);
 assert.equal(manifest.facadePrototype.worldEnginePerformanceBenchmarked,false);
 assert.equal(manifest.facadePrototype.originalRealDbFunctionBodiesReconstructed,false);
});
test('R138 PG17 synthetic tests cover fenced start/advance/commit, DM/private projection and ACLs',()=>{
 for(const expected of ['R138 expected topic RPC + seven closed facade functions',
  'R138 default fenced mode allowed gameplay',
  'R138 player received wrong scene/sight/cursor projection',
  'R138 cross-campaign P2 scene was readable',
  'R138 DM authorized fixture returned wrong scope',
  'R138 temporary-granted signed player has wrong scene',
  'R138 original begin reply shape changed',
  'R138 original movement sequence not forwarded',
  'R138 original motion commit response changed',
  'R138 fenced motion still wrote',
  'R138 safe cancellation blocked while fenced',
  'R138 temporary grant escaped rollback'])
  assert.ok(verify.includes(expected),expected);
 for(const required of ['R138_ISOLATED','127.0.0.1','world_v2_r18_138',
  'r138_disposable_only','SUPABASE_SERVICE_ROLE_KEY',
  'unapplied-closed-world-v3-facade.sql','verify-closed-primary-facade.sql',
  'no-player-scene','no-player-sight','no-player-begin',
  'no-player-advance','no-player-commit','no-player-cancel','no-anon-scene'])
  assert.ok(runner.includes(required),required);
 assert.match(fixture,/r138_mock_motion/);
 assert.doesNotMatch(runner,/supabase\s+(?:db|link|migration|deploy)/);
});
test('R138 handoff does not claim signed users, client unseal or real movement performance',()=>{
 for(const w of ['NO_GO','R18-139','67','83','26','17',
  'Storage','signed','scene','sight','movement','performance','fog',
  'Postgres Changes','realtime','R128'])
  assert.ok(handoff.toLowerCase().includes(w.toLowerCase()),w);
 assert.equal(manifest.facadePrototype.signedDmP1P2OutsiderQaProven,false);
 assert.equal(manifest.facadePrototype.signedSightAndFogSecurityProven,false);
 assert.equal(manifest.unresolvedIssues.join(','),'220,223,229,231');
});
