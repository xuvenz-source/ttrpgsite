import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const pg='tests/world-v2-b10-postgres/';
const matrix=read(pg+'r86-full-trigger-eight-viewer-candidate-matrix.sql');
const r54=read(pg+'r54-fog-commit-source-real.sql');
const runner=read(pg+'rehearse-r05.sh');
const ledger=JSON.parse(read('staging/next-release-ledger.json'));
const gitBlob=s=>{const b=Buffer.from(s);return createHash('sha1')
 .update('blob '+b.length+'\0').update(b).digest('hex')};
const sources=[
 ['supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql','6adf9a0b43e833c1b7f13befaca458b14781f74b'],
 ['supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql','66745cc8305b8ff11cfac58a18c3864d2052ae3e'],
 ['supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql','06a0e142608dcd53aefe739c451230ac906c51df'],
 ['supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql','6320a8a6a0e61ec8127891576a81f025b4c17027']
];

test('R86 preserves exact opt-in candidate install and inverse source, no production migration',()=>{
 for(const [path,sha] of sources){
  const source=read(path);
  assert.equal(gitBlob(source),sha,path);
  assert.ok(matrix.includes('\\i '+path),path);
 }
 assert.equal(gitBlob(read(pg+'r68-commit-cost-attribution.sql')),
  'c77a39a89eb2b5eaa98279705251e18befa8e9d1');
 assert.match(matrix,/R86 refuses nonisolated, source-drifted or incomplete six\/four trigger fixture/);
});

