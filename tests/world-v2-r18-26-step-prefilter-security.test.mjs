import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const candidate=read('supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql');
const parity=read('tests/world-v2-b10-postgres/step-bbox-r18-26.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r18-22.sh');
function gitBlob(content){
 return createHash('sha1').update('blob '+Buffer.byteLength(content)+'\0')
  .update(content).digest('hex');
}

test('R18-26 cannot rewrite frozen R05 or previously approved wall and campaign candidates',()=>{
 const frozen=new Map([
  ['supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql',
   'f4e296725c09055685321726cbe4bc6e09dbce5a'],
  ['supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql',
   'c78998da8a9013591f2bb479cca4b222f41ef2d7'],
  ['supabase/candidates/world_v2_r18_19_cross_map_guard.sql',
   '55db7e6b6839d1d8b489203baa11c99264648a55'],
  ['supabase/candidates/world_v2_r18_20_campaign_affinity.sql',
   '3980808966ec56ad74120bc4f737c78ddd2056bb']
 ]);
 for(const [path,sha] of frozen)
  assert.equal(gitBlob(read(path)),sha,path);
});
test('R18-26 stages exactly one original-signature PRIVATE STABLE INVOKER replacement',()=>{
 const sql=candidate.replace(/^--.*$/gm,'');
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/gi)||[]).length,1);
 assert.match(sql,/CREATE OR REPLACE FUNCTION forge_world_v2\.step_allowed\(/);
 assert.match(sql,/RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO ''/);
 assert.doesNotMatch(sql,/\bSECURITY\s+DEFINER\b|\bGRANT\b|\bREVOKE\b|\bDROP\b|\bTRUNCATE\b|\bALTER\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
 assert.match(sql,/IF NOT p_collision THEN RETURN true;END IF;/);
 assert.match(sql,/jsonb_array_length\(p_scene->'objects'\)>120/);
 assert.match(sql,/IF forge_world_v2\.wall_passes\(obj,p_attrs\) THEN CONTINUE;/);
 assert.match(sql,/jsonb_array_length\(pts\) NOT BETWEEN 2 AND 80/);
 assert.match(sql,/forge_world_v2\.swept_hits_segment\(/);
 assert.match(sql,/THEN RETURN false;END IF;/);
});
test('R18-26 conservative prefilter requires fully bounded finite sweep AND wall endpoints',()=>{
 assert.match(candidate,/finite_sweep:=/);
 assert.match(candidate,/abs\(x0\)<=100000/);
 assert.match(candidate,/abs\(y1\)<=100000/);
 assert.match(candidate,/ax IS NOT NULL AND ay IS NOT NULL/);
 assert.match(candidate,/bx IS NOT NULL AND by_ IS NOT NULL/);
 assert.match(candidate,/abs\(ax\)<=100000/);
 assert.match(candidate,/abs\(by_\)<=100000/);
 assert.match(candidate,/sweep_min_x:=least\(x0,x1\)-0\.0001/);
 assert.match(candidate,/sweep_max_x:=greatest\(x0,x1\)\+span_x\+0\.0001/);
 assert.match(candidate,/sweep_max_y:=greatest\(y0,y1\)\+span_y\+0\.0001/);
 assert.match(candidate,/greatest\(ax,bx\)<sweep_min_x/);
 assert.match(candidate,/least\(ax,bx\)>sweep_max_x/);
});
test('R18-26 runs only after full ordered R05 chain, then rolls back original SQL',()=>{
 assert.match(runner,/\[\[ "\$\{WORLD_V2_B10_ISOLATED:-\}" == "yes" \]\]/);
 assert.match(runner,/PGHOST:-.*localhost/);
 assert.match(runner,/PGDATABASE:-.*world_v2_b10/);
 assert.ok(runner.indexOf('ordered-stack-r18-22.sql')<
  runner.indexOf('step-bbox-r18-26.sql'));
 assert.ok(parity.indexOf('BEGIN;')<
  parity.indexOf('supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql'));
 assert.ok(parity.indexOf('ROLLBACK;')>
  parity.indexOf('supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql'));
 assert.match(parity,/pg_get_functiondef/);
 assert.match(parity,/step_allowed_reference_r18_26/);
 assert.match(parity,/md5\(pg_get_functiondef\(original\)\)='6dcd75ce4719cd0bf6173f77f75fdf32'/);
 assert.match(parity,/R26-13 candidate and reference both ROLLED BACK/);
});
test('R18-26 differential matrix covers fog-independent security and invalid geometry',()=>{
 for(const description of [
  '4860 deterministic','clear ground','shallow clearance','open/closed portal',
  'character attribute wall','malformed footprints','invalid barrier-point',
  'malformed wall-coordinate','no-collision flag','private schema',
  '40-call 100-remote-barrier'
 ])assert.ok(parity.includes(description),description);
 const gates=[...parity.matchAll(/'R26-\d{2}/g)].map(m=>m[0]);
 for(let i=1;i<=13;i++)
  assert.ok(gates.some(code=>code==="'R26-"+String(i).padStart(2,'0')),
   'missing R26-'+i);
});
