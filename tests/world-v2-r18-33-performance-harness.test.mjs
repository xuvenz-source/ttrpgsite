import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('tests/world-v2-b10-postgres/performance-r18-33.sql','utf8');
const runner=readFileSync('tests/world-v2-b10-postgres/rehearse-r18-22.sh','utf8');

test('R18-33 benchmarks real RPCs, wall denial, reversal and 8-advance bursts',()=>{
 assert.match(sql,/DO \\$r33_baseline\\$/);
 assert.match(sql,/DO \\$r33_staged\\$/);
 for(const name of ['begin_world_motion_v2','advance_world_motion_v2',
  'commit_world_motion_v2','finalize_world_motion_v2',
  'cancel_world_motion_v2'])assert.ok(sql.includes('public.'+name),name);
 for(const scenario of ['approved-near-wall','blocked-first-step',
  'reversal','eight-advance-burst'])assert.ok(sql.includes(scenario),scenario);
 assert.match(sql,/FOR i IN 1\\.\\.6 LOOP/g);
 assert.match(sql,/FOR j IN 1\\.\\.8 LOOP/g);
 assert.match(sql,/count\\(\\*\\)=48/);
 assert.match(sql,/x=3 AND y=1/);
 assert.match(sql,/x=1 AND y=1/);
 assert.match(sql,/noMotion/);
});

test('R18-33 ordered original baseline precedes isolated, complete staged overlays',()=>{
 const baseline=sql.indexOf('DO $r33_baseline$');
 const staged=sql.indexOf('DO $r33_staged$');
 const candidates=[
  'world_v2_r18_26_step_bbox_prefilter.sql',
  'world_v2_r18_27_commit_empty_work.sql',
  'world_v2_r18_28_atomic_finalize.sql',
  'world_v2_r18_30_blocked_final_semantics.sql'
 ];
 let previous=baseline;
 for(const file of candidates){
  assert.equal(sql.split(file).length,2,'one overlay reference for '+file);
  const pos=sql.indexOf(file);
  assert.ok(pos>previous && pos<staged,'candidate ordered '+file);
  previous=pos;
 }
 assert.ok(sql.indexOf('SELECT variant,scenario')>staged);
});

test('R18-33 never grants permissions or persists benchmark changes',()=>{
 assert.ok(sql.startsWith('-- B10-R18-33: advisory'));
 assert.match(sql,/^BEGIN;$/m);
 assert.match(sql,/^ROLLBACK;$/m);
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
 assert.equal((sql.match(/^ROLLBACK;$/gm)||[]).length,1);
 assert.doesNotMatch(sql,/\\b(?:GRANT|REVOKE|ALTER\\s+ROLE|TRUNCATE|DROP\\s+TABLE|CREATE\\s+EXTENSION|dblink)\\b/i);
 assert.match(sql,/NOT has_function_privilege\\('anon'/);
 assert.match(sql,/NOT has_schema_privilege\\('authenticated'/);
 assert.match(sql,/to_regclass\\('pg_temp\\.r33_samples'\\) IS NULL/);
 assert.match(sql,/to_regprocedure\\('public\\.finalize_world_motion_v2/);
 assert.match(sql,/advisory/i);
});

test('R18-33 can only run via existing protected ephemeral runner',()=>{
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOST/);
 assert.match(runner,/PGDATABASE/);
 assert.match(runner,/PGSERVICEFILE/);
 assert.match(runner,/DATABASE_URL/);
 const target='r22_psql -f tests/world-v2-b10-postgres/performance-r18-33.sql';
 assert.equal(runner.split(target).length-1,1);
 assert.ok(runner.indexOf(target)>runner.indexOf('verify-blocked-final-r18-30.mjs'));
});
