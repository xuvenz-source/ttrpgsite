-- Staging only: no production SQL is applied without designer approval.
-- Private viewer ticks carry sanitized server-authorized fog delta/snapshot
-- instead of forcing every existing sprite to vanish during a fresh RPC.
ALTER TABLE public.map_viewer_visibility_ticks
 ADD COLUMN IF NOT EXISTS authorized_frame jsonb;

-- SECURITY DEFINER helper is private and checks explicit recipient membership.
-- Its body mirrors the currently deployed get_authorized_map_fog function.
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
  'permissionGeneration',permission_generation,
  'visible',seen,'explored',coalesce(memory,'[]'::jsonb));
end $function$;


REVOKE ALL ON FUNCTION forge_visibility.authorized_viewer_fog_frame(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION forge_visibility.bump_viewer_ticks(
 p_map uuid,p_viewers uuid[] DEFAULT NULL::uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 recipient record;old_revision bigint;revision_now bigint;
 current_frame jsonb;view_snapshot forge_visibility.viewer_fog_snapshots%rowtype;
 new_sequence bigint;envelope jsonb;visible_diff jsonb;explored_diff jsonb;
 can_delta boolean;
BEGIN
 IF p_map IS NULL THEN RETURN;END IF;
 FOR recipient IN
  SELECT m.id,m.campaign_id,cm.user_id,coalesce(r.fog_enforced,false) fog_on
  FROM public.battle_maps m
  JOIN public.campaigns camp ON camp.id=m.campaign_id
  JOIN public.campaign_members cm ON cm.campaign_id=m.campaign_id
  LEFT JOIN public.campaign_player_maps pm
   ON pm.campaign_id=m.campaign_id AND pm.user_id=cm.user_id
  LEFT JOIN forge_visibility.map_rules r ON r.map_id=m.id
  WHERE m.id=p_map AND cm.role='player'
   AND coalesce(pm.map_id,camp.active_map_id)=m.id
   AND (p_viewers IS NULL OR cm.user_id=ANY(p_viewers))
  ORDER BY cm.user_id LIMIT 32
 LOOP
  -- Serialize two simultaneous sessions for the same viewer without adding
  -- persistent locks or paid infrastructure.
  PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_map::text||':'||recipient.user_id::text,0));
  SELECT tick.revision INTO old_revision
   FROM public.map_viewer_visibility_ticks tick
   WHERE tick.map_id=p_map AND tick.user_id=recipient.user_id FOR UPDATE;
  revision_now:=coalesce(old_revision,0)+1;
  current_frame:=forge_visibility.authorized_viewer_fog_frame(
   p_map,recipient.user_id) ||
   pg_catalog.jsonb_build_object('protocolVersion',2,'revision',revision_now,
    'navigationEnvironmentRevision',coalesce((SELECT e.revision
     FROM public.map_environments e WHERE e.map_id=p_map),0));
  INSERT INTO forge_visibility.viewer_fog_snapshots(map_id,user_id)
   VALUES(p_map,recipient.user_id)
   ON CONFLICT(map_id,user_id) DO NOTHING;
  SELECT * INTO view_snapshot FROM forge_visibility.viewer_fog_snapshots
   WHERE map_id=p_map AND user_id=recipient.user_id FOR UPDATE;
  new_sequence:=view_snapshot.sequence+1;
  can_delta:=view_snapshot.frame?'visible' AND
   view_snapshot.frame?'explored' AND
   view_snapshot.revision=coalesce(old_revision,0) AND
   view_snapshot.frame->>'width'=current_frame->>'width' AND
   view_snapshot.frame->>'height'=current_frame->>'height' AND
   view_snapshot.frame->>'enabled'=current_frame->>'enabled' AND
   view_snapshot.frame->>'partyShared'=current_frame->>'partyShared';
  IF can_delta THEN
   visible_diff:=forge_visibility.fog_cells_diff(
    view_snapshot.frame->'visible',current_frame->'visible');
   explored_diff:=forge_visibility.fog_cells_diff(
    view_snapshot.frame->'explored',current_frame->'explored');
   envelope:=pg_catalog.jsonb_build_object(
    'mode','delta','deltaProtocolVersion',1,'protocolVersion',2,'mapId',p_map,
    'width',current_frame->'width','height',current_frame->'height',
    'enabled',current_frame->'enabled',
    'partyShared',current_frame->'partyShared',
    'collisionEnabled',current_frame->'collisionEnabled',
    'navigationEnvironmentRevision',current_frame->'navigationEnvironmentRevision',
    'permissionGeneration',current_frame->'permissionGeneration',
    'epoch',view_snapshot.epoch,'revision',revision_now,
    'sequence',new_sequence,
    'baseRevision',view_snapshot.revision,
    'baseSequence',view_snapshot.sequence,
    'visibleAdd',visible_diff->'add','visibleRemove',visible_diff->'remove',
    'exploredAdd',explored_diff->'add','exploredRemove',explored_diff->'remove',
    'entitiesChanged',true);
  ELSE
   envelope:=current_frame||pg_catalog.jsonb_build_object(
    'mode','snapshot','deltaProtocolVersion',1,
    'epoch',view_snapshot.epoch,'sequence',new_sequence,'entitiesChanged',true);
  END IF;
  UPDATE forge_visibility.viewer_fog_snapshots
   SET frame=current_frame,revision=revision_now,sequence=new_sequence,
    updated_at=now()
   WHERE map_id=p_map AND user_id=recipient.user_id;
  -- Exactly one authorized revision event is emitted per affected viewer.
  INSERT INTO public.map_viewer_visibility_ticks(
   map_id,campaign_id,user_id,revision,fog_enforced,updated_at,authorized_frame
  )VALUES(
   p_map,recipient.campaign_id,recipient.user_id,revision_now,
   recipient.fog_on,now(),envelope
  ) ON CONFLICT(map_id,user_id) DO UPDATE SET
   revision=excluded.revision,fog_enforced=excluded.fog_enforced,
   updated_at=excluded.updated_at,authorized_frame=excluded.authorized_frame;
 END LOOP;
END $function$;

REVOKE ALL ON FUNCTION forge_visibility.bump_viewer_ticks(uuid,uuid[])
 FROM PUBLIC,anon,authenticated;
