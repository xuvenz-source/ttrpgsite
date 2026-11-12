import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const route='tests/world-v2-b10-postgres/live-party-route-r18-21.sql';
const fixture='tests/world-v2-b10-postgres/dm-workflow-affinity-r18-21.sql';
const runner='tests/world-v2-b10-postgres/run.sh';

test('R18-21 source-real live party routing function is pinned and does not change piece campaign identity',()=>{
 const s=read(route);
 assert.match(s,/MD5: 2e7de20ead8eb0dd156fe4e6f2f08bb7/);
 assert.match(s,/CREATE OR REPLACE FUNCTION public.move_entire_party_to_map\(p_campaign uuid, p_map uuid\)/);
 assert.match(s,/public\.is_campaign_dm\(p_campaign\)/);
 assert.match(s,/where m\.id=p_map and m\.campaign_id=p_campaign/);
 assert.match(s,/update public\.campaigns c set active_map_id=p_map/);
 assert.match(s,/delete from public\.campaign_player_maps a where a\.campaign_id=p_campaign/);
 assert.doesNotMatch(s,/update public\.(?:map_tokens|battle_maps|campaign_tool_issues)/i);
 assert.doesNotMatch(s,/\bset\s+campaign_id\s*=/i);
});
test('R18-21 actual app implements new-map upload and calibration, not map reparenting',()=>{
 const src=read('src/TabletopApp.jsx');
 assert.match(src,/db\.from\('battle_maps'\)\.insert\(\{campaign_id:activeId,/);
 assert.match(src,/db\.from\('battle_maps'\)\s*\.update\(\{width:next\.width,height:next\.height,grid_size:next\.grid_size\}\)/);
 assert.match(src,/db\.rpc\('move_entire_party_to_map',\{p_campaign:activeId,p_map:id\}\)/);
 assert.match(src,/db\.from\('campaign_player_maps'\)\.upsert\(\{/);
 assert.match(src,/db\.from\('campaigns'\)\.update\(\{active_map_id:id\}\)/);
 assert.doesNotMatch(src,/from\('battle_maps'\)\s*\.update\(\{[^}]*campaign_id\s*:/);
 assert.doesNotMatch(src,/from\('map_tokens'\)\s*\.update\(\{[^}]*campaign_id\s*:/);
 // Sheet-template import and personal token artwork copy are separate
 // workflows, not campaign/map reparenting.
 assert.match(src,/async function importTemplateFile/);
 assert.match(src,/async function uploadMap/);
});
test('R18-21 17 source-real DM compatibility assertions run in isolated rollback',()=>{
 const sql=read(fixture);
 const cases=[...sql.matchAll(/'W(\d\d) /g)].map(x=>Number(x[1]));
 assert.deepEqual(cases,Array.from({length:17},(_,i)=>i+1));
 for(const needle of [
  'live-party-route-r18-21.sql',
  'live-validators-r18-20.sql',
  'world_v2_r18_19_cross_map_guard.sql',
  'world_v2_r18_20_campaign_affinity.sql',
  'CREATE TRIGGER tokens_validate',
  'CREATE TRIGGER campaign_tool_validate_issue',
  'move_entire_party_to_map(first_campaign,uploaded_map)',
  'move_entire_party_to_map(first_campaign,copied_map)',
  'INSERT INTO public.battle_maps',
  'UPDATE public.battle_maps SET width=200',
  'UPDATE public.map_tokens SET map_id=uploaded_map',
  'Campaign identity cannot change',
  'Only the campaign DM can move the party'
 ])assert.ok(sql.includes(needle),needle);
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^ROLLBACK;\s*$/m);
 assert.doesNotMatch(sql,/\bdblink\s*\(|postgres:\/\/|supabase_migrations|service_role_secret/i);
});
test('R18-21 all new source-real suites precede separate frozen R05 atomic rehearsal',()=>{
 const sh=read(runner);
 assert.match(sh,/WORLD_V2_B10_ISOLATED/);
 assert.match(sh,/PGHOST/);
 assert.match(sh,/PGDATABASE/);
 assert.ok(sh.indexOf('legacy-session-r18-20.sql')<
   sh.indexOf('dm-workflow-affinity-r18-21.sql'));
 assert.ok(sh.indexOf('dm-workflow-affinity-r18-21.sql')<
   sh.indexOf('rehearse-r05.sh'));
 assert.match(sh,/rehearse-r05\.sh/);
});
test('R18-21 release candidates still not activated and private guards protected',()=>{
 const guard=read('supabase/candidates/world_v2_r18_20_campaign_affinity.sql');
 assert.match(guard,/NOT A MIGRATION/);
 assert.match(guard,/BEFORE UPDATE OF campaign_id ON public\.battle_maps/);
 assert.match(guard,/BEFORE UPDATE OF campaign_id ON public\.map_tokens/);
 assert.doesNotMatch(guard,/\bCREATE POLICY\b/);
 const stage=read('staging/next-release-ledger.json');
 assert.match(stage,/20261111023204_world_v2_b10_integrated_motion/);
 assert.doesNotMatch(read('src/engine/v2/SceneManager.js'),/clearanceCells:\s*0\.1/);
});
