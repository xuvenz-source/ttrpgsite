import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const file=p=>readFileSync(new URL('../'+p,import.meta.url));
const source=p=>file(p).toString('utf8');
const blobSha=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const old='supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql';
const latest='supabase/migrations/20261108055943_world_runtime_single_write_trajectory.sql';
const extractor='tests/world-v2-b10-postgres/extract_latest_trajectory_r18_19.py';
const candidate='supabase/candidates/world_v2_r18_19_cross_map_guard.sql';
const testSql='tests/world-v2-b10-postgres/trajectory-map-auth-r18-19.sql';

test('R18-19 pins historical AND final-live collision trigger migrations',()=>{
 assert.equal(blobSha(file(old)),'c774aa7d13e89aa2d783d8d5fdc6f46326e28206');
 assert.equal(blobSha(file(latest)),'2dbb5e3d76ffbfecbb33c739a3a6a7d328baf451');
 const src=source(extractor);
 assert.match(src,/FROZEN SOURCE DRIFT/);
 assert.match(src,/forge_visibility\.validate_piece_trajectory/);
 assert.match(src,/forge_visibility\.enforce_collision/);
 assert.match(src,/forge_visibility\.enforce_tool_collision/);
 assert.match(src,/public\.move_map_group/);
 assert.match(src,/public\.commit_map_trajectory/);
 assert.match(src,/hashlib\.sha1/);
 assert.doesNotMatch(src,/urllib|requests\.|subprocess|socket|https?:\/\//);
});
test('R18-19 fixes earlier historical-only legacy trigger source test blind spot',()=>{
 const prior=source('tests/world-v2-b10-postgres/extract_real_collision_triggers_r18_18.py');
 assert.match(prior,/20261108031754_world_runtime_movement/);
 assert.match(source(extractor),/20261108055943_world_runtime_single_write_trajectory/);
 const last=source(latest);
 assert.match(last,/route_text:=current_setting\('forge\.trajectory_steps',true\)/);
 assert.match(last,/forge_visibility\.validate_piece_trajectory/);
});
test('R18-19 cross-map candidate adds both guards BEFORE legacy early returns',()=>{
 const s=source(candidate);
 assert.match(s,/NOT A VERSIONED MIGRATION/);
 assert.equal((s.match(/create or replace function forge_visibility\.enforce_/gi)||[]).length,2);
 const token=s.indexOf('create or replace function forge_visibility.enforce_collision(');
 const tool=s.indexOf('create or replace function forge_visibility.enforce_tool_collision(');
 assert.ok(token>=0&&tool>token);
 const tokenSql=s.slice(token,tool),toolSql=s.slice(tool);
 assert.ok(tokenSql.indexOf('Token destination map outside campaign')<
  tokenSql.indexOf('select r.collision_enforced'));
 assert.ok(toolSql.indexOf('Only the DM can transfer issued tools between maps')<
  toolSql.indexOf('if new.held_by_token_id is not null'));
 assert.ok(toolSql.indexOf('Tool destination map outside campaign')<
  toolSql.indexOf('if new.map_id is null then return new'));
 for(const x of [tokenSql,toolSql]){
  assert.match(x,/bm\.id=new\.map_id and bm\.campaign_id=new\.campaign_id/);
  assert.match(x,/security definer set search_path=''/);
  assert.match(x,/forge_visibility\.validate_piece_trajectory/);
 }
 assert.doesNotMatch(s,/\bGRANT\b|\bCREATE POLICY\b|\bDROP TABLE\b|\bALTER ROLE\b/i);
});
test('R18-19 source-real public RPC and trajectory validation use actual row writes',()=>{
 const s=source(testSql);
 for(const needle of ['validate_piece_trajectory','commit_map_trajectory',
  'move_map_group','r19_expect_token_map','r19_expect_tool_map',
  'UPDATE public.campaign_tool_issues SET map_id=','UPDATE public.map_tokens SET map_id=',
  'SET LOCAL ROLE authenticated','CREATE POLICY',
  'GET STACKED DIAGNOSTICS'])assert.ok(
  s.includes(needle),needle);
 assert.match(source(extractor),/REVOKE ALL ON FUNCTION forge_visibility\.validate_piece_trajectory/);
 assert.equal((s.match(/SET LOCAL ROLE authenticated;/g)||[]).length,3);
 assert.equal((s.match(/RESET ROLE;/g)||[]).length,3);
 assert.match(s,/^BEGIN;/m);assert.match(s,/^ROLLBACK;\s*$/m);
 const a=[...s.matchAll(/'A(\d\d) /g)].map(x=>Number(x[1]));
 const b=[...s.matchAll(/'B(\d\d) /g)].map(x=>Number(x[1]));
 const l=[...s.matchAll(/'L(\d\d) /g)].map(x=>Number(x[1]));
 assert.deepEqual(a,Array.from({length:22},(_,i)=>i+1));
 assert.deepEqual(b,[1,2,3]);
 assert.ok(s.indexOf('unpatched latest held-tool shortcut')<s.indexOf('CREATE OR REPLACE FUNCTION public.r19_scene'));
 assert.ok(s.indexOf('R18-19: three negative-control')<s.indexOf('CREATE OR REPLACE FUNCTION public.r19_scene'));
 assert.deepEqual(l,Array.from({length:7},(_,i)=>i+1));
});
test('R18-19 no unsafe execution or broad auth surfaces',()=>{
 const r=source('tests/world-v2-b10-postgres/run.sh');
 assert.match(r,/WORLD_V2_B10_ISOLATED/);
 assert.match(r,/PGHOST/);assert.match(r,/PGDATABASE/);
 assert.ok(r.indexOf('direct-write-wall-r18-18.sql')<
  r.indexOf('trajectory-map-auth-r18-19.sql'));
 assert.ok(r.indexOf('trajectory-map-auth-r18-19.sql')<
  r.indexOf('rehearse-r05.sh'));
 assert.match(r,/extract_latest_trajectory_r18_19\.py/);
 const fixture=source(testSql);
 assert.doesNotMatch(fixture,/\bdblink\s*\(|postgres:\/\/|supabase_migrations|service_role_secret/i);
 assert.doesNotMatch(fixture,/^\s*(CREATE|ALTER|DROP)\s+ROLE\b/im);
 assert.doesNotMatch(fixture,/\b(auth\.users|supabase_realtime|vault\.secrets)\b/i);
});
test('R18-19 defaults strict on deployed client and leaves R05 migration frozen',()=>{
 const scene=source('src/engine/v2/SceneManager.js');
 assert.doesNotMatch(scene,/clearanceCells:\s*0\.1/);
 const release=source('staging/next-release-ledger.json');
 assert.match(release,/20261111023204_world_v2_b10_integrated_motion/);
 const candidateSql=source(candidate);
 assert.doesNotMatch(candidateSql,/CREATE OR REPLACE FUNCTION public\./i);
});
