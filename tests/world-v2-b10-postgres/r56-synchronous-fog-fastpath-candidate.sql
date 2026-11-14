-- B10-R18-56: CAUTION — TEST-ONLY PostgreSQL 17 fast-path experiment.
-- Function body derived exactly from pinned live fog source MD5
-- ee3356af321fec1a3e167a75c6245e86; only added guarded branches.
-- No production migration / no browser access / no feature flags.
\set ON_ERROR_STOP on
DO $r56_guard$ BEGIN
 IF current_database()<>'world_v2_b10_r05'
 OR to_regprocedure('forge_visibility.r56_original_fog_frame(uuid,uuid)') IS NULL
 OR to_regclass('forge_visibility.viewer_fog_snapshots') IS NULL
 OR to_regprocedure('public.b08_assert(boolean,text)') IS NULL
 THEN RAISE EXCEPTION 'R56 never execute candidate outside disposable source-real fixture';END IF;
END $r56_guard$;
CREATE OR REPLACE FUNCTION forge_visibility.authorized_viewer_fog_frame(p_map uuid, p_viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 m record;scene jsonb;is_dm boolean;actor uuid:=p_viewer;
 fog_on boolean;collision_on boolean;shared boolean;rev bigint;w int;h int;
 permission_generation bigint:=0;
 seen jsonb:='[]'::jsonb;memory jsonb:='[]'::jsonb;
 -- R56 source-real candidate: only fast-path conditions which imply the
 -- ORIGINAL source's ray/lighting result for every candidate cell.
 r56_open_los boolean:=false;r56_has_light boolean:=true;
 r56_no_lights boolean:=false;r56_ambient double precision;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m from public.battle_maps bm where bm.id=p_map;
 if not found or not exists(
 select 1 from public.campaign_members cm
 join public.campaigns camp on camp.id=cm.campaign_id
 left join public.campaign_player_maps pm
  on pm.campaign_id=cm.campaign_id and pm.user_id=cm.user_id
 where cm.campaign_id=m.campaign_id and cm.user_id=actor and
  (cm.role='dm' or
   (cm.role='player' and coalesce(pm.map_id,camp.active_map_id)=p_map))
 )
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
 select coalesce(g.generation,0) into permission_generation
 from forge_visibility.navigation_permission_generations g where g.map_id=p_map;
 permission_generation:=coalesce(permission_generation,0);
 select live into scene from public.map_environments where map_id=p_map;
 shared:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 is_dm:=exists(select 1 from public.campaign_members cm where
  cm.campaign_id=m.campaign_id and cm.user_id=actor and cm.role='dm');
 if fog_on and (scene is null or jsonb_typeof(scene->'objects')<>'array')
 then raise exception 'Published fog unavailable';end if;
 if not fog_on or is_dm then
  return jsonb_build_object('mapId',p_map,'width',w,'height',h,
   'revision',rev,'enabled',fog_on,'collisionEnabled',collision_on,'partyShared',shared,
   'permissionGeneration',permission_generation,
   'visible',seen,'explored',memory);
 end if;
 -- Materialize only the eight permitted viewers once per snapshot. The
 -- old per-cell point_visible() reloaded map, membership, scene and
 -- viewer rows repeatedly for every candidate fog cell.
 -- Preserve the original fail-closed behavior on malformed sight inputs.
 -- A bad ray or lighting evaluation must never disclose unauthorized cells.
 begin
 -- Source ray_blocked returns FALSE for a well-formed <=120-element scene
 -- with zero wall/door/window objects. Malformed objects, unknown type or
 -- over-limit objects MUST run the original fail-closed ray helper.
 SELECT coalesce(bool_and(
   CASE WHEN jsonb_typeof(item)='object' AND
             jsonb_typeof(item->'type')='string' AND
             item->>'type' NOT IN ('wall','door','window')
        THEN true ELSE false END),true),
        coalesce(bool_or(item->>'type'='light'),false)
 INTO r56_open_los,r56_has_light
 FROM jsonb_array_elements(scene->'objects') AS objects(item);
 r56_open_los:=r56_open_los AND
  jsonb_array_length(scene->'objects')<=120;
 -- Without authored scene lights AND without equipped torch sources,
 -- source is_lit only checks ambient and the cell-to-source distance.
 -- Any type='light' is conservatively treated as a light even if disabled.
 r56_no_lights:=NOT r56_has_light AND NOT EXISTS(
  SELECT 1 FROM public.campaign_tool_map_tokens tool
  WHERE tool.map_id=p_map AND tool.kind='torch' AND tool.light_enabled);
 r56_ambient:=coalesce((scene->>'ambient')::double precision,25);
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
    and (r56_open_los OR NOT forge_visibility.ray_blocked(scene,
     src.x+src.span_x/2.0,src.y+src.span_y/2.0,
     cx+0.5,cy+0.5,'vision',src.viewer_values))
    and (CASE
     WHEN r56_ambient>=50 THEN true
     WHEN r56_no_lights THEN
       ((r56_ambient>0 AND sqrt(
          power(cx+0.5-(src.x+src.span_x/2.0),2)+
          power(cy+0.5-(src.y+src.span_y/2.0),2))<=6)
        OR sqrt(
          power(cx+0.5-(src.x+src.span_x/2.0),2)+
          power(cy+0.5-(src.y+src.span_y/2.0),2))<=1.5)
     ELSE forge_visibility.is_lit(p_map,scene,
       src.x+src.span_x/2.0,src.y+src.span_y/2.0,
       cx+0.5,cy+0.5,m.grid_size)
    END)
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
  'permissionGeneration',permission_generation,
  'visible',seen,'explored',coalesce(memory,'[]'::jsonb));
end $function$;

REVOKE ALL ON FUNCTION forge_visibility.authorized_viewer_fog_frame(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_visibility.r56_original_fog_frame(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
