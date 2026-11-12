import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const base=new URL('../',import.meta.url);
const load=path=>readFileSync(new URL(path,base));
const read=path=>load(path).toString('utf8');
const sha=buf=>createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
const runner='tests/world-v2-b10-postgres/rehearse-r18-22.sh';
const sqlPath='tests/world-v2-b10-postgres/ordered-stack-r18-22.sql';

test('R18-22 frozen R05 and candidate exact Git blobs, no rewritten migration',()=>{
 const expected={
  'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql':
   'f4e296725c09055685321726cbe4bc6e09dbce5a',
  'supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql':
   'c78998da8a9013591f2bb479cca4b222f41ef2d7',
  'supabase/candidates/world_v2_r18_19_cross_map_guard.sql':
   '55db7e6b6839d1d8b489203baa11c99264648a55',
  'supabase/candidates/world_v2_r18_20_campaign_affinity.sql':
   '3980808966ec56ad74120bc4f737c78ddd2056bb'
 };
 for(const [path,expectedSha] of Object.entries(expected)){
  assert.equal(sha(load(path)),expectedSha,path);
 }
});
test('R18-22 refuses remote databases and creates a THIRD independent disposable DB',()=>{
 const s=read(runner);
 assert.match(s,/WORLD_V2_B10_ISOLATED/);
 assert.match(s,/PGHOST:-/);
 assert.match(s,/PGDATABASE:-/);
 assert.match(s,/world_v2_b10_r18_22/);
 assert.match(s,/createdb "\$\{r22_db\}"/);
 assert.match(s,/SUPABASE_DB_URL/);
 assert.match(s,/PGSERVICEFILE/);
 assert.match(s,/DATABASE_URL/);
 assert.match(s,/PGDATABASE="\$\{r22_db\}" psql -X -v ON_ERROR_STOP=1/);
 assert.doesNotMatch(s,/\b(?:supabase\s+db\s+push|apply_migration|dropdb|psql\s+-h\s+(?!localhost))\b/i);
 const parent=read('tests/world-v2-b10-postgres/run.sh');
 assert.ok(parent.indexOf('bash tests/world-v2-b10-postgres/rehearse-r05.sh')<
  parent.indexOf('bash tests/world-v2-b10-postgres/rehearse-r18-22.sh'));
 assert.match(parent,/WORLD_V2_B10_ISOLATED/);
});
test('R18-22 applies frozen R05 before EXACT three candidate SQL files, each committed',()=>{
 const s=read(sqlPath);
 const paths=[
  'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql',
  'supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql',
  'supabase/candidates/world_v2_r18_19_cross_map_guard.sql',
  'supabase/candidates/world_v2_r18_20_campaign_affinity.sql'
 ];
 let last=-1;
 for(const path of paths){
  const i=s.indexOf('\\i '+path);
  assert.ok(i>last,'incorrect release install order for '+path);
  assert.equal(s.split('\\i '+path).length,2,'expected exactly one install: '+path);
  last=i;
 }
 assert.match(s,/CREATE TEMP TABLE r22_original/);
 assert.match(s,/four new authority bodies REMAIN ACTIVE/);
 const iCommit=s.indexOf('\\i supabase/migrations/20261111023204');
 assert.ok(iCommit>=0&&s.indexOf('COMMIT;',iCommit)>iCommit);
 assert.equal((s.match(/^COMMIT;$/gm)||[]).length,4);
 assert.ok(s.lastIndexOf('ROLLBACK;')>s.lastIndexOf('COMMIT;'));
 assert.doesNotMatch(s,/world_v2_b10_r05_restore_original_authority/);
 assert.doesNotMatch(s,/^\s*(?:\\i|\\ir)\s+supabase\/release-recovery\//gm);
});
test('R18-22 active POST-R05 has real canonical token+tool movement, not just geometry',()=>{
 const s=read(sqlPath);
 for(const needle of [
  'public.begin_world_motion_v2(',
  'public.advance_world_motion_v2(',
  'public.commit_world_motion_v2(',
  'forge_world_v2.motion_r05_function_backup',
  'forge_visibility.map_rules',
  'commit_allows_piece_v2',
  'token reparent blocked',
  'map reparent blocked',
  'actual mount canonical commit',
  'O17 test-only DML rolled back'
 ]) assert.ok(s.includes(needle),needle);
 assert.match(s,/source-real/i);
 assert.deepEqual([...s.matchAll(/'O(\d\d) /g)].map(m=>Number(m[1])).sort((a,b)=>a-b),
  Array.from({length:20},(_,i)=>i+1));
 assert.match(s,/^BEGIN;$/m);assert.match(s,/^ROLLBACK;$/m);
 assert.doesNotMatch(s,/\bdblink\s*\(|postgres:\/\/|supabase_migrations|service_role_secret/i);
});
test('R18-22 does not claim real P1/P2 sight, migrate or enable guarded observer',()=>{
 const r=read(runner)+read(sqlPath);
 assert.doesNotMatch(r,/https:\/\/.*supabase|npx\s+supabase\s+db\s+push|service_role_secret/i);
 const release=read('staging/next-release-ledger.json');
 assert.match(release,/20261111023204_world_v2_b10_integrated_motion/);
 assert.doesNotMatch(read('src/engine/v2/SceneManager.js'),/clearanceCells:\s*0\.1/);
});
