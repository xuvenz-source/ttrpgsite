import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const prefix='tests/world-v2-b10-postgres/';
const sample=read(prefix+'r87-balanced-signed-candidate-cost.sql');
const original=read(prefix+'r86-full-trigger-eight-viewer-candidate-matrix.sql');
const r54=read(prefix+'r54-fog-commit-source-real.sql');
const runner=read(prefix+'rehearse-r05.sh');
const ledger=JSON.parse(read('staging/next-release-ledger.json'));
const gitBlob=s=>{const b=Buffer.from(s);return createHash('sha1')
 .update('blob '+b.length+'\0').update(b).digest('hex')};
const expected={
 'supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql':'6adf9a0b43e833c1b7f13befaca458b14781f74b',
 'supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql':'66745cc8305b8ff11cfac58a18c3864d2052ae3e',
 'supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql':'06a0e142608dcd53aefe739c451230ac906c51df',
 'supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql':'6320a8a6a0e61ec8127891576a81f025b4c17027'
};

test('R87 pins original exact operator-gated candidate install and inverse sources',()=>{
 for(const [path,sha] of Object.entries(expected)){
  assert.equal(gitBlob(read(path)),sha,path);
  assert.equal(sample.split('\\i '+path).length-1,12,path);
 }
 assert.equal(gitBlob(read(prefix+'r68-commit-cost-attribution.sql')),
  'c77a39a89eb2b5eaa98279705251e18befa8e9d1');
 assert.match(sample,/ee3356af321fec1a3e167a75c6245e86/);
 assert.match(sample,/f37c8d13e8d48bea123b4c811ae6de4d/);
 assert.match(sample,/a9fc198168c29fd5d80041b05337017e/);
 assert.match(sample,/has_inline:=position/);
 assert.match(sample,/R87 selected mode drifted private original\/sealed source or ACL/);
 // Read-only live pg_catalog confirms the ray has NULL proacl (default
 // function EXECUTE), while the private schema prevents anon/authenticated
 // USAGE. The fog frame itself is explicitly postgres-only. Enforce exact
 // inherited ACLs; never misrepresent default EXECUTE as private revocation.
 assert.match(sample,/p\.proacl IS NOT NULL FROM pg_proc/);
 assert.match(sample,/proacl::text IS DISTINCT FROM '\{postgres=X\/postgres\}'/);
 assert.match(sample,/has_schema_privilege\('authenticated','forge_visibility','USAGE'\)/);
 assert.match(sample,/has_schema_privilege\('anon','forge_visibility','USAGE'\)/);
 assert.doesNotMatch(sample,/CREATE OR REPLACE FUNCTION forge_visibility\.authorized_viewer_fog_frame|CREATE OR REPLACE FUNCTION forge_visibility\.ray_blocked/);
});

test('R87 requires fifth independent original full-trigger signed PG17 rollback pass',()=>{
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOSTADDR/);
 assert.match(runner,/SUPABASE_DB_URL/);
 assert.match(runner,/r05_psql -v r84_full=1 -v r86_matrix=1 -v r87_balanced=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.match(original,/\\if :\{\?r87_balanced\}/);
 assert.match(original,/\\i tests\/world-v2-b10-postgres\/r87-balanced-signed-candidate-cost.sql/);
 assert.match(sample,/current_database\(\)<>'world_v2_b10_r05'/);
 assert.match(sample,/current_user<>'postgres'/);
 assert.match(sample,/to_regclass\('pg_temp.r86_matrix_samples'\) IS NULL/);
 assert.match(sample,/count\(\*\)<>6 FROM pg_trigger/);
 assert.match(sample,/count\(\*\)<>4 FROM pg_trigger/);
 assert.match(sample,/md5\(pg_get_functiondef\(to_regprocedure\(sig_fog\)\)\)/);
 assert.match(sample,/md5\(pg_get_functiondef\(to_regprocedure\(sig_ray\)\)\)/);
 assert.match(r54,/to_regclass\('pg_temp.r87_expected_schedule'\) IS NULL/);
 assert.match(r54,/to_regclass\('pg_temp.r87_balanced_samples'\) IS NULL/);
 assert.match(r54,/to_regprocedure\('pg_temp.r87_signed_sample\(integer,text\)'\) IS NULL/);
 assert.match(r54,/R54-11 rollback removes fog functions\/triggers/);
});

test('R87 has exact 4x4 balanced Latin and ABBA/BAAB original vs combined sequence',()=>{
 const match=[...sample.matchAll(/\(\s*(\d+),'(latin[1-4]|abba|baab)',([1-4]),'(original|r57|r77|combined)'\)/g)]
  .map(m=>({ordinal:Number(m[1]),group:m[2],position:Number(m[3]),variant:m[4]}));
 assert.equal(match.length,24);
 for(let k=0;k<match.length;k++)assert.equal(match[k].ordinal,k+1);
 const variants=['original','r57','r77','combined'];
 const latin=match.filter(x=>x.group.startsWith('latin'));
 const abba=match.filter(x=>x.group==='abba');
 const baab=match.filter(x=>x.group==='baab');
 assert.equal(latin.length,16);
 for(const variant of variants){
  assert.equal(latin.filter(x=>x.variant===variant).length,4);
  for(let pos=1;pos<=4;pos++)
   assert.equal(latin.filter(x=>x.variant===variant&&x.position===pos).length,1);
 }
 assert.deepEqual(abba.map(x=>x.variant),['original','combined','combined','original']);
 assert.deepEqual(baab.map(x=>x.variant),['combined','original','original','combined']);
 assert.equal(sample.split('SELECT pg_temp.r87_signed_sample(').length-1,24);
 assert.match(sample,/sum\(signed_commits\)=48/);
 assert.match(sample,/sum\(full_frame_pairs\)=192/);
 assert.match(sample,/R87-10 source-sealed original\/57\/77\/composite/);
});

