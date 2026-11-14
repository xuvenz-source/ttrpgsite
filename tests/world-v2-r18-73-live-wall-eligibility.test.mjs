import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateR73WallEligibilityEvidence} from '../scripts/release/validate-world-v2-r18-73-wall-eligibility.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sql=readFileSync(join(root,'supabase/release-preflight/world_v2_b10_r18_73_published_wall_eligibility.sql'),'utf8');
const validatorPath=join(root,'scripts/release/validate-world-v2-r18-73-wall-eligibility.mjs');
const NOW=Date.parse('2026-11-14T12:57:00.000Z');
const observed='2026-11-14T12:56:16.443068+00:00';
const base=()=>({
 schema:1,kind:'B10-R18-73-published-wall-eligibility',
 observed_at:observed,
 published_scene_rows:2,scenes_with_array:2,scenes_without_array:0,
 scenes_over_120:0,strict_plain_wall_scenes:0,
 strict_plain_wall_scenes_with_duplicates:0,
 strict_plain_wall_scenes_without_duplicates:0,
 strict_plain_wall_eligible_objects:0,strict_plain_wall_duplicate_objects:0,
 fallback_scenes:2,bounded_objects_total:3,bounded_wall_objects:1,
 bounded_door_objects:0,bounded_window_objects:0,bounded_light_objects:2,
 bounded_other_objects:0,geometry_recorded:false,map_ids_recorded:false,
 operator_cli_verified:false,independent_dm_p1_p2_verified:false,
 safe_to_install:false,release_decision:'NO_GO'
});
const check=x=>validateR73WallEligibilityEvidence(x,{now:NOW});

test('R18-73 recognizes the two-published-scene sanitized live aggregate and never approves release',()=>{
 const output=check([{world_v2_wall_eligibility:base()}]);
 assert.equal(output.classification,'NO_ELIGIBLE_SCENES');
 assert.equal(output.counts.published_scene_rows,2);
 assert.equal(output.counts.strict_plain_wall_scenes_with_duplicates,0);
 assert.equal(output.snapshotCurrent,true);
 assert.equal(output.decision,'NO_GO');
 assert.equal(output.safeToDeploy,false);
 assert.equal(output.safeToInstallSql,false);
 assert.equal(output.productionSpeedupVerified,false);
 assert.equal(output.browserRttP95Ms,null);
 assert.equal(JSON.stringify(output).includes('00000000-0000'),false);
});

test('R18-73 classifies a valid synthetic duplicate case as review-only, never installable',()=>{
 const x=base();
 Object.assign(x,{
  published_scene_rows:3,scenes_with_array:3,
  strict_plain_wall_scenes:1,strict_plain_wall_scenes_with_duplicates:1,
  strict_plain_wall_eligible_objects:3,strict_plain_wall_duplicate_objects:1,
  fallback_scenes:2,bounded_objects_total:8,bounded_wall_objects:5,
  bounded_light_objects:3
 });
 const result=check(x);
 assert.equal(result.classification,'DUPLICATES_EXIST_REVIEW_ONLY');
 assert.equal(result.safeToInstallSql,false);
 assert.equal(result.productionSpeedupVerified,false);
});

test('R18-73 rejects forged approvals, private IDs/geometry and any unknown input keys',()=>{
 for(const patch of [
  {safe_to_install:true},{release_decision:'GO'},{geometry_recorded:true},
  {operator_cli_verified:true},{map_ids_recorded:true},
  {independent_dm_p1_p2_verified:true},{map_id:'secret'},
  {objects:[{type:'wall'}]},{raw_sql:'select * from secrets'}
 ]){
  assert.throws(()=>check({...base(),...patch}),/NO-GO/);
 }
 assert.throws(()=>check([{world_v2_wall_eligibility:base(),raw_scene:'secret'}]),/NO-GO/);
 assert.throws(()=>check([{}, {world_v2_wall_eligibility:base()}]),/NO-GO/);
});

test('R18-73 rejects negative, fractional, string, missing or internally contradictory scene metrics',()=>{
 for(const patch of [
  {published_scene_rows:-1},
  {published_scene_rows:2.5},
  {scenes_with_array:'2'},
  {fallback_scenes:1},
  {scenes_without_array:1},
  {strict_plain_wall_scenes:1},
  {strict_plain_wall_scenes_with_duplicates:1},
  {strict_plain_wall_eligible_objects:1},
  {strict_plain_wall_duplicate_objects:1},
  {bounded_objects_total:4},
  {bounded_wall_objects:4},
  {scenes_over_120:3}
 ])assert.throws(()=>check({...base(),...patch}),/NO-GO/);
 assert.throws(()=>check(Object.fromEntries(Object.entries(base()).filter(([key])=>key!=='bounded_light_objects'))),/NO-GO/);
});

