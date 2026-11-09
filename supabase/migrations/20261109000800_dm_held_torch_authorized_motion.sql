-- WP4: Preserve existing authorized lighting calculations and only
-- correct the holder motion-source restriction for legitimate DM movement.
-- Migrated from current live function definitions; no production SQL applied.
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
  select case when t.id is null then coalesce(tool_rate.last_x,p.x)+0.5
    else coalesce(rate.last_x,t.x)+t.span_x/2.0 end as cx,
   case when t.id is null then coalesce(tool_rate.last_y,p.y)+0.5
    else coalesce(rate.last_y,t.y)+t.span_y/2.0 end as cy,
   p.light_bright,p.light_dim
  from public.campaign_tool_map_tokens p
  left join public.map_tokens t on t.id=p.held_by_token_id
   and t.map_id=p_map and t.visible
  -- Latest authorized holder location may be moved by its owning player
  -- OR by the campaign DM. Never accept a random actor's preview row.
  left join lateral(
   select r.last_x,r.last_y
   from forge_visibility.movement_preview_rates r
   where r.piece_id=t.id and r.kind='token' and r.map_id=p_map
    and r.base_x=t.x and r.base_y=t.y
    and r.last_sent>statement_timestamp()-interval '2 seconds'
    and (r.actor_id=t.owner_id or exists(
     select 1 from public.campaign_members cm
     where cm.campaign_id=p.campaign_id and cm.user_id=r.actor_id
      and cm.role='dm'))
   order by r.last_sent desc limit 1
  )rate on true
  left join lateral(
   select r.last_x,r.last_y from forge_visibility.movement_preview_rates r
   where r.piece_id=p.issue_id and r.map_id=p_map and r.kind='tool'
    and r.base_x=p.x and r.base_y=p.y
    and r.last_sent>statement_timestamp()-interval '2 seconds'
   order by r.last_sent desc limit 1
  )tool_rate on true
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


CREATE OR REPLACE FUNCTION public.get_authorized_map_light_masks(p_map uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid:=auth.uid();map_row record;scene jsonb;fog_on boolean;
 frame jsonb;seen jsonb;revision bigint;
 width integer;height integer;source record;
 cx double precision;cy double precision;radius double precision;
 lit_cells jsonb; sources jsonb:='[]'::jsonb;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into map_row
  from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(map_row.campaign_id,p_map)
 then raise exception 'Map unavailable';end if;
 if map_row.grid_size is null or map_row.grid_size<=0
 then raise exception 'Invalid map grid';end if;
 width:=floor(map_row.width/map_row.grid_size);
 height:=floor(map_row.height/map_row.grid_size);
 if width not between 1 and 128 or height not between 1 and 128
 then raise exception 'Light maps support at most 128 cells per axis';end if;
 select coalesce(r.fog_enforced,false) into fog_on
  from forge_visibility.map_rules r where r.map_id=p_map;
 fog_on:=coalesce(fog_on,false);
 select e.live into scene from public.map_environments e where e.map_id=p_map;
 select coalesce(t.revision,0) into revision
  from public.map_visibility_ticks t where t.map_id=p_map;
 revision:=coalesce(revision,0);
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or
   jsonb_array_length(scene->'objects')>120 then
  return jsonb_build_object('mapId',p_map,'revision',revision,
   'width',width,'height',height,'masks',sources);
 end if;
 -- The DM uses local prepared artwork, not this player-only sanitized feed.
 if public.is_campaign_dm(map_row.campaign_id) then
  return jsonb_build_object('mapId',p_map,'revision',revision,
   'width',width,'height',height,'masks',sources);
 end if;
 if fog_on then
  -- Own authorized snapshot: any returned torch shadow is intersected with
  -- server-calculated LOS, even when source light extends around wall ends.
  frame:=public.get_authorized_map_fog(p_map);
  if frame->>'enabled'<>'true' then raise exception 'Fog unavailable';end if;
  seen:=coalesce(frame->'visible','[]'::jsonb);
 else
  seen:='[]'::jsonb;
 end if;
 for source in
  select p.issue_id,p.map_id,p.kind,p.light_enabled,p.light_bright,
   p.light_dim,p.span,
   case when holder.id is null then coalesce(tool_rate.last_x,p.x)+0.5
    else coalesce(rate.last_x,holder.x)+holder.span_x/2.0 end as cx,
   case when holder.id is null then coalesce(tool_rate.last_y,p.y)+0.5
    else coalesce(rate.last_y,holder.y)+holder.span_y/2.0 end as cy
  from public.campaign_tool_map_tokens p
  left join public.map_tokens holder on holder.id=p.held_by_token_id
   and holder.map_id=p_map and holder.visible
  -- Latest authorized holder location may be moved by its owning player
  -- OR by the campaign DM. Never accept a random actor's preview row.
  left join lateral(
   select r.last_x,r.last_y
   from forge_visibility.movement_preview_rates r
   where r.piece_id=holder.id and r.kind='token' and r.map_id=p_map
    and r.base_x=holder.x and r.base_y=holder.y
    and r.last_sent>statement_timestamp()-interval '2 seconds'
    and (r.actor_id=holder.owner_id or exists(
     select 1 from public.campaign_members cm
     where cm.campaign_id=p.campaign_id and cm.user_id=r.actor_id
      and cm.role='dm'))
   order by r.last_sent desc limit 1
  )rate on true
  left join lateral(
   select r.last_x,r.last_y from forge_visibility.movement_preview_rates r
   where r.piece_id=p.issue_id and r.map_id=p_map and r.kind='tool'
    and r.base_x=p.x and r.base_y=p.y
    and r.last_sent>statement_timestamp()-interval '2 seconds'
   order by r.last_sent desc limit 1
  )tool_rate on true
  where p.map_id=p_map and p.campaign_id=map_row.campaign_id
   and p.kind='torch' and p.light_enabled
   and (p.held_by_token_id is null or holder.id is not null)
  order by p.issue_id limit 16
 loop
  cx:=source.cx;cy:=source.cy;
  radius:=(source.light_bright+source.light_dim)/5.0;
  if radius<=0 or radius>48 or
   not forge_visibility.point_visible(p_map,cx,cy,actor) then continue;end if;
  select coalesce(jsonb_agg(index_cell order by index_cell),'[]'::jsonb)
  into lit_cells
  from (
   select x+y*width as index_cell,x,y
   from generate_series(greatest(0,floor(cx-radius)::int),
    least(width-1,ceil(cx+radius)::int)) x
   cross join generate_series(greatest(0,floor(cy-radius)::int),
    least(height-1,ceil(cy+radius)::int)) y
  ) nearby
  where (not fog_on or seen @> jsonb_build_array(index_cell))
   and (x+0.5-cx)^2+(y+0.5-cy)^2<=radius^2
   and not forge_visibility.ray_blocked(scene,cx,cy,
     x+0.5,y+0.5,'light');
  sources:=sources||jsonb_build_array(jsonb_build_object(
   'id',source.issue_id,'cells',lit_cells));
 end loop;
 return jsonb_build_object('mapId',p_map,'revision',revision,
  'width',width,'height',height,'masks',sources);
exception when others then
 -- Never silently fall back to the unoccluded client radial gradient.
 return jsonb_build_object('mapId',p_map,'revision',coalesce(revision,0),
  'width',coalesce(width,1),'height',coalesce(height,1),'masks','[]'::jsonb);
end $function$;

