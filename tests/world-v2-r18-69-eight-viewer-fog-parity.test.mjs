import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(ROOT,p),'utf8');
const r57=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const parity=read('tests/world-v2-b10-postgres/r69-eight-viewer-fog-parity.sql');
const include='\\i tests/world-v2-b10-postgres/r69-eight-viewer-fog-parity.sql';

test('R18-69 parity SQL runs only in original source-real R57 transaction, after sealed opt-in',()=>{
 assert.equal(r57.split(include).length,2);
 const open=r57.indexOf('BEGIN;');
 const candidate=r57.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql');
 const sealed=r57.indexOf('END $r57_applied$;');
 const expanded=r57.indexOf(include);
 const oldSuite=r57.indexOf('DO $r57_compare_and_measure$');
 const undo=r57.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
 const rollback=r57.lastIndexOf('ROLLBACK;');
 assert.ok(open>=0&&open<candidate&&candidate<sealed&&sealed<expanded);
 assert.ok(expanded<oldSuite&&oldSuite<undo&&undo<rollback);
 assert.match(parity,/already-open BEGIN\/ROLLBACK/);
 assert.doesNotMatch(parity,/^\s*BEGIN\s*;|^\s*COMMIT\s*;|^\s*ROLLBACK\s*;/mi);
});
test('R18-69 reject changed source history or private ACL before any fog tests',()=>{
 assert.match(parity,/current_database\(\)='world_v2_b10_r05'/);
 assert.match(parity,/current_user='postgres'/);
 assert.match(parity,/count\(\*\)=91 FROM supabase_migrations\.schema_migrations/);
 assert.match(parity,/f37c8d13e8d48bea123b4c811ae6de4d/);
 assert.match(parity,/postgres=X\/postgres/);
 assert.match(parity,/NOT has_schema_privilege\('authenticated','forge_visibility','USAGE'\)/);
 assert.match(parity,/NOT has_schema_privilege\('anon','forge_visibility','USAGE'\)/);
 assert.match(parity,/NOT has_function_privilege\('authenticated'/);
 assert.match(parity,/NOT has_function_privilege\('anon'/);
});
test('R18-69 covers nine independent scenes across all eight signed members',()=>{
 for(const scene of [
  'open-dark','shared-open-dark','shared-open-default',
  'closed-door','open-door','closed-window',
  'malformed-wall','null-object','over-limit'
 ]){
  assert.match(parity,new RegExp("'"+scene+"'"));
 }
 assert.match(parity,/SELECT cm\.user_id FROM public\.campaign_members cm/);
 assert.match(parity,/AND cm\.role='player' ORDER BY cm\.user_id/);
 assert.match(parity,/PERFORM public\.b08_assert\(seen=8/);
 assert.match(parity,/count\(\*\)=9 AND sum\(checked_viewers\)=72/);
 assert.match(parity,/72 full JSONB frame comparisons/);
});
test('R18-69 checks complete original-vs-candidate authorized JSONB, not simple cell counts',()=>{
 assert.match(parity,/expected:=forge_visibility\.r57_unmodified_fog_frame\(test_map,person\)/);
 assert.match(parity,/actual:=forge_visibility\.authorized_viewer_fog_frame\(test_map,person\)/);
 assert.match(parity,/expected IS NOT DISTINCT FROM actual/);
 assert.match(parity,/source-vs-candidate/);
 assert.doesNotMatch(parity,/coalesce\(jsonb_array_length\(expected->'visible'/);
});
test('R18-69 hostile malformed and overlimit fog fail closed and cannot omit 120 object cap',()=>{
 assert.match(parity,/"points":"bad"/);
 assert.match(parity,/"objects":\[null\]/);
 assert.match(parity,/generate_series\(1,121\)/);
 assert.match(parity,/expected->'visible'='\[\]'::jsonb/);
 assert.match(parity,/actual->'visible'='\[\]'::jsonb/);
 assert.match(parity,/R69-03 over-limit scene fails closed/);
});
test('R18-69 original R57 source parity, revoked viewer and rollback remain intact',()=>{
 assert.match(r57,/R57-06 exact 8-viewer full frame parity/);
 assert.match(r57,/R57-07 eight-viewer wall-heavy held-light exact parity/);
 assert.match(r57,/R57-08 original wall authority and private geometry protected/);
 assert.match(r57,/R57-09 revoked user refused by both original and optimized/);
 assert.match(r57,/R57-10 exact original source and private privileges restored/);
 assert.match(r57,/R57 PASS: source-drift application rejected/);
 assert.match(r57,/R57 PASS: missing release migration rejected/);
});
test('R18-69 no candidate changes, live migrations, role grants or session tokens',()=>{
 assert.doesNotMatch(parity,/^\s*(?:GRANT|REVOKE|ALTER FUNCTION|CREATE OR REPLACE FUNCTION|DROP FUNCTION|CREATE ROLE)\b/mi);
 assert.doesNotMatch(parity,/oauth|sessionStorage|access_token|service_role|SUPABASE_ACCESS_TOKEN|https?:\/\//i);
 assert.match(parity,/pg_catalog\.set_config\('request\.jwt\.claim\.sub'/);
 assert.match(parity,/UPDATE public\.map_environments SET live=/);
 assert.match(parity,/CREATE TEMP TABLE r69_parity_counts/);
 assert.match(parity,/original scene before R18-57's existing bench\/hostile cases/);
});
