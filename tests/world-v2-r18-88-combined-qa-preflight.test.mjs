import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR88CombinedQa} from '../scripts/release/validate-world-v2-r18-88-combined-qa.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(join(root,p),'utf8');
const manifest=JSON.parse(file('staging/world-v2-b10-r18-88-combined-qa/manifest.json'));
const altered=fn=>{const m=structuredClone(manifest);fn(m);assert.throws(
 ()=>validateR88CombinedQa({repoRoot:root,manifest:m}),
 /R88 COMBINED QA NO-GO/);};

test('R88 precise live source-sealed combined QA manifest still denies every release action',()=>{
 const result=validateR88CombinedQa({repoRoot:root});
 assert.deepEqual(result,{
  workPackage:'B10-R18-88',decision:'NO_GO',safeToApply:false,
  project:'lwhwgqaunxbmvyndswze',registeredMigrations:83,
  requiredMigrations:91,officialLinkedCliVerified:false,
  combinedSourcesSourceSealed:4,originalPrivateAclIntact:true,
  transactionalRollbackRehearsalStaged:true,
  signedMultiplayerQaAccepted:false,freeTierLoadAccepted:false,
  previewDeployed:false,productionDeployed:false
 });
 assert.equal(manifest.project.liveFogFunctionMd5,'ee3356af321fec1a3e167a75c6245e86');
 assert.equal(manifest.project.liveRayFunctionMd5,'a9fc198168c29fd5d80041b05337017e');
 assert.equal(manifest.project.liveRayAcl,null);
 assert.equal(manifest.project.liveFogAcl,'{postgres=X/postgres}');
});

test('R88 rejects false 83+8 history success, missing versions and unpinned CLI upgrade',()=>{
 altered(m=>m.pendingMigrations.officialLinkedHistoryFetchAndDryRunVerified=true);
 altered(m=>m.pendingMigrations.versions.pop());
 altered(m=>m.pendingMigrations.versions[2]='20261113021015');
 altered(m=>m.pendingMigrations.officialLinkedCliVersion='3.0.0');
 altered(m=>m.pendingMigrations.mustNotUseDefaultV3CliTarget=false);
 altered(m=>m.project.liveRegisteredMigrations=91);
 altered(m=>m.project.liveNewestVersion='20261113024116');
});

test('R88 refuses candidate substitution, install order reversal and broken rollback identity',()=>{
 altered(m=>m.candidate.installOrder.reverse());
 altered(m=>m.candidate.rollbackOrder.reverse());
 altered(m=>m.candidate.installOrder[0].gitBlobSha='0000000000000000000000000000000000000000');
 altered(m=>m.candidate.installOrder[1].path='supabase/migrations/bad.sql');
 altered(m=>m.candidate.rollbackOrder[0].guard='skip');
 altered(m=>m.candidate.originalFogMd5='00000000000000000000000000000000');
 altered(m=>m.candidate.anyPublicGrantChange=true);
 altered(m=>m.candidate.synchronousPrivateSightPreserved=false);
});

test('R88 refuses fabricated preview, multiplayer sign-in, free-tier acceptance or release approval',()=>{
 for(const gate of Object.keys(manifest.requiredGates))
  altered(m=>m.requiredGates[gate]=true);
 altered(m=>m.deployment.permanentQaPreviewChanged=true);
 altered(m=>m.deployment.runtimeFlagsEnabled=true);
 altered(m=>m.deployment.qaTargetBuild='abc123');
 altered(m=>m.deployment.migrationApplied=true);
 altered(m=>m.productionReleaseAuthorized=true);
 altered(m=>m.candidateReadyToApply=true);
 altered(m=>m.source.runtimeFilesChanged=true);
});

