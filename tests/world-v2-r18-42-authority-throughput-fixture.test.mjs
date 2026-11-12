import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0')
 .update(s).digest('hex');

const sqlPath='tests/world-v2-b10-postgres/authority-throughput-r18-42.sql';
const runnerPath='tests/world-v2-b10-postgres/rehearse-r05.sh';
const frozenPath='supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql';
const r05Path='supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql';

test('R18-42 baseline remains the exact frozen original live authority, NOT an R05 rollout',()=>{
 const src=read(frozenPath);
 assert.equal(blob(src),'db8ee81b8630a0a2b61c1520385104d67adc53e3');
 assert.match(src,/CREATE OR REPLACE FUNCTION public\.begin_world_motion_v2\(/);
 assert.match(src,/CREATE OR REPLACE FUNCTION public\.advance_world_motion_v2\(/);
 assert.match(src,/CREATE OR REPLACE FUNCTION public\.commit_world_motion_v2\(/);
 assert.match(src,/forge_world_v2\.step_allowed/);
 assert.match(src,/public\.map_tokens tok SET/);
 const mig=read(r05Path);
 assert.equal(blob(mig),'f4e296725c09055685321726cbe4bc6e09dbce5a');
 assert.match(mig,/STAGED, NONAPPLIED/);
});
test('R18-42 timing harness runs only after source-extracted REAL Commit and before R05 rehearsal',()=>{
 const runner=read(runnerPath);
 for(const marker of [
  'WORLD_V2_B10_ISOLATED','PGDATABASE','PGHOST','PGSERVICE',
  'DATABASE_URL','SUPABASE_DB_URL',
  'r05_psql -f /tmp/world_v2_b10_r05_core.sql',
  'r05_psql -f /tmp/world_v2_b10_r05_viewers.sql',
  'r05_psql -f tests/world-v2-b10-postgres/authority-throughput-r18-42.sql',
  'r05_psql -f tests/world-v2-b10-postgres/versioned-release-r05.sql'
 ])assert.ok(runner.includes(marker),marker);
 const rank=name=>runner.indexOf(name);
 assert.ok(rank('r05_psql -f /tmp/world_v2_b10_r05_core.sql')<
  rank('r05_psql -f /tmp/world_v2_b10_r05_viewers.sql'));
 assert.ok(rank('r05_psql -f /tmp/world_v2_b10_r05_viewers.sql')<
  rank('r05_psql -f tests/world-v2-b10-postgres/authority-throughput-r18-42.sql'));
 assert.ok(rank('r05_psql -f tests/world-v2-b10-postgres/authority-throughput-r18-42.sql')<
  rank('r05_psql -f tests/world-v2-b10-postgres/versioned-release-r05.sql'));
 assert.doesNotMatch(runner,/supabase\s+db\s+(push|reset)|pg_dump/);
 assert.match(runner,/createdb "\$r05db"/);
});
test('R18-42 source-real benchmark respects original Advance limits and exact source actor ownership',()=>{
 const sql=read(sqlPath);
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^ROLLBACK;/m);
 assert.ok(sql.indexOf('BEGIN;')<sql.indexOf('CREATE TEMP TABLE r42_samples'));
 assert.ok(sql.indexOf('CREATE TEMP TABLE r42_samples')<sql.indexOf('ROLLBACK;'));
 assert.match(sql,/public\.begin_world_motion_v2\(/);
 assert.match(sql,/public\.advance_world_motion_v2\(/);
 assert.match(sql,/public\.commit_world_motion_v2\(/);
 assert.match(sql,/FOR j IN 1\.\.23 LOOP/);
 assert.match(sql,/'\[\{"x":24,"y":1\}\]'::jsonb/);
 assert.match(sql,/jsonb_array_length\(ack->'accepted'\)=23/);
 assert.match(sql,/attempted_cells=23 AND accepted_cells=23/);
 assert.match(sql,/batches=advance_calls/);
 assert.match(sql,/rpc_count int NOT NULL/);
 assert.match(sql,/total_rpc_calls/);
 assert.match(sql,/sum\(rpc_count\)=138/);
 assert.match(sql,/sum\(rpc_count\)=6/);
 assert.match(sql,/SELECT width=160 FROM public\.battle_maps/);
 assert.match(sql,/SELECT count\(\*\)=0 FROM forge_world_v2\.motion_sessions/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION|CREATE POLICY|GRANT EXECUTE|SECURITY DEFINER/);
 assert.doesNotMatch(sql,/\bDISABLE TRIGGER\b|SET session_replication_role/);
});
test('R18-42 blocked wall and foreign actor are denied before any canonical write',()=>{
 const sql=read(sqlPath);
 const foreign=sql.indexOf("set_config('request.jwt.claim.sub',foreign_actor::text,true)");
 const denied=sql.indexOf("public.b08_assert(r IS NULL");
 const restored=sql.indexOf("set_config('request.jwt.claim.sub',actor::text,true)",foreign);
 const wall=sql.indexOf("r->>'blocked'='true'");
 assert.ok(foreign>=0&&foreign<denied&&denied<restored&&restored<wall);
 assert.match(sql,/NOT\(r \? 'wallGeometry'\)/);
 assert.match(sql,/NOT\(r \? 'scene'\)/);
 assert.match(sql,/\(SELECT x=1 AND y=1 FROM public\.map_tokens/);
 assert.match(sql,/to_regprocedure\('public\.finalize_world_motion_v2/);
 assert.match(sql,/to_regclass\('forge_world_v2\.observer_pending_b07'\) IS NULL/);
});
test('R18-42 benchmark output is advisory SQL time, not a browser latency claim',()=>{
 const sql=read(sqlPath);
 assert.match(sql,/6x23|FOR i IN 1\.\.6 LOOP/i);
 assert.match(sql,/percentile_cont\(0\.95\)/);
 assert.match(sql,/p95_sql_ms/);
 assert.match(sql,/no production network round trips/i);
 assert.match(sql,/observer publisher is a TEST-ONLY sink/i);
 assert.match(sql,/R18-42 PASS/);
});
