-- World Engine V2 Phase 7 / authorized snapshot + persistence.
-- STAGED ONLY. Independent from legacy authorized_viewer_fog_frame and
-- map_viewer_visibility_ticks: one actor-bound frame contains fog, roster,
-- recipient movement cursor, scene generation and vision epoch.
--
-- A DM preview runs with the player's sight rights WITHOUT modifying that
-- player's explored history. Only the real viewer may persist exploration.

CREATE OR REPLACE FUNCTION forge_world_v2.visibility_frame_v2(
 p_map uuid,p_viewer uuid,p_store_exploration boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=auth.uid();camp uuid;role_name text;real_dm boolean;
 env jsonb;revision bigint:=0;scene_gen bigint:=0;
 permission_gen bigint:=0;fog_enabled boolean:=false;
 shared boolean:=false;w integer;h integer;grid integer;
 sources jsonb:='[]'::jsonb;lights jsonb:='[]'::jsonb;
 visible jsonb:='[]'::jsonb;explored jsonb:='[]'::jsonb;
 roster jsonb:='[]'::jsonb;pieces record;piece_delta jsonb;
 px integer;py integer;tx integer;ty integer;
 memory_count integer:=0;cursor bigint:=0;vision_epoch bigint:=0;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR p_viewer IS NULL OR
  (actor<>p_viewer AND
   NOT EXISTS(SELECT 1 FROM public.battle_maps m WHERE m.id=p_map
    AND public.is_campaign_dm(m.campaign_id)))
 THEN RETURN NULL;END IF;
 SELECT m.campaign_id,m.grid_size,
  floor(m.width/m.grid_size)::integer,
  floor(m.height/m.grid_size)::integer
 INTO camp,grid,w,h FROM public.battle_maps m
 WHERE m.id=p_map AND m.grid_size>0;
 IF NOT FOUND OR w<1 OR h<1 OR w>10000 OR h>10000
 THEN RETURN NULL;END IF;
 role_name:=forge_world_v2.viewer_on_map(camp,p_map,p_viewer);
 IF role_name IS NULL THEN RETURN NULL;END IF;
 -- A map may be unpublished. A fog-enabled scene cannot be synthesized
 -- from missing geometry; fail closed instead of opening visibility.
 SELECT e.live,e.revision INTO env,revision
 FROM public.map_environments e WHERE e.map_id=p_map
  AND e.campaign_id=camp;
 SELECT coalesce(r.fog_enforced,false) INTO fog_enabled
 FROM forge_visibility.map_rules r
 WHERE r.map_id=p_map AND r.campaign_id=camp;
 fog_enabled:=coalesce(fog_enabled,false);
 -- Automatic fog has a 128x128-cell authoring limit. Without fog, preserve
 -- large-map token rosters without generating a huge boolean fog texture.
 IF fog_enabled AND (w>128 OR h>128) THEN RETURN NULL;END IF;
 IF fog_enabled AND (jsonb_typeof(env->'objects')<>'array'
  OR jsonb_array_length(env->'objects')>120) THEN RETURN NULL;END IF;
 shared:=coalesce((env->'fog'->>'partyShared')::boolean,false);
 SELECT coalesce(g.generation,0) INTO permission_gen
 FROM forge_visibility.navigation_permission_generations g
 WHERE g.map_id=p_map;
 SELECT s.generation INTO scene_gen FROM forge_world_v2.scene_publications s
 WHERE s.map_id=p_map AND s.campaign_id=camp;
 SELECT s.seq INTO cursor FROM forge_world_v2.viewer_streams s
 WHERE s.map_id=p_map AND s.viewer_id=p_viewer AND s.campaign_id=camp;
 SELECT e.epoch INTO vision_epoch FROM forge_world_v2.vision_epochs e
 WHERE e.map_id=p_map AND e.viewer_id=p_viewer AND e.campaign_id=camp;
 real_dm:=role_name='dm';
 IF fog_enabled AND NOT real_dm THEN
  sources:=forge_world_v2.vision_sources_v2(p_map,camp,p_viewer,env);
  lights:=forge_world_v2.light_sources_v2(p_map,camp,env);
  -- Compute a bounded candidate union around at most eight vision sources;
  -- do not scan the full map if the viewer has no entitled tokens.
  WITH candidates AS (
   SELECT DISTINCT xx.x,yy.y
   FROM jsonb_array_elements(sources) AS src(v)
   CROSS JOIN LATERAL generate_series(
    greatest(0,floor((src.v->>'x')::numeric +
       (src.v->>'spanX')::numeric/2.0-12)::integer),
    least(w-1,ceil((src.v->>'x')::numeric +
       (src.v->>'spanX')::numeric/2.0+12)::integer)) AS xx(x)
   CROSS JOIN LATERAL generate_series(
    greatest(0,floor((src.v->>'y')::numeric +
       (src.v->>'spanY')::numeric/2.0-12)::integer),
    least(h-1,ceil((src.v->>'y')::numeric +
       (src.v->>'spanY')::numeric/2.0+12)::integer)) AS yy(y)
  ), lit AS (
   SELECT (c.x+c.y*w) AS idx FROM candidates c
   WHERE forge_world_v2.is_seen_v2(env,sources,lights,
    c.x+0.5,c.y+0.5)
  )
  SELECT coalesce(jsonb_agg(idx ORDER BY idx),'[]'::jsonb)
   INTO visible FROM lit;
  IF p_store_exploration AND actor=p_viewer AND
   jsonb_array_length(visible)>0 AND NOT EXISTS(
     SELECT 1 FROM forge_visibility.exploration ex
     WHERE ex.map_id=p_map AND ex.user_id=p_viewer
      AND ex.explored_cells @> visible
   )
  THEN
   INSERT INTO forge_visibility.exploration(
    campaign_id,map_id,user_id,explored_cells)
   VALUES(camp,p_map,p_viewer,visible)
   ON CONFLICT(map_id,user_id) DO UPDATE SET
    explored_cells=(
      SELECT coalesce(jsonb_agg(cell ORDER BY cell),'[]'::jsonb)
      FROM (SELECT DISTINCT value::integer AS cell
       FROM jsonb_array_elements_text(
        forge_visibility.exploration.explored_cells ||
        excluded.explored_cells)) v),
    revision=forge_visibility.exploration.revision+1,
    updated_at=now()
   WHERE NOT forge_visibility.exploration.explored_cells
    @> excluded.explored_cells;
  END IF;
  IF shared THEN
   SELECT coalesce(jsonb_agg(cell ORDER BY cell),'[]'::jsonb)
   INTO explored FROM(
    SELECT DISTINCT value::integer AS cell
    FROM forge_visibility.exploration ex
    JOIN public.campaign_members cm ON cm.campaign_id=ex.campaign_id
      AND cm.user_id=ex.user_id AND cm.role='player'
    CROSS JOIN LATERAL jsonb_array_elements_text(ex.explored_cells) v(value)
    WHERE ex.map_id=p_map AND ex.campaign_id=camp
   ) combined;
  ELSE
   SELECT coalesce(ex.explored_cells,'[]'::jsonb)
    INTO explored FROM forge_visibility.exploration ex
    WHERE ex.map_id=p_map AND ex.user_id=p_viewer;
  END IF;
  explored:=coalesce(explored,'[]'::jsonb);
 END IF;
 -- Select visible tokens and placed tools with server canonical/approved
 -- positions, without any raw NPC sheet or hidden environment details.
 FOR pieces IN
  SELECT 'token'::text AS kind,t.id,t.x,t.y,
   t.span_x AS sw,t.span_y AS sh,t.visible AS shown,
   t.owner_id,t.character_id
  FROM public.map_tokens t
  WHERE t.map_id=p_map AND t.campaign_id=camp
  UNION ALL
  SELECT 'tool'::text,p.issue_id,p.x,p.y,p.span::numeric,p.span::numeric,
   true,NULL::uuid,NULL::uuid
  FROM public.campaign_tool_map_tokens p
  WHERE p.map_id=p_map AND p.campaign_id=camp
   AND p.held_by_token_id IS NULL
  ORDER BY id LIMIT 500
 LOOP
  IF NOT real_dm AND pieces.shown IS DISTINCT FROM true THEN CONTINUE;END IF;
  piece_delta:=forge_world_v2.piece_offset_v2(
   p_map,pieces.kind,pieces.id);
  px:=pieces.x+(piece_delta->>'dx')::integer;
  py:=pieces.y+(piece_delta->>'dy')::integer;
  IF px<0 OR py<0 OR px>=w OR py>=h THEN CONTINUE;END IF;
  IF fog_enabled AND NOT real_dm THEN
   IF NOT forge_world_v2.is_seen_v2(
    env,sources,lights,
    px+pieces.sw/2.0,py+pieces.sh/2.0)
   THEN CONTINUE;END IF;
  END IF;
  roster:=roster||jsonb_build_array(jsonb_build_object(
   'kind',pieces.kind,'id',pieces.id,'x',px,'y',py));
 END LOOP;
 RETURN jsonb_build_object(
  'version',2,'mapId',p_map,'viewerId',p_viewer,
  'scope',CASE WHEN real_dm THEN 'dm' ELSE 'viewer' END,
  'cursor',coalesce(cursor,0),
  'environmentRevision',coalesce(revision,0),
  'permissionGeneration',coalesce(permission_gen,0),
  'sceneGeneration',coalesce(scene_gen,0),
  'visionEpoch',coalesce(vision_epoch,0),
  'enabled',fog_enabled AND NOT real_dm,
  'width',w,'height',h,'partyShared',shared,
  'visible',visible,'explored',explored,
  'visiblePieces',roster);
EXCEPTION WHEN others THEN
 -- No incomplete/partial fog frame or private geometry escapes on failure.
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.get_world_visibility_v2(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF auth.uid() IS NULL OR p_map IS NULL THEN RETURN NULL;END IF;
 RETURN forge_world_v2.visibility_frame_v2(p_map,auth.uid(),true);
END $$;

CREATE OR REPLACE FUNCTION public.preview_world_visibility_v2(
 p_map uuid,p_viewer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE campaign uuid;
BEGIN
 SELECT m.campaign_id INTO campaign FROM public.battle_maps m
 WHERE m.id=p_map;
 IF auth.uid() IS NULL OR p_viewer IS NULL OR campaign IS NULL OR
  NOT public.is_campaign_dm(campaign)
 THEN RETURN NULL;END IF;
 -- Do not persist player exploration as a side effect of DM preview.
 RETURN forge_world_v2.visibility_frame_v2(p_map,p_viewer,false);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_world_visibility_v2(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.preview_world_visibility_v2(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_world_visibility_v2(uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_world_visibility_v2(uuid,uuid)
 TO authenticated;
