import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging/sql-candidates/observer_path_visibility_single_snapshot.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../staging/sql-candidates/rollback_observer_path_visibility_single_snapshot.sql',import.meta.url),'utf8');
const dispatchStart=sql.search(/create or replace function forge_visibility\.dispatch_movement_preview\(/i);
assert.ok(dispatchStart>=0,'Staged SQL must contain the complete server dispatcher');
const dispatch=sql.slice(dispatchStart);

test('staged observer optimization cannot deploy itself or silently change the public movement API',()=>{
 assert.match(sql,/STAGING CANDIDATE ONLY.*DO NOT APPLY/);
 assert.doesNotMatch(sql,/alter table|create policy|grant execute.*authenticated/i);
 assert.match(dispatch,/security definer\s+set search_path TO ''/i);
 assert.match(dispatch,/returns boolean/i);
 assert.match(dispatch,/p_map uuid, p_kind text, p_piece uuid, p_x integer, p_y integer, p_seq bigint, p_ignore_collision boolean/);
 assert.match(sql,/revoke all on function forge_visibility\.observer_path_status/);
 assert.match(sql,/from public,anon,authenticated/);
});

test('viewer snapshot is private, bounded, server-attested and reused across entire observer path',()=>{
 assert.match(sql,/function forge_visibility\.observer_path_status\(/);
 assert.match(sql,/with sources as materialized\s*\(/i);
 assert.match(sql,/order by t\.id limit 8/);
 assert.match(sql,/from pg_catalog\.generate_series\(0/);
 assert.match(sql,/p_steps>12/);
 assert.match(sql,/forge_visibility\.ray_blocked\(scene/);
 assert.match(sql,/forge_visibility\.is_lit\(p_map,scene/);
 assert.match(sql,/where cm\.campaign_id=m\.campaign_id and cm\.user_id=t\.owner_id/);
 assert.match(sql,/party and t\.owner_id is not null/);
 assert.match(sql,/rate\.last_sent>statement_timestamp\(\)-interval '2 seconds'/);
 assert.doesNotMatch(sql,/return jsonb_build_object\([^;]*sheet_values/s);
});

test('recipient checks preserve actor/DM/map authorization and hidden-source protection',()=>{
 assert.match(sql,/where cm\.campaign_id=m\.campaign_id and cm\.user_id=p_recipient/);
 assert.match(sql,/if member_role is null then return 0/);
 assert.match(sql,/if member_role='dm' then return case when p_steps<=12 then 1 else 2 end/);
 assert.match(sql,/if p_map is distinct from coalesce\(assigned,active\) then return 0/);
 assert.match(dispatch,/actor uuid:=auth\.uid\(\)/);
 assert.match(dispatch,/not public\.can_view_campaign_map\(m\.campaign_id,p_map\)/);
 assert.match(dispatch,/not dm and \(token\.owner_id is distinct from actor/);
 assert.match(dispatch,/not dm and tool\.owner_id is distinct from actor/);
 assert.match(dispatch,/if p_kind='token' and not token_visible and recipient\.role<>'dm'/);
 assert.match(dispatch,/where cm\.campaign_id=camp and cm\.user_id<>actor/);
 assert.match(dispatch,/order by cm\.user_id limit 32/);
});

test('collision and preview replay protections survive unchanged',()=>{
 for(const guard of [
  /forge_visibility\.wall_passes\(obstacle,attrs,'movement'\)/,
  /forge_visibility\.swept_hits_segment\(/,
  /jsonb_array_length\(scene->'objects'\)>120/,
  /p_ignore_collision and not dm/,
  /last_sent>clock_timestamp\(\)-interval '3 seconds'/,
  /last_seq<p_seq/,
  /last_sent<=\s*excluded\.last_sent-interval '100 milliseconds'/,
  /p_seq>forge_visibility\.movement_preview_rates\.last_seq/,
  /if accepted is null then return false/
 ]) assert.match(dispatch,guard);
 // Only the trusted per-actor rate table changes. Never write map tokens here.
 assert.doesNotMatch(dispatch,/\bupdate public\.map_tokens\b|\bupdate public\.map_visibility_ticks\b/);
});

test('private visibility result carries NO hidden coordinates in hide packet',()=>{
 assert.match(dispatch,/probe:=forge_visibility\.observer_path_status\(/);
 assert.doesNotMatch(dispatch,/forge_visibility\.observer_can_see\(/);
 assert.match(dispatch,/if probe=0 then continue/);
 assert.match(dispatch,/if probe=1 then\s+packet:=jsonb_build_object\('kind',p_kind/);
 assert.match(dispatch,/\x27action\x27,\x27hide\x27\);/);
 const hide=dispatch.match(/else\s+-- If the route or destination is concealed[\s\S]*?end if;/)?.[0];
 assert.ok(hide,'The conceal-only packet must be kept isolated');
 assert.doesNotMatch(hide,/'x',p_x|'y',p_y/);
 assert.match(dispatch,/perform realtime\.send\(packet,'motion',\s*'forge-observer:'/);
 assert.match(dispatch,/exception when others then\s+-- An unavailable broadcast is not authorization to weaken privacy\.\s+return false/);
});

test('SQL candidate can be reverted to the deployed dispatcher and drops helper',()=>{
 assert.match(rollback,/create or replace function forge_visibility\.dispatch_movement_preview\(/i);
 assert.match(rollback,/forge_visibility\.observer_can_see\(/);
 assert.doesNotMatch(rollback,/probe:=forge_visibility\.observer_path_status\(/);
 assert.match(rollback,/drop function if exists forge_visibility\.observer_path_status\(/);
 assert.equal((sql.match(/\$path_status\$/g)||[]).length,2);
 assert.equal((sql.match(/\$function\$/g)||[]).length,2);
 assert.equal((rollback.match(/\$function\$/g)||[]).length,2);
});
