import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canUseViewerFogProtocol,isMissingViewerFogRpc} from '../src/ViewerFogProtocol.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('staging/sql-candidates/per_viewer_visibility_v2.sql');
const undo=read('staging/sql-candidates/rollback_per_viewer_visibility_v2.sql');
const hook=read('src/useAuthorizedMapFog.js');

test('the per-viewer fog protocol requires an explicit server version and safe revision',()=>{
 const valid={protocolVersion:2,revision:0,enabled:true,partyShared:false};
 assert.equal(canUseViewerFogProtocol(valid),true);
 for(const changed of [
  {...valid,protocolVersion:1},{...valid,revision:-1},
  {...valid,revision:'3'},{...valid,revision:NaN},
  {...valid,enabled:'true'}, {...valid,partyShared:1},null,[valid]
 ])assert.equal(canUseViewerFogProtocol(changed),false);
});

test('only a missing RPC may select the older already-authorized fog protocol',()=>{
 assert.equal(isMissingViewerFogRpc({code:'PGRST202'}),true);
 assert.equal(isMissingViewerFogRpc({code:'42883'}),true);
 for(const code of ['42501','PGRST116','PGRST301','57014','XX000','']) 
  assert.equal(isMissingViewerFogRpc({code}),false);
});

test('the per-viewer Realtime table is read-only and independently RLS isolated',()=>{
 assert.match(sql,/create table if not exists public\.map_viewer_visibility_ticks/);
 assert.match(sql,/id uuid primary key default pg_catalog\.gen_random_uuid\(\)/);
 assert.match(sql,/unique\(map_id,user_id\)/);
 assert.match(sql,/alter table public\.map_viewer_visibility_ticks enable row level security/);
 assert.match(sql,/revoke all on table public\.map_viewer_visibility_ticks from public,anon,authenticated/);
 assert.match(sql,/grant select on table public\.map_viewer_visibility_ticks to authenticated/);
 assert.match(sql,/for select to authenticated\s+using \(user_id=\(select auth\.uid\(\)\) and\s+public\.can_view_campaign_map\(campaign_id,map_id\)\)/);
 assert.doesNotMatch(sql,/grant (?:all|insert|update|delete) on table public\.map_viewer_visibility_ticks to authenticated/i);
 assert.match(sql,/alter publication supabase_realtime\s+add table public\.map_viewer_visibility_ticks/);
});

test('all global map mutations still emit legacy and per-viewer authorization ticks',()=>{
 assert.match(sql,/function forge_visibility\.bump_tick\(p_map uuid\)/);
 assert.match(sql,/insert into public\.map_visibility_ticks/);
 assert.match(sql,/perform forge_visibility\.bump_viewer_ticks\(p_map,null\)/);
 assert.match(sql,/function forge_visibility\.bump_tick_scoped/);
 assert.match(sql,/perform forge_visibility\.bump_viewer_ticks\(p_map,p_viewers\)/);
 assert.match(sql,/on conflict\(map_id,user_id\) do update set\s+revision=public\.map_viewer_visibility_ticks\.revision\+1/);
});

