import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const prefix='tests/world-v2-b10-postgres/';
const fixture=read(prefix+'r84-full-position-trigger-fixture.sql');
const sources=read(prefix+'r84-live-position-trigger-functions.sql');
const start=read(prefix+'r84-commit-function-profile-start.sql');
const finish=read(prefix+'r84-commit-function-profile-finish.sql');
const tool=read(prefix+'r84-issued-tool-hostile.sql');
const runner=read(prefix+'r54-fog-commit-source-real.sql');
const shell=read(prefix+'rehearse-r05.sh');
const historical=read(prefix+'r68-commit-cost-attribution.sql');
const ledger=JSON.parse(read('staging/next-release-ledger.json'));
const shaGitBlob=content=>{
 const b=Buffer.from(content);
 return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
};
const originalSource=[
 ['forge_visibility.enforce_collision()','7e652f0f2334980ccc724e1748d334ba'],
 ['forge_visibility.tick_tokens()','f6c2eef860141bff253024e0f6d8c7ba'],
 ['public.reject_direct_sheet_inventory_overwrite()','14c6e5f2f18d473a807c8f5a4bd3277d'],
 ['public.protect_token_fields()','188ca42e10f52115511eba0a594c29c6'],
 ['public.touch_updated_at()','8639838030b589f3caeaf247e9aa9986'],
 ['public.validate_token_map()','8ddb83de264171910132b2da9979f26c'],
 ['public.reject_direct_tool_inventory_overwrite()','b33940d8d6f5b676b4cf0ec4e0548978'],
 ['public.sync_campaign_tool_map_token()','640b3b7ae479936c45271482a150afaa'],
 ['public.validate_campaign_tool_write()','3968fd2daec5e268c931cdcf42e9bdc7'],
 ['forge_visibility.enforce_tool_collision()','771ea1716498a43210661532f9c24977']
];
const tokens=['forge_player_collision','forge_visibility_token_tick',
 'npc_token_sheet_items_rpc_only','tokens_protected','tokens_touch','tokens_validate'];
const tools=['campaign_tool_items_rpc_only','campaign_tool_sync_map',
 'campaign_tool_validate_issue','forge_tool_collision'];

