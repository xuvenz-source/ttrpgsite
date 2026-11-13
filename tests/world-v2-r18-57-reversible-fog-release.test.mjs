import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const forward=read('supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql');
const reverse=read('supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
const experiment=read('tests/world-v2-b10-postgres/r56-synchronous-fog-fastpath-candidate.sql');
const original=read('tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql');
const history=JSON.parse(read('staging/world-v2-b10-r18-08-remote-history-content-hashes.json'));
const manifest=JSON.parse(read('staging/world-v2-b10-r18-48-narrow-pending/manifest.json'));
const versions=['20261111023204',...manifest.pending.map(x=>x.filename.slice(0,14))];
const fixture=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const synthetic=read('tests/world-v2-b10-postgres/r57-synthetic-91-version-gate.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r05.sh');
const workflow=read('.github/workflows/world-v2-r18-54-fog-commit.yml');
const needle='CREATE OR REPLACE FUNCTION forge_visibility.authorized_viewer_fog_frame(';
const candidate=experiment.slice(experiment.indexOf(needle),
 experiment.indexOf('\nREVOKE ALL ON FUNCTION',experiment.indexOf(needle))).trim();
const originalBody=original.slice(original.indexOf(needle),
 original.indexOf('\nend $function$;',original.indexOf(needle))+
 '\nend $function$;'.length).trim();

test('R18-57 actual opt-in and rollback embed EXACT original/optimized full SQL',()=>{
 assert.ok(forward.includes(candidate),'optimized body differs from sealed R56 PG17');
 assert.ok(reverse.includes(originalBody),'rollback must restore actual R54 live source');
 assert.equal((forward.match(/CREATE OR REPLACE FUNCTION /g)||[]).length,1);
 assert.equal((reverse.match(/CREATE OR REPLACE FUNCTION /g)||[]).length,1);
 assert.equal((forward.match(/DO \$r57_operator\$/g)||[]).length,1);
 assert.equal((reverse.match(/DO \$r57_operator\$/g)||[]).length,1);
 assert.match(forward,/EXECUTE \$r57_sql\$/);
 assert.match(reverse,/EXECUTE \$r57_sql\$/);
});
test('R18-57 function source pins are exact PG17 catalog MD5, not placeholders',()=>{
 assert.match(forward,/ee3356af321fec1a3e167a75c6245e86/);
 assert.match(forward,/f37c8d13e8d48bea123b4c811ae6de4d/);
 assert.match(reverse,/f37c8d13e8d48bea123b4c811ae6de4d/);
 assert.match(reverse,/ee3356af321fec1a3e167a75c6245e86/);
 assert.doesNotMatch(forward+reverse,/PENDING|PLACEHOLDER|__R57_|R57_OPTIMIZED_MD5_PENDING/);
 assert.match(forward,/md5\(pg_get_functiondef\(fn\)\)/);
 assert.match(reverse,/md5\(pg_get_functiondef\(fn\)\)/);
});
test('R18-57 candidate checks exactly 83+8 official-reviewed migrations',()=>{
 assert.equal(history.rows.length,83);
 assert.equal(versions.length,8);
 assert.equal(new Set([...history.rows.map(x=>x.version),...versions]).size,91);
 for(const v of versions){
  assert.ok(forward.includes("'"+v+"'"),'missing reviewed pending '+v);
  assert.ok(reverse.includes("'"+v+"'"),'rollback missing '+v);
  assert.ok(synthetic.includes("('"+v+"')"),'fixture missing '+v);
 }
 for(const r of history.rows)
  assert.ok(synthetic.includes("('"+r.version+"')"),'missing historical '+r.version);
 assert.match(forward,/version_count<>91 OR reviewed_count<>8/);
 assert.match(reverse,/version_count<>91 OR reviewed_count<>8/);
 assert.match(forward,/max\(version::text\).*'20261113024116'/);
 assert.match(reverse,/max\(version::text\).*'20261113024116'/);
});
test('R18-57 only audited postgres owner can opt in and private grants must remain identical',()=>{
 for(const code of [forward,reverse]){
  assert.match(code,/current_user<>'postgres'/);
  assert.match(code,/current_database\(\) NOT IN \('postgres','world_v2_b10_r05'\)/);
  assert.match(code,/rowdata\.prosecdef IS DISTINCT FROM true/);
  assert.match(code,/proconfig @> ARRAY\['search_path=""'\]::text\[\]/);
  assert.match(code,/rowdata\.proacl::text IS DISTINCT FROM '\{postgres=X\/postgres\}'/);
  assert.match(code,/has_function_privilege\('authenticated',fn,'EXECUTE'\)/);
  assert.match(code,/has_function_privilege\('anon',fn,'EXECUTE'\)/);
  assert.match(code,/current_setting\('forge\.r18_57_release_authorization',true\)/);
  assert.match(code,/RAISE EXCEPTION 'R57/);
  assert.doesNotMatch(code,/\bGRANT\b|\bALTER\s+TABLE\b|\bTRUNCATE\b|\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(code,/\bsupabase db push\b|\bmigration repair\b/i);
 }
 assert.match(forward,/sealed_post_83_plus_8_candidate_only/);
 assert.match(reverse,/sealed_post_83_plus_8_rollback_only/);
});
test('R18-57 opt-in stays out of all active migrations and has an independent rollback',()=>{
 assert.match(forward,/UNVERSIONED \/ OPT-IN \/ NO-GO/);
 assert.match(reverse,/UNVERSIONED \/ OPT-IN/);
 assert.match(forward,/One PostgreSQL DO statement is atomic/);
 assert.match(reverse,/One PostgreSQL DO statement is atomic/);
 assert.doesNotMatch(forward+reverse,/\\i |\\set /);
 assert.match(fixture,/supabase\/candidates\/world_v2_r18_57_sync_fog_fastpath_optin.sql/);
 assert.match(fixture,/supabase\/candidates\/world_v2_r18_57_sync_fog_fastpath_rollback.sql/);
 assert.match(fixture,/^BEGIN;$/m);
 assert.match(fixture,/^ROLLBACK;$/m);
});
test('R18-57 exercises all eight affected signed recipients, 24 blockers and torch',()=>{
 assert.match(fixture,/generate_series\(14,19\)/);
 assert.match(fixture,/generate_series\(1,24\)/);
 assert.match(fixture,/r57_source_original/);
 assert.match(fixture,/r57_unmodified_fog_frame/);
 assert.match(fixture,/source_frame IS NOT DISTINCT FROM candidate_frame/);
 assert.match(fixture,/newcount>=oldcount\+8/);
 assert.match(fixture,/R57-07 eight-viewer wall-heavy held-light exact parity/);
 assert.match(fixture,/R57-08 original wall authority and private geometry protected/);
 assert.match(fixture,/R57-09 revoked user refused/);
 assert.match(fixture,/R57-10 exact original source and private privileges restored/);
 assert.match(fixture,/R57-11 no opt-in, rollback or 91-history test residue persisted/);
 assert.doesNotMatch(fixture,/\bUPDATE\s+public\.map_tokens\b/i);
});
test('R18-57 uses localhost-only test guard and preserves earlier full authority rehearsal',()=>{
 const a=runner.indexOf('r54-fog-commit-source-real.sql');
 const b=runner.indexOf('r55-dirty-fog-prototype.sql');
 const c=runner.indexOf('r56-synchronous-fog-fastpath-benchmark.sql');
 const d=runner.indexOf('r57-guarded-fog-release-benchmark.sql');
 const e=runner.indexOf('versioned-release-r05.sql');
 assert.ok(a>=0&&a<b&&b<c&&c<d&&d<e);
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOSTADDR/);
 assert.match(workflow,/image:\s*postgres:17/);
 assert.match(workflow,/PGHOST: '127\.0\.0\.1'/);
 assert.match(workflow,/supabase\/candidates\/world_v2_r18_57_sync_fog_fastpath_\*\.sql/);
 assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN|service_role/);
});
