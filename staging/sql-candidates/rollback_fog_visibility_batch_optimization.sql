-- STAGING ROLLBACK SOURCE, NOT AN APPLIED MIGRATION.
-- Production function snapshot as of 2026-11-07, before fog batch optimization.
-- Use only after explicit rollback authorization and review.
-- Do not run automatically as part of deployment or migration replay.
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
 with sources as (
  select t.x,t.y,t.span_x,t.span_y from public.map_tokens t
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
  where forge_visibility.point_visible(p_map,cx+0.5,cy+0.5,actor)
 )
 select coalesce(jsonb_agg(cell order by cell),'[]'::jsonb) into seen
 from visible_indices;
 insert into forge_visibility.exploration(campaign_id,map_id,user_id,explored_cells)
 values(m.campaign_id,p_map,actor,seen)
 on conflict(map_id,user_id) do update
  set explored_cells=(select coalesce(jsonb_agg(v order by v),'[]'::jsonb)
   from(select distinct value::integer v from jsonb_array_elements_text(
     forge_visibility.exploration.explored_cells || excluded.explored_cells)) unique_cells),
   revision=forge_visibility.exploration.revision+1,updated_at=now();
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
