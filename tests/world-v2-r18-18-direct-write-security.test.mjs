import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const file=path=>readFileSync(new URL('../'+path,import.meta.url));
const text=path=>file(path).toString('utf8');
const blobSha=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const sourceA='supabase/migrations/20261107110539_authoritative_fog_collision_release.sql';
const sourceB='supabase/migrations/20261108031754_world_runtime_movement_fog_collision_20261108.sql';
const extractor='tests/world-v2-b10-postgres/extract_real_collision_triggers_r18_18.py';
const qa='tests/world-v2-b10-postgres/direct-write-wall-r18-18.sql';
const candidate='supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql';
const runner='tests/world-v2-b10-postgres/run.sh';

test('R18-18 unchanged historical source blobs anchor real collision trigger extraction',()=>{
 const a=blobSha(file(sourceA)),b=blobSha(file(sourceB));
 assert.equal(a,'fcac1768285a2774fe62894ec2ec0649f0174769');
 assert.equal(b,'c774aa7d13e89aa2d783d8d5fdc6f46326e28206');
 const python=text(extractor);
 assert.match(python,/FROZEN TRIGGER SOURCE DRIFT/);
 assert.match(python,/hashlib\.sha1/);
 assert.match(python,/function\(v2, "enforce_collision"\)/);
 assert.match(python,/function\(v2, "enforce_tool_collision"\)/);
 assert.match(python,/triggers\(v2, "forge_player_collision"/);
 assert.match(python,/triggers\(v2, "forge_tool_collision"/);
 assert.doesNotMatch(python,/\b(requests|urllib|httpx|subprocess|socket)\b/);
});
test('R18-18 exact trigger DDL covers token x/y/span/map and tool map/x/y/config',()=>{
 const source=text(sourceB);
 assert.match(source,/create trigger forge_player_collision\s+before update of x,y,span_x,span_y,map_id on public\.map_tokens/i);
 assert.match(source,/create trigger forge_tool_collision before update of map_id,x,y,config\s+on public\.campaign_tool_issues/i);
 assert.match(source,/security definer set search_path=''/i);
});
test('R18-18 uses only disposable PG17 and a rollback transaction',()=>{
 const sql=text(qa),shell=text(runner);
 assert.match(sql,/^BEGIN;\s/m);
 assert.match(sql,/^ROLLBACK;\s*$/m);
 assert.match(sql,/\\i \/tmp\/world_v2_b10_r18_18_legacy_triggers\.sql/);
 assert.match(sql,/\\i supabase\/candidates\/world_v2_r18_17_wall_edge_clearance\.sql/);
 assert.match(shell,/WORLD_V2_B10_ISOLATED/);
 assert.match(shell,/PGHOST/);
 assert.match(shell,/PGDATABASE/);
 assert.match(shell,/extract_real_collision_triggers_r18_18\.py/);
 assert.match(shell,/direct-write-wall-r18-18\.sql/);
 assert.doesNotMatch(sql,/supabase_migrations|production|dblink|postgres:\/\/|service_role_secret|\bGRANT\b/i);
});
test('R18-18 actually updates token/tool rows, not only calling geometry functions',()=>{
 const s=text(qa);
 for(const needle of [
  'UPDATE public.map_tokens SET x=p_x',
  'UPDATE public.map_tokens SET span_x=p_span',
  'UPDATE public.campaign_tool_issues SET x=p_x',
  'UPDATE public.campaign_tool_issues',
  'set_config(\'request.jwt.claim.sub\'',
  'forge.collision_override',
  'Sign in to move tokens',
  'Sign in to move tools',
  'Movement leaves the map bounds',
  'conditional',
  'config resize',
  'source-extracted legacy collision triggers'
 ])assert.ok(s.toLowerCase().includes(needle.toLowerCase()),needle);
 const cases=[...s.matchAll(/'T(\d{2}) [^']+'/g)].map(x=>Number(x[1]));
 assert.deepEqual(cases,Array.from({length:38},(_,i)=>i+1));
 assert.match(s,/GET STACKED DIAGNOSTICS seen_error=MESSAGE_TEXT/g);
 assert.match(s,/SELECT x=old_x/);
 assert.match(s,/SELECT config=old_config/);
});
test('R18-18 avoids schema or runtime production changes to frozen R05 and guard flags',()=>{
 const code=text(candidate);
 assert.match(code,/NOT A VERSIONED MIGRATION/);
 assert.doesNotMatch(code,/CREATE POLICY|DROP POLICY|ALTER ROLE|GRANT USAGE/i);
 const run=text(runner);
 assert.match(run,/rehearse-r05\.sh/);
 assert.match(run,/wall-edge-r18-17\.sql/);
 const runtime=text('src/engine/v2/SceneManager.js');
 assert.doesNotMatch(runtime,/clearanceCells:\s*0\.10?/);
});