test('R87 measures real signed original Commit, checks eight private viewers and signed canonical reverse each phase',()=>{
 assert.match(sample,/public\.begin_world_motion_v2\(/);
 assert.match(sample,/public\.advance_world_motion_v2\(/);
 assert.equal(sample.split('public.commit_world_motion_v2(').length-1,2);
 assert.match(sample,/t0:=clock_timestamp\(\)/);
 assert.match(sample,/commit_ms:=extract\(epoch FROM clock_timestamp\(\)-t0\)\*1000/);
 assert.match(sample,/new_ticks>=old_ticks\+8/);
 assert.match(sample,/count\(\*\)=8 FROM public.map_viewer_visibility_ticks/);
 assert.match(sample,/expected_frame:=forge_visibility\.r86_frozen_original_frame/);
 assert.match(sample,/candidate_frame:=forge_visibility\.authorized_viewer_fog_frame/);
 assert.match(sample,/expected_frame IS NOT DISTINCT FROM candidate_frame/);
 assert.match(sample,/R87-08 every measured attempt includes original signed canonical return/);
 assert.match(sample,/R87-06 exact complete private sight\/exploration frame/);
 assert.match(sample,/R87-07 all eight independent fixture viewers/);
 assert.doesNotMatch(sample,/DISABLE TRIGGER|DROP TRIGGER|GRANT EXECUTE|ALTER SYSTEM|ALTER ROLE|UPDATE\s+public\.map_tokens/i);
});

test('R87 refuses original signed session limiter bypass and does not overclaim measured local speed',()=>{
 assert.match(sample,/prior_starts NOT BETWEEN 40 AND 48/);
 assert.match(sample,/prior_starts\+48<=120/);
 assert.match(sample,/current_starts<=120/);
 assert.match(sample,/R87-01 original 120-session rolling budget/);
 assert.match(sample,/SELECT variant,count\(\*\) AS n,/);
 assert.match(sample,/percentile_cont\(0.50\)/);
 assert.doesNotMatch(sample,/percentile_cont\(0.95\)|production_p95|browser_p95/i);
 assert.doesNotMatch(sample,/https?:\/\/|DATABASE_URL|SUPABASE_DB_URL|dblink|pg_read_file|COPY.+PROGRAM/i);
 assert.match(sample,/No dynamic SQL assembling a non-original candidate body/);
});

test('R87 ledger is another draft, never approval for migration, QA alias or production',()=>{
 assert.equal(ledger.branches.length,181);
 assert.equal(ledger.upcomingRelease.outstandingBranches.length,116);
 assert.equal(ledger.releaseBranch,'stage/world-v2-b10-r18-95-free-isolated-qa-project-preflight-2026-11-16');
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
 const x=ledger.releaseBalancedCandidateBenchmark;
 assert.equal(x.workPackage,'B10-R18-87');
 assert.equal(x.decision,'NO_GO');
 assert.equal(x.previousLedgerBranches,172);
 assert.equal(x.currentLedgerBranches,173);
 assert.equal(x.counterbalancedLatinPhases,16);
 assert.equal(x.originalCombinedAbbaBaabPhases,8);
 assert.equal(x.measuredSignedOriginalCommitSamples,24);
 assert.equal(x.signedCanonicalReturnCommits,24);
 assert.equal(x.originalMotionRateCapPerMinute,120);
 assert.equal(x.expectedSourceExactFullFrameComparisons,192);
 assert.equal(x.sourceFrozenOriginalFogAndRay,true);
 assert.equal(x.sourceSealedActualCandidateInstallAndInversePerPhase,true);
 assert.equal(x.testOnlyRollback,true);
 for(const k of ['candidateSourceOrPermissionsRelaxed','originalAuthorizerOrCollisionBypassed',
 'original120GestureCapBypassed','localSampleProvesHostedSpeedup',
 'browserP95AcceptanceProven','fullHostedRlsParityEstablished',
 'officialLinkedCli83Plus8Verified','independentSignedDmP1P2Accepted',
 'freeTierRamAndLockLoadAccepted','liveSupabaseSqlWritten','sqlMigrationApplied',
 'previewDeployed','productionDeployed','productionReleaseAuthorized'])
  assert.equal(x[k],false,k);
 assert.equal(ledger.releaseFogCandidateMatrix.productionReleaseAuthorized,false);
 assert.equal(ledger.releaseCommitPhaseIsolation.productionReleaseAuthorized,false);
});
