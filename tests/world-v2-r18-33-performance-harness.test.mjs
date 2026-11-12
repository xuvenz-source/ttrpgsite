import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('tests/world-v2-b10-postgres/performance-r18-33.sql','utf8');
const runner=readFileSync('tests/world-v2-b10-postgres/rehearse-r18-22.sh','utf8');

test('R18-33 times genuine RPCs, wall denial, reversal and eight approved batches',()=>{
 for(const section of ['DO $r33_baseline$', 'DO $r33_staged$',
  'FOR i IN 1..6 LOOP','FOR j IN 1..8 LOOP','count(*)=48','noMotion',
  'x=3 AND y=1','x=1 AND y=1']){
  assert.ok(sql.includes(section),'missing '+section);
 }
 for(const name of ['begin_world_motion_v2','advance_world_motion_v2',
  'commit_world_motion_v2','finalize_world_motion_v2'])assert.ok(sql.includes('public.'+name),name);
 for(const scenario of ['approved-near-wall','blocked-first-step',
  'reversal','eight-advance-burst'])assert.ok(sql.includes(scenario),scenario);
 assert.equal(sql.split('FOR i IN 1..6 LOOP').length-1,2);
 assert.equal(sql.split('FOR j IN 1..8 LOOP').length-1,2);
});

test('R18-33 baseline and the four post-R05 candidates are in exact order',()=>{
 const baseline=sql.indexOf('DO $r33_baseline$');
 const staged=sql.indexOf('DO $r33_staged$');
 const candidates=[
  'world_v2_r18_26_step_bbox_prefilter.sql',
  'world_v2_r18_27_commit_empty_work.sql',
  'world_v2_r18_28_atomic_finalize.sql',
  'world_v2_r18_30_blocked_final_semantics.sql'
 ];
 assert.ok(baseline>0 && staged>baseline);
 let previous=baseline;
 for(const file of candidates){
  assert.equal(sql.split(file).length,2,'one overlay reference for '+file);
  const pos=sql.indexOf(file);
  assert.ok(pos>previous && pos<staged,'out-of-order candidate '+file);
  previous=pos;
 }
 assert.ok(sql.indexOf('SELECT variant,scenario')>staged);
});

test('R18-33 is rollback-only, no grants, and asserts private visibility constraints',()=>{
 assert.ok(sql.startsWith('-- B10-R18-33: advisory'));
 assert.equal(sql.split('\n').filter(s=>s==='BEGIN;').length,1);
 assert.equal(sql.split('\n').filter(s=>s==='ROLLBACK;').length,1);
 for(const forbidden of ['GRANT EXECUTE','REVOKE ALL','ALTER ROLE',
  'TRUNCATE TABLE','DROP TABLE','CREATE EXTENSION','dblink(']){
  assert.ok(!sql.includes(forbidden),'unexpected operation '+forbidden);
 }
 for(const required of ["NOT has_function_privilege('anon'",
  "NOT has_schema_privilege('authenticated'",
  "to_regclass('pg_temp.r33_samples') IS NULL",
  "to_regprocedure('public.finalize_world_motion_v2",
  'ROLLBACK;','performance threshold']){
  assert.ok(sql.includes(required),'missing guard '+required);
 }
});

test('R18-33 only executes inside existing localhost-only ephemeral PostgreSQL runner',()=>{
 for(const guard of ['WORLD_V2_B10_ISOLATED','PGHOST','PGDATABASE',
  'PGSERVICEFILE','DATABASE_URL'])assert.ok(runner.includes(guard));
 const target='r22_psql -f tests/world-v2-b10-postgres/performance-r18-33.sql';
 assert.equal(runner.split(target).length-1,1);
 assert.ok(runner.indexOf(target)>runner.indexOf('verify-blocked-final-r18-30.mjs'));
});
