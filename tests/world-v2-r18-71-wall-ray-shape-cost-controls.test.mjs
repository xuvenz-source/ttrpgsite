import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const harness=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const source=read('tests/world-v2-b10-postgres/r71-wall-ray-shape-cost-controls.sql');

test('R71 is contained after R70, before signed benchmark and within original rollback',()=>{
 const a=harness.indexOf('\\i tests/world-v2-b10-postgres/r70-fog-function-cost-profile.sql');
 const inc='\\i tests/world-v2-b10-postgres/r71-wall-ray-shape-cost-controls.sql';
 const b=harness.indexOf(inc), c=harness.indexOf('DO $r57_compare_and_measure$');
 const d=harness.lastIndexOf('ROLLBACK;');
 assert.ok(a>=0&&a<b&&b<c&&c<d);
 assert.equal(harness.split(inc).length,2);
 assert.match(harness,/^BEGIN;$/m);
 assert.doesNotMatch(source,/^BEGIN;|^COMMIT;|^ROLLBACK;/m);
});
test('R71 refuses any non-disposable source, role, unauthorized observer or changed ray function',()=>{
 for(const pattern of [
  /current_database\(\)='world_v2_b10_r05'/,
  /current_user='postgres'/,
  /count\(\*\)=91 FROM supabase_migrations\.schema_migrations/,
  /pg_temp\.r70_function_samples/,
  /a9fc198168c29fd5d80041b05337017e/,
  /f37c8d13e8d48bea123b4c811ae6de4d/,
  /NOT has_schema_privilege\('authenticated'/,
  /NOT has_schema_privilege\('anon'/,
  /NOT has_function_privilege\('authenticated'/,
  /NOT has_function_privilege\('anon'/
 ])assert.match(source,pattern);
});
test('R71 uses three exact diagnostic control shapes without changing authored environments permanently',()=>{
 for(const x of ['repeated-24','distinct-8','reversed-24'])assert.ok(source.includes("'"+x+"'"));
 assert.match(source,/jsonb_agg\(v ORDER BY v\)/);
 assert.match(source,/SELECT DISTINCT value AS v/);
 assert.match(source,/WITH ORDINALITY AS e\(value,ord\)/);
 assert.match(source,/count\(DISTINCT value\)=8/);
 assert.match(source,/jsonb_array_length\(scene->'objects'\)=24/);
 assert.match(source,/jsonb_array_length\(scene->'objects'\)=8/);
 assert.match(source,/R71-09 exact original environment restored/);
});
test('R71 separately measures 3 shapes x 2 variants x 2 repetitions and verifies 24 full private frames',()=>{
 assert.match(source,/FOR i IN 1\.\.2 LOOP/);
 assert.match(source,/ARRAY\['original','fastpath'\]/);
 assert.match(source,/ARRAY\['fastpath','original'\]/);
 assert.match(source,/count\(\*\)=12 FROM pg_temp\.r71_samples/);
 assert.match(source,/expected IS NOT DISTINCT FROM actual/);
 assert.match(source,/r57_unmodified_fog_frame\(test_map,person\)/);
 assert.match(source,/authorized_viewer_fog_frame\(test_map,person\)/);
 assert.match(source,/R71-08 all eight original fixture viewers checked/);
});
test('R71 uses transaction-local function stats, reports only aggregates and restores tracking before R57',()=>{
 assert.match(source,/SET LOCAL track_functions='all';/);
 assert.match(source,/pg_stat_xact_user_functions/);
 assert.match(source,/SET LOCAL track_functions='none';/);
 assert.match(source,/mean_ray_calls/);
 assert.match(source,/mean_ray_self_ms/);
 assert.match(source,/R71-10 original ray source and untracked R57 benchmark restored/);
 assert.doesNotMatch(source,/pg_stat_reset|pg_stat_statements_reset/);
 assert.doesNotMatch(source,/RAISE NOTICE.*(?:person|p_viewer|frame->|'JWT'|token)/);
});
test('R71 never changes protected visibility, grants, migration history or movement authority',()=>{
 assert.doesNotMatch(source,/^\s*(?:CREATE OR REPLACE FUNCTION|GRANT|REVOKE|ALTER FUNCTION|DROP FUNCTION|CREATE ROLE|ALTER ROLE|DISABLE TRIGGER)\b/mi);
 assert.doesNotMatch(source,/^SET\s+(?!LOCAL)/mi);
 assert.doesNotMatch(source,/^\s*UPDATE\s+(?:supabase_migrations|forge_world_v2|public\.map_tokens|public\.campaign_members)/mi);
 assert.match(source,/UPDATE public\.map_environments/);
 assert.match(harness,/R57-09 revoked user refused by both original and optimized/);
 assert.match(harness,/R57-10 exact original source and private privileges restored/);
});
