import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0')
 .update(s).digest('hex');
const preflight='supabase/release-preflight/world_v2_b10_r18_45_exact_authority_readonly.sql';
const containment='supabase/release-recovery/world_v2_b10_r18_45_atomic_containment.sql';
const post='tests/world-v2-b10-postgres/postcommit-containment-r18-45.sql';
const run='tests/world-v2-b10-postgres/rehearse-r18-44.sh';
const exact={
 'supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql':'57522d2d801ca69c92a136c5c915c58101644e51',
 'supabase/candidates/world_v2_r18_27_commit_empty_work.sql':'bbc2dcf4c770ce857845691c80bd2c11418c3d77',
 'tests/world-v2-b10-postgres/step-bbox-r18-26.sql':'ec6b3516e8dbacf35d01fc70063775d666972442',
 'tests/world-v2-b10-postgres/commit-empty-r18-27.sql':'4ca8967191c43a0d8598ecd93ce32fa0451ee22d'
};
test('R18-45 uses exact previously reviewed R18-26/27 source and immutable R05 migration',()=>{
 for(const [p,expected] of Object.entries(exact))
  assert.equal(blob(read(p)),expected,'candidate or fixture drift '+p);
 assert.equal(blob(read('supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql')),
  'f4e296725c09055685321726cbe4bc6e09dbce5a');
});
test('R18-45 live preflight is SELECT-only, pins 83 history and all 10 source definitions',()=>{
 const src=read(preflight);
 const statements=src.replace(/--[^\n]*/g,'');
 assert.match(statements,/DO \$r45_exact_gate\$/);
 assert.match(statements,/migration_count|n<>83/);
 assert.match(statements,/latest<>'20261109171247'/);
 assert.match(statements,/version='20261111023204'/);
 assert.match(statements,/status='active' AND expires_at>clock_timestamp\(\)/);
 assert.match(statements,/to_regprocedure/);
 const hashes=[
  '4145e4a7b1eee062196e91fffd052be1',
  '4b38b5e7116a3ff9abc8a99f58755126',
  'f87014e7a967d1db1262dabe9e125552',
  '129d3d872050dd44da989fc5c36a816e',
  'fe246c2a813edb77179dfa6c3632face',
  'd31f0c5cf2be78374b348f12c4e756a5',
  '88f8da7421b36f5375aa26e798a4a08b',
  '6dcd75ce4719cd0bf6173f77f75fdf32',
  '7e652f0f2334980ccc724e1748d334ba',
  '771ea1716498a43210661532f9c24977'
 ];
 for(const hash of hashes)assert.equal(src.split(hash).length,2,hash);
 assert.doesNotMatch(statements,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE)\b\s+(?:TABLE|FUNCTION|INDEX|TRIGGER|POLICY|ROLE|ON|FROM|INTO|public\.|forge_)/i);
 assert.match(statements,/RAISE EXCEPTION 'R45 STOP:/);
});
test('R18-45 exact RPC signature checks fail closed instead of guessing missing arg',()=>{
 for(const src of [read(preflight),read(containment)]){
  assert.match(src,/'public\.advance_world_motion_v2\(uuid,bigint,jsonb,jsonb,bigint,bigint\)'/);
  assert.doesNotMatch(src,/'public\.advance_world_motion_v2\(uuid,bigint,jsonb,bigint,bigint\)'/);
  assert.match(src,/has_function_privilege\('authenticated'/);
  assert.match(src,/has_schema_privilege\('anon','forge_world_v2','USAGE'\)/);
 }
});
test('R18-45 incident script is a bounded transactional EXECUTE revoke, NOT schema rollback',()=>{
 const src=read(containment),sql=src.replace(/--[^\n]*/g,'');
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^COMMIT;/m);
 assert.match(sql,/SET LOCAL lock_timeout='5s'/);
 assert.match(sql,/SET LOCAL statement_timeout='30s'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.finalize_world_motion_v2/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/position\('final_request_r28' IN src\)/);
 assert.match(sql,/position\('noMotion' IN src\)/);
 assert.match(sql,/NOT has_function_privilege\('authenticated',\s*'public\.begin_world_motion_v2/);
 assert.match(sql,/NOT has_function_privilege\('authenticated',\s*'public\.advance_world_motion_v2/);
 assert.match(sql,/NOT has_function_privilege\('authenticated',\s*'public\.commit_world_motion_v2/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b\s+(?:TABLE|FUNCTION|INDEX|TRIGGER|ROLE|ON|FROM|INTO|public\.|forge_)/i);
 assert.doesNotMatch(sql,/schema_migrations/);
});
test('R18-45 committed full chain runs BEFORE ACL containment and protected R05 forward recovery',()=>{
 const src=read(post);
 const order=[
  'world_v2_r18_26_step_bbox_prefilter.sql',
  'world_v2_r18_27_commit_empty_work.sql',
  'world_v2_r18_28_atomic_finalize.sql',
  'world_v2_r18_30_blocked_final_semantics.sql',
  'world_v2_b10_r18_45_atomic_containment.sql',
  'world_v2_b10_r05_restore_original_authority.sql'
 ];
 let last=-1;
 for(const item of order){
  const next=src.indexOf(item);
  assert.ok(next>last,'missing or out-of-order '+item);last=next;
 }
 assert.match(src,/^BEGIN;/m);
 assert.match(src,/^COMMIT;/m);
 assert.match(src,/r45_active/);
 assert.match(src,/public\.advance_world_motion_v2\(/);
 assert.match(src,/public\.commit_world_motion_v2\(/);
 assert.match(src,/original_digest IS DISTINCT FROM/);
 assert.match(src,/sweep_min_x/);
 assert.match(src,/NOT FULL|NOT a full|NOT FULL/i);
});
test('R18-45 standalone source-real suites test both speed candidates before postcommit recovery',()=>{
 const runner=read(run);
 const pos=s=>runner.indexOf(s);
 assert.ok(pos('authority-bridge-r18-44.sql')<pos('step-bbox-r18-26.sql'));
 assert.ok(pos('step-bbox-r18-26.sql')<pos('commit-empty-r18-27.sql'));
 assert.ok(pos('commit-empty-r18-27.sql')<pos('postcommit-containment-r18-45.sql'));
 assert.match(runner,/PGDATABASE/);
 assert.match(runner,/PGHOSTADDR/);
 assert.match(runner,/DATABASE_URL/);
});
test('R18-45 never turns on a client atomic feature flag or loosens private fog',()=>{
 const s=read('src/engine/v2/WorldV2TabletopRuntime.js');
 const a=read('src/engine/v2/AuthorityClient.js');
 assert.match(s,/VITE_WORLD_V2_ATOMIC_FINALIZE==='1'/);
 assert.match(s,/VITE_WORLD_V2_ATOMIC_FINALIZE_READY==='1'/);
 assert.match(s,/atomicFinalizeEnabled=!dmPreview/);
 assert.match(a,/atomicFinalizeEnabled=false/);
 assert.match(read(containment),/REVOKE ALL ON FUNCTION/);
});
