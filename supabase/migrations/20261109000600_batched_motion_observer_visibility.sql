-- WP2/WP4: publish ONLY a server-checked path to entitled recipients.
-- This never authorizes the gesture itself; the calling public RPC owns that.
-- Private helper routines are NOT exposed to API roles.
CREATE OR REPLACE FUNCTION forge_visibility.observer_verified_path_status(
 p_map uuid,p_recipient uuid,p_campaign uuid,p_scene jsonb,
 p_grid integer,p_width integer,p_height integer,p_path jsonb)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $verified$
DECLARE
 role_name text;assigned uuid;active uuid;shared boolean;
 head jsonb;prev jsonb;point jsonb;
 first_visible boolean:=false;entirely_visible boolean:=false;
BEGIN
 IF p_map IS NULL OR p_recipient IS NULL OR p_campaign IS NULL OR
    p_grid IS NULL OR p_grid<=0 OR p_width<1 OR p_height<1 OR
    jsonb_typeof(p_scene->'objects')<>'array' OR
    jsonb_typeof(p_path)<>'array' OR
    jsonb_array_length(p_path) NOT BETWEEN 2 AND 49
 THEN RETURN 0;END IF;
 -- Refuse non-adjacent, duplicated and off-board path samples even though
 -- the authoritative caller already creates only approved adjacent cells.
 FOR point IN SELECT value FROM jsonb_array_elements(p_path) LOOP
  IF jsonb_typeof(point->'x')<>'number' OR
     jsonb_typeof(point->'y')<>'number' OR
     (point->>'x')::numeric<>trunc((point->>'x')::numeric) OR
     (point->>'y')::numeric<>trunc((point->>'y')::numeric) OR
     (point->>'x')::numeric NOT BETWEEN 0 AND p_width OR
     (point->>'y')::numeric NOT BETWEEN 0 AND p_height
  THEN RETURN 0;END IF;
  IF prev IS NOT NULL AND (
    greatest(abs((point->>'x')::numeric-(prev->>'x')::numeric),
             abs((point->>'y')::numeric-(prev->>'y')::numeric))<>1)
  THEN RETURN 0;END IF;
  prev:=point;
 END LOOP;
 SELECT cm.role INTO role_name FROM public.campaign_members cm
 WHERE cm.user_id=p_recipient AND cm.campaign_id=p_campaign;
 IF role_name IS NULL THEN RETURN 0;END IF;
 IF role_name='dm' THEN RETURN 1;END IF;
 IF role_name<>'player' THEN RETURN 0;END IF;
 SELECT c.active_map_id INTO active FROM public.campaigns c WHERE c.id=p_campaign;
 SELECT pm.map_id INTO assigned FROM public.campaign_player_maps pm
  WHERE pm.user_id=p_recipient AND pm.campaign_id=p_campaign;
 IF p_map IS DISTINCT FROM coalesce(assigned,active) THEN RETURN 0;END IF;
 IF NOT EXISTS(SELECT 1 FROM forge_visibility.map_rules r
  WHERE r.map_id=p_map AND r.fog_enforced) THEN RETURN 1;END IF;
 shared:=coalesce((p_scene->'fog'->>'partyShared')::boolean,false);
 -- The same eight entitled vision sources as authorized_viewer_fog_frame.
 -- Materialize them ONCE for all coordinates of this approved path.
 WITH sources AS MATERIALIZED (
  SELECT coalesce(rate.last_x,t.x)::double precision AS x,
   coalesce(rate.last_y,t.y)::double precision AS y,
   t.span_x,t.span_y,
   coalesce(ch.field_values,t.npc_values,'{}'::jsonb) AS sheet_values
  FROM public.map_tokens t
  LEFT JOIN public.characters ch ON ch.id=t.character_id
   AND ch.campaign_id=p_campaign
  LEFT JOIN LATERAL (
   SELECT r.last_x,r.last_y FROM forge_visibility.movement_preview_rates r
   WHERE r.piece_id=t.id AND r.kind='token' AND r.map_id=p_map
    AND r.base_x=t.x AND r.base_y=t.y
    AND r.last_sent>statement_timestamp()-interval '2 seconds'
    AND (r.actor_id=t.owner_id OR EXISTS(
      SELECT 1 FROM public.campaign_members dm
      WHERE dm.campaign_id=p_campaign AND dm.user_id=r.actor_id
       AND dm.role='dm'))
   ORDER BY r.last_sent DESC LIMIT 1
  ) rate ON true
  WHERE t.map_id=p_map AND t.campaign_id=p_campaign AND t.visible
   AND (t.owner_id=p_recipient OR
    (shared AND t.owner_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.campaign_members cm
      WHERE cm.campaign_id=p_campaign AND cm.user_id=t.owner_id
       AND cm.role='player')))
  ORDER BY t.id LIMIT 8
 ), samples AS (
  SELECT segment.ordinality AS i, EXISTS(
   SELECT 1 FROM sources src
   WHERE ((segment.value->>'x')::double precision-
     (src.x+src.span_x/2.0))^2+
    ((segment.value->>'y')::double precision-
     (src.y+src.span_y/2.0))^2<=144
   AND NOT forge_visibility.ray_blocked(p_scene,
     src.x+src.span_x/2.0,src.y+src.span_y/2.0,
     (segment.value->>'x')::double precision,
     (segment.value->>'y')::double precision,'vision',src.sheet_values)
   AND forge_visibility.is_lit(p_map,p_scene,
     src.x+src.span_x/2.0,src.y+src.span_y/2.0,
     (segment.value->>'x')::double precision,
     (segment.value->>'y')::double precision,p_grid)
  ) AS visible
  FROM jsonb_array_elements(p_path) WITH ORDINALITY AS segment(value,ordinality)
 )
 SELECT coalesce(bool_or(visible) FILTER(WHERE i=1),false),
        coalesce(bool_and(visible),false)
 INTO first_visible,entirely_visible FROM samples;
 IF NOT first_visible THEN RETURN 0;END IF;
 IF NOT entirely_visible THEN RETURN 2;END IF;
 RETURN 1;
