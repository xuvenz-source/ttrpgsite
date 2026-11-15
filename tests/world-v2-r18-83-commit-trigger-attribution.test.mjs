import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const record=JSON.parse(read('staging/world-v2-b10-r18-83-live-commit-trigger-inventory.json'));
const start=read('tests/world-v2-b10-postgres/r83-commit-function-profile-start.sql');
const finish=read('tests/world-v2-b10-postgres/r83-commit-function-profile-finish.sql');
const runner=read('tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql');
const historic=read('tests/world-v2-b10-postgres/r68-commit-cost-attribution.sql');
const originalBlob=content=>{const bytes=Buffer.from(content);
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')};
const expectedTokenPos=['forge_player_collision','forge_visibility_token_tick',
 'npc_token_sheet_items_rpc_only','tokens_protected','tokens_touch','tokens_validate'];
const expectedNotToken=['combat_sync_token_change','forge_navigation_token_permissions',
 'tokens_validate_statuses','world_v2_token_roster_changed'];
const expectedTool=['campaign_tool_items_rpc_only','campaign_tool_sync_map',
 'campaign_tool_validate_issue','forge_tool_collision'];
test('R83 inventory is source-specific, read-only, non-releasing and privacy bounded',()=>{
 assert.equal(record.schema,1);
 assert.equal(record.workPackage,'B10-R18-83');
 assert.equal(record.source,'SUPABASE_READ_ONLY_PG_CATALOG_AND_PG_STAT_STATEMENTS');
 assert.equal(record.releaseDecision,'NO_GO');
 assert.equal(record.safeToInstall,false);
 assert.equal(record.operatorApprovedToDeploy,false);
 assert.equal(record.registeredMigrations,83);
 assert.equal(record.liveSettings.trackFunctions,'none');
 assert.equal(record.liveSettings.trackIoTiming,'off');
 assert.equal(record.liveSettings.settingsModified,false);
 assert.equal(record.projectId,'lwhwgqaunxbmvyndswze');
 assert.equal(record.deployment.supabaseSqlWritten,false);
 assert.equal(record.deployment.migrationApplied,false);
 assert.equal(record.deployment.newPreviewDeployed,false);
 assert.equal(record.deployment.productionDeployed,false);
 assert.equal(record.deployment.officialLinkedCLI83Plus8DryRunVerified,false);
 assert.equal(record.baseline.liveSqlTimingsMatchedToBrowserRequests,false);
 assert.equal(record.sampledInfrastructure.metadataContainsPrivateMapOrSight,false);
 assert.doesNotMatch(JSON.stringify(record),
  /"(?:jwt|accessToken|refreshToken|oauthCode|geometry|privateSight|userId|mapId|secret|password)"\s*:/);
});
test('R83 distinguishes six token x/y UPDATE triggers from four column-specific nonfiring triggers',()=>{
 const inventory=record.liveTriggerInventory.mapTokens;
 assert.equal(inventory.totalEnabledUpdateTriggers,10);
 assert.deepEqual(inventory.firedByPositionOnlyUpdate,expectedTokenPos);
 assert.deepEqual(inventory.notFiredByPositionOnlyUpdate,expectedNotToken);
 assert.equal(new Set([...inventory.firedByPositionOnlyUpdate,
  ...inventory.notFiredByPositionOnlyUpdate]).size,10);
 const tool=record.liveTriggerInventory.campaignToolIssues;
 assert.equal(tool.totalEnabledUpdateTriggers,5);
 assert.deepEqual(tool.firedByPositionOnlyUpdate,expectedTool);
 assert.deepEqual(tool.notFiredByPositionOnlyUpdate,
  ['forge_navigation_tool_permissions']);
 assert.equal(new Set([...tool.firedByPositionOnlyUpdate,
  ...tool.notFiredByPositionOnlyUpdate]).size,5);
});
test('R83 source-exact fog/collision fixture models only two of six actual token movement triggers',()=>{
 assert.deepEqual(record.syntheticR54Fixture.installedRealMovementTriggers,expectedTokenPos.slice(0,2));
 assert.deepEqual(record.syntheticR54Fixture.missingLivePositionTriggerPaths,expectedTokenPos.slice(2));
 assert.equal(record.syntheticR54Fixture.fullProductionTriggerParity,false);
 assert.equal(record.syntheticR54Fixture.addedR83SignedCommits,0);
 assert.equal(record.syntheticR54Fixture.originallyBenchmarkedSignedCommits,72);
 assert.equal(record.syntheticR54Fixture.sourceOriginalCommitMD5,
  'f87014e7a967d1db1262dabe9e125552');
 assert.deepEqual(record.originalTokenTriggerDefinitions,{
  'forge_visibility.enforce_collision()':'7e652f0f2334980ccc724e1748d334ba',
  'forge_visibility.tick_tokens()':'f6c2eef860141bff253024e0f6d8c7ba',
  'public.reject_direct_sheet_inventory_overwrite()':'14c6e5f2f18d473a807c8f5a4bd3277d',
  'public.protect_token_fields()':'188ca42e10f52115511eba0a594c29c6',
  'public.touch_updated_at()':'8639838030b589f3caeaf247e9aa9986',
  'public.validate_token_map()':'8ddb83de264171910132b2da9979f26c'
 });
});
test('R83 preserves original 36-sample R68 fixture byte-for-byte and existing security cases',()=>{
 assert.equal(originalBlob(historic),'c77a39a89eb2b5eaa98279705251e18befa8e9d1');
 assert.match(historic,/public\.begin_world_motion_v2/);
 assert.match(historic,/public\.advance_world_motion_v2/);
 assert.match(historic,/public\.commit_world_motion_v2/);
 assert.match(historic,/FOR iteration IN 1\.\.3 LOOP/);
 assert.match(historic,/FOR cfg IN SELECT scenario,scene/);
 assert.match(historic,/INSERT INTO pg_temp\.r68_samples/);
 assert.match(historic,/count\(\*\)=36 FROM pg_temp\.r68_samples/);
 assert.match(runner,/R54-09 original wall blocks unauthorized crossing without leaking geometry/);
 assert.match(runner,/R54-10 revoked fixture viewer cannot request an authorized fog frame/);
});
test('R83 source profiler runs only in protected PG17 fixture inside R54 transaction and tracks temporary counters',()=>{
 assert.match(start,/current_database\(\)<>'world_v2_b10_r05'/);
 assert.match(start,/current_user<>'postgres'/);
 assert.match(start,/to_regclass\('pg_temp\.r54_samples'\)/);
 assert.match(start,/md5\(pg_get_functiondef\(/);
 assert.match(start,/SET LOCAL track_functions = 'all';/);
 assert.match(start,/CREATE TEMP TABLE r83_functions_before ON COMMIT DROP AS/);
 assert.match(start,/FROM pg_stat_xact_user_functions/);
 assert.doesNotMatch(start,/ALTER SYSTEM|ALTER ROLE|CREATE EXTENSION|ALTER DATABASE|dblink|postgres\.com|supabase\.co|INSERT INTO public/);
});
test('R83 profiler wraps existing workload without creating additional signed sessions',()=>{
 const marker0='\\i tests/world-v2-b10-postgres/r83-commit-function-profile-start.sql';
 const marker1='\\i tests/world-v2-b10-postgres/r68-commit-cost-attribution.sql';
 const marker2='\\i tests/world-v2-b10-postgres/r83-commit-function-profile-finish.sql';
 const positions=[runner.indexOf(marker0),runner.indexOf(marker1),runner.indexOf(marker2)];
 assert.ok(positions.every(x=>x>0),positions.toString());
 assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]);
 assert.ok(positions[0]>runner.indexOf("R54-10 revoked fixture viewer"));
 assert.ok(positions[2]<runner.lastIndexOf('\nROLLBACK;'));
 assert.match(runner,/to_regclass\('pg_temp\.r83_functions_before'\) IS NULL/);
 assert.match(runner,/to_regclass\('pg_temp\.r83_function_delta'\) IS NULL/);
 // Source fingerprint guards contain literal regprocedure signatures;
 // prohibit actual extra signed RPC execution, not harmless digest strings.
 assert.doesNotMatch(start+finish,/(?:PERFORM|:=|SELECT)\s+public\.(?:begin|advance|commit)_world_motion_v2\s*\(/);
});
test('R83 records source user-function deltas and signed Commit/trigger counts but never invents browser p95',()=>{
 assert.match(finish,/pg_stat_xact_user_functions after_stats/);
 assert.match(finish,/LEFT JOIN pg_temp\.r83_functions_before/);
 assert.match(finish,/signed_commits=72/);
 assert.match(finish,/fog_trigger_calls>=72/);
 assert.match(finish,/collision_trigger_calls>=72/);
 assert.match(finish,/track_functions'\)<>'all'/);
 assert.match(finish,/xact-scoped function profile/i);
 assert.doesNotMatch(finish,/CREATE OR REPLACE FUNCTION|DROP FUNCTION|DROP TRIGGER|DISABLE TRIGGER|GRANT EXECUTE|INSERT INTO public|UPDATE public\.map_tokens/);
 assert.equal(record.baseline.browserCommitP95Ms,1451.7);
 assert.equal(record.baseline.browserReleaseToTerminalP95Ms,2226.1);
 assert.equal(record.baseline.liveCommitMeanSQLMs,305.46);
});
test('R83 review still requires real 6-trigger and tool 4-trigger coverage before optimizing Commit',()=>{
 assert.equal(record.syntheticR54Fixture.fullProductionTriggerParity,false);
 assert.equal(record.liveSettings.trackFunctions,'none');
 assert.equal(record.sampledInfrastructure.actualFreeTierPhysicalRamAndSwapMeasured,false);
 assert.equal(record.deployment.authorizedIndependentPlayersVerified,false);
 assert.equal(record.baseline.sqlCumulativeStatsResetUTC,'2026-11-05T09:51:43Z');
 assert.equal(record.liveTriggerInventory.campaignToolIssues.firedByPositionOnlyUpdate.length,4);
 assert.match(read('docs/testing/world-v2-r18-83-live-commit-trigger-profile-2026-11-15.md'),
  /full six-trigger production parity remains unverified/i);
});
