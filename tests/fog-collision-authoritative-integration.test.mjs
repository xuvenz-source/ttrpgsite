import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=text('staging/sql-candidates/fog_collision_authoritative_release.sql');
const app=text('src/main.jsx'),panel=text('src/MapSettingPanel.jsx');
test('server collision must cover token direct writes and issued tools',()=>{
 assert.match(sql,/create trigger forge_player_collision before update of x,y/);
 assert.match(sql,/create trigger forge_tool_collision before update of map_id,x,y/);
 assert.match(sql,/forge_visibility\.swept_hits_segment\(/);
 assert.match(sql,/Movement blocked by a wall or closed portal/);
 assert.match(sql,/Tool movement blocked by a wall or closed portal/);
 assert.match(sql,/public\.can_player_place_map_piece\(/);
 assert.match(sql,/r\.collision_enforced or r\.fog_enforced/);
 assert.match(sql,/public\.is_campaign_dm\(new\.campaign_id\)/);
});
test('published geometry never automatically exposes prepared DM maps',()=>{
 assert.match(sql,/select prepared into scene from public\.map_environments/);
 assert.match(sql,/update public\.map_environments set live=scene/);
 assert.match(sql,/publish_map_environment\(p_map uuid/);
 assert.match(sql,/reset_exploration/);
 assert.match(sql,/jsonb_array_length\(scene->'objects'\)>120/);
 assert.match(sql,/fog_enforced boolean not null default false/);
 assert.match(sql,/collision_enforced boolean not null default false/);
 assert.doesNotMatch(sql,/grant select on public\.map_environments to authenticated/);
});
test('players cannot query all visible token rows outside their server sight',()=>{
 assert.match(sql,/drop policy if exists "members view visible tokens" on public\.map_tokens/);
 assert.match(sql,/create policy "members view only observed tokens"/);
 assert.match(sql,/public\.can_observe_map_token\(id\)/);
 assert.match(sql,/create policy "viewers see only observed map tools"/);
 assert.match(sql,/public\.can_observe_map_position\(/);
 assert.match(sql,/public\.can_view_campaign_map\(t\.campaign_id,t\.map_id\)/);
 assert.match(sql,/revoke all on forge_visibility\.map_rules from public,anon,authenticated/);
 assert.match(sql,/revoke all on forge_visibility\.exploration from public,anon,authenticated/);
});
test('combat and monitor endpoints are filtered before React renders them',()=>{
 assert.match(sql,/create policy "dm or nonfog viewers read combat roster"/);
 assert.match(sql,/not public\.is_map_fog_published\(map_id\)/);
 assert.match(sql,/create or replace function public\.get_authorized_map_combat/);
 assert.match(sql,/create or replace function public\.get_authorized_map_fog/);
 assert.match(sql,/get_token_monitor_values/);
 assert.match(sql,/get_token_encumbrance_badges/);
 assert.match(sql,/t\.visible and public\.can_observe_map_token\(t\.id\)/);
 assert.match(sql,/not exists\(select 1 from forge_visibility\.map_rules r/);
 assert.match(text('src/useMapCombat.js'),/db\.rpc\('get_authorized_map_combat'/);
});
test('signed NPC artwork cannot be requested by any arbitrary campaign member',()=>{
 assert.match(sql,/drop policy if exists "campaign members access artwork" on storage\.objects/);
 assert.match(sql,/storage\.objects\.owner_id=auth\.uid\(\)::text/);
 assert.match(sql,/public\.can_observe_map_token\(t\.id\)/);
 assert.match(sql,/create policy "artwork only for dm owned characters and observed map tokens"/);
});
test('sanitized revision tick replaces leaked private movement coordinates under fog',()=>{
 assert.match(sql,/create table if not exists public\.map_visibility_ticks/);
 assert.match(sql,/grant select on public\.map_visibility_ticks to authenticated/);
 assert.match(sql,/create trigger forge_visibility_token_tick/);
 assert.match(sql,/create trigger forge_visibility_tool_tick/);
 assert.match(sql,/create trigger forge_visibility_combat_tick/);
 assert.match(sql,/alter publication supabase_realtime add table public\.map_visibility_ticks/);
 assert.match(app,/if\(!fog\.frame\|\|fog\.frame\.mapId!==selectedMap\|\|fog\.frame\.enabled\)return;/);
 assert.match(app,/fog\.frame\?\.revision/);
 assert.match(text('src/useAuthorizedMapFog.js'),/table:'map_visibility_ticks'/);
});
test('DM publishes saved rules explicitly; player fog fails closed',()=>{
 assert.match(app,/await mapEnvironmentWriter\.current\.flush\(\)/);
 assert.match(app,/db\.rpc\('publish_map_environment'/);
 assert.match(panel,/Enforce wall and door collision/);
 assert.match(panel,/Publish map rules/);
 assert.match(panel,/Disable published rules/);
 assert.match(panel,/Reset exploration/);
 assert.match(app,/!isDM&&<MapFogOverlay/);
 assert.match(text('src/MapFogOverlay.jsx'),/if\(!sanitized\)/);
});
test('SQL is a pending migration only, never auto-applied by staging CI',()=>{
 assert.match(sql,/STAGING ONLY/);
 assert.match(text('AGENTS.md'),/Batch all outstanding staged work into the next approved production update/);
 assert.doesNotMatch(text('.github/workflows/verify-staged.yml'),/supabase db push|apply_migration|supabase migration up/);
});
