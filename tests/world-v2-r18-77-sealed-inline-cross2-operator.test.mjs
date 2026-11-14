import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const harness=read('tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql');
const rehearsal=read('tests/world-v2-b10-postgres/r77-operator-sealed-inline-cross2-rehearsal.sql');
const candidate=read('supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql');
const inverse=read('supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql');
const original=read('tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql');

test('R77 rehearsal lies in original R57 transaction after R76 and before untouched signed movement',()=>{
 const a=harness.indexOf('\\i tests/world-v2-b10-postgres/r76-balanced-cross2-equivalence.sql');
 const marker='\\i tests/world-v2-b10-postgres/r77-operator-sealed-inline-cross2-rehearsal.sql';
 const b=harness.indexOf(marker);
 const c=harness.indexOf('DO $r57_compare_and_measure$');
 const d=harness.indexOf('\\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql');
 const e=harness.lastIndexOf('ROLLBACK;');
 assert.ok(a>=0&&a<b&&b<c&&c<d&&d<e);
 assert.equal(harness.split(marker).length,2);
 assert.match(harness,/^BEGIN;$/m);
 assert.doesNotMatch(rehearsal,/^BEGIN;|^COMMIT;/m);
});

test('R77 operator install and inverse are atomic independent DOs outside migrations without grants',()=>{
 assert.match(candidate,/^DO \$r77_install\$/m);
 assert.match(inverse,/^DO \$r77_rollback\$/m);
 for(const doc of [candidate,inverse]){
  const executable=doc.replace(/^--.*$/gm,'');
  assert.doesNotMatch(executable,/^\s*(?:GRANT|REVOKE|CREATE TABLE|ALTER TABLE|CREATE ROLE|DROP ROLE|TRUNCATE|COMMIT|BEGIN)\b/mi);
  assert.doesNotMatch(executable,/^\s*UPDATE\s+(?:supabase_migrations|public\.map_tokens|forge_world_v2)\b/mi);
  assert.doesNotMatch(executable,/pg_stat_reset|pg_stat_statements_reset|pg_read_file|dblink_exec/);
  assert.match(doc,/NOT a migration/i);
  assert.match(doc,/EXECUTE (?:new_source|original_source);/);
 }
});

test('R77 requires postgres, independent approval, 91-history seal and eight reviewed versions',()=>{
 for(const doc of [candidate,inverse]){
  for(const x of [
   "current_user<>'postgres'",
   "current_database() NOT IN ('postgres','world_v2_b10_r05')",
   "current_setting('forge.r18_77_release_authorization',true)",
   'version_count<>91 OR reviewed_count<>8',
   "'20261113024116'",
   "'20261111023204'","'20261113021005'","'20261113021007'",
   "'20261113021010'","'20261113021012'","'20261113021020'",
   "'20261113021022'"
  ])assert.ok(doc.includes(x),x);
 }
 assert.match(candidate,/sealed_post_83_plus_8_ray_inline_candidate_only/);
 assert.match(inverse,/sealed_post_83_plus_8_ray_inline_rollback_only/);
 assert.doesNotMatch(candidate,/sealed_post_83_plus_8_ray_inline_rollback_only/);
 assert.doesNotMatch(inverse,/sealed_post_83_plus_8_ray_inline_candidate_only/);
});

