import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandGestureRoute,takeGestureBatch} from '../src/engine/v2/GesturePath.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/candidates/world_v2_b03_path_validation.sql');
const active=read('supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql');
const observer=read('supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql');

test('B03 is a non-applied, private, invoker-scoped candidate (no public API or migrations)',()=>{
 assert.match(sql,/B03 CANDIDATE ONLY\. NOT A DEPLOYABLE\/APPLIED MIGRATION/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION forge_world_v2\.validate_motion_path_batch_b03\(/);
 assert.match(sql,/RETURNS jsonb\s+LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION forge_world_v2\.validate_motion_path_batch_b03\([\s\S]*?FROM PUBLIC,anon,authenticated;/);
 assert.doesNotMatch(sql,/CREATE\s+(?:OR REPLACE\s+)?FUNCTION\s+public\./i);
 assert.doesNotMatch(sql,/GRANT\s+EXECUTE\s+ON\s+FUNCTION/i);
 assert.doesNotMatch(sql,/^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE\s+|PERFORM\s+realtime\.)/im);
 assert.doesNotMatch(sql,/ALTER\s+FUNCTION|CREATE\s+TABLE|DROP\s+FUNCTION/i);
 assert.equal((sql.match(/\$b03\$/g)||[]).length,2,'balanced function delimiter');
});

test('B03 rechecks actor, session, permission, map and canonical anchor on every call',()=>{
 for(const clause of [
  /auth\.uid\(\) IS NULL/,/motion\.actor_id=auth\.uid\(\)/,
  /forge_world_v2\.session_valid\(s\) IS DISTINCT FROM true/,
  /p_seq<>s\.last_seq\+1/,
  /s\.environment_revision IS DISTINCT FROM p_environment_revision/,
  /s\.permission_generation IS DISTINCT FROM p_permission_generation/,
  /p_from IS DISTINCT FROM jsonb_build_object/,
  /\(p_from->>'x'\)::integer<>s\.last_x/,
  /m\.id=s\.map_id AND m\.campaign_id=s\.campaign_id/,
  /public\.is_campaign_dm\(s\.campaign_id\)/
 ]) assert.match(sql,clause);
 assert.match(active,/NOT public\.can_view_campaign_map\(s\.campaign_id,s\.map_id\)/);
 assert.match(active,/t\.owner_id IS DISTINCT FROM s\.actor_id/);
 assert.match(active,/u\.owner_id IS DISTINCT FROM s\.actor_id/);
});

test('B03 is bounded and checks every step for every immutable selection footprint',()=>{
 for(const clause of [
  /jsonb_array_length\(p_targets\) NOT BETWEEN 1 AND 8/,
  /jsonb_array_length\(s\.selection\) NOT BETWEEN 1 AND 48/,
  /s\.batches>=64/,/s\.attempted_cells>=128/,
  /needed\+steps>24/,/s\.attempted_cells\+needed\+steps>128/,
  /FOR target IN SELECT value FROM jsonb_array_elements\(p_targets\)/,
  /forge_world_v2\.valid_point\(target\) IS DISTINCT FROM true/,
  /target IS DISTINCT FROM jsonb_build_object/,
  /FOR i IN 1\.\.steps LOOP/,
  /greatest\(abs\(step_x\),abs\(step_y\)\)<>1/,
  /FOR candidate IN SELECT value FROM jsonb_array_elements\(parts\)/,
  /forge_world_v2\.step_allowed\(/,
  /\(candidate->>'spanX'\)::double precision/,
  /\(candidate->>'spanY'\)::double precision/,
  /s\.collision_on AND NOT s\.dm_override/,
  /jsonb_array_length\(routes\)>=64/,
  /IF NOT blocked AND processed=0 THEN RETURN NULL/
 ]) assert.match(sql,clause);
 assert.match(sql,/jsonb_typeof\(scene->'objects'\) IS DISTINCT FROM 'array'/,
  'fail closed when collision world is unavailable');
});

test('B03 loads only server-authorized actor attributes; never client-supplied geometry',()=>{
 assert.match(sql,/FROM public\.map_tokens t/);
 assert.match(sql,/FROM public\.characters c/);
 assert.match(sql,/FROM public\.campaign_tool_issues u/);
 assert.match(sql,/forge_world_v2\.session_valid\(s\)/);
 assert.match(sql,/token_row\.npc_values/);
 assert.match(sql,/character_row\.field_values/);
 assert.match(sql,/tool_row\.state->'attrs'/);
 assert.doesNotMatch(sql,/p_scene|p_geometry|p_attrs|p_grants|p_wall_objects/);
 assert.match(active,/CREATE OR REPLACE FUNCTION forge_world_v2\.wall_passes/);
 assert.doesNotMatch(active,/oneWay/, 'one-way currently controls V2 sight only, not movement');
 assert.match(observer,/publish_approved_observers/);
 assert.match(observer,/observer_path_status/);
});

test('B03 appends ordered, contiguous route steps and returns a blocked prefix without secret blockers',()=>{
 assert.match(sql,/segment_start_x:=cursor_x;segment_start_y:=cursor_y/);
 assert.match(sql,/sign\(delta_x\)\*floor\(abs\(delta_x\)::numeric\*i\/steps\+0\.5\)/);
 assert.match(sql,/sign\(delta_y\)\*floor\(abs\(delta_y\)::numeric\*i\/steps\+0\.5\)/);
 assert.match(sql,/accepted:=accepted\|\|jsonb_build_array/);
 assert.match(sql,/routes:=routes\|\|jsonb_build_array/);
 assert.match(sql,/IF NOT valid THEN blocked:=true; EXIT; END IF/);
 assert.match(sql,/IF blocked THEN EXIT; END IF/);
 assert.match(sql,/'accepted',accepted[\s\S]*'blocked',blocked[\s\S]*'endpoint'/);
 assert.doesNotMatch(sql,/RETURN jsonb_build_object\([\s\S]*?(?:wallGeometry|hiddenNpcs|secretWalls)/i);
 // Client expansion remains the approved sequence contract, not an independent
 // server validation. B04 must exercise the SQL in a real, isolated database.
 const route=expandGestureRoute({x:2,y:2},[{x:5,y:2},{x:5,y:4},{x:2,y:4}]);
 assert.deepEqual(route,[
  {x:3,y:2},{x:4,y:2},{x:5,y:2},
  {x:5,y:3},{x:5,y:4},
  {x:4,y:4},{x:3,y:4},{x:2,y:4}
 ]);
 const split=takeGestureBatch({x:0,y:0},[{x:30,y:0}]);
 assert.deepEqual(split.targets,[{x:24,y:0}]);
 assert.equal(split.consumed,0,'unfinished segment must not disappear');
});
