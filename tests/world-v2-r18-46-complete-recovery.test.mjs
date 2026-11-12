import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const path='supabase/candidates/';
const capture=read(path+'world_v2_r18_46_capture_original_sources.sql');
const seal=read(path+'world_v2_r18_46_seal_release_sources.sql');
const restore=read('supabase/release-recovery/world_v2_b10_r18_46_restore_original_geometry.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r18-46.sh');
const install=read('tests/world-v2-b10-postgres/recoverable-install-r18-46.sql');
const final=read('tests/world-v2-b10-postgres/verify-recovered-r18-46.sql');
const migrations='supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql';

test('R18-46 original 83-version R05 migration, historical ordered stack and R18-17/19/20 remain byte-identical',()=>{
 const fixed={
  [migrations]:'f4e296725c09055685321726cbe4bc6e09dbce5a',
  'tests/world-v2-b10-postgres/ordered-stack-r18-22.sql':'2e7ccf6c2b3c56b880e96c6bda2762a594f6e428',
  [path+'world_v2_r18_17_wall_edge_clearance.sql']:'c78998da8a9013591f2bb479cca4b222f41ef2d7',
  [path+'world_v2_r18_19_cross_map_guard.sql']:'55db7e6b6839d1d8b489203baa11c99264648a55',
  [path+'world_v2_r18_20_campaign_affinity.sql']:'3980808966ec56ad74120bc4f737c78ddd2056bb',
  [path+'world_v2_r18_26_step_bbox_prefilter.sql']:'57522d2d801ca69c92a136c5c915c58101644e51',
  [path+'world_v2_r18_27_commit_empty_work.sql']:'bbc2dcf4c770ce857845691c80bd2c11418c3d77',
  [path+'world_v2_r18_28_atomic_finalize.sql']:'9f22adbe0de09148a67ba1a1ef0397df1cd85be9',
  [path+'world_v2_r18_30_blocked_final_semantics.sql']:'6741a9f31e72bd354818de9d77b9a893aca51c51'
 };
 for(const [f,sha] of Object.entries(fixed))assert.equal(blob(read(f)),sha,f);
});
test('R18-46 five original live PG definitions are frozen before any wall changes',()=>{
 const hashes=['86cbe9a2145e05f8a5f88b05e6b87186',
  '95ee819774fc9b4303dffff76c786dee',
  '7e652f0f2334980ccc724e1748d334ba',
  '771ea1716498a43210661532f9c24977',
  '6dcd75ce4719cd0bf6173f77f75fdf32'];
 for(const h of hashes)assert.ok(capture.includes(h),'missing original live catalog digest '+h);
 for(const name of ['forge_world_v2.swept_hits_segment','forge_visibility.swept_hits_segment',
  'forge_visibility.enforce_collision','forge_visibility.enforce_tool_collision','forge_world_v2.step_allowed'])
  assert.ok(capture.includes(name),'missing original function '+name);
 assert.match(capture,/to_regclass\('forge_world_v2\.motion_r05_function_backup'\)/);
 assert.match(capture,/CREATE TABLE forge_world_v2\.motion_r46_source_backup/);
 assert.match(capture,/ALTER TABLE forge_world_v2\.motion_r46_source_backup ENABLE ROW LEVEL SECURITY/);
 assert.match(capture,/REVOKE ALL ON TABLE forge_world_v2\.motion_r46_source_backup FROM PUBLIC,anon,authenticated/);
 assert.match(capture,/has_function_privilege\('authenticated',p,'EXECUTE'\)/);
 assert.match(capture,/IF n<>0 THEN RAISE EXCEPTION/);
 assert.doesNotMatch(capture,/DROP TABLE|DROP FUNCTION|CASCADE/);
});
test('R18-46 sealed replacement hashes and guard topology are source bound, never client writable',()=>{
 assert.match(seal,/UPDATE forge_world_v2\.motion_r46_source_backup/);
 assert.match(seal,/installed_digest=current_md5/);
 assert.match(seal,/installed_digest IS NOT NULL/);
 assert.match(seal,/CREATE TABLE forge_world_v2\.motion_r46_guard_seal/);
 assert.match(seal,/ALTER TABLE forge_world_v2\.motion_r46_guard_seal ENABLE ROW LEVEL SECURITY/);
 assert.match(seal,/REVOKE ALL ON TABLE forge_world_v2\.motion_r46_guard_seal FROM PUBLIC,anon,authenticated/);
 assert.match(seal,/tgrelid='public\.battle_maps'::regclass/);
 assert.match(seal,/tgrelid='public\.map_tokens'::regclass/);
 assert.match(seal,/tgenabled='O'/);
 assert.match(seal,/count\(\*\) FROM pg_trigger WHERE tgfoid=guard_oid\)<>2/);
 assert.match(seal,/has_function_privilege\('authenticated',guard_oid,'EXECUTE'\)/);
});
test('R18-46 atomic restoring transaction refuses drift before executing first source',()=>{
 assert.match(restore,/^BEGIN;/m);
 assert.match(restore,/^COMMIT;/m);
 assert.match(restore,/SET LOCAL lock_timeout='5s'/);
 assert.match(restore,/SET LOCAL statement_timeout='90s'/);
 assert.match(restore,/SET LOCAL search_path=''/);
 const guards=[
  "R46 recovery STOP: incomplete source backups",
  "R46 recovery STOP: browser/private privilege drift",
  "R46 recovery STOP: original four R05 functions not yet restored",
  "R46 recovery STOP: campaign-affinity guard changed",
  "R46 recovery STOP: guard trigger topology/source drift",
  "R46 recovery STOP: source, ACL, or security mode drift",
  "R46 recovery STOP: exact postrestore source/ACL mismatch"
 ];
 for(const g of guards)assert.ok(restore.includes(g),'missing fail-closed check '+g);
 assert.ok(restore.indexOf('md5(pg_get_functiondef(p)) IS DISTINCT FROM rec.installed_digest')<
  restore.indexOf('EXECUTE rec.old_definition'));
 assert.match(restore,/md5\(rec\.old_definition\)<>rec\.original_digest/);
 assert.match(restore,/EXECUTE rec\.old_definition/);
 assert.match(restore,/pg_get_functiondef\(p\)\)<>rec\.original_digest/);
 assert.doesNotMatch(restore,/DROP (?:TABLE|TRIGGER|FUNCTION)|\bCASCADE\b|schema_migrations.*(?:UPDATE|DELETE)/);
});
test('R18-46 security-first recovery keeps R18-20 campaign-identity guards and normal actor APIs',()=>{
 assert.match(restore,/Deliberately KEEP both source-pinned R18-20 campaign-affinity triggers/);
 assert.match(restore,/pg_get_triggerdef/);
 assert.match(restore,/has_function_privilege\('authenticated',\s*'public\.finalize_world_motion_v2/);
 assert.match(restore,/has_function_privilege\('authenticated',\s*'public\.advance_world_motion_v2/);
 assert.match(restore,/has_function_privilege\('authenticated',\s*'public\.commit_world_motion_v2/);
 assert.match(final,/R46-02 exact original 5 geometry\/collision\/step PLUS 4 R05 functions all restored/);
 assert.match(final,/R46-04 campaign identity security remains stronger/);
 assert.match(final,/R46-05 release history\/schema retained/);
});
test('R18-46 fourth PG17 database is loopback-only and installs source capture BEFORE R17',()=>{
 for(const token of ['WORLD_V2_B10_ISOLATED','PGHOSTADDR','PGSERVICE','PGSERVICEFILE',
  'DATABASE_URL','SUPABASE_DB_URL','r46db','127.0.0.1','postgres',
  'world_v2_b10_r18_46','2e7ccf6c2b3c56b880e96c6bda2762a594f6e428',
  'world_v2_r18_46_capture_original_sources.sql',
  'world_v2_b10_r46_ordered.sql',
  'recoverable-install-r18-46.sql',
  'world_v2_b10_r18_45_atomic_containment.sql',
  'world_v2_b10_r05_restore_original_authority.sql',
  'world_v2_b10_r18_46_restore_original_geometry.sql'])
  assert.ok(runner.includes(token),token);
 assert.match(runner,/anchor="-- 2\. Staged dual-geometry helpers/);
 assert.ok(runner.indexOf('capture_original_sources.sql')<
  runner.indexOf('recoverable-install-r18-46.sql'));
 assert.ok(runner.indexOf('world_v2_b10_r18_45_atomic_containment.sql')<
  runner.indexOf('world_v2_b10_r05_restore_original_authority.sql'));
 assert.ok(runner.indexOf('world_v2_b10_r05_restore_original_authority.sql')<
  runner.indexOf('world_v2_b10_r18_46_restore_original_geometry.sql'));
 assert.doesNotMatch(runner,/supabase\s+db\s+(push|reset)|curl|wget|PGHOST="\$\{.*supabase/i);
});
test('R18-46 commit all four exact post-R05 candidates, seal BEFORE COMMIT',()=>{
 let last=-1;
 for(const f of ['world_v2_r18_26_step_bbox_prefilter.sql',
  'world_v2_r18_27_commit_empty_work.sql',
  'world_v2_r18_28_atomic_finalize.sql',
  'world_v2_r18_30_blocked_final_semantics.sql',
  'world_v2_r18_46_seal_release_sources.sql']){
  const idx=install.indexOf(f);
  assert.ok(idx>last,'missing or out of order '+f);last=idx;
 }
 assert.ok(last<install.indexOf('COMMIT;'));
 assert.match(install,/^BEGIN;/m);
 assert.match(install,/^COMMIT;/m);
 assert.match(install,/R46-01 full source stack committed/);
 const master=read('tests/world-v2-b10-postgres/run.sh');
 assert.ok(master.indexOf('rehearse-r18-44.sh')<master.indexOf('rehearse-r18-46.sh'));
});
test('R18-46 backend staging does not turn on production atomic client grants or flags',()=>{
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.match(runtime,/atomicFinalizeEnabled=!dmPreview&&/);
 assert.match(runtime,/VITE_WORLD_V2_ATOMIC_FINALIZE==='1'/);
 assert.match(runtime,/VITE_WORLD_V2_ATOMIC_FINALIZE_READY==='1'/);
 assert.match(read('src/engine/v2/AuthorityClient.js'),/atomicFinalizeEnabled=false/);
 assert.match(restore,/has_function_privilege\('authenticated',\s*'public\.finalize_world_motion_v2/);
});