test('R88 PG17 harness proves incomplete and complete candidate SAVEPOINT rollback without fake migration or bypass',()=>{
 const sql=file('tests/world-v2-b10-postgres/r88-combined-savepoint-rollback.sql');
 const runner=file('tests/world-v2-b10-postgres/rehearse-r05.sh');
 const r86=file('tests/world-v2-b10-postgres/r86-full-trigger-eight-viewer-candidate-matrix.sql');
 const r54=file('tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql');
 for(const needle of ['SAVEPOINT r88_partial;','SAVEPOINT r88_combined;',
  'ROLLBACK TO SAVEPOINT r88_partial;','ROLLBACK TO SAVEPOINT r88_combined;',
  'R88-04 aborted R57-only partial install restores both exact original sources and ACL',
  'R88-07 eight complete original fog and ray private frame comparisons',
  'R88-09 partial-failure and full combined rollback both restore exactly',
  'R18-88 PASS: partial and combined transactional rollback']){
  assert.ok(sql.includes(needle),needle);
 }
 const order=[
  '\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql',
  '\\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql'
 ];
 assert.equal(sql.split(order[0]).length-1,2);
 assert.equal(sql.split(order[1]).length-1,1);
 assert.ok(sql.indexOf(order[1])>sql.lastIndexOf(order[0]));
 assert.match(sql,/current_database\(\)='world_v2_b10_r05'/);
 assert.match(sql,/count\(\*\)=91 FROM supabase_migrations\.schema_migrations/);
 assert.match(sql,/count\(\*\)=6 FROM pg_trigger/);
 assert.match(sql,/count\(\*\)=4 FROM pg_trigger/);
 assert.match(sql,/proacl IS NULL FROM pg_proc/);
 assert.match(sql,/NOT has_schema_privilege\('authenticated','forge_visibility','USAGE'\)/);
 assert.match(r86,/\\if :\{\?r88_atomic\}/);
 assert.match(r54,/to_regclass\('pg_temp.r88_atomic_canary'\) IS NULL/);
 assert.match(runner,/r05_psql -v r84_full=1 -v r86_matrix=1 -v r88_atomic=1 -f tests\/world-v2-b10-postgres\/r54-fog-commit-source-real.sql/);
 assert.doesNotMatch(sql,/DISABLE TRIGGER|DROP TRIGGER|ALTER SYSTEM|ALTER ROLE|GRANT EXECUTE|COMMIT;|UPDATE\s+public\.map_tokens/i);
});

test('R88 live preflight SQL is SELECT-only, bounded, privacy-safe and explicitly NO-GO',()=>{
 const sql=file('supabase/release-preflight/world_v2_b10_r18_88_combined_live_readonly.sql');
 assert.match(sql,/^SELECT jsonb_build_object\(/m);
 assert.match(sql,/'registered_migrations'/);
 assert.match(sql,/'fog_original_md5'/);
 assert.match(sql,/'ray_original_md5'/);
 assert.match(sql,/'release_decision','NO_GO'/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|CALL|DO)\s+(?:TABLE|FUNCTION|SCHEMA|ROLE|public|forge|supabase|SET|INTO|FROM)/i);
 assert.doesNotMatch(sql,/auth\.users|map_tokens\b|map_environments\b|authorized_frame|pg_read_file|dblink|COPY\s+PROGRAM/i);
});

test('R88 release ledger successor still blocks actual root migration and production/QA promotion',()=>{
 const l=JSON.parse(file('staging/next-release-ledger.json'));
 assert.equal(l.branches.length,191);
 assert.equal(l.upcomingRelease.outstandingBranches.length,126);
 assert.equal(l.branches.at(-18).linkedPullRequest,190);
 assert.equal(l.branches.at(-17).linkedPullRequest,191);
 assert.equal(l.branches.at(-16).linkedPullRequest,192);
 assert.equal(l.branches.at(-15).linkedPullRequest,193);
 assert.equal(l.branches.at(-14).linkedPullRequest,194);
 assert.equal(l.branches.at(-13).linkedPullRequest,195);
 assert.equal(l.branches.at(-12).linkedPullRequest,196);
 assert.equal(l.branches.at(-11).linkedPullRequest,197);
 assert.equal(l.branches.at(-10).releaseReady,false);
 assert.equal(l.releaseBranch,'stage/world-v2-b10-r18-105-fog-guard-isolated-pg17-2026-11-17');
 assert.equal(l.releaseCombinedQaPreflight.workPackage,'B10-R18-88');
 assert.equal(l.releaseCombinedQaPreflight.decision,'NO_GO');
 assert.equal(l.releaseCombinedQaPreflight.officialLinkedCli83Plus8Verified,false);
 assert.equal(l.releaseCombinedQaPreflight.transactionalRollbackFixturePassedOnlyLocally,true);
 assert.equal(l.releaseCombinedQaPreflight.sqlMigrationApplied,false);
 assert.equal(l.releaseCombinedQaPreflight.productionReleased,false);
 assert.equal(l.releaseCombinedQaPreflight.previewDeployed,false);
});
