-- STAGING ONLY: trusted, input-bound adaptation of installed observer_path_status.
-- Only public.advance_map_motion_session may call this private helper.
-- p_scene, map bounds and campaign are read from its server-owned session,
-- never client JSON. Current recipient membership/routing and light/vision
-- sources are still rechecked at every accepted segment.
CREATE OR REPLACE FUNCTION forge_visibility.observer_path_status_cached(p_map uuid, p_recipient uuid, p_campaign uuid, p_scene jsonb, p_grid_size integer, p_map_width integer, p_map_height integer, p_x0 double precision, p_y0 double precision, p_x1 double precision, p_y1 double precision, p_steps integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $cached_observer$
declare
 member_role text; assigned uuid; active uuid;
 scene jsonb; party boolean; old_visible boolean:=false; path_visible boolean:=false;
begin
 if p_map is null or p_recipient is null or
    p_x0 is null or p_y0 is null or p_x1 is null or p_y1 is null or
    p_steps is null or p_steps<0 then return 0;end if;
 if p_campaign is null or p_grid_size is null or p_grid_size<=0 or
    p_map_width is null or p_map_height is null or
    p_map_width<=0 or p_map_height<=0 or p_scene is null
 then return 0;end if;
 select cm.role into member_role from public.campaign_members cm
 where cp_campaign=p_campaign and cm.user_id=p_recipient;
 if member_role is null then return 0;end if;
 -- Exactly as observer_can_see: the DM sees regardless of map assignment.
 if member_role='dm' then return case when p_steps<=12 then 1 else 2 end;end if;
 select c.active_map_id into active from public.campaigns c where c.id=p_campaign;
 select pm.map_id into assigned from public.campaign_player_maps pm
 where pp_campaign=p_campaign and pm.user_id=p_recipient;
 if p_map is distinct from coalesce(assigned,active) then return 0;end if;
 -- Fog-disabled players can see any path on their authorized map.
 if not exists(select 1 from forge_visibility.map_rules r
   where r.map_id=p_map and r.fog_enforced)
 then return case when p_steps<=12 then 1 else 2 end;end if;
 if p_grid_size is null or p_grid_size<=0 or
    p_x0<0 or p_y0<0 or
    p_x0>p_map_width or p_y0>p_map_height
 then return 0;end if;
 scene:=p_scene;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' then return 0;end if;
 party:=coalesce((scene->'fog'->>'partyShared')::boolean,false);

 -- Materialize the *same* eight permitted source tokens once and use them
 -- for all path samples. This replaces N full observer_can_see executions.
 -- Always include step zero; a hidden-origin preview may send NOTHING.
 with sources as materialized (
  select coalesce(rate.last_x,t.x)::double precision as x,
   coalesce(rate.last_y,t.y)::double precision as y,
   t.span_x,t.span_y,
   coalesce(ch.field_values,t.npc_values,'{}'::jsonb) as sheet_values
  from public.map_tokens t
  left join public.characters ch on ch.id=t.character_id
   and ch.campaign_id=p_campaign
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  where t.map_id=p_map and t.campaign_id=p_campaign and t.visible
   and (t.owner_id=p_recipient or
    (party and t.owner_id is not null and exists(
      select 1 from public.campaign_members cm
      where cp_campaign=p_campaign and cm.user_id=t.owner_id
       and cm.role='player')))
  order by t.id limit 8
 ), points as (
  select step,
   p_x0+(p_x1-p_x0)*step::double precision/greatest(p_steps,1) as x,
   p_y0+(p_y1-p_y0)*step::double precision/greatest(p_steps,1) as y
  from pg_catalog.generate_series(0,
    case when p_steps>12 then 0 else p_steps end) as step
 ), samples as (
  select waypoint.step,exists(
   select 1 from sources s
   where (waypoint.x-(s.x+s.span_x/2.0))^2+
         (waypoint.y-(s.y+s.span_y/2.0))^2<=144
    and not forge_visibility.ray_blocked(scene,
     s.x+s.span_x/2.0,s.y+s.span_y/2.0,waypoint.x,waypoint.y,
     'vision',s.sheet_values)
    and forge_visibility.is_lit(p_map,scene,
     s.x+s.span_x/2.0,s.y+s.span_y/2.0,waypoint.x,waypoint.y,p_grid_size)
  ) as visible from points waypoint
 )
 select coalesce(bool_or(visible) filter (where step=0),false),
        coalesce(bool_and(visible),false)
 into old_visible,path_visible from samples;
 if not old_visible then return 0;end if;
 if p_steps>12 or not path_visible then return 2;end if;
 return 1;
exception when others then
 -- On malformed scene or any unexpected error, suppress the preview.
 return 0;
end $cached_observer$

revoke all on function forge_visibility.observer_path_status_cached(
 uuid,uuid,uuid,jsonb,integer,integer,integer,
 double precision,double precision,double precision,double precision,integer)
 from public,anon,authenticated;
