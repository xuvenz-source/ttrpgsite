import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAP_TOKEN_SAFE_PROJECTION,mergeDmNpcValues}
 from '../src/MapTokenPrivateProjection.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=source('src/TabletopApp.jsx');
const sql=source('supabase/migrations/20261109000500_dm_map_npc_protected_columns.sql');

test('player map projection never requests protected private NPC values',()=>{
 const columns=MAP_TOKEN_SAFE_PROJECTION.split(',');
 assert.ok(columns.includes('id'));
 assert.ok(columns.includes('npc_bars_public'));
 assert.ok(!columns.includes('npc_values'));
 assert.match(app,/\.select\(MAP_TOKEN_SAFE_PROJECTION\)\.eq\('map_id',mapId\)/);
 assert.match(app,/if\(!isDM\)return safeRows/);
 assert.doesNotMatch(app,/\.select\('npc_values[,']|projection\+',npc_values'/);
 assert.doesNotMatch(app,/db\.from\('map_tokens'\)\.select\('\*'\)/);
});

test('DMs merge private attributes by token id without reordering a snapshot',()=>{
 const visible=[{id:'a',name:'Dragon'},{id:'b',name:'Hero'}];
 const merged=mergeDmNpcValues(visible,[{token_id:'a',npc_values:{hp:100}},{token_id:'c',npc_values:{hp:999}}]);
 assert.deepEqual(merged,[{id:'a',name:'Dragon',npc_values:{hp:100}},
  {id:'b',name:'Hero',npc_values:{}}]);
 assert.deepEqual(visible,[{id:'a',name:'Dragon'},{id:'b',name:'Hero'}]);
});

test('DM private batch is authenticated, campaign-scoped and never public-grants table select',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.get_dm_map_npc_values\(p_map uuid\)/);
 assert.match(sql,/SECURITY DEFINER SET search_path TO ''/);
 assert.match(sql,/public\.is_campaign_dm\(m\.campaign_id\)/);
 assert.match(sql,/t\.map_id=p_map/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.get_dm_map_npc_values\(uuid\)\s+FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.get_dm_map_npc_values\(uuid\)\s+TO authenticated,service_role/);
 assert.doesNotMatch(sql,/^\s*GRANT\s+SELECT\s+ON\s+(?:TABLE\s+)?public\.map_tokens/gim);
 assert.match(app,/db\.rpc\('get_dm_map_npc_values',\{p_map:mapId\}\)/);
 assert.match(app,/db\.rpc\('get_npc_token_values',\{p_token:sourceId\}\)/);
});
