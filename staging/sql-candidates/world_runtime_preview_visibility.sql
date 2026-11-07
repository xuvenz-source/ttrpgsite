-- STAGING CANDIDATE ONLY. Do not apply without designer's release approval.
-- Prerequisite: world_runtime_private_observer_motion.sql.
-- Existing RLS authorization and eight-source visibility are preserved.
-- A player's validated fresh movement preview may stand in for that player's
-- canonical coordinates ONLY while its base is still the saved token location.
-- This updates sight/exploration without updating map_tokens or ticking map
-- visibility on every pointer movement. Authentication comes from the RPC.
-- A failed or expired preview reverts to the authoritative saved token row.
begin;

-- Keep holder-carried torch light synchronized with validated preview positions.
CREATE OR REPLACE FUNCTION forge_visibility.is_lit(p_map uuid, scene jsonb, viewer_x double precision, viewer_y double precision, target_x double precision, target_y double precision, grid_size integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 ambient double precision; source jsonb;
 sx double precision;sy double precision;reach double precision;
 light record;
begin
 ambient:=coalesce((scene->>'ambient')::double precision,25);
 if ambient>=50 then return true;end if;
 if ambient>0 and sqrt((target_x-viewer_x)^2+(target_y-viewer_y)^2)<=6
 then return true;end if;
 if sqrt((target_x-viewer_x)^2+(target_y-viewer_y)^2)<=1.5
 then return true;end if;
 for source in select value from jsonb_array_elements(scene->'objects')
  where value->>'type'='light' and value->>'enabled'<>'false' limit 60 loop
  sx:=(source->>'x')::double precision;sy:=(source->>'y')::double precision;
  reach:=(coalesce((source->>'bright')::double precision,0)+
   coalesce((source->>'dim')::double precision,0))/5;
  if reach>0 and (target_x-sx)^2+(target_y-sy)^2<=reach^2 and
   not forge_visibility.ray_blocked(scene,sx,sy,target_x,target_y,'light')
  then return true;end if;
 end loop;
 for light in
  select case when t.id is null then p.x+0.5
    else coalesce(rate.last_x,t.x)+t.span_x/2.0 end as cx,
   case when t.id is null then p.y+0.5
    else coalesce(rate.last_y,t.y)+t.span_y/2.0 end as cy,
   p.light_bright,p.light_dim
  from public.campaign_tool_map_tokens p
  left join public.map_tokens t on t.id=p.held_by_token_id
   and t.map_id=p_map and t.visible
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  where p.map_id=p_map and p.light_enabled and p.kind='torch'
   and (p.held_by_token_id is null or t.id is not null)
  limit 50
 loop
  sx:=light.cx;sy:=light.cy;
  reach:=(light.light_bright+light.light_dim)/5.0;
  if reach>0 and (target_x-sx)^2+(target_y-sy)^2<=reach^2 and
   not forge_visibility.ray_blocked(scene,sx,sy,target_x,target_y,'light')
  then return true;end if;
 end loop;
 return false;
exception when others then return false;
end $function$;

create or replace function forge_visibility.point_visible(p_map uuid,
 target_x double precision,target_y double precision,actor uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare m record;scene jsonb;enabled boolean;party boolean;viewer record;
 sx double precision;sy double precision;val jsonb;dx double precision;dy double precision;
begin
 if actor is null or actor is distinct from auth.uid() then return false;end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(m.campaign_id,p_map) then return false;end if;
 if not exists(select 1 from forge_visibility.map_rules r
  where r.map_id=p_map and r.fog_enforced) then return true;end if;
 select live into scene from public.map_environments where map_id=p_map;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or
   m.grid_size<=0 then return false;end if;
 if target_x<0 or target_y<0 or target_x>m.width/m.grid_size or
   target_y>m.height/m.grid_size then return false;end if;
 party:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 for viewer in
  select coalesce(rate.last_x,t.x) as x,
   coalesce(rate.last_y,t.y) as y,t.span_x,t.span_y,
   t.npc_values,ch.field_values
  from public.map_tokens t
  left join public.characters ch on ch.id=t.character_id and ch.campaign_id=m.campaign_id
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  where t.map_id=p_map and t.campaign_id=m.campaign_id and t.visible
   and (t.owner_id=actor or
    (party and t.owner_id is not null and exists(
      select 1 from public.campaign_members cm
      where cm.campaign_id=m.campaign_id and cm.user_id=t.owner_id and cm.role='player')))
  order by t.id limit 8
 loop
  sx:=viewer.x+viewer.span_x/2.0;sy:=viewer.y+viewer.span_y/2.0;
  dx:=target_x-sx;dy:=target_y-sy;
  if dx*dx+dy*dy>144 then continue;end if;
  val:=coalesce(viewer.field_values,viewer.npc_values,'{}'::jsonb);
  if not forge_visibility.ray_blocked(scene,sx,sy,target_x,target_y,'vision',val)
    and forge_visibility.is_lit(p_map,scene,sx,sy,target_x,target_y,m.grid_size)
  then return true;end if;
 end loop;
 return false;
exception when others then return false;
end $$;

CREATE OR REPLACE FUNCTION public.get_authorized_map_fog(p_map uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 m record;scene jsonb;is_dm boolean;actor uuid:=auth.uid();
 fog_on boolean;collision_on boolean;shared boolean;rev bigint;w int;h int;
 seen jsonb:='[]'::jsonb;memory jsonb:='[]'::jsonb;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(m.campaign_id,p_map)
 then raise exception 'Map unavailable';end if;
 if m.grid_size<=0 then raise exception 'Invalid map grid';end if;
 w:=floor(m.width/m.grid_size);h:=floor(m.height/m.grid_size);
 select r.fog_enforced,r.collision_enforced into fog_on,collision_on from forge_visibility.map_rules r where r.map_id=p_map;
 fog_on:=coalesce(fog_on,false);collision_on:=coalesce(collision_on,false);
 if fog_on and (w not between 1 and 128 or h not between 1 and 128)
 then raise exception 'Fog maps support at most 128 cells per axis';end if;
 if not fog_on then w:=greatest(1,least(128,w));h:=greatest(1,least(128,h));end if;
 select coalesce(t.revision,0) into rev from public.map_visibility_ticks t where t.map_id=p_map;
 rev:=coalesce(rev,0);
 select live into scene from public.map_environments where map_id=p_map;
 shared:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 is_dm:=public.is_campaign_dm(m.campaign_id);
 if fog_on and (scene is null or jsonb_typeof(scene->'objects')<>'array')
 then raise exception 'Published fog unavailable';end if;
 if not fog_on or is_dm then
  return jsonb_build_object('mapId',p_map,'width',w,'height',h,
   'revision',rev,'enabled',fog_on,'collisionEnabled',collision_on,'partyShared',shared,
   'visible',seen,'explored',memory);
 end if;
 -- Materialize only the eight permitted viewers once per snapshot. The
 -- old per-cell point_visible() reloaded map, membership, scene and
 -- viewer rows repeatedly for every candidate fog cell.
 -- Preserve the original fail-closed behavior on malformed sight inputs.
 -- A bad ray or lighting evaluation must never disclose unauthorized cells.
 begin
 with sources as materialized (
  select coalesce(rate.last_x,t.x) as x,
   coalesce(rate.last_y,t.y) as y,t.span_x,t.span_y,
   coalesce(ch.field_values,t.npc_values,'{}'::jsonb) as viewer_values
  from public.map_tokens t
  left join public.characters ch
   on ch.id=t.character_id and ch.campaign_id=m.campaign_id
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  where t.map_id=p_map and t.visible and t.campaign_id=m.campaign_id
   and (t.owner_id=actor or
    (shared and t.owner_id is not null and exists(
      select 1 from public.campaign_members cm
      where cm.campaign_id=m.campaign_id and cm.user_id=t.owner_id and cm.role='player')))
  order by t.id limit 8
 ), nearby as (
  select distinct gx.x as cx,gy.y as cy from sources src
  cross join lateral generate_series(
   greatest(0,src.x-12),least(w-1,src.x+src.span_x::int+12)) as gx(x)
  cross join lateral generate_series(
   greatest(0,src.y-12),least(h-1,src.y+src.span_y::int+12)) as gy(y)
 ), visible_indices as (
  select (cx+cy*w) as cell from nearby
  where exists (
   select 1 from sources src
   where power(cx+0.5-(src.x+src.span_x/2.0),2)
       + power(cy+0.5-(src.y+src.span_y/2.0),2)<=144
    and not forge_visibility.ray_blocked(scene,
     src.x+src.span_x/2.0,src.y+src.span_y/2.0,
     cx+0.5,cy+0.5,'vision',src.viewer_values)
    and forge_visibility.is_lit(p_map,scene,
     src.x+src.span_x/2.0,src.y+src.span_y/2.0,
     cx+0.5,cy+0.5,m.grid_size)
  )
 )
 select coalesce(jsonb_agg(cell order by cell),'[]'::jsonb) into seen
 from visible_indices;
 exception when others then
  seen:='[]'::jsonb;
 end;
 -- Skip idempotent exploration writes: moving within already explored
 -- territory must not generate an UPDATE/WAL entry per fog refresh.
 -- JSONB @> compares the complete numeric array, not string keys.
 if jsonb_array_length(seen)>0 and not exists(
  select 1 from forge_visibility.exploration e
  where e.map_id=p_map and e.user_id=actor and e.explored_cells @> seen
 ) then
  insert into forge_visibility.exploration(campaign_id,map_id,user_id,explored_cells)
  values(m.campaign_id,p_map,actor,seen)
  on conflict(map_id,user_id) do update
   set explored_cells=(select coalesce(jsonb_agg(v order by v),'[]'::jsonb)
    from(select distinct value::integer v from jsonb_array_elements_text(
      forge_visibility.exploration.explored_cells || excluded.explored_cells)) unique_cells),
    revision=forge_visibility.exploration.revision+1,updated_at=now();
 end if;
 if shared then
  select coalesce(jsonb_agg(cell order by cell),'[]'::jsonb) into memory
  from (
   select distinct value::integer as cell
   from forge_visibility.exploration e
   join public.campaign_members cm on cm.campaign_id=e.campaign_id and cm.user_id=e.user_id
   cross join lateral jsonb_array_elements_text(e.explored_cells) value
   where e.map_id=p_map and e.campaign_id=m.campaign_id
  ) all_cells;
 else
  select explored_cells into memory from forge_visibility.exploration
   where map_id=p_map and user_id=actor;
 end if;
 return jsonb_build_object('mapId',p_map,'width',w,'height',h,
  'revision',rev,'enabled',true,'collisionEnabled',collision_on,'partyShared',shared,
  'visible',seen,'explored',coalesce(memory,'[]'::jsonb));
end $function$;

commit;
