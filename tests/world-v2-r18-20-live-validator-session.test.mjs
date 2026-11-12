import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

const snapshot='tests/world-v2-b10-postgres/live-source-r18-20.sql';
const candidate='supabase/candidates/world_v2_r18_20_campaign_affinity.sql';
const integration='tests/world-v2-b10-postgres/campaign-affinity-r18-20.sql';
const motion='tests/world-v2-b10-postgres/legacy-session-r18-20.sql';

test('R18-20 pins real live PG17 token/tool validator and legacy gesture function fingerprints',()=>{
 const s=read(snapshot);
 assert.match(s,/PRODUCTION FUNCTION SOURCE IS REPLAYED ONLY IN DISPOSABLE PG17/);
 for(const [name,digest] of [
  ['validate_token_map','8ddb83de264171910132b2da9979f26c'],
  ['validate_campaign_tool_write','3968fd2daec5e268c931cdcf42e9bdc7'],
  ['advance_map_motion_session_path','539292b1950d76909c032a056bebee79']
 ]){
  assert.ok(s.includes('source: public.'+name+'() | pg_get_functiondef md5: '+digest),name);
  assert.match(s,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\('));
 }
 assert.match(s,/if new\.id<>old\.id or new\.campaign_id<>old\.campaign_id/);
 assert.match(s,/Token and map must belong to same campaign/);
 assert.match(s,/forge_visibility\.movement_sessions%rowtype/);
 assert.match(s,/s\.environment_revision/);
 assert.match(s,/observer_verified_path_status/);
 assert.match(s,/realtime\.send/);
});
test('R18-20 campaign identity guard is narrow and private, no Data API/RLS grant',()=>{
 const s=read(candidate);
 assert.match(s,/NOT A MIGRATION/);
 assert.match(s,/BEFORE UPDATE OF campaign_id ON public\.battle_maps/);
 assert.match(s,/BEFORE UPDATE OF campaign_id ON public\.map_tokens/);
 assert.doesNotMatch(s,/BEFORE UPDATE OF campaign_id ON public\.campaign_tool_issues/);
 assert.equal((s.match(/CREATE TRIGGER forge_/g)||[]).length,2);
 assert.match(s,/NEW\.campaign_id IS DISTINCT FROM OLD\.campaign_id/);
 assert.match(s,/request\.jwt\.claim\.role/);
 assert.match(s,/SECURITY DEFINER SET search_path=''/);
 assert.match(s,/REVOKE ALL ON FUNCTION/);
 assert.doesNotMatch(s,/\bCREATE POLICY\b|\bDROP POLICY\b|^\s*GRANT /mi);
});
test('R18-20 source-real campaign tests demonstrate previously allowed DM dual-campaign reparent then explicit denial',()=>{
 const s=read(integration);
 assert.match(s,/\\i tests\/world-v2-b10-postgres\/live-validators-r18-20\.sql/);
 assert.match(s,/CREATE TRIGGER tokens_validate/);
 assert.match(s,/CREATE TRIGGER campaign_tool_validate_issue/);
 assert.ok(s.indexOf('I07 unpatched dual-campaign DM')<
  s.indexOf('\\i supabase/candidates/world_v2_r18_20_campaign_affinity.sql'));
 assert.ok(s.indexOf('I08 existing map campaign reparent')<
  s.indexOf('\\i supabase/candidates/world_v2_r18_20_campaign_affinity.sql'));
 assert.ok(s.indexOf('I12 DM in both campaigns cannot reparent')>
  s.indexOf('\\i supabase/candidates/world_v2_r18_20_campaign_affinity.sql'));
 assert.deepEqual([...s.matchAll(/'I(\d\d) /g)].map(x=>Number(x[1])),
  Array.from({length:20},(_,i)=>i+1));
 assert.match(s,/^BEGIN;/m);assert.match(s,/^ROLLBACK;\s*$/m);
});
test('R18-20 legacy session tests require actual positive authorized advance, replay, revoke and no canonical mutation',()=>{
 const s=read(motion);
 for(const x of [
  'forge_visibility.movement_sessions',
  'forge_visibility.movement_preview_rates',
  'CREATE TABLE forge_visibility.r20_tick_count',
  'public.advance_map_motion_session_path(',
  'realtime.b07_outbox',
  'S02 valid legacy token path updates preview only',
  'S06 live ownership revocation',
  'S07 environment revision',
  'S08 rule revision',
  'S09 solid wall crossing',
  'S12 simulated zero-visibility recipient',
  'S13 Realtime send failure',
  'S15 held tool',
  'S16 issued tool revision',
  'S17 expired gesture'
 ]) assert.ok(s.includes(x),x);
 assert.match(read(snapshot),/observer_verified_path_status/);
 assert.deepEqual([...s.matchAll(/'S(\d\d) /g)].map(x=>Number(x[1])),
  Array.from({length:20},(_,i)=>i+1));
 assert.match(s,/^BEGIN;/m);assert.match(s,/^ROLLBACK;\s*$/m);
 assert.match(s,/NOT proof|not proof|not real|not actual|not production|not proof of actual/i);
});
test('R18-20 isolated PG17 runner preserves security gates and frozen R05',()=>{
 const run=read('tests/world-v2-b10-postgres/run.sh');
 assert.match(run,/WORLD_V2_B10_ISOLATED/);
 assert.match(run,/PGHOST/);assert.match(run,/PGDATABASE/);
 assert.ok(run.indexOf('trajectory-map-auth-r18-19.sql')<
  run.indexOf('campaign-affinity-r18-20.sql'));
 assert.ok(run.indexOf('campaign-affinity-r18-20.sql')<
  run.indexOf('legacy-session-r18-20.sql'));
 assert.ok(run.indexOf('legacy-session-r18-20.sql')<
  run.indexOf('rehearse-r05.sh'));
 assert.doesNotMatch(read(integration)+read(motion),/\bdblink\s*\(|postgres:\/\/|supabase_migrations|service_role_secret/i);
 assert.match(read('staging/next-release-ledger.json'),/20261111023204_world_v2_b10_integrated_motion/);
 assert.doesNotMatch(read('src/engine/v2/SceneManager.js'),/clearanceCells:\s*0\.1/);
});
