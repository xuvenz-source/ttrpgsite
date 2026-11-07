import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const anon=readFileSync(new URL('../supabase/migrations/20261107051546_remove_unused_anon_preference_and_map_grants.sql',import.meta.url),'utf8');
const art=readFileSync(new URL('../security/sql-candidates/02-separate-dm-npc-artwork.sql',import.meta.url),'utf8');
const roles=readFileSync(new URL('../security/ROLE-BASED-ACCEPTANCE.md',import.meta.url),'utf8');

test('anonymous preference grants are only removed from tables with authenticated-only RLS',()=>{
 assert.match(anon,/revoke all privileges on table/i);
 for(const table of ['campaign_map_views','campaign_player_maps','tabletop_menu_preferences'])
  assert.match(anon,new RegExp(table));
 assert.match(anon,/pg_policies/i);
 assert.match(anon,/raise exception/i);
});

test('NPC image access requires DM or a revealed NPC token on an authorized map',()=>{
 assert.match(art,/public\.is_campaign_member\(c\.id\)/i);
 assert.match(art,/public\.is_campaign_dm\(c\.id\)/i);
 assert.match(art,/t\.image_path = storage\.objects\.name/i);
 assert.match(art,/t\.visible = true/i);
 assert.match(art,/public\.can_view_campaign_map\(t\.campaign_id,t\.map_id\)/i);
 assert.match(art,/t\.character_id is null/i);
 assert.match(art,/for select to authenticated/i);
 assert.doesNotMatch(art,/to anon/i);
});

test('privacy changes have a role-switched test matrix and safe rollout gate',()=>{
 for(const role of ['DM-A','Player-A','Player-B','Player-C','Signed-out'])
  assert.ok(roles.includes(role));
 assert.match(roles,/NPC artwork.*candidate-only/i);
 assert.match(roles,/NOT yet deployed/i);
 assert.match(roles,/signed URL/i);
});
