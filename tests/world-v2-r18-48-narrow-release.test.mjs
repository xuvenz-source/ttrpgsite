import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR48NarrowPackage} from '../scripts/release/validate-world-v2-r18-48-narrow-package.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const m=JSON.parse(read('staging/world-v2-b10-r18-48-narrow-pending/manifest.json'));
const tamper=fn=>{const copy=structuredClone(m);fn(copy);return copy};
const fails=fn=>assert.throws(()=>validateR48NarrowPackage({repoRoot:root,manifest:tamper(fn)}),/R48 NO-GO/);
test('R18-48 narrows official CLI package to exactly seven reviewed SQL files, eight with R05, flags still OFF',()=>{
 const r=validateR48NarrowPackage({repoRoot:root});
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.safeToApply,false);
 assert.equal(r.pendingWithR05,8);
 assert.equal(r.selectedVersionedSources,7);
 assert.equal(r.excludedMixedPerformance,2);
 assert.equal(r.originalStepValidatorPreserved,true);
});
test('R18-48 rejects unapproved performance sources or staged source identity drift',()=>{
 fails(x=>x.intentionallyExcluded=[]);
 fails(x=>x.pending.push(x.pending[0]));
 fails(x=>x.pending[4].source='supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql');
 fails(x=>x.pending[4].gitBlobSha='0'.repeat(40));
 fails(x=>x.pending[6].filename='20261113021024_r47_seal_release_sources.sql');
 fails(x=>x.pending.reverse());
 fails(x=>x.expectedPendingTotalWithR05=10);
});
test('R18-48 refuses history drift, altered CLI provenance and lost manual gates',()=>{
 fails(x=>x.baseline.remoteMigrations=84);
 fails(x=>x.baseline.r05GitBlob='0'.repeat(40));
 fails(x=>x.baseline.sqlDigestsMatched=82);
 fails(x=>x.lastCli.version='3.1.0');
 fails(x=>x.lastCli.unlinked=false);
 fails(x=>x.releaseDecision='GO');
 fails(x=>x.safeToApply=true);
 fails(x=>x.requiredGates=[]);
 fails(x=>x.prohibited=[]);
});
test('R18-48 source-seal enforces unmodified original step validator, four changed replacements and guard source',()=>{
 const seal=read('supabase/candidates/world_v2_r18_48_narrow_seal_release_sources.sql');
 const original=read('supabase/candidates/world_v2_r18_46_seal_release_sources.sql');
 assert.ok(seal.includes("rec.signature LIKE 'forge_world_v2.step_allowed(%'"));
 assert.ok(seal.includes("current_md5<>rec.original_digest"));
 assert.ok(seal.includes("rec.signature NOT LIKE 'forge_world_v2.step_allowed(%'"));
 assert.ok(seal.includes("current_md5=rec.original_digest"));
 assert.ok(seal.includes('6dcd75ce4719cd0bf6173f77f75fdf32'));
 assert.ok(!original.includes('R48 narrow seal STOP'));
 assert.match(seal,/CREATE TABLE forge_world_v2\.motion_r46_guard_seal/);
 assert.match(seal,/ENABLE ROW LEVEL SECURITY/);
 assert.match(seal,/REVOKE ALL ON TABLE forge_world_v2\.motion_r46_guard_seal/);
 assert.match(seal,/pg_get_triggerdef/);
 assert.match(seal,/has_function_privilege\('authenticated',guard_oid,'EXECUTE'\)/);
});
test('R18-48 fifth source-real PostgreSQL database cannot install R26/27 or touch remote',()=>{
 const sh=read('tests/world-v2-b10-postgres/rehearse-r18-48-narrow.sh');
 const install=read('tests/world-v2-b10-postgres/recoverable-install-r18-48-narrow.sql');
 for(const token of ['WORLD_V2_B10_ISOLATED','PGHOSTADDR','SUPABASE_DB_URL','DATABASE_URL',
 '127.0.0.1','world_v2_b10_r18_48_narrow','recoverable-install-r18-48-narrow.sql',
 'world_v2_b10_r05_restore_original_authority.sql',
 'world_v2_b10_r18_46_restore_original_geometry.sql',
 'verify-recovered-r18-48-narrow.sql'])
  assert.ok(sh.includes(token),token);
 assert.doesNotMatch(install,/^\s*\\i\s+.*world_v2_r18_(26|27)/m);
 assert.match(install,/world_v2_r18_28_atomic_finalize.sql/);
 assert.match(install,/world_v2_r18_30_blocked_final_semantics.sql/);
 assert.match(install,/world_v2_r18_48_narrow_seal_release_sources.sql/);
 assert.match(install,/installed_digest=original_digest/);
 assert.match(install,/installed_digest<>original_digest/);
 assert.match(sh,/R46 recovery STOP: source, ACL, or security mode drift/);
 const runner=read('tests/world-v2-b10-postgres/run.sh');
 assert.ok(runner.includes('rehearse-r18-48-narrow.sh'));
 assert.ok(runner.indexOf('rehearse-r18-46.sh')<runner.indexOf('rehearse-r18-48-narrow.sh'));
});
test('R18-48 existing after-commit recovery checks unchanged session/ACL/geometry sources',()=>{
 const testSql=read('tests/world-v2-b10-postgres/verify-recovered-r18-48-narrow.sql');
 assert.match(testSql,/R48-02 narrow original 5 geometry\/collision\/step PLUS 4 R05 restored/);
 assert.match(testSql,/installed_digest=original_digest/);
 assert.match(testSql,/installed_digest<>original_digest/);
 assert.match(testSql,/to_regprocedure\('public\.finalize_world_motion_v2/);
 assert.match(testSql,/has_function_privilege\('authenticated'/);
 assert.match(testSql,/motion_r46_guard_seal/);
 assert.match(read('supabase/release-recovery/world_v2_b10_r18_46_restore_original_geometry.sql'),/EXECUTE rec\.old_definition/);
});
