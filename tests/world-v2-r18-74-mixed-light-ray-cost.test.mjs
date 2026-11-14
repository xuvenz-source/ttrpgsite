import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const harness=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const sql=read('tests/world-v2-b10-postgres/r74-mixed-light-ray-cost-profile.sql');
const source=read('tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql');
const r72=read('tests/world-v2-b10-postgres/r72-frame-local-solid-wall-probe.sql');

test('R18-74 runs exactly once after restored R72 but before original signed R57 Commit and inside outer rollback',()=>{
 const before=harness.indexOf('\\i tests/world-v2-b10-postgres/r72-frame-local-solid-wall-probe.sql');
 const marker='\\i tests/world-v2-b10-postgres/r74-mixed-light-ray-cost-profile.sql';
 const step=harness.indexOf(marker);
 const signed=harness.indexOf('DO $r57_compare_and_measure$');
 const inverse=harness.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
 const rolled=harness.lastIndexOf('ROLLBACK;');
 assert.ok(before>=0&&before<step&&step<signed&&signed<inverse&&inverse<rolled);
 assert.equal(harness.split(marker).length,2);
 assert.match(harness,/^BEGIN;$/m);
 assert.doesNotMatch(sql,/^BEGIN;|^COMMIT;/m);
 assert.match(r72,/R72-12 exact sealed R57 source, private ACL, roster and original environment restored/);
});

