import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const harness=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const sql=read('tests/world-v2-b10-postgres/r75-inline-ray-cross2-parity.sql');
const original=read('tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql');

test('R18-75 is exact-once after R74 source restore and before original signed R57 Commit/rollback',()=>{
 const before=harness.indexOf('\\i tests/world-v2-b10-postgres/r74-mixed-light-ray-cost-profile.sql');
 const name='\\i tests/world-v2-b10-postgres/r75-inline-ray-cross2-parity.sql';
 const current=harness.indexOf(name);
 const signed=harness.indexOf('DO $r57_compare_and_measure$');
 const inverse=harness.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
 const rollback=harness.lastIndexOf('ROLLBACK;');
 assert.ok(before>=0&&before<current&&current<signed&&signed<inverse&&inverse<rollback);
 assert.equal(harness.split(name).length,2);
 assert.match(harness,/^BEGIN;$/m);
 assert.doesNotMatch(sql,/^BEGIN;|^COMMIT;/m);
});

test('R18-75 requires exact disposable DB, 91 synthetic migrations, eight members, original fog/ray/cross2/lighting digests and private grants',()=>{
 for(const p of [
  /current_database\(\)='world_v2_b10_r05'/,
  /current_user='postgres'/,
  /current_setting\('track_functions'\)='none'/,
  /count\(\*\)=91 FROM supabase_migrations\.schema_migrations/,
  /count\(\*\)=8 FROM public\.campaign_members/,
  /count\(\*\)=10 FROM pg_temp\.r74_scenes/,
  /count\(\*\)=24 FROM pg_temp\.r74_cost/,
  /count\(\*\)=23 FROM pg_temp\.r72_scenes/,
  /a9fc198168c29fd5d80041b05337017e/,
  /65c4bff8aaa6ecf38e335a44e95d874e/,
  /cec916b326a14937ceee2e170619cca2/,
  /f37c8d13e8d48bea123b4c811ae6de4d/,
  /NOT has_schema_privilege\('authenticated'/,
  /NOT has_schema_privilege\('anon'/,
  /NOT has_function_privilege\('authenticated'/,
  /NOT has_function_privilege\('anon'/
 ])assert.match(sql,p);
});

test('R18-75 original reference ray and frames persist outside candidate-only savepoint',()=>{
 const ref=sql.indexOf('CREATE TEMP TABLE r75_expected_frames');
 const rays=sql.indexOf('CREATE TEMP TABLE r75_expected_rays');
 const source=sql.indexOf('DO $r75_capture_original$');
 const patch=sql.indexOf('SAVEPOINT r75_inline_ray_probe;');
 const rollback=sql.indexOf('ROLLBACK TO SAVEPOINT r75_inline_ray_probe;');
 assert.ok(ref>=0&&ref<rays&&rays<source&&source<patch&&patch<rollback);
 assert.match(sql,/n=528/);
 assert.match(sql,/count\(\*\)=2376 FROM pg_temp\.r75_expected_rays/);
 assert.match(sql,/count\(\*\)=33 FROM pg_temp\.r75_scenes/);
 assert.match(sql,/count\(\*\)=16 FROM pg_temp\.r75_expected_torch/);
});

test('R18-75 changes only four exact anchored calls to inline equivalent source cross2 arithmetic',()=>{
 const anchors=[
  "forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)",
  "forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay)",
  "forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)",
  "forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)"
 ];
 for(const anchor of anchors)assert.ok(original.includes(anchor));
 for(const x of [
  "((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))",
  "((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))",
  "((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))",
  "((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))"
 ])assert.ok(sql.includes(x));
 assert.match(sql,/length\(original\)-length\(replace\(original,a,''\)\)/);
 assert.match(sql,/length\(original\)-length\(replace\(original,b,''\)\)/);
 assert.match(sql,/length\(original\)-length\(replace\(original,c,''\)\)/);
 assert.match(sql,/length\(original\)-length\(replace\(original,d,''\)\)/);
 assert.match(sql,/patched:=replace\(original,a,/);
 assert.match(sql,/EXECUTE patched;/);
 assert.match(original,/if abs\(denominator\)<0\.0000001 then continue;end if;/);
 assert.match(original,/if param>0\.00001 and param<0\.99999 and/);
 assert.match(original,/exception when others then[\s\S]*return true;/);
});

test('R18-75 checks exact unrounded original/candidate direct rays under all three modes including field values and boundary cases',()=>{
 assert.match(sql,/INSERT INTO pg_temp\.r75_rays VALUES/);
 assert.match(sql,/\(11,6\.49999,7\.5,6\.50001,7\.5\)/);
 assert.match(sql,/\(12,6\.50001,7\.5,6\.49999,7\.5\)/);
 assert.match(sql,/VALUES \('vision'\),\('light'\),\('movement'\)/);
 assert.match(sql,/"STR":\{"current":10\}/);
 assert.match(sql,/result_blocked IS NOT DISTINCT FROM rec.expected/);
 assert.match(sql,/n=2376/);
 assert.match(sql,/R75-12 33 source-real scenes x 12 rays x 3 modes x 2 attributes/);
});

test('R18-75 compares complete private frame fields across 33 hostile scenes, two implementations and eight viewers',()=>{
 assert.match(sql,/current_frame IS NOT DISTINCT FROM reference.ref_frame/);
 assert.match(sql,/n=528/);
 assert.match(sql,/r57_unmodified_fog_frame\(\s*test_map,reference\.viewer\)/);
 assert.match(sql,/authorized_viewer_fog_frame\(\s*test_map,reference\.viewer\)/);
 assert.match(sql,/R75-14 33 hostile\/source-real scenes x 8 viewers x 2 frame variants/);
 assert.match(harness,/R57-08 original wall authority and private geometry protected/);
});

test('R18-75 validates mixed authored/torch lighting and both revoked-viewer denials',()=>{
 assert.match(sql,/count\(\*\)=16 FROM pg_temp\.r75_expected_torch/);
 assert.match(sql,/R75-15 full inlined mixed authored\/torch private frame parity/);
 assert.match(sql,/R75-16 16 complete original\/inlined torch protected frames/);
 assert.match(sql,/SAVEPOINT r75_revocation;/);
 assert.match(sql,/ROLLBACK TO SAVEPOINT r75_revocation;/);
 assert.match(sql,/UPDATE public\.campaign_members SET role='spectator'/);
 assert.match(sql,/R75-17 both protected original and inlined frames deny revoked viewer/);
 assert.match(sql,/DELETE FROM public\.campaign_tool_map_tokens/);
});

test('R18-75 statistics are local, complete and cannot be mistaken for production performance',()=>{
 assert.match(sql,/SET LOCAL track_functions='all';/);
 assert.match(sql,/SET LOCAL track_functions='none';/);
 assert.match(sql,/pg_stat_xact_user_functions/);
 assert.match(sql,/count\(\*\)=12 FROM pg_temp\.r75_cost/);
 assert.match(sql,/count\(\*\)=6 FROM pg_temp\.r75_cost/);
 assert.match(sql,/variant='inlined' AND cross_calls=0/);
 for(const k of ['mean_8_frame_elapsed_ms','mean_ray_calls','mean_cross2_calls','mean_cross2_self_ms'])
  assert.ok(sql.includes(k));
 assert.doesNotMatch(sql,/pg_stat_reset|pg_stat_statements_reset/);
});

test('R18-75 restores original ray digest, owner, ACL, flags, original sealed fog and fixture after savepoint',()=>{
 assert.match(sql,/ROLLBACK TO SAVEPOINT r75_inline_ray_probe;/);
 assert.match(sql,/RELEASE SAVEPOINT r75_inline_ray_probe;/);
 assert.match(sql,/R75-21 original ray, frames, ACL, roster, light, fog and tracking restored/);
 assert.match(sql,/p\.proacl IS NOT DISTINCT FROM g\.proacl/);
 assert.match(sql,/p\.proconfig IS NOT DISTINCT FROM g\.proconfig/);
 assert.match(sql,/p\.provolatile IS NOT DISTINCT FROM g\.provolatile/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM public\.campaign_tool_map_tokens/);
 assert.match(harness,/R57-10 exact original source and private privileges restored/);
 assert.match(harness,/R57-12 no opt-in, rollback or 91-history test residue persisted/);
});

test('R18-75 cannot install runtime code, create real migration, loosen grants or export geometry/frame IDs',()=>{
 const executable=sql.replace(/^--.*$/gm,'');
 assert.doesNotMatch(executable,/^\s*(?:CREATE OR REPLACE FUNCTION|GRANT|REVOKE|ALTER FUNCTION|DROP FUNCTION|CREATE ROLE|ALTER ROLE|TRUNCATE|DISABLE TRIGGER)\b/mi);
 assert.doesNotMatch(executable,/^SET\s+(?!LOCAL)/mi);
 assert.doesNotMatch(executable,/^\s*UPDATE\s+(?:supabase_migrations|forge_world_v2|public\.map_tokens)\b/mi);
 assert.doesNotMatch(executable,/RAISE NOTICE.*(?:user_id|frame->|geometry|scene->|JWT)/i);
 assert.match(sql,/FROM pg_temp\.r75_cost\s+GROUP BY scenario,variant/);
 assert.match(sql,/R18-75 PASS: 2376 exact ray comparisons, 528 private frames, 16 torch frames, revocation and full original source rollback/);
});
