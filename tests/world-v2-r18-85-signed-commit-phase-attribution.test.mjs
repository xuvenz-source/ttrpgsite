import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const ROOTPG='tests/world-v2-b10-postgres/';
const phase=read(ROOTPG+'r85-signed-commit-phase-attribution.sql');
const runner=read(ROOTPG+'r54-fog-commit-source-real.sql');
const shell=read(ROOTPG+'rehearse-r05.sh');
const r68=read(ROOTPG+'r68-commit-cost-attribution.sql');
const r84Start=read(ROOTPG+'r84-commit-function-profile-start.sql');
const r84Finish=read(ROOTPG+'r84-commit-function-profile-finish.sql');
const issued=read(ROOTPG+'r84-issued-tool-hostile.sql');
const blob=s=>{const b=Buffer.from(s);
 return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};

test('R85 keeps original signed R68 and complete R84 full-trigger workload unchanged',()=>{
 assert.equal(blob(r68),'c77a39a89eb2b5eaa98279705251e18befa8e9d1');
 assert.match(r84Start,/IF trigger_count<>6/);
 assert.match(r84Finish,/signed_commits=72/);
 assert.match(issued,/R84-13 observed all four original issued-tool x\/y trigger functions/);
 assert.match(shell,/r05_psql -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(shell,/r05_psql -v r84_full=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(shell,/r05_psql -v r84_full=1 -v r85_phase=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.ok(shell.indexOf('r05_psql -v r85_full=1')===-1);
 const end84=runner.indexOf('\\i tests/world-v2-b10-postgres/r84-issued-tool-hostile.sql');
 const start85=runner.indexOf('\\i tests/world-v2-b10-postgres/r85-signed-commit-phase-attribution.sql');
 assert.ok(end84>0&&start85>end84);
 assert.ok(runner.indexOf('\\if :{?r85_phase}')<start85);
 assert.ok(start85<runner.lastIndexOf('\nROLLBACK;'));
});

test('R85 refuses external/nonisolated execution and retains all 10 live position triggers',()=>{
 for(const pattern of [
 /current_database\(\)<>'world_v2_b10_r05'/,
 /current_user<>'postgres'/,
 /current_setting\('track_functions'\)<>'all'/,
 /to_regclass\('pg_temp.r84_function_delta'\)/,
 /to_regclass\('pg_temp.r84_tool_function_delta'\)/,
 /to_regprocedure\('public\.finalize_world_motion_v2/,
 /f87014e7a967d1db1262dabe9e125552/,
 /count\(\*\)<>6 FROM pg_trigger/,
 /count\(\*\)<>4 FROM pg_trigger/,
 /NOT has_schema_privilege\('authenticated','forge_world_v2','USAGE'\)/])
  assert.match(phase,pattern);
 assert.match(shell,/WORLD_V2_B10_ISOLATED/);
 assert.match(shell,/PGHOSTADDR/);
 assert.match(shell,/PGSERVICEFILE/);
 assert.match(shell,/SUPABASE_DB_URL/);
 assert.doesNotMatch(phase,/DISABLE TRIGGER|DROP TRIGGER|ALTER SYSTEM|ALTER ROLE|GRANT EXECUTE|CREATE OR REPLACE FUNCTION|UPDATE\s+public\.map_tokens/i);
});

test('R85 cap-aware phase profiling adds four original signed sessions without changing 120/60s rate limit',()=>{
 assert.match(phase,/starts NOT BETWEEN 112 AND 116/);
 assert.match(phase,/starts<=120/);
 assert.match(phase,/ARRAY\['fog-on','fog-off'\]/);
 assert.match(phase,/FOREACH fog_mode IN ARRAY/);
 assert.match(phase,/public\.begin_world_motion_v2/);
 assert.match(phase,/public\.advance_world_motion_v2/);
 assert.match(phase,/public\.commit_world_motion_v2/);
 assert.match(phase,/original signed return/i);
 assert.match(phase,/CREATE TEMP TABLE r85_phase_samples/);
 assert.match(phase,/CREATE TEMP TABLE r85_function_before/);
 assert.match(phase,/CREATE TEMP TABLE r85_function_delta/);
 assert.match(runner,/to_regclass\('pg_temp\.r85_phase_samples'\) IS NULL/);
 assert.match(runner,/to_regclass\('pg_temp\.r85_function_before'\) IS NULL/);
 assert.match(runner,/to_regclass\('pg_temp\.r85_function_delta'\) IS NULL/);
});

test('R85 isolates function deltas for exact Begin+Advance vs Commit rather than subtracting independent benchmarks',()=>{
 assert.match(phase,/pg_stat_xact_user_functions/);
 assert.match(phase,/pg_stat_clear_snapshot/);
 assert.match(phase,/phase text NOT NULL CHECK \(phase IN \('begin_advance','commit'\)\)/);
 assert.match(phase,/a\.calls-coalesce\(b\.calls,0\)/);
 assert.match(phase,/fog_mode,'begin_advance'/);
 assert.match(phase,/fog_mode,'commit'/);
 assert.match(phase,/function_name='begin_world_motion_v2' AND calls=1/);
 assert.match(phase,/function_name='advance_world_motion_v2' AND calls=1/);
 assert.match(phase,/function_name='commit_world_motion_v2' AND calls=1/);
 assert.match(phase,/AND function_name='enforce_collision' AND calls=1/);
 assert.match(phase,/AND function_name='tick_tokens' AND calls=1/);
 assert.match(phase,/function_name='authorized_viewer_fog_frame'/);
 assert.match(phase,/function_name='ray_blocked'/);
 assert.match(phase,/NOT EXISTS\(SELECT 1 FROM pg_temp\.r85_function_delta/);
 assert.match(phase,/inclusive costs NEST/);
});

test('R85 preserves wall, fog authorization, opaque server refusal, canonical restoration and original rollback',()=>{
 assert.match(phase,/scenario='wall-heavy'/);
 assert.match(phase,/jsonb_array_length\(live->'objects'\)=24/);
 assert.match(phase,/viewer_revision_delta>=2/);
 assert.match(phase,/viewer_revision_delta=0/);
 assert.match(phase,/R85-07 original signed return preserves canonical source\/home/);
 assert.match(phase,/R85-09 synchronous private fog cost is in signed Commit/);
 assert.match(phase,/R85-10 no session throttle bypass/);
 assert.match(runner,/R54-09 original wall blocks unauthorized crossing without leaking geometry/);
 assert.match(runner,/R54-10 revoked fixture viewer cannot request an authorized fog frame/);
 assert.match(runner,/R54-11 rollback removes fog functions\/triggers/);
 assert.match(issued,/R84-10 source-real issued-tool collision: no wall crossing or leaked geometry/);
 assert.match(issued,/R84-11 revoked player may not finalize signed tool move/);
});

test('R85 prints only bounded counters and synthetic timings without claiming browser p95 or production release',()=>{
 assert.match(phase,/SELECT fog,phase,count\(\*\) AS samples/);
 assert.match(phase,/SELECT fog,phase,function_schema,function_name,calls/);
 // A fixed success message can mention 'token' generically; forbid values.
 assert.doesNotMatch(phase,/RAISE NOTICE[^;\n]*%[^;\n]*,/i);
 assert.match(phase,/RAISE NOTICE 'R18-85 PASS: signed wall-heavy Commit phase isolation/);
 assert.doesNotMatch(phase,/https?:\/\/|SUPABASE_DB_URL|DATABASE_URL|dblink|postgres\.com|SUPABASE_SERVICE_ROLE_KEY/);
 const ledger=JSON.parse(read('staging/next-release-ledger.json'));
 assert.equal(ledger.releaseBranch,'stage/world-v2-b10-r18-95-free-isolated-qa-project-preflight-2026-11-16');
 assert.equal(ledger.branches.length,182);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,116);
 assert.equal(ledger.branches.at(-11).linkedPullRequest,187);
 assert.equal(ledger.branches.at(-9).releaseReady,false);
 assert.equal(ledger.branches.at(-10).linkedPullRequest,188);
 assert.equal(ledger.branches.at(-8).releaseReady,false);
 assert.equal(ledger.branches.at(-9).linkedPullRequest,189);
 assert.equal(ledger.branches.at(-1).releaseReady,false);
 assert.equal(ledger.branches.at(-8).linkedPullRequest,190);
 assert.equal(ledger.branches.at(-7).linkedPullRequest,191);
 assert.equal(ledger.branches.at(-6).linkedPullRequest,192);
 assert.equal(ledger.branches.at(-5).linkedPullRequest,193);
 assert.equal(ledger.branches.at(-4).linkedPullRequest,194);
 assert.equal(ledger.branches.at(-3).linkedPullRequest,195);
 assert.equal(ledger.branches.at(-2).linkedPullRequest,196);
 assert.equal(ledger.branches.at(-1).linkedPullRequest,197);
 const state=ledger.releaseCommitPhaseIsolation;
 assert.equal(state.workPackage,'B10-R18-85');
 assert.equal(state.decision,'NO_GO');
 assert.equal(state.priorLedgerBranches,170);
 assert.equal(state.currentLedgerBranches,171);
 assert.equal(state.fullSourceRealTokenTriggers,6);
 assert.equal(state.fullSourceRealToolTriggers,4);
 assert.equal(state.additionalSignedSessions,4);
 assert.equal(state.pairedFogStateCount,2);
 assert.equal(state.browserReleasePerformanceAccepted,false);
 assert.equal(state.productionReleaseAuthorized,false);
 for(const field of ['productionDeployed','previewDeployed','supabaseSqlWritten','sqlMigrationApplied',
  'officialLinkedCli83Plus8Accepted','independentSignedDmP1P2Accepted',
  'freeTierLoadRamAccepted','fullHostedRlsParityEstablished'])
  assert.equal(state[field],false,field);
});
