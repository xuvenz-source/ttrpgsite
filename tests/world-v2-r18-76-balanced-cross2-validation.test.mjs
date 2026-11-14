import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const harness=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const sql=read('tests/world-v2-b10-postgres/r76-balanced-cross2-equivalence.sql');
const r75=read('tests/world-v2-b10-postgres/r75-inline-ray-cross2-parity.sql');
const original=read('tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql');

test('R76 runs once after R75 restoration and before the original R57 signed Commit within rollback',()=>{
 const previous=harness.indexOf('\\i tests/world-v2-b10-postgres/r75-inline-ray-cross2-parity.sql');
 const marker='\\i tests/world-v2-b10-postgres/r76-balanced-cross2-equivalence.sql';
 const here=harness.indexOf(marker);
 const signed=harness.indexOf('DO $r57_compare_and_measure$');
 const inverse=harness.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
 const outer=harness.lastIndexOf('ROLLBACK;');
 assert.ok(previous>=0&&previous<here&&here<signed&&signed<inverse&&inverse<outer);
 assert.equal(harness.split(marker).length,2);
 assert.match(harness,/^BEGIN;$/m);
 assert.doesNotMatch(sql,/^BEGIN;|^COMMIT;/m);
 assert.match(r75,/R75-21 original ray, frames, ACL, roster, light, fog and tracking restored/);
});
test('R76 requires sealed 91-history DB, original source functions, private privileges and prior R75 data',()=>{
 for(const p of [
 /current_database\(\)='world_v2_b10_r05'/,
 /current_user='postgres'/,
 /current_setting\('track_functions'\)='none'/,
 /count\(\*\)=91 FROM supabase_migrations\.schema_migrations/,
 /count\(\*\)=8 FROM public\.campaign_members/,
 /count\(\*\)=33 FROM pg_temp\.r75_scenes/,
 /count\(\*\)=528 FROM pg_temp\.r75_expected_frames/,
 /count\(\*\)=2376 FROM pg_temp\.r75_expected_rays/,
 /count\(\*\)=16 FROM pg_temp\.r75_expected_torch/,
 /count\(\*\)=6 FROM pg_temp\.r75_cost/,
 /a9fc198168c29fd5d80041b05337017e/,
 /65c4bff8aaa6ecf38e335a44e95d874e/,
 /f37c8d13e8d48bea123b4c811ae6de4d/,
 /cec916b326a14937ceee2e170619cca2/,
 /NOT has_schema_privilege\('authenticated'/,
 /NOT has_schema_privilege\('anon'/,
 /NOT has_function_privilege\('authenticated'/,
 /NOT has_function_privilege\('anon'/
 ])assert.match(sql,p);
});
test('R76 extends malformed, directional, conditional and floating-point epsilon coverage',()=>{
 for(const label of ['west-epsilon','east-epsilon','near-parallel','zero-length',
 'conditional','one-way-window','invalid-points','invalid-coordinate']){
  assert.ok(sql.includes("'"+label+"'"),label);
 }
 assert.match(sql,/count\(\*\)=41 FROM pg_temp\.r76_scenes/);
 assert.match(sql,/count\(\*\)=8 FROM pg_temp\.r76_scenes WHERE label LIKE 'edge-%'/);
 assert.match(sql,/count\(\*\)=32 FROM pg_temp\.r76_rays/);
 assert.match(sql,/count\(\*\)=4 FROM pg_temp\.r76_vals/);
 assert.match(sql,/"STR":\{"current":10\}/);
 assert.match(sql,/"STR":8/);
 assert.match(sql,/"STR":"malformed"/);
 assert.match(sql,/6\.4999999999,8,6\.5000000001,8/);
 assert.match(sql,/0\.000000000000001/);
});
test('R76 captures exact private frame and boolean references before changing source',()=>{
 const rays=sql.indexOf('CREATE TEMP TABLE r76_expected_rays');
 const frames=sql.indexOf('CREATE TEMP TABLE r76_expected_frames');
 const capture=sql.indexOf('DO $r76_extra_reference$');
 const savepoint=sql.indexOf('SAVEPOINT r76_balanced_probe;');
 const patch=sql.indexOf('DO $r76_initial_inline$');
 assert.ok(rays>=0&&frames>=0&&rays<capture&&frames<capture&&capture<savepoint&&savepoint<patch);
 assert.match(sql,/15744 FROM pg_temp\.r76_expected_rays/);
 assert.match(sql,/656 FROM pg_temp\.r76_expected_frames/);
 assert.match(sql,/original_frame IS DISTINCT FROM fast_frame/);
 assert.match(sql,/r57_unmodified_fog_frame\(test_map,person\)/);
 assert.match(sql,/authorized_viewer_fog_frame\(test_map,person\)/);
});
test('R76 derives four exact anchored cross-product expressions and retains original function attributes',()=>{
 for(const x of [
 'forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)',
 'forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay)',
 'forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)',
 'forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)'
 ])assert.ok(original.includes(x));
 for(const x of [
 '((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))',
 '((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))',
 '((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))',
 '((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))'
 ])assert.ok(sql.includes(x));
 for(const x of ['a','b','c','d'])
  assert.ok(sql.includes("length(original)-length(replace(original,"+x+",''))"));
 assert.match(sql,/EXECUTE candidate;/);
 assert.match(sql,/EXECUTE code;/);
 assert.match(sql,/p\.proowner=g\.proowner/);
 assert.match(sql,/p\.proacl IS NOT DISTINCT FROM g\.proacl/);
 assert.match(sql,/p\.proparallel IS NOT DISTINCT FROM g\.proparallel/);
 assert.match(original,/if abs\(denominator\)<0\.0000001 then continue;end if;/);
 assert.match(original,/if param>0\.00001 and param<0\.99999 and/);
 assert.match(original,/exception when others then[\s\S]*return true;/);
});
test('R76 checks exact ray Boolean values, full original protected frames, torch and revocation',()=>{
 assert.match(sql,/blocked IS DISTINCT FROM ray\.expected/);
 assert.match(sql,/ray_n=15744/);
 assert.match(sql,/actual IS DISTINCT FROM reference\.expected/);
 assert.match(sql,/frame_n=656/);
 assert.match(sql,/actual IS DISTINCT FROM ref\.expected/);
 assert.match(sql,/n=16/);
 assert.match(sql,/R76-09 all 16 private torch\+authored-light frames exactly matched/);
 assert.match(sql,/SAVEPOINT r76_revoke;/);
 assert.match(sql,/ROLLBACK TO SAVEPOINT r76_revoke;/);
 assert.match(sql,/R76-10 revoked viewer denied by both unchanged protected frame wrappers/);
});
test('R76 ABBA/BAAB balances implementation order with separate warmup and measures function calls',()=>{
 for(const line of [
 "(1,'source'),(2,'inlined'),(3,'inlined'),(4,'source')",
 "(5,'inlined'),(6,'source'),(7,'source'),(8,'inlined')"
 ])assert.ok(sql.includes(line));
 assert.match(sql,/PERFORM forge_visibility\.authorized_viewer_fog_frame\(test_map,warm_viewer\)/);
 assert.match(sql,/SET LOCAL track_functions='all';/);
 assert.match(sql,/SET LOCAL track_functions='none';/);
 assert.match(sql,/pg_stat_xact_user_functions/);
 assert.match(sql,/count\(\*\)=24 FROM pg_temp\.r76_cost/);
 assert.match(sql,/count\(\*\)=12 FROM pg_temp\.r76_cost c WHERE c\.variant='source'/);
 assert.match(sql,/count\(\*\)=12 FROM pg_temp\.r76_cost c WHERE c\.variant='inlined'/);
 assert.match(sql,/count\(DISTINCT c\.ray_calls\)=1/);
 assert.match(sql,/R76-13 exact ABBA\/BAAB balanced 24 full frame sets, original ray count retained/);
});
test('R76 prints aggregate medians and ranges without exposing private source data',()=>{
 for(const k of ['mean_8_frame_ms','median_8_frame_ms','min_8_frame_ms',
 'max_8_frame_ms','mean_ray_calls','mean_ray_self_ms','mean_cross_calls','mean_cross_self_ms'])
  assert.ok(sql.includes(k));
 assert.match(sql,/percentile_cont\(0\.5\) WITHIN GROUP/);
 assert.match(sql,/FROM pg_temp\.r76_cost c GROUP BY c\.scene_label,c\.variant/);
 assert.doesNotMatch(sql,/pg_stat_reset|pg_stat_statements_reset/);
 assert.doesNotMatch(sql,/RAISE NOTICE.*(?:user_id|frame->|coords|scene->|map_id|JWT|jsonb_build_object)/i);
});
test('R76 SAVEPOINT rollback restores all original source, permissions, private fog and signed movement',()=>{
 assert.match(sql,/ROLLBACK TO SAVEPOINT r76_balanced_probe;/);
 assert.match(sql,/RELEASE SAVEPOINT r76_balanced_probe;/);
 assert.match(sql,/count\(\*\)=0 FROM pg_temp\.r76_cost/);
 assert.match(sql,/R76-14 sealed original function, ACL, roster, scene and profiling restored/);
 assert.match(sql,/R18-76 PASS: 15744 exact rays, 656 private frames, 16 torch frames/);
 assert.match(harness,/R57-08 original wall authority and private geometry protected/);
 assert.match(harness,/R57-09 revoked user refused by both original and optimized/);
 assert.match(harness,/R57-10 exact original source and private privileges restored/);
 assert.match(harness,/R57-12 no opt-in, rollback or 91-history test residue persisted/);
});
test('R76 cannot install runtime SQL, migrations, grants or security exceptions',()=>{
 const executable=sql.replace(/^--.*$/gm,'');
 assert.doesNotMatch(executable,/^\s*(?:CREATE OR REPLACE FUNCTION|GRANT|REVOKE|ALTER FUNCTION|DROP FUNCTION|CREATE ROLE|ALTER ROLE|TRUNCATE|DISABLE TRIGGER)\b/mi);
 assert.doesNotMatch(executable,/^SET\s+(?!LOCAL)/mi);
 assert.doesNotMatch(executable,/^\s*UPDATE\s+(?:supabase_migrations|forge_world_v2|public\.map_tokens)\b/mi);
 assert.match(sql,/R76-01 exact R75 restored private-source fixture and ACL/);
 assert.match(sql,/R76-14 sealed original function, ACL, roster, scene and profiling restored/);
});
