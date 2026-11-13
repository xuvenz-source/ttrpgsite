-- B10-R18-54: exact production pg_get_functiondef text, captured read-only.
-- Only sourced from current 83-migration Supabase baseline; NO SQL run live.
-- Disposable PostgreSQL 17 TEST FIXTURE ONLY. Do not include in migrations.
-- Security assertions check each canonical pg_get_functiondef MD5 after load.
\set ON_ERROR_STOP on
-- R54 pinned cross2 65c4bff8aaa6ecf38e335a44e95d874e
CREATE OR REPLACE FUNCTION forge_visibility.cross2(ax double precision, ay double precision, bx double precision, b_y double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select ax*b_y-ay*bx
$function$;

-- R54 pinned wall_passes 5c52255db93f2a9ed892e684dd11f898
CREATE OR REPLACE FUNCTION forge_visibility.wall_passes(o jsonb, vals jsonb, mode text, side text DEFAULT 'a'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 field text:=o->>'attributeField';
 threshold text; raw text;
begin
 threshold:=case when mode='movement' then o->>'movementAt' else o->>'visionAt' end;
 if mode<>'light' and coalesce(field,'')<>'' and
    coalesce(threshold,'') ~ '^[-]?[0-9]{1,5}([.][0-9]{1,3})?$' then
  raw:=case when jsonb_typeof(vals->field)='object'
    then vals->field->>'current' else vals->>field end;
  if coalesce(raw,'')~'^[-]?[0-9]{1,5}([.][0-9]{1,3})?$'
     and raw::numeric>=threshold::numeric then return true; end if;
 end if;
 if o->>'type' in ('door','window') and o->>'state' in ('open','broken')
 then return true;end if;
 if mode='movement' then return o->>'blocksMovement'='false';end if;
 if mode='light' then return o->>'blocksLight'='false'
  and not (o->>'type'='window' and o->>'curtains'='true');end if;
 if o->>'type'='window' and o->>'curtains'='true' then return false;end if;
 if o->>'vision'='pass' then return true;end if;
 if o->>'vision'='one-way' then
  return o->>'oneWay'=case when side='a' then 'a-to-b' else 'b-to-a' end;
 end if;
 return false;
end $function$;

-- R54 pinned ray_blocked a9fc198168c29fd5d80041b05337017e
CREATE OR REPLACE FUNCTION forge_visibility.ray_blocked(scene jsonb, sx double precision, sy double precision, tx double precision, ty double precision, mode text, vals jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare o jsonb; pts jsonb;a jsonb;b jsonb; i integer;
 ax double precision;ay double precision;bx double precision;b_y double precision;
 denominator double precision;param double precision;edgeparam double precision;
 side text;
begin
 if jsonb_typeof(scene->'objects')<>'array' or
    jsonb_array_length(scene->'objects')>120 then return true;end if;
 for o in select value from jsonb_array_elements(scene->'objects') loop
  if o->>'type' not in ('wall','door','window') then continue;end if;
  pts:=o->'points';
  if jsonb_typeof(pts)<>'array' or jsonb_array_length(pts) not between 2 and 80
  then return true;end if;
  for i in 1..jsonb_array_length(pts)-1 loop
   a:=pts->(i-1);b:=pts->i;
   ax:=(a->>'x')::double precision;ay:=(a->>'y')::double precision;
   bx:=(b->>'x')::double precision;b_y:=(b->>'y')::double precision;
   side:=case when forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)>=0
    then 'a' else 'b' end;
   if forge_visibility.wall_passes(o,vals,mode,side) then continue;end if;
   denominator:=forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay);
   if abs(denominator)<0.0000001 then continue;end if;
   param:=forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)/denominator;
   edgeparam:=forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)/denominator;
   if param>0.00001 and param<0.99999 and
      edgeparam>=-0.00001 and edgeparam<=1.00001 then return true;end if;
  end loop;
 end loop;
 return false;
exception when others then
 -- Invalid published geometry must never give a player extra visibility.
 return true;
end $function$;

-- R54 pinned is_lit cec916b326a14937ceee2e170619cca2
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