test('R18-74 refuses wrong PG17 fixture, changed historical source, altered grants or roster',()=>{
 for(const match of [
  /current_database\(\)='world_v2_b10_r05'/,
  /current_user='postgres'/,
  /current_setting\('track_functions'\)='none'/,
  /count\(\*\)=91 FROM supabase_migrations\.schema_migrations/,
  /count\(\*\)=6 FROM pg_temp\.r72_samples/,
  /f37c8d13e8d48bea123b4c811ae6de4d/,
  /a9fc198168c29fd5d80041b05337017e/,
  /cec916b326a14937ceee2e170619cca2/,
  /5c52255db93f2a9ed892e684dd11f898/,
  /proacl::text='\{postgres=X\/postgres\}'/,
  /NOT has_schema_privilege\('authenticated'/,
  /NOT has_schema_privilege\('anon'/,
  /NOT has_function_privilege\('authenticated'/,
  /NOT has_function_privilege\('anon'/
 ])assert.match(sql,match);
 assert.match(source,/R54 pinned is_lit cec916b326a14937ceee2e170619cca2/);
 assert.match(source,/R54 pinned wall_passes 5c52255db93f2a9ed892e684dd11f898/);
});

test('R18-74 models exactly one wall and two authored lights with darkness, brightness, open/closed portals and hostile fallbacks',()=>{
 const labels=[
  'mixed-wall-dark','mixed-wall-dim','mixed-wall-bright','mixed-door-closed-dark',
  'mixed-door-open-dark','mixed-lights-disabled-dark','mixed-one-way-dark',
  'mixed-curtained-window-dark','mixed-malformed-light-dark','mixed-wall-shared-dark'
 ];
 for(const name of labels)assert.ok(sql.includes("'"+name+"'"),name);
 assert.match(sql,/count\(\*\)=10 FROM pg_temp\.r74_scenes/);
 assert.match(sql,/count\(\*\)=6 FROM pg_temp\.r74_scenes WHERE profiled/);
 assert.match(sql,/count\(\*\)=4 FROM pg_temp\.r74_scenes WHERE NOT profiled/);
 assert.match(sql,/jsonb_array_length\(scene->'objects'\)=3/);
 assert.match(sql,/count\(\*\)=2 FROM jsonb_array_elements\(/);
 assert.match(sql,/count\(\*\)=1 FROM jsonb_array_elements\(/);
 assert.match(sql,/'"?objects"?":\[/);
});

test('R18-74 attributes ray, is_lit, wall_passes and cross2 calls/self-time only through PG transaction-local statistics',()=>{
 assert.match(sql,/SET LOCAL track_functions='all';/);
 assert.match(sql,/SET LOCAL track_functions='none';/);
 assert.match(sql,/pg_stat_xact_user_functions/g);
 for(const family of ['ray_blocked','is_lit','wall_passes','cross2'])
  assert.ok(sql.includes("funcname='"+family+"'"));
 for(const column of ['mean_ray_calls','mean_ray_self_ms','mean_lighting_calls',
  'mean_lighting_self_ms','mean_wall_passes_calls','mean_wall_passes_self_ms',
  'mean_cross2_calls','mean_cross2_self_ms'])assert.match(sql,new RegExp(column));
 assert.match(sql,/self_time excludes tracked nested function time/);
 assert.match(sql,/cannot split those call modes/);
 assert.doesNotMatch(sql,/pg_stat_reset|pg_stat_statements_reset/i);
});

test('R18-74 has balanced variants and exactly 192 instrumented protected eight-viewer frames',()=>{
 assert.match(sql,/FOR i IN 1\.\.2 LOOP/);
 assert.match(sql,/ARRAY\['original','fastpath'\]/);
 assert.match(sql,/ARRAY\['fastpath','original'\]/);
 assert.match(sql,/r57_unmodified_fog_frame\(test_map,person\)/);
 assert.match(sql,/authorized_viewer_fog_frame\(test_map,person\)/);
 assert.match(sql,/count\(\*\)=24 FROM pg_temp\.r74_cost/);
 assert.match(sql,/count\(DISTINCT \(label,variant\)\)=12/);
 assert.match(sql,/R74-06 6x2x2 eight-viewer samples/);
 assert.match(sql,/label='mixed-wall-bright' AND variant='fastpath'/);
 assert.match(sql,/label='mixed-wall-dark' AND is_lit_calls>0/);
});

test('R18-74 checks 80 complete original-versus-fastpath private frames and no heuristic or cell counts',()=>{
 assert.match(sql,/original_frame IS NOT DISTINCT FROM fast_frame/);
 assert.match(sql,/scenes=10 AND frames=80/);
 assert.match(sql,/R74-07 complete private original\/fastpath fog parity/);
 assert.match(sql,/R74-08 all eight independently authorized fixture viewers included/);
 assert.match(sql,/R74-09 ten mixed and hostile scenes x eight complete private frames/);
 assert.match(harness,/R57-08 original wall authority and private geometry protected/);
});

test('R18-74 tests torch and revoked viewer under separate source-real savepoints',()=>{
 assert.match(sql,/SAVEPOINT r74_torch_probe;/);
 assert.match(sql,/ROLLBACK TO SAVEPOINT r74_torch_probe;/);
 assert.match(sql,/RELEASE SAVEPOINT r74_torch_probe;/);
 assert.match(sql,/INSERT INTO public\.campaign_tool_map_tokens\(/);
 assert.match(sql,/R74-10 torch and mixed authored light exact original\/fastpath parity/);
 assert.match(sql,/SAVEPOINT r74_revoke;/);
 assert.match(sql,/ROLLBACK TO SAVEPOINT r74_revoke;/);
 assert.match(sql,/RELEASE SAVEPOINT r74_revoke;/);
 assert.match(sql,/UPDATE public\.campaign_members SET role='spectator'/);
 assert.match(sql,/R74-12 source original\/fastpath both deny revoked player/);
 assert.match(sql,/R74-13 exact source\/ACL, light, scene and authorized fixture restored/);
});

test('R18-74 does not create installable runtime functions, grants, migrations or leak source player frames to output',()=>{
 const executable=sql.replace(/^--.*$/gm,'');
 assert.doesNotMatch(executable,/^\s*(?:CREATE OR REPLACE FUNCTION|GRANT|REVOKE|ALTER FUNCTION|DROP FUNCTION|ALTER ROLE|CREATE ROLE|DISABLE TRIGGER|TRUNCATE)\b/mi);
 assert.doesNotMatch(executable,/^SET\s+(?!LOCAL)/mi);
 assert.doesNotMatch(executable,/^\s*UPDATE\s+(?:supabase_migrations|forge_world_v2|public\.map_tokens)\b/mi);
 assert.match(sql,/UPDATE public\.map_environments/);
 assert.match(sql,/R18-74 PASS: mixed light\/LOS function attribution/);
 assert.doesNotMatch(sql,/RAISE NOTICE.*(?:user_id|frame->|geometry_json|scene->|JWT)/i);
 assert.match(sql,/FROM pg_temp\.r74_cost GROUP BY label,variant ORDER BY label,variant/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM public\.campaign_tool_map_tokens/);
 assert.match(harness,/R57-10 exact original source and private privileges restored/);
 assert.match(harness,/R57-12 no opt-in, rollback or 91-history test residue persisted/);
});