test('R18-73 rejects unknown or future source timestamps; older snapshots remain historical NO-GO',()=>{
 assert.throws(()=>check({...base(),observed_at:'bad'}),/NO-GO/);
 assert.throws(()=>check({...base(),observed_at:'2026-11-15T12:00:00Z'}),/NO-GO/);
 const stale=check({...base(),observed_at:'2026-11-12T12:00:00Z'});
 assert.equal(stale.snapshotCurrent,false);
 assert.equal(stale.decision,'NO_GO');
});

test('R18-73 correctly validates zero published scenes as insufficient evidence',()=>{
 const empty=base();
 Object.assign(empty,{
  published_scene_rows:0,scenes_with_array:0,fallback_scenes:0,
  bounded_objects_total:0,bounded_wall_objects:0,bounded_light_objects:0
 });
 assert.equal(check(empty).classification,'NO_PUBLISHED_SAMPLE');
});

test('R18-73 source is one aggregate-only SELECT on published live JSONB, no app or permission writes',()=>{
 const executable=sql.replace(/^--.*$/gm,'').trim();
 assert.match(executable,/^WITH\s+scenes AS MATERIALIZED\s*\(/);
 assert.match(executable,/FROM public\.map_environments/);
 assert.match(executable,/AS world_v2_wall_eligibility\s+FROM classified;$/);
 assert.doesNotMatch(executable,/^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|BEGIN|SET|DO)\b/mi);
 assert.doesNotMatch(executable,/pg_stat_reset|pg_read_file|dblink_exec|execute\s+/i);
 assert.doesNotMatch(executable,/public\.map_tokens|public\.campaign_members|auth\.users|viewer_fog_snapshots/);
 assert.match(executable,/'geometry_recorded',false/);
 assert.match(executable,/'map_ids_recorded',false/);
 assert.match(executable,/'release_decision','NO_GO'/);
});

test('R18-73 SQL matches R72 whole-scene strict guard and bounds expensive JSON expansion',()=>{
 const r72=readFileSync(join(root,'tests/world-v2-b10-postgres/r72-frame-local-solid-wall-probe.sql'),'utf8');
 assert.match(sql,/s\.object_count BETWEEN 2 AND 120/);
 assert.match(sql,/jsonb_array_length\(o\.value->'points'\) BETWEEN 2 AND 80/);
 assert.match(sql,/o\.value->>'type'='wall'/);
 assert.match(sql,/jsonb_object_keys\(/);
 assert.match(sql,/jsonb_typeof\(point\.value->'x'\) IS DISTINCT FROM 'number'/);
 assert.match(sql,/jsonb_typeof\(point\.value->'y'\) IS DISTINCT FROM 'number'/);
 assert.match(sql,/count\(DISTINCT value\)/);
 assert.match(sql,/count\(\*\) FILTER\(WHERE strict_eligible AND duplicate_objects>0\)/);
 assert.match(r72,/jsonb_array_length\(scene->'objects'\) BETWEEN 2 AND 120/);
 assert.match(r72,/jsonb_array_length\(r72_item->'points'\) NOT BETWEEN 2 AND 80/);
 assert.match(r72,/SELECT DISTINCT ON \(object_value\)/);
});

test('R18-73 source only returns whitelisted category aggregates, not raw authored type strings',()=>{
 for(const category of ['wall','door','window','light','other']){
  assert.match(sql,new RegExp("safe_family='"+category+"'"));
 }
 assert.doesNotMatch(sql,/jsonb_agg\s*\(|array_agg\s*\(|string_agg\s*\(/i);
 assert.doesNotMatch(sql,/jsonb_build_object\([^]*?'(map_id|user_id|scene|geometry|visible|explored)'\s*,/i);
 assert.match(sql,/'bounded_objects_total'/);
 assert.match(sql,/'safe_to_install',false/);
});

test('R18-73 offline CLI accepts sanitized external file but refuses in-repo and symlink inputs',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r73-safe-'));
 try{
  const path=join(dir,'safe.json');
  writeFileSync(path,JSON.stringify([{world_v2_wall_eligibility:base()}]),'utf8');
  const safe=spawnSync(process.execPath,[validatorPath,'--input='+path],{encoding:'utf8'});
  // File fixture timestamps are intentionally fixed in November 2026.
  assert.equal(safe.status,0,safe.stderr);
  assert.equal(JSON.parse(safe.stdout).decision,'NO_GO');
  const link=join(dir,'alias.json');
  symlinkSync(path,link);
  const unsafe=spawnSync(process.execPath,[validatorPath,'--input='+link],{encoding:'utf8'});
  assert.notEqual(unsafe.status,0);
  assert.doesNotMatch(unsafe.stderr,/00000000|raw_sql|coordinates/);
  const inside=spawnSync(process.execPath,[validatorPath,'--input='+join(root,'package.json')],{encoding:'utf8'});
  assert.notEqual(inside.status,0);
 }finally{
  rmSync(dir,{recursive:true,force:true});
 }
});
