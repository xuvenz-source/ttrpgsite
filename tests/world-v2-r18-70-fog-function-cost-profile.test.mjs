import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const harness=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const attribution=read('tests/world-v2-b10-postgres/r70-fog-function-cost-profile.sql');

test('R18-70 profiling runs only between installed sealed candidate and unchanged R57 rollback in disposable PG17',()=>{
 const install=harness.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql');
 const parity=harness.indexOf('\\i tests/world-v2-b10-postgres/r69-eight-viewer-fog-parity.sql');
 const include='\\i tests/world-v2-b10-postgres/r70-fog-function-cost-profile.sql';
 const profiler=harness.indexOf(include);
 const originalSuite=harness.indexOf('DO $r57_compare_and_measure$');
 const rollback=harness.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
 const outerRollback=harness.lastIndexOf('ROLLBACK;');
 assert.ok(install>=0&&install<parity&&parity<profiler);
 assert.ok(profiler<originalSuite&&originalSuite<rollback&&rollback<outerRollback);
 assert.equal(harness.split(include).length,2);
 assert.match(harness,/^BEGIN;$/m);
 assert.doesNotMatch(attribution,/^BEGIN;|^COMMIT;|^ROLLBACK;/m);
});
test('R18-70 refuses unpinned production functions, wrong schema, grants or public role',()=>{
 assert.match(attribution,/current_database\(\)='world_v2_b10_r05'/);
 assert.match(attribution,/current_user='postgres'/);
 assert.match(attribution,/count\(\*\)=91 FROM supabase_migrations\.schema_migrations/);
 assert.match(attribution,/f37c8d13e8d48bea123b4c811ae6de4d/);
 assert.match(attribution,/to_regprocedure\('forge_visibility\.r57_unmodified_fog_frame/);
 assert.match(attribution,/NOT has_schema_privilege\('authenticated','forge_visibility','USAGE'\)/);
 assert.match(attribution,/NOT has_schema_privilege\('anon','forge_visibility','USAGE'\)/);
 assert.match(attribution,/NOT has_function_privilege\('authenticated'/);
 assert.match(attribution,/NOT has_function_privilege\('anon'/);
});
test('R18-70 uses transaction-only PostgreSQL function statistics and switches them off before original R57 benchmark',()=>{
 assert.match(attribution,/current_setting\('track_functions'\)='none'/);
 assert.match(attribution,/SET LOCAL track_functions='all';/);
 assert.match(attribution,/pg_stat_xact_user_functions/g);
 assert.match(attribution,/SET LOCAL track_functions='none';/);
 const on=attribution.indexOf("SET LOCAL track_functions='all';");
 const samples=attribution.indexOf("CREATE TEMP TABLE r70_function_samples");
 const off=attribution.indexOf("SET LOCAL track_functions='none';");
 assert.ok(on>=0&&on<samples&&samples<off);
 assert.match(attribution,/R70-06 original function tracking and authorized roster restored/);
 assert.doesNotMatch(attribution,/pg_stat_reset\s*\(|pg_stat_statements_reset\s*\(/);
});
test('R18-70 reports only ray_blocked and is_lit counts and self-time, never any private map or player frame',()=>{
 assert.match(attribution,/funcname='ray_blocked'/);
 assert.match(attribution,/funcname='is_lit'/);
 assert.match(attribution,/sum\(self_time\)/);
 assert.match(attribution,/sum\(calls\)/);
 assert.match(attribution,/source\/ACL untouched/);
 assert.match(attribution,/mean_ray_self_ms/);
 assert.match(attribution,/mean_lighting_self_ms/);
 assert.doesNotMatch(attribution,/SELECT.*(?:user_id|auth\.uid\(\)|npc_values).*FROM pg_stat_xact_user_functions/i);
 assert.doesNotMatch(attribution,/RAISE NOTICE.*(?:frame|user_id|scene->|JWT|token)/i);
});
test('R18-70 tests both original and fastpath in two scenes and balanced reversed order',()=>{
 assert.match(attribution,/WHERE label IN \('open','wall-heavy'\)/);
 assert.match(attribution,/FOR iter IN 1\.\.2 LOOP/);
 assert.match(attribution,/ARRAY\['original','fastpath'\]/);
 assert.match(attribution,/ARRAY\['fastpath','original'\]/);
 assert.match(attribution,/r57_unmodified_fog_frame\(test_map,person\)/);
 assert.match(attribution,/authorized_viewer_fog_frame\(test_map,person\)/);
 assert.match(attribution,/PERFORM public\.b08_assert\(viewers=8/);
 assert.match(attribution,/count\(\*\)=8 FROM pg_temp\.r70_function_samples/);
 assert.match(attribution,/count\(DISTINCT \(s\.scenario,s\.variant\)\)=4/);
});
test('R18-70 does not patch fog functions, collisions, movement rate limit or production migrations',()=>{
 assert.doesNotMatch(attribution,/^\s*(?:CREATE OR REPLACE FUNCTION|GRANT|REVOKE|ALTER FUNCTION|DROP FUNCTION|CREATE ROLE|ALTER ROLE|DISABLE TRIGGER)\b/mi);
 assert.doesNotMatch(attribution,/^SET\s+(?!LOCAL)/mi);
 assert.doesNotMatch(attribution,/^\s*UPDATE\s+(?:supabase_migrations|forge_world_v2|public\.map_tokens|public\.campaign_members)/mi);
 assert.match(attribution,/UPDATE public\.map_environments SET live=/);
 assert.match(attribution,/R70-05 2x2x2 isolated function attribution samples and scene restored/);
 assert.match(harness,/R57-09 revoked user refused by both original and optimized/);
 assert.match(harness,/R57-10 exact original source and private privileges restored/);
});