test('R86 is separate fourth local R54 source-real pass without replaying 72 extra signed Commits',()=>{
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOSTADDR/);
 assert.match(runner,/SUPABASE_DB_URL/);
 assert.match(runner,/r05_psql -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(runner,/r05_psql -v r84_full=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(runner,/r05_psql -v r84_full=1 -v r85_phase=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(runner,/r05_psql -v r84_full=1 -v r86_matrix=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(r54,/\\if :\{\?r86_matrix\}/);
 assert.match(r54,/\\i tests\/world-v2-b10-postgres\/r86-full-trigger-eight-viewer-candidate-matrix.sql/);
 assert.ok(r54.indexOf('r86-full-trigger-eight-viewer-candidate-matrix.sql')<r54.lastIndexOf('\nROLLBACK;'));
 assert.match(matrix,/to_regclass\('pg_temp.r84_function_delta'\) IS NOT NULL/);
 assert.match(matrix,/to_regclass\('pg_temp.r68_samples'\) IS NOT NULL/);
 assert.match(matrix,/count\(\*\)<>6 FROM pg_trigger/);
 assert.match(matrix,/count\(\*\)<>4 FROM pg_trigger/);
 assert.doesNotMatch(matrix,/DISABLE TRIGGER|DROP TRIGGER|ALTER SYSTEM|ALTER ROLE|GRANT EXECUTE|UPDATE\s+public\.map_tokens/i);
});

test('R86 freezes BOTH private ray and full fog source independently of candidates',()=>{
 assert.match(matrix,/ee3356af321fec1a3e167a75c6245e86/);
 assert.match(matrix,/a9fc198168c29fd5d80041b05337017e/);
 assert.match(matrix,/replace\(replace\(frame,frame_header/);
 assert.match(matrix,/call_anchor,'forge_visibility.r86_frozen_original_ray\('/);
 assert.match(matrix,/frame_original:=forge_visibility.r86_frozen_original_frame/);
 assert.match(matrix,/frame_current:=forge_visibility.authorized_viewer_fog_frame/);
 assert.match(matrix,/frame_original IS NOT DISTINCT FROM frame_current/);
 assert.match(matrix,/REVOKE ALL ON FUNCTION forge_visibility.r86_frozen_original_frame/);
 assert.match(matrix,/REVOKE ALL ON FUNCTION forge_visibility.r86_frozen_original_ray/);
 assert.match(r54,/to_regprocedure\('forge_visibility.r86_frozen_original_ray/);
 assert.match(r54,/to_regprocedure\('forge_visibility.r86_frozen_original_frame/);
});

test('R86 compares 4 truly distinct signed variants, eight protected viewers and hostile full-frame parity',()=>{
 for(const v of ['original','r57','r77','combined'])
  assert.ok(matrix.includes("r86_signed_probe('"+v+"')"),v);
 assert.match(matrix,/r57-synthetic-91-version-gate.sql/);
 assert.match(matrix,/R86-02 source-real 6\+4 triggers, eight actor-owned pieces/);
 assert.match(matrix,/full_frame_pairs integer NOT NULL CHECK\(full_frame_pairs=48\)/);
 assert.match(matrix,/R86-06 all eight protected viewers refreshed synchronously/);
 assert.match(matrix,/R86-07 canonical reverse signed/);
 assert.match(matrix,/R86-08 complete private frame equality/);
 assert.match(matrix,/R86-09 over-limit geometry fails closed/);
 assert.match(matrix,/R86-10 six hostile\/shared\/dark\/24-wall scenes/);
 assert.match(matrix,/R86-13 combined candidate revoked spectator denied/);
 assert.match(matrix,/R86-14 all four independent candidate modes, 192 complete frames/);
 assert.match(matrix,/count\(\*\)=192/);
 assert.match(matrix,/sum\(signed_commits\)=8/);
 assert.match(matrix,/R86-11 independently sealed R57 inverse/);
 assert.match(matrix,/R86-12 independently sealed R77 inverse/);
});

test('R86 checks private grants, rolls back sealed candidates, and prints no sensitive geometry or frames',()=>{
 for(const pattern of [
  /current_database\(\)<>'world_v2_b10_r05'/,
  /current_user<>'postgres'/,
  /to_regprocedure\('public.finalize_world_motion_v2/,
  /NOT has_function_privilege\('authenticated'/,
  /NOT has_schema_privilege\('anon','forge_visibility','USAGE'\)/
 ]) assert.match(matrix,pattern);
 assert.match(r54,/to_regclass\('pg_temp.r86_matrix_scenes'\) IS NULL/);
 assert.match(r54,/to_regclass\('pg_temp.r86_matrix_samples'\) IS NULL/);
 assert.match(r54,/to_regclass\('supabase_migrations.schema_migrations'\) IS NULL/);
 assert.match(r54,/R54-09 original wall blocks unauthorized crossing without leaking geometry/);
 assert.match(r54,/R54-10 revoked fixture viewer cannot request an authorized fog frame/);
 assert.match(r54,/R54-11 rollback removes fog functions\/triggers/);
 assert.match(matrix,/Only aggregate variant labels and synthetic SQL execution timings/);
 assert.doesNotMatch(matrix,/https?:\/\/|DATABASE_URL|SUPABASE_DB_URL|dblink|pg_read_file|COPY.+PROGRAM/);
});

test('R86 ledger cannot turn synthetic history or a single local Commit into release approval',()=>{
 assert.equal(ledger.branches.length,179);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,114);
 assert.equal(ledger.releaseBranch,
  'stage/world-v2-b10-r18-93-cli-streams-positive-offline-2026-11-16');
 assert.equal(ledger.branches.at(-8).linkedPullRequest,188);
 assert.equal(ledger.branches.at(-7).releaseReady,false);
 assert.equal(ledger.branches.at(-7).linkedPullRequest,189);
 assert.equal(ledger.branches.at(-1).releaseReady,false);
 assert.equal(ledger.branches.at(-6).linkedPullRequest,190);
 assert.equal(ledger.branches.at(-5).linkedPullRequest,191);
 assert.equal(ledger.branches.at(-4).linkedPullRequest,192);
 assert.equal(ledger.branches.at(-3).linkedPullRequest,193);
 assert.equal(ledger.branches.at(-2).linkedPullRequest,194);
 assert.equal(ledger.branches.at(-1).linkedPullRequest,195);
 const x=ledger.releaseFogCandidateMatrix;
 assert.equal(x.workPackage,'B10-R18-86');
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.previousLedgerBranches,171);
 assert.equal(x.currentLedgerBranches,172);
 assert.deepEqual(x.fourModes,['original','r57','r77','combined']);
 assert.equal(x.originalTokenPositionTriggers,6);
 assert.equal(x.originalToolPositionTriggers,4);
 assert.equal(x.syntheticFixtureViewerCount,8);
 assert.equal(x.sourceFrozenOriginalFogAndRay,true);
 assert.equal(x.plannedFullFrameComparisons,192);
 assert.equal(x.plannedSignedCanonicalCommits,8);
 assert.equal(x.testOnlyRollback,true);
 for(const k of ['originalAuthorizerOrCollisionBypassed','original120GestureCapBypassed',
  'fullHostedRlsParityEstablished','independentSignedDmP1P2Accepted',
  'officialLinkedCli83Plus8Verified','browserMovementAccepted',
  'freeTierRamAndLockLoadAccepted','liveSupabaseSqlWritten',
  'sqlMigrationApplied','previewDeployed','productionDeployed',
  'productionReleaseAuthorized']) assert.equal(x[k],false,k);
 assert.equal(ledger.releaseCommitPhaseIsolation.productionReleaseAuthorized,false);
 assert.equal(ledger.releaseFullTriggerFidelity.productionReleaseAuthorized,false);
});