test('R77 source-pins private helpers and both reviewed viewer fog sources',()=>{
 const hashes=[
  'a9fc198168c29fd5d80041b05337017e',
  '65c4bff8aaa6ecf38e335a44e95d874e',
  '5c52255db93f2a9ed892e684dd11f898',
  'cec916b326a14937ceee2e170619cca2',
  'f37c8d13e8d48bea123b4c811ae6de4d',
  'ee3356af321fec1a3e167a75c6245e86'
 ];
 for(const doc of [candidate,inverse]){
  for(const hash of hashes)assert.ok(doc.includes(hash),hash);
  assert.match(doc,/fog_hash NOT IN/);
  assert.match(doc,/has_schema_privilege\('authenticated','forge_visibility','USAGE'\)/);
  assert.match(doc,/has_schema_privilege\('anon','forge_visibility','USAGE'\)/);
  assert.match(doc,/has_function_privilege\('authenticated'/);
  assert.match(doc,/has_function_privilege\('anon'/);
 }
});

test('R77 preserves source-original invoker, implicit ACL, owner, volatility and pinned search path',()=>{
 for(const doc of [candidate,inverse]){
  for(const x of [
   "prosecdef IS DISTINCT FROM false",
   "provolatile IS DISTINCT FROM 's'",
   "proparallel IS DISTINCT FROM 'u'",
   "proacl IS NOT NULL",
   "proconfig IS DISTINCT FROM ARRAY['search_path=\"\"']::text[]",
   "pronargdefaults<>1",
   "proowner IS DISTINCT FROM",
   "proacl IS DISTINCT FROM",
   "prosecdef IS DISTINCT FROM",
   "proconfig IS DISTINCT FROM",
   "proparallel IS DISTINCT FROM",
   "pronargdefaults IS DISTINCT FROM",
   "'plpgsql'"
  ])assert.ok(doc.includes(x),x);
  assert.match(doc,/pg_get_userbyid\([a-z_]+\.proowner\)<>'postgres'/);
 }
});

test('R77 only replaces the four pinned original cross2 calls with operand-order-identical expressions',()=>{
 const originals=[
  'forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)',
  'forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay)',
  'forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)',
  'forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)'
 ];
 const inlined=[
  '((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))',
  '((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))',
  '((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))',
  '((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))'
 ];
 for(let i=0;i<4;i++){
  assert.ok(original.includes(originals[i]));
  assert.ok(candidate.includes("'"+originals[i]+"'"));
  assert.ok(inverse.includes("'"+originals[i]+"'"));
  assert.ok(candidate.includes("'"+inlined[i]+"'"));
  assert.ok(inverse.includes("'"+inlined[i]+"'"));
 }
 for(const x of ['anchor1','anchor2','anchor3','anchor4'])
  assert.ok(candidate.includes("length(old_source)-length(replace(old_source,"+x+",''))"));
 for(const x of ['inline1','inline2','inline3','inline4'])
  assert.ok(inverse.includes("length(optimized_source)-length(replace(optimized_source,"+x+",''))"));
 assert.match(candidate,/pg_get_functiondef\(fn\) IS DISTINCT FROM new_source/);
 assert.match(inverse,/md5\(original_source\)<>'a9fc198168c29fd5d80041b05337017e'/);
 assert.match(inverse,/verified_forward_source IS DISTINCT FROM optimized_source/);
});

test('R77 tests actual installable files with approval, history, source drift, repeat install and rollback denials',()=>{
 const a='\\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql';
 const b='\\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql';
 assert.ok(rehearsal.split(a).length>=5);
 assert.ok(rehearsal.split(b).length>=5);
 for(const name of [
  'r77_wrong_install_approval','r77_missing_release_version',
  'r77_drifted_original','r77_operator_rehearsal','r77_duplicate_install',
  'r77_wrong_rollback_approval','r77_rollback_source_drift','r77_double_rollback'
 ])assert.ok(rehearsal.includes(name),name);
 assert.match(rehearsal,/\\set ON_ERROR_STOP off/);
 assert.match(rehearsal,/\\if :ERROR/);
 assert.match(rehearsal,/ROLLBACK TO SAVEPOINT r77_operator_rehearsal;/);
 assert.match(rehearsal,/R77-08 actual operator rollback restores original exact source\/ACL/);
});

test('R77 verifies 15744 exact rays, 656 complete private frames, torch and revocation, no private outputs',()=>{
 assert.match(rehearsal,/count\(\*\)=15744 FROM pg_temp\.r76_expected_rays/);
 assert.match(rehearsal,/count\(\*\)=656 FROM pg_temp\.r76_expected_frames/);
 assert.match(rehearsal,/count\(\*\)=16 FROM pg_temp\.r75_expected_torch/);
 assert.match(rehearsal,/blocked IS DISTINCT FROM candidate_ray\.expected/);
 assert.match(rehearsal,/n=15744/);
 assert.match(rehearsal,/actual IS DISTINCT FROM reference\.expected/);
 assert.match(rehearsal,/n=656/);
 assert.match(rehearsal,/actual IS DISTINCT FROM r\.expected/);
 assert.match(rehearsal,/n=16/);
 assert.match(rehearsal,/SAVEPOINT r77_revoke;/);
 assert.match(rehearsal,/ROLLBACK TO SAVEPOINT r77_revoke;/);
 assert.match(rehearsal,/original_denied AND candidate_denied/);
 assert.doesNotMatch(rehearsal,/RAISE NOTICE.*(?:user_id|frame->|scene->|coords|JWT)/i);
});

test('R77 preserves original R57 signed authority and 91-history rollback after independent source inverse',()=>{
 for(const x of [
  'R57-08 original wall authority and private geometry protected',
  'R57-09 revoked user refused by both original and optimized',
  'R57-10 exact original source and private privileges restored',
  'R57-11 all three negative operator gates left original source/history intact',
  'R57-12 no opt-in, rollback or 91-history test residue persisted'
 ])assert.ok(harness.includes(x));
 assert.match(rehearsal,/R77-09 no candidate, migration, privilege, fixture or history residue/);
 assert.match(rehearsal,/R18-77 PASS: actual sealed candidate and inverse, 15744 rays, 656 private frames/);
});