-- R54 pinned fog_cells_diff 0c477595f2fd916d3520a792bbe52cd7
CREATE OR REPLACE FUNCTION forge_visibility.fog_cells_diff(p_old jsonb, p_new jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select pg_catalog.jsonb_build_object(
 'add',coalesce((
  select pg_catalog.jsonb_agg(v order by v) from (
   select value::integer as v from pg_catalog.jsonb_array_elements_text(p_new)
   except select value::integer from pg_catalog.jsonb_array_elements_text(p_old)
  ) additions
 ),'[]'::jsonb),
 'remove',coalesce((
  select pg_catalog.jsonb_agg(v order by v) from (
   select value::integer as v from pg_catalog.jsonb_array_elements_text(p_old)
   except select value::integer from pg_catalog.jsonb_array_elements_text(p_new)
  ) removals
 ),'[]'::jsonb))
$function$;

-- R54 pinned viewers_affected_by_token_move 18ee8bd8e81d681dc22aecd50eb66425
CREATE OR REPLACE FUNCTION forge_visibility.viewers_affected_by_token_move(p_old map_tokens, p_new map_tokens)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 scene jsonb;party_shared boolean;candidate uuid[];
begin
 if p_old is null or p_new is null or
    p_old.campaign_id is distinct from p_new.campaign_id or
    p_old.map_id is distinct from p_new.map_id or
    p_new.map_id is null or
    p_old.span_x is null or p_old.span_y is null or
    p_old.span_x<=0 or p_old.span_y<=0 then return null;end if;
 select e.live into scene from public.map_environments e
  where e.map_id=p_new.map_id;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' then
  return null;end if;
 party_shared:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 -- A light attached to the moving token may change the illumination of a
 -- remote viewer even if the token never enters their personal 60ft sight.
 if exists(select 1 from public.campaign_tool_map_tokens t
  where t.map_id=p_new.map_id and t.campaign_id=p_new.campaign_id
   and t.held_by_token_id=p_new.id and t.light_enabled and t.kind='torch')
 then return null;end if;

 with viewers as materialized (
  select cm.user_id
  from public.campaign_members cm
  join public.campaigns c on c.id=cm.campaign_id
  left join public.campaign_player_maps pm
   on pm.campaign_id=cm.campaign_id and pm.user_id=cm.user_id
  where cm.campaign_id=p_new.campaign_id and cm.role='player'
   and coalesce(pm.map_id,c.active_map_id)=p_new.map_id
 )
 select pg_catalog.array_agg(v.user_id order by v.user_id) into candidate
 from viewers v
 where
  (p_new.visible and p_new.owner_id=v.user_id)
  or
  (party_shared and p_new.visible and p_new.owner_id is not null
   and exists(select 1 from public.campaign_members src_owner
    where src_owner.campaign_id=p_new.campaign_id
     and src_owner.user_id=p_new.owner_id and src_owner.role='player'))
  or exists (
   select 1 from public.map_tokens src
   left join forge_visibility.movement_preview_rates rate
    on rate.piece_id=src.id and rate.actor_id=src.owner_id
     and rate.kind='token' and rate.map_id=p_new.map_id
     and rate.base_x=src.x and rate.base_y=src.y
     and rate.last_sent>statement_timestamp()-interval '2 seconds'
   where src.map_id=p_new.map_id and src.campaign_id=p_new.campaign_id
    and src.visible and src.owner_id is not null
    and (src.owner_id=v.user_id or
     (party_shared and exists(
      select 1 from public.campaign_members co
      where co.campaign_id=p_new.campaign_id and co.user_id=src.owner_id
       and co.role='player')))
    and (
     (
      abs(p_old.x+p_old.span_x/2.0-(src.x+src.span_x/2.0))
         <=16+p_old.span_x/2.0+src.span_x/2.0
      and
      abs(p_old.y+p_old.span_y/2.0-(src.y+src.span_y/2.0))
         <=16+p_old.span_y/2.0+src.span_y/2.0
     ) or (
      abs(p_new.x+p_new.span_x/2.0-(src.x+src.span_x/2.0))
         <=16+p_new.span_x/2.0+src.span_x/2.0
      and
      abs(p_new.y+p_new.span_y/2.0-(src.y+src.span_y/2.0))
         <=16+p_new.span_y/2.0+src.span_y/2.0
     ) or (
      rate.last_x is not null and
      (
       (
        abs(p_old.x+p_old.span_x/2.0-(rate.last_x+src.span_x/2.0))
          <=16+p_old.span_x/2.0+src.span_x/2.0
        and
        abs(p_old.y+p_old.span_y/2.0-(rate.last_y+src.span_y/2.0))
          <=16+p_old.span_y/2.0+src.span_y/2.0
       ) or (
        abs(p_new.x+p_new.span_x/2.0-(rate.last_x+src.span_x/2.0))
          <=16+p_new.span_x/2.0+src.span_x/2.0
        and
        abs(p_new.y+p_new.span_y/2.0-(rate.last_y+src.span_y/2.0))
          <=16+p_new.span_y/2.0+src.span_y/2.0
       )
      )
     )
    )
  );
 return coalesce(candidate,array[]::uuid[]);
exception when others then
 -- Fail OPEN to invalidating all viewers, never to revealing private NPCs.
 return null;
end $function$;

-- R54 pinned bump_viewer_ticks fead41e37dfd6e2fa30499829e24bd02
CREATE OR REPLACE FUNCTION forge_visibility.bump_viewer_ticks(p_map uuid, p_viewers uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

-- R54 pinned bump_tick_scoped f75e231c06bef2912c9b013ea9735cdc
CREATE OR REPLACE FUNCTION forge_visibility.bump_tick_scoped(p_map uuid, p_viewers uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into public.map_visibility_ticks(
  map_id,campaign_id,revision,updated_at,fog_enforced
 )
 select m.id,m.campaign_id,1,now(),coalesce(r.fog_enforced,false)
 from public.battle_maps m
 left join forge_visibility.map_rules r on r.map_id=m.id
 where m.id=p_map
 on conflict(map_id)do update set
  revision=public.map_visibility_ticks.revision+1,
  updated_at=now(),fog_enforced=excluded.fog_enforced;
 perform forge_visibility.bump_viewer_ticks(p_map,p_viewers);
end $function$;

-- R54 pinned bump_tick adfc0d91e3e7e6011b46a98d14c83ad9
CREATE OR REPLACE FUNCTION forge_visibility.bump_tick(p_map uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into public.map_visibility_ticks(
  map_id,campaign_id,revision,updated_at,fog_enforced
 )
 select m.id,m.campaign_id,1,now(),coalesce(r.fog_enforced,false)
 from public.battle_maps m
 left join forge_visibility.map_rules r on r.map_id=m.id
 where m.id=p_map
 on conflict(map_id)do update set
  revision=public.map_visibility_ticks.revision+1,
  updated_at=now(),fog_enforced=excluded.fog_enforced;
 perform forge_visibility.bump_viewer_ticks(p_map,null);
end $function$;

-- R54 pinned authorized_viewer_fog_frame ee3356af321fec1a3e167a75c6245e86
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

-- R54 pinned tick_tokens f6c2eef860141bff253024e0f6d8c7ba
CREATE OR REPLACE FUNCTION forge_visibility.tick_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pure_movement boolean; impacted uuid[];
begin
 if tg_op='INSERT' then
  perform forge_visibility.bump_tick(new.map_id);
  return new;
 end if;
 if tg_op='DELETE' then
  perform forge_visibility.bump_tick(old.map_id);
  return old;
 end if;
 if old.x is distinct from new.x or old.y is distinct from new.y or
    old.map_id is distinct from new.map_id or
    old.visible is distinct from new.visible or
    old.span_x is distinct from new.span_x or old.span_y is distinct from new.span_y or
    old.owner_id is distinct from new.owner_id or
    old.character_id is distinct from new.character_id or
    old.npc_values is distinct from new.npc_values then
  pure_movement:=
   (old.x is distinct from new.x or old.y is distinct from new.y)
   and (to_jsonb(old)-'x'-'y'-'updated_at')=
       (to_jsonb(new)-'x'-'y'-'updated_at');
  if pure_movement and exists(
   select 1 from forge_visibility.map_rules r
   where r.map_id=new.map_id and r.fog_enforced=true
  ) then
   impacted:=forge_visibility.viewers_affected_by_token_move(old,new);
   perform forge_visibility.bump_tick_scoped(new.map_id,impacted);
  elsif not pure_movement then
   perform forge_visibility.bump_tick(new.map_id);
  end if;
  if old.map_id is distinct from new.map_id then
   perform forge_visibility.bump_tick(old.map_id);
  end if;
 end if;
 return new;
end $function$;

-- R54 pinned enforce_collision 7e652f0f2334980ccc724e1748d334ba
CREATE OR REPLACE FUNCTION forge_visibility.enforce_collision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 scene jsonb; m record; obstacle jsonb; points jsonb; a jsonb; b jsonb; i integer;
 attrs jsonb; cells_w double precision; cells_h double precision;
 actor uuid:=auth.uid(); dm boolean;
 collision_on boolean;route_text text;route_end jsonb;
begin
 if actor is null then
  -- Trusted service work is not the player movement API.
  if current_setting('request.jwt.claim.role',true)='service_role' then return new; end if;
  raise exception 'Sign in to move tokens';
 end if;
 if old.x is not distinct from new.x and old.y is not distinct from new.y and
    old.span_x is not distinct from new.span_x and
    old.span_y is not distinct from new.span_y and
    old.map_id is not distinct from new.map_id then return new;end if;
 dm:=public.is_campaign_dm(new.campaign_id);
 if new.map_id is distinct from old.map_id and not dm then
  raise exception 'Players cannot move tokens between maps';
 end if;
 select r.collision_enforced into collision_on
 from forge_visibility.map_rules r where r.map_id=new.map_id;
 if coalesce(collision_on,false)=false then return new;end if;
 -- The DM never bypasses collision accidentally. Only the authenticated DM
 -- using the explicit move_map_group override may request a bypass.
 if dm and current_setting('forge.collision_override',true)='on' then return new;end if;
 select live into scene from public.map_environments where map_id=new.map_id;
 select bm.width,bm.height,bm.grid_size into m from public.battle_maps bm
  where bm.id=new.map_id and bm.campaign_id=new.campaign_id;
 if not found or scene is null or jsonb_typeof(scene->'objects')<>'array' or
   m.grid_size is null or m.grid_size<=0 or
   jsonb_array_length(scene->'objects')>120 then
  raise exception 'Published collision configuration unavailable';
 end if;
 cells_w:=floor(m.width/m.grid_size);cells_h:=floor(m.height/m.grid_size);
 if new.x<0 or new.y<0 or new.x+new.span_x>cells_w or
    new.y+new.span_y>cells_h or
    new.span_x<=0 or new.span_y<=0 or new.span_x>12 or new.span_y>12
 then raise exception 'Movement leaves the map bounds';end if;
 attrs:=coalesce(new.npc_values,'{}'::jsonb);
 if new.character_id is not null then
  select ch.field_values into attrs from public.characters ch
   where ch.id=new.character_id and ch.campaign_id=new.campaign_id;
  attrs:=coalesce(attrs,'{}'::jsonb);
 end if;
 -- Trusted V2 commits use an unforgeable per-transaction private row.
  -- The legacy route validator remains solely for pre-cutover compatibility.
  IF old.map_id IS NOT DISTINCT FROM new.map_id AND
     old.campaign_id IS NOT DISTINCT FROM new.campaign_id AND
     old.span_x IS NOT DISTINCT FROM new.span_x AND
     old.span_y IS NOT DISTINCT FROM new.span_y AND
     forge_world_v2.commit_allows_piece_v2(
      'token',new.id,new.campaign_id,new.map_id,
      old.x,old.y,new.x,new.y) THEN RETURN new;END IF;
  -- For approved trajectories the trigger itself checks every bent segment.
 route_text:=current_setting('forge.trajectory_steps',true);
 if coalesce(route_text,'')<>'' and
    current_setting('forge.trajectory_map',true)=new.map_id::text and
    current_setting('forge.trajectory_actor',true)=actor::text then
  route_end:=forge_visibility.validate_piece_trajectory(
   scene,attrs,old.x,old.y,new.span_x,new.span_y,
   cells_w,cells_h,route_text::jsonb);
  if (route_end->>'x')::double precision is distinct from new.x or
     (route_end->>'y')::double precision is distinct from new.y
  then raise exception 'Movement destination does not match validated route';end if;
  return new;
 end if;
 for obstacle in select value from jsonb_array_elements(scene->'objects') loop
  if obstacle->>'type' not in ('wall','door','window') then continue;end if;
  if obstacle->>'type' in ('door','window') and obstacle->>'state'='broken'
   then continue;end if;
  if forge_visibility.wall_passes(obstacle,attrs,'movement') then continue;end if;
  points:=obstacle->'points';
  if jsonb_typeof(points)<>'array' or jsonb_array_length(points) not between 2 and 80
   then raise exception 'Invalid published barrier geometry';end if;
  for i in 1..jsonb_array_length(points)-1 loop
   a:=points->(i-1);b:=points->i;
   if forge_visibility.swept_hits_segment(
    old.x,old.y,old.span_x,old.span_y,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
    or forge_visibility.swept_hits_segment(
    new.x,new.y,new.span_x,new.span_y,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
   then raise exception 'Movement blocked by a wall or closed portal';end if;
  end loop;
 end loop;
 return new;
end $function$;

