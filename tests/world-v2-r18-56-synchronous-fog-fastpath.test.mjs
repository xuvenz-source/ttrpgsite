import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=x=>readFileSync(join(root,x),'utf8');
const original=read('tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql');
const candidate=read('tests/world-v2-b10-postgres/r56-synchronous-fog-fastpath-candidate.sql');
const fixture=read('tests/world-v2-b10-postgres/r56-synchronous-fog-fastpath-benchmark.sql');
const runner=read('tests/world-v2-b10-postgres/rehearse-r05.sh');
const workflow=read('.github/workflows/world-v2-r18-54-fog-commit.yml');

test('R18-56 candidate copies original pinned signer and has strict local test guard',()=>{
 assert.match(original,/R54 pinned authorized_viewer_fog_frame ee3356af321fec1a3e167a75c6245e86/);
 assert.match(candidate,/ee3356af321fec1a3e167a75c6245e86/);
 assert.match(candidate,/current_database\(\)<>'world_v2_b10_r05'/);
 assert.match(candidate,/r56_original_fog_frame\(uuid,uuid\)/);
 assert.equal((candidate.match(/CREATE OR REPLACE FUNCTION forge_visibility\.authorized_viewer_fog_frame/g)||[]).length,1);
 assert.match(candidate,/SECURITY DEFINER/);
 assert.match(candidate,/SET search_path TO ''/);
 assert.doesNotMatch(candidate,/CREATE OR REPLACE FUNCTION public\.|ALTER TABLE public\.map_tokens/);
});
test('R18-56 no ray shortcut for malformed or over-limit shapes, walls or unknown types',()=>{
 assert.match(candidate,/jsonb_array_length\(scene->'objects'\)<=120/);
 assert.match(candidate,/jsonb_typeof\(item\)='object'/);
 assert.match(candidate,/jsonb_typeof\(item->'type'\)='string'/);
 assert.match(candidate,/item->>'type' NOT IN \('wall','door','window'\)/);
 assert.match(candidate,/ELSE false END\),true\)/);
 assert.match(candidate,/r56_open_los OR NOT forge_visibility\.ray_blocked/);
 assert.match(fixture,/malformed-wall/);
 assert.match(fixture,/malformed-type/);
 assert.match(fixture,/R56-07 over-limit 121 object scene never becomes visible/);
});
test('R18-56 no lighting shortcut if any authored light or enabled torch exists',()=>{
 assert.match(candidate,/r56_has_light/);
 assert.match(candidate,/item->>'type'='light'/);
 assert.match(candidate,/tool\.kind='torch' AND tool\.light_enabled/);
 assert.match(candidate,/WHEN r56_ambient>=50 THEN true/);
 assert.match(candidate,/WHEN r56_no_lights THEN/);
 assert.match(candidate,/ELSE forge_visibility\.is_lit/);
 assert.match(fixture,/R56-08 torch lighting frame exactly preserved/);
 assert.match(fixture,/'open-dark'/);
 assert.match(fixture,/'open-bright'/);
 assert.match(fixture,/'open-shared'/);
});
test('R18-56 differential source-real scenes assert FULL frame equality, not just counts',()=>{
 assert.match(fixture,/ALTER FUNCTION forge_visibility\.authorized_viewer_fog_frame\(uuid,uuid\)/);
 assert.match(fixture,/r56_original_fog_frame\(test_map,who\)/);
 assert.match(fixture,/authorized_viewer_fog_frame\(test_map,who\)/);
 assert.match(fixture,/expected IS NOT DISTINCT FROM actual/);
 for(const kind of ["'wall'","'door'","'window'","'light'","'malformed-wall'","'malformed-type'"]){
  assert.ok(fixture.includes(kind),'missing '+kind);
 }
 assert.match(fixture,/R56-06 exact authorized fog\/LOS\/exploration equivalence/);
});
test('R18-56 signed canonical Commit, observer revisions, solid wall and rollback tested',()=>{
 assert.match(fixture,/public\.begin_world_motion_v2/);
 assert.match(fixture,/public\.advance_world_motion_v2/);
 assert.match(fixture,/public\.commit_world_motion_v2/);
 assert.match(fixture,/R56-12 both variants still perform full synchronous per-viewer refresh/);
 assert.match(fixture,/R56-13 solid wall still blocks and never leaks private geometry/);
 assert.match(fixture,/R56-14 full fixture rollback reverts authorized frames and canonical position/);
 assert.match(fixture,/^BEGIN;$/m);
 assert.match(fixture,/^ROLLBACK;$/m);
 assert.doesNotMatch(fixture,/\bUPDATE public\.map_tokens\b/i);
});
test('R18-56 same PG17 runner is localhost-only; no external CLI or live deployment',()=>{
 const k=runner.indexOf('r55-dirty-fog-prototype.sql');
 const j=runner.indexOf('r56-synchronous-fog-fastpath-benchmark.sql');
 const n=runner.indexOf('versioned-release-r05.sql');
 assert.ok(k>=0&&k<j&&j<n);
 assert.match(runner,/WORLD_V2_B10_ISOLATED/);
 assert.match(runner,/PGHOSTADDR/);
 assert.match(workflow,/postgres:17/);
 assert.match(workflow,/PGHOST: '127\.0\.0\.1'/);
 assert.match(workflow,/r56-\*/);
 assert.doesNotMatch(runner+workflow,/supabase\s+(?:db push|migration repair|link)|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN/i);
});
test('R18-56 retains actor/map and fail-closed original frame semantics',()=>{
 for(const x of [
  "if actor is null then raise exception 'Sign in first'",
  "then raise exception 'Map unavailable'",
  "then raise exception 'Published fog unavailable'",
  "order by t.id limit 8",
  "seen:='[]'::jsonb;",
  "forge_visibility.exploration",
  "where cm.campaign_id=m.campaign_id and cm.user_id=actor",
 ])assert.ok(candidate.includes(x),'missing original source behavior '+x);
 assert.match(candidate,/REVOKE ALL ON FUNCTION forge_visibility\.authorized_viewer_fog_frame\(uuid,uuid\)/);
 assert.match(candidate,/REVOKE ALL ON FUNCTION forge_visibility\.r56_original_fog_frame\(uuid,uuid\)/);
});
