import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const harness=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const experiment=read('tests/world-v2-b10-postgres/r72-frame-local-solid-wall-probe.sql');
const candidate=read('supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql');

test('R18-72 remains inside original R57 transaction and after R71 but before original signed movement/rollback',()=>{
 const r71=harness.indexOf('\\i tests/world-v2-b10-postgres/r71-wall-ray-shape-cost-controls.sql');
 const include='\\i tests/world-v2-b10-postgres/r72-frame-local-solid-wall-probe.sql';
 const here=harness.indexOf(include);
 const compare=harness.indexOf('DO $r57_compare_and_measure$');
 const inverse=harness.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
 const fullRollback=harness.lastIndexOf('ROLLBACK;');
 assert.ok(r71>=0&&r71<here&&here<compare&&compare<inverse&&inverse<fullRollback);
 assert.equal(harness.split(include).length,2);
 assert.match(harness,/^BEGIN;$/m);
 assert.doesNotMatch(experiment,/^BEGIN;|^COMMIT;/m);
});
test('R18-72 refuses wrong database, history, role, drifted sealed R57 source, ray function and public visibility grants',()=>{
 for(const x of [
  /current_database\(\)='world_v2_b10_r05'/,
  /current_user='postgres'/,
  /count\(\*\)=91 FROM supabase_migrations\.schema_migrations/,
  /count\(\*\)=12 FROM pg_temp\.r71_samples/,
  /f37c8d13e8d48bea123b4c811ae6de4d/,
  /a9fc198168c29fd5d80041b05337017e/,
  /proacl::text='\{postgres=X\/postgres\}'/,
  /NOT has_schema_privilege\('authenticated'/,
  /NOT has_schema_privilege\('anon'/,
  /NOT has_function_privilege\('authenticated'/,
  /NOT has_function_privilege\('anon'/
 ])assert.match(experiment,x);
});
test('R18-72 only reduces exact simple, static walls; all mixed malformed and conditional scenes use original geometry',()=>{
 assert.match(experiment,/r72_ray_scene:=scene;/);
 assert.match(experiment,/r72_valid:=false;/);
 assert.match(experiment,/r72_item->>'type' IS DISTINCT FROM 'wall'/);
 assert.match(experiment,/jsonb_array_length\(scene->'objects'\) BETWEEN 2 AND 120/);
 assert.match(experiment,/jsonb_array_length\(r72_item->'points'\) NOT BETWEEN 2 AND 80/);
 assert.match(experiment,/jsonb_typeof\(r72_point->'x'\) IS DISTINCT FROM 'number'/);
 assert.match(experiment,/jsonb_typeof\(r72_point->'y'\) IS DISTINCT FROM 'number'/);
 assert.match(experiment,/SELECT DISTINCT ON \(object_value\)/);
 assert.match(experiment,/ORDER BY object_value,ordinal/);
 assert.match(experiment,/jsonb_agg\(object_value ORDER BY first_ordinal\)/);
 assert.match(experiment,/jsonb_array_length\(r72_short\)<jsonb_array_length\(scene->'objects'\)/);
 assert.match(experiment,/r72_ray_scene:=jsonb_set\(scene/);
 assert.match(experiment,/EXCEPTION WHEN OTHERS THEN[\s\S]*r72_ray_scene:=scene;/);
 for(const label of [
  'duplicate-with-light','duplicate-with-conditional','duplicate-with-null',
  'duplicate-with-invalid-points','duplicate-with-nonnumeric-point','duplicate-over-120',
  'duplicate-shared','duplicate-dark'
 ])assert.ok(experiment.includes("'"+label+"'"));
});
test('R18-72 source probe is derived from exact live function, changes only the private frame call and returns to original via savepoint',()=>{
 assert.match(experiment,/pg_get_functiondef/);
 assert.match(experiment,/position\(a in original\)/);
 assert.match(experiment,/position\(b in original\)/);
 assert.match(experiment,/position\(c in original\)/);
 assert.match(experiment,/EXECUTE patched;/);
 assert.match(experiment,/SAVEPOINT r72_candidate_only;/);
 assert.match(experiment,/ROLLBACK TO SAVEPOINT r72_candidate_only;/);
 assert.match(experiment,/RELEASE SAVEPOINT r72_candidate_only;/);
 assert.match(experiment,/R72-12 exact sealed R57 source, private ACL, roster and original environment restored/);
 assert.match(experiment,/r72_ray_scene jsonb/);
 assert.match(experiment,/forge_visibility\.ray_blocked\(r72_ray_scene,/);
 assert.match(candidate,/r56_no_lights boolean:=false;r56_ambient double precision;/);
 assert.match(candidate,/with sources as materialized/);
 assert.match(candidate,/forge_visibility\.ray_blocked\(scene,/);
});
test('R18-72 checks complete private original equality on 23 scenes, all eight viewers and revoked viewer denial',()=>{
 assert.match(experiment,/count\(\*\)=23 FROM pg_temp\.r72_scenes/);
 assert.match(experiment,/scenes=23 AND frames=184/);
 assert.match(experiment,/reference IS NOT DISTINCT FROM probed/);
 assert.match(experiment,/r57_unmodified_fog_frame\(test_map,person\)/);
 assert.match(experiment,/authorized_viewer_fog_frame\(test_map,person\)/);
 assert.match(experiment,/denied_original AND denied_probe/);
 assert.match(experiment,/R72-11 both original and source probe deny revoked viewer/);
 assert.match(harness,/R57-08 original wall authority and private geometry protected/);
 assert.match(harness,/R57-09 revoked user refused by both original and optimized/);
});
test('R18-72 restores transaction-local profiling and prints only aggregate function timing',()=>{
 assert.match(experiment,/SET LOCAL track_functions='all';/);
 assert.match(experiment,/pg_stat_xact_user_functions/);
 assert.match(experiment,/SET LOCAL track_functions='none';/);
 assert.match(experiment,/count\(\*\)=6 FROM pg_temp\.r72_samples/);
 assert.match(experiment,/probe_ray_self_ms/);
 assert.doesNotMatch(experiment,/RAISE NOTICE.*(?:JWT|tokenId|user_id|frame->)/i);
 assert.doesNotMatch(experiment,/pg_stat_reset|pg_stat_statements_reset/);
});
test('R18-72 cannot directly grant roles, change migration ledger, renderer, movement or deploy production',()=>{
 assert.doesNotMatch(experiment,/^\s*(?:GRANT|REVOKE|ALTER FUNCTION|DROP FUNCTION|DISABLE TRIGGER|CREATE ROLE|ALTER ROLE)\b/mi);
 assert.doesNotMatch(experiment,/^SET\s+(?!LOCAL)/mi);
 assert.doesNotMatch(experiment,/^\s*UPDATE\s+(?:supabase_migrations|forge_world_v2|public\.map_tokens)\b/mi);
 assert.match(experiment,/UPDATE public\.map_environments/);
 assert.match(experiment,/R72-12 exact sealed R57 source/);
});