EXCEPTION WHEN others THEN
 -- Never convert malformed source geometry/lighting into a visibility grant.
 RETURN 0;
END $verified$;

REVOKE ALL ON FUNCTION forge_visibility.observer_verified_path_status(
 uuid,uuid,uuid,jsonb,integer,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION forge_visibility.publish_approved_navigation_batch(
 p_session uuid,p_start_dx integer,p_start_dy integer,
 p_approved jsonb,p_scene jsonb,p_refresh_fog boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $publish$
DECLARE
 s forge_visibility.navigation_gestures%rowtype;actor uuid:=auth.uid();
 piece jsonb;accepted jsonb;route jsonb;recipient record;
 kind_name text;id uuid;start_x integer;start_y integer;
 path_x integer;path_y integer;end_x integer;end_y integer;
 visible_flag boolean;access integer;
 server_seq bigint;now_at timestamptz:=clock_timestamp();
 map_w integer;map_h integer;grid integer;
BEGIN
 IF actor IS NULL OR p_session IS NULL OR jsonb_typeof(p_approved)<>'array' OR
    jsonb_array_length(p_approved) NOT BETWEEN 1 AND 48 THEN RETURN;END IF;
 SELECT ng.* INTO s FROM forge_visibility.navigation_gestures ng
 WHERE ng.id=p_session AND ng.actor_id=actor;
 IF NOT FOUND OR s.expires_at<now_at THEN RETURN;END IF;
 SELECT floor(m.width/m.grid_size),floor(m.height/m.grid_size),m.grid_size
 INTO map_w,map_h,grid FROM public.battle_maps m
 WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF map_w IS NULL OR map_h IS NULL OR
    jsonb_typeof(p_scene->'objects')<>'array' THEN RETURN;END IF;
 -- Match legacy observer packet monotonic sequence scale while ensuring
 -- no route packet uses client-authored actor or recipient coordinates.
 server_seq:=floor(extract(epoch FROM now_at)*1000000)::bigint+s.last_seq;
 FOR piece IN
  SELECT value FROM jsonb_array_elements(s.token_origins||s.tool_origins)
 LOOP
  kind_name:=CASE WHEN (s.token_origins @> jsonb_build_array(piece))
                  THEN 'token' ELSE 'tool' END;
  id:=(piece->>'id')::uuid;
  start_x:=(piece->>'x')::integer;
  start_y:=(piece->>'y')::integer;
  path_x:=start_x+p_start_dx;path_y:=start_y+p_start_dy;
  route:=jsonb_build_array(jsonb_build_object('x',path_x,'y',path_y));
  FOR accepted IN SELECT value FROM jsonb_array_elements(p_approved) LOOP
   path_x:=start_x+(accepted->>'dx')::integer;
   path_y:=start_y+(accepted->>'dy')::integer;
   route:=route||jsonb_build_array(jsonb_build_object('x',path_x,'y',path_y));
  END LOOP;
  end_x:=path_x;end_y:=path_y;
  IF kind_name='token' THEN
   SELECT t.visible INTO visible_flag FROM public.map_tokens t
   WHERE t.id=id AND t.map_id=s.map_id AND t.campaign_id=s.campaign_id;
  ELSE visible_flag:=true;END IF;
  -- A single idempotent transient position per member feeds the EXISTING
  -- authorized sight/torch functions. It does not mutate canonical tokens.
  INSERT INTO forge_visibility.movement_preview_rates(
   actor_id,piece_id,last_sent,last_seq,map_id,kind,
   base_x,base_y,last_x,last_y
  )VALUES(actor,id,now_at,server_seq,s.map_id,kind_name,
   start_x,start_y,end_x,end_y)
  ON CONFLICT(actor_id,piece_id) DO UPDATE SET
   last_sent=excluded.last_sent,last_seq=excluded.last_seq,
   map_id=excluded.map_id,kind=excluded.kind,
   base_x=excluded.base_x,base_y=excluded.base_y,
   last_x=excluded.last_x,last_y=excluded.last_y
  WHERE excluded.last_seq>forge_visibility.movement_preview_rates.last_seq;
  FOR recipient IN
   SELECT cm.user_id,cm.role FROM public.campaign_members cm
   WHERE cm.campaign_id=s.campaign_id AND cm.user_id<>actor
   ORDER BY cm.user_id LIMIT 32
  LOOP
   IF kind_name='token' AND visible_flag IS DISTINCT FROM true AND
      recipient.role<>'dm' THEN CONTINUE;END IF;
   access:=forge_visibility.observer_verified_path_status(
    s.map_id,recipient.user_id,s.campaign_id,p_scene,grid,map_w,map_h,route);
   IF access=0 THEN CONTINUE;END IF;
   IF access=1 THEN
    PERFORM realtime.send(jsonb_build_object(
     'kind',kind_name,'id',id,'mapId',s.map_id,
     'actor',actor,'seq',server_seq,'action','path','path',route),
     'motion','forge-observer:'||s.map_id::text||':'||
      recipient.user_id::text,true);
   ELSE
    PERFORM realtime.send(jsonb_build_object(
     'kind',kind_name,'id',id,'mapId',s.map_id,
     'actor',actor,'seq',server_seq,'action','hide'),
     'motion','forge-observer:'||s.map_id::text||':'||
      recipient.user_id::text,true);
   END IF;
  END LOOP;
 END LOOP;
 -- The snapshot RPC already creates per-viewer deltas and saves explored
 -- history. Run once per accepted batch (throttled by the caller), NOT per cell.
 IF p_refresh_fog THEN
  PERFORM forge_visibility.bump_viewer_ticks(s.map_id,NULL);
 END IF;
END $publish$;

REVOKE ALL ON FUNCTION forge_visibility.publish_approved_navigation_batch(
 uuid,integer,integer,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
