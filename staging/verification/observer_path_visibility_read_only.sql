-- Read-only post-release acceptance probe; DO NOT run until candidate SQL is
-- compiled/applied by a designer-approved production migration.
-- Run as privileged database maintenance operator on existing test campaigns.
-- Returns comparisons rather than mutating gameplay data. Keep a small sample.

-- The newly introduced helper must not be callable by browser-facing roles.
select
 has_function_privilege(
  'anon','forge_visibility.observer_path_status(uuid,uuid,double precision,double precision,double precision,double precision,integer)','EXECUTE'
 ) as anonymous_can_execute,
 has_function_privilege(
  'authenticated','forge_visibility.observer_path_status(uuid,uuid,double precision,double precision,double precision,double precision,integer)','EXECUTE'
 ) as player_can_execute;

-- Compare one-step LOS semantics against the *deployed* single-point helper.
-- All recipients and coordinates are sourced from existing DB rows; none
-- is accepted from untrusted browser or an ad-hoc client preview.
with samples as (
 select t.map_id,m.campaign_id,t.x::double precision+t.span_x/2.0 as x,
  t.y::double precision+t.span_y/2.0 as y
 from public.map_tokens t
 join public.battle_maps m on m.id=t.map_id
 where t.visible and t.x+t.span_x+1<=floor(m.width/nullif(m.grid_size,0))
 order by t.map_id,t.id limit 8
), cases as (
 select s.map_id,cm.user_id,s.x,s.y
 from samples s
 join public.campaign_members cm on cm.campaign_id=s.campaign_id
 order by s.map_id,cm.user_id limit 24
), expected as (
 select c.*,
 case
  when not forge_visibility.observer_can_see(c.map_id,c.user_id,c.x,c.y)
   then 0
  when forge_visibility.observer_can_see(c.map_id,c.user_id,c.x+1,c.y)
   then 1
  else 2
 end as old_path_status
 from cases c
)
select map_id,user_id,old_path_status,
 forge_visibility.observer_path_status(
  map_id,user_id,x,y,x+1,y,1
 ) as new_path_status
from expected
order by map_id,user_id;
-- Every row should have old_path_status = new_path_status.
-- Separately verify routes with 2..12 samples, forbidden 13+ samples,
-- fog toggles, held lights, current-map assignment and private hide payloads.