test('R84 frozen R68 signed workload and historical R83 profiler are preserved',()=>{
 assert.equal(shaGitBlob(historical),'c77a39a89eb2b5eaa98279705251e18befa8e9d1');
 assert.match(shell,/r05_psql -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(shell,/r05_psql -v r84_full=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(runner,/\\i tests\/world-v2-b10-postgres\/r83-commit-function-profile-start.sql/);
 assert.match(runner,/\\i tests\/world-v2-b10-postgres\/r83-commit-function-profile-finish.sql/);
 assert.match(runner,/\\i tests\/world-v2-b10-postgres\/r84-commit-function-profile-start.sql/);
 assert.match(runner,/\\i tests\/world-v2-b10-postgres\/r84-commit-function-profile-finish.sql/);
 assert.match(runner,/\\i tests\/world-v2-b10-postgres\/r68-commit-cost-attribution.sql/);
 assert.match(runner,/\\i tests\/world-v2-b10-postgres\/r84-issued-tool-hostile.sql/);
 assert.ok(runner.indexOf('r84-full-position-trigger-fixture.sql')<
  runner.indexOf('CREATE TEMP TABLE r54_samples('));
 assert.match(runner,/\nROLLBACK;\nDO \$r54_restore\$/);
});

test('R84 uses original source bodies and refuses missing or changed digests',()=>{
 assert.equal(originalSource.length,10);
 for(const [signature,digest] of originalSource){
  assert.ok(fixture.includes("'"+signature+"'"),signature);
  assert.ok(fixture.includes("'"+digest+"'"),digest);
 }
 for(const signature of originalSource.slice(2).map(x=>x[0])){
  const name=signature.replace(/^.*\./,'').replace(/\(\)$/,'');
  assert.match(sources,new RegExp('CREATE OR REPLACE FUNCTION (?:public|forge_visibility)\\.'+name+'\\(\\)'));
 }
 assert.match(fixture,/md5\(pg_get_functiondef\(to_regprocedure\(r\.signature\)\)\)/);
 assert.match(fixture,/RAISE EXCEPTION 'R84 live function source drift/);
 assert.doesNotMatch(sources,/DROP FUNCTION|DROP TRIGGER|DISABLE TRIGGER|GRANT EXECUTE|ALTER ROLE|ALTER SYSTEM/);
});

test('R84 creates exactly all six live x/y token and four tool trigger paths',()=>{
 for(const name of tokens){
  assert.match(fixture+runner,new RegExp('CREATE TRIGGER '+name+'\\b'));
 }
 for(const name of tools){
  assert.match(fixture,new RegExp('CREATE TRIGGER '+name+'\\b'));
 }
 assert.match(fixture,/count\(\*\)=6 FROM pg_trigger/);
 assert.match(fixture,/count\(\*\)=4 FROM pg_trigger/);
 assert.match(fixture,/t\.tgattr::text=''/);
 assert.match(fixture,/NOT has_schema_privilege\('authenticated','forge_world_v2','USAGE'\)/);
 assert.match(fixture,/current_database\(\)<>'world_v2_b10_r05'/);
 assert.match(fixture,/current_user<>'postgres'/);
 assert.match(fixture,/to_regprocedure\('public\.finalize_world_motion_v2/);
});

test('R84 wraps original 72 signed token Commits with transaction-only cost counters',()=>{
 assert.match(start,/SET LOCAL track_functions = 'all';/);
 assert.match(start,/IF trigger_count<>6 THEN/);
 assert.match(start,/to_regclass\('pg_temp\.r54_samples'\)/);
 assert.match(finish,/signed_commits=72/);
 assert.match(finish,/fog_trigger_calls>=72/);
 assert.match(finish,/collision_trigger_calls>=72/);
 for(const fn of ['reject_direct_sheet_inventory_overwrite',
   'protect_token_fields','touch_updated_at','validate_token_map']){
  assert.ok(finish.includes("'"+fn+"'"));
 }
 assert.doesNotMatch(start+finish,/CREATE OR REPLACE FUNCTION|DROP TRIGGER|DISABLE TRIGGER|GRANT EXECUTE|ALTER SYSTEM|ALTER ROLE/);
 assert.match(runner,/to_regclass\('pg_temp\.r84_function_delta'\) IS NULL/);
 assert.match(runner,/to_regclass\('pg_temp\.r84_tool_function_delta'\) IS NULL/);
});

test('R84 tests signed tool authority, wall blocking, revocation and protected fields',()=>{
 for(const name of ['begin_world_motion_v2','advance_world_motion_v2','commit_world_motion_v2'])
  assert.match(tool,new RegExp('public\\.'+name+'\\('));
 assert.match(tool,/campaign_tool_map_tokens/);
 assert.match(tool,/revision=rev\+1/);
 assert.match(tool,/revision=rev\+2/);
 assert.match(tool,/forge_visibility','enforce_tool_collision/);
 assert.match(tool,/R84-07 original tool validation prevents player reconfiguration/);
 assert.match(tool,/R84-08 original token protected-fields rejects foreign owner overwrite/);
 assert.match(tool,/R84-09 DM map\/campaign mismatch rejected by original token validator/);
 assert.match(tool,/R84-10 source-real issued-tool collision: no wall crossing or leaked geometry/);
 assert.match(tool,/R84-11 revoked player may not finalize signed tool move/);
 assert.match(tool,/NOT \(advance_ack \? 'wallGeometry'\)/);
 assert.match(tool,/SELECT fog,count\(\*\)/);
 assert.doesNotMatch(tool,/DISABLE TRIGGER|DROP TRIGGER|GRANT EXECUTE|CREATE OR REPLACE FUNCTION/);
});

test('R84 is never deployment authority, SQL migration, linked CLI or browser acceptance',()=>{
 assert.equal(ledger.branches.length,189);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,124);
 assert.equal(ledger.releaseBranch,'stage/world-v2-b10-r18-103-live-rpc-source-parity-2026-11-17');
 const record=ledger.releaseFullTriggerFidelity;
 assert.equal(record.decision,'NO_GO');
 assert.equal(record.fullFixtureTokenPositionTriggerCount,6);
 assert.equal(record.fullFixtureToolPositionTriggerCount,4);
 assert.equal(record.originalR68SignedTokenCommitsRetained,72);
 assert.equal(record.additionalSignedToolCommitsPlanned,8);
 for(const k of ['fixtureEquivalentToFullProductionRLS',
  'liveSourceFunctionStatsChanged','liveDatabaseSqlWritten','sqlMigrationApplied',
  'previewDeployed','productionDeployed','performanceAcceptedInBrowser',
  'independentSignedDmP1P2Accepted','officialLinkedCli83Plus8Verified',
  'freeTierRamAndLockLoadAccepted','productionReleaseAuthorized'])
  assert.equal(record[k],false,k);
 assert.equal(record.testOnlyRollback,true);
 assert.equal(record.separateOriginalR83BenchmarkPreserved,true);
 assert.equal(ledger.branches.at(-20).linkedPullRequest,186);
 assert.equal(ledger.branches.at(-18).releaseReady,false);
 assert.equal(ledger.branches.at(-19).linkedPullRequest,187);
 assert.equal(ledger.branches.at(-17).releaseReady,false);
 assert.equal(ledger.branches.at(-18).linkedPullRequest,188);
 assert.equal(ledger.branches.at(-16).releaseReady,false);
 assert.equal(ledger.branches.at(-17).linkedPullRequest,189);
 assert.equal(ledger.branches.at(-8).releaseReady,false);
 assert.equal(ledger.branches.at(-16).linkedPullRequest,190);
 assert.equal(ledger.branches.at(-15).linkedPullRequest,191);
 assert.equal(ledger.branches.at(-14).linkedPullRequest,192);
 assert.equal(ledger.branches.at(-13).linkedPullRequest,193);
 assert.equal(ledger.branches.at(-12).linkedPullRequest,194);
 assert.equal(ledger.branches.at(-11).linkedPullRequest,195);
 assert.equal(ledger.branches.at(-10).linkedPullRequest,196);
 assert.equal(ledger.branches.at(-9).linkedPullRequest,197);
 assert.doesNotMatch(fixture+tool+start+finish,/https?:\/\/|DATABASE_URL|SUPABASE_DB_URL|dblink/);
});