test('only pure coordinate changes can use conservative scoped visibility',()=>{
 assert.match(sql,/to_jsonb\(old\)-'x'-'y'-'updated_at'/);
 assert.match(sql,/to_jsonb\(new\)-'x'-'y'-'updated_at'/);
 assert.match(sql,/if pure_movement and exists\(/);
 assert.match(sql,/and r\.fog_enforced=true/);
 assert.match(sql,/viewers_affected_by_token_move\(old,new\)/);
 assert.match(sql,/bump_tick_scoped\(new\.map_id,impacted\)/);
 assert.match(sql,/elsif not pure_movement then\s+perform forge_visibility\.bump_tick\(new\.map_id\)/);
 assert.match(sql,/old\.character_id is distinct from new\.character_id/);
 assert.match(sql,/perform forge_visibility\.bump_tick\(old\.map_id\)/);
});

test('server never skips players if shared sight, a carried light or nearby source could change',()=>{
 assert.match(sql,/cm\.role='player'/);
 assert.match(sql,/coalesce\(pm\.map_id,c\.active_map_id\)=p_new\.map_id/);
 assert.match(sql,/p_new\.owner_id=v\.user_id/);
 assert.match(sql,/party_shared and p_new\.visible/);
 assert.match(sql,/src_owner\.role='player'/);
 assert.match(sql,/held_by_token_id=p_new\.id and t\.light_enabled and t\.kind='torch'/);
 assert.match(sql,/then return null;end if;/);
 assert.match(sql,/rate\.last_sent>statement_timestamp\(\)-interval '2 seconds'/);
 assert.match(sql,/src\.visible and src\.owner_id is not null/);
 assert.match(sql,/return coalesce\(candidate,array\[\]::uuid\[\]\)/);
 assert.match(sql,/exception when others then[\s\S]*?return null/);
});

test('authorized v2 RPC reuses the original RLS-protected fog and rejects racing revisions',()=>{
 assert.match(sql,/function public\.get_authorized_map_fog_v2\(p_map uuid\)/);
 assert.match(sql,/actor uuid:=auth\.uid\(\)/);
 assert.match(sql,/result:=public\.get_authorized_map_fog\(p_map\)/);
 assert.match(sql,/raise exception 'Viewer visibility publication unavailable'/);
 assert.match(sql,/before_rev is distinct from after_rev then\s+raise exception/);
 assert.match(sql,/'protocolVersion',2,'revision',after_rev/);
 assert.match(sql,/revoke all on function public\.get_authorized_map_fog_v2\(uuid\)\s+from public,anon/);
 assert.match(sql,/grant execute on function public\.get_authorized_map_fog_v2\(uuid\) to authenticated/);
 assert.match(sql,/revoke all on function forge_visibility\.viewers_affected_by_token_move\(/);
});

test('the client switches streams only after a confirmed server v2 frame and fails closed',()=>{
 assert.match(hook,/!isDM&&viewerRpcSupported\.current!==false/);
 assert.match(hook,/db\.rpc\('get_authorized_map_fog_v2'/);
 assert.match(hook,/if\(!canUseViewerFogProtocol\(data\)\)throw Error/);
 assert.match(hook,/if\(!isMissingViewerFogRpc\(viewerError\)\)throw viewerError/);
 assert.match(hook,/db\.rpc\('get_authorized_map_fog'/);
 assert.match(hook,/validated\.current=safe/);
 assert.match(hook,/setScope\(previous=>/);
 assert.match(hook,/event:'INSERT',schema:'public',\s+table:'map_viewer_visibility_ticks',filter:'user_id=eq\.'\+userId/);
 assert.match(hook,/event:'UPDATE',schema:'public',\s+table:'map_viewer_visibility_ticks',filter:'user_id=eq\.'\+userId/);
 assert.match(hook,/table:'map_visibility_ticks',filter:'map_id=eq\.'\+mapId/);
 assert.doesNotMatch(hook,/event:'(?:\*|DELETE)',schema:'public',\s+table:'map_viewer_visibility_ticks'/);
 assert.match(hook,/if\(invalidate\(event\)&&document\.visibilityState==='visible'\)changed\.request\(\)/);
 assert.match(hook,/setFrame\(previous=>previous\?fogFrameDuringRefresh\(previous,mapId\):previous\)/);
 assert.match(hook,/if\(state==='SUBSCRIBED'\)/);
 assert.match(hook,/state==='CHANNEL_ERROR'\|\|state==='TIMED_OUT'/);
 assert.match(read('src/TabletopApp.jsx'),/useAuthorizedMapFog\(\{db,campaignId:activeId,mapId:selectedMap,userId:user,isDM/);
});

test('rollback restores global functions and has no client-visible access to private state',()=>{
 assert.match(undo,/function forge_visibility\.bump_tick\(p_map uuid\)/i);
 assert.match(undo,/function forge_visibility\.tick_tokens\(\)/i);
 assert.match(undo,/drop function if exists public\.get_authorized_map_fog_v2\(uuid\)/);
 assert.match(undo,/drop function if exists forge_visibility\.viewers_affected_by_token_move/);
 assert.match(undo,/drop table if exists public\.map_viewer_visibility_ticks/);
 assert.match(undo,/alter publication supabase_realtime\s+drop table public\.map_viewer_visibility_ticks/);
 assert.doesNotMatch(sql,/\bgrant\s+.*\btoken\b.*\bauthenticated\b/i);
});
