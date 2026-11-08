-- Prepared only. Apply to the existing Supabase Free project AFTER release approval.
-- Never grant published wall geometry; each grant contains only opaque
-- directional movement permissions within a bounded, currently authorized area.
-- Final position writes remain independently checked by existing triggers.
CREATE OR REPLACE FUNCTION forge_visibility.navigation_position_observed(
 p_x integer,p_y integer,p_width double precision,p_height double precision,
 p_cells_w integer,p_cells_h integer,p_visible integer[],p_fog boolean)
RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path TO ''
AS $fn$
DECLARE cx integer;cy integer;
BEGIN
 IF p_x IS NULL OR p_y IS NULL OR p_width IS NULL OR p_height IS NULL OR
  p_x<0 OR p_y<0 OR p_width<=0 OR p_height<=0 OR
  p_x+p_width>p_cells_w OR p_y+p_height>p_cells_h THEN RETURN false;END IF;
 IF NOT p_fog THEN RETURN true;END IF;
 IF p_visible IS NULL THEN RETURN false;END IF;
 FOR cx IN p_x..pg_catalog.ceil(p_x+p_width)::integer-1 LOOP
  FOR cy IN p_y..pg_catalog.ceil(p_y+p_height)::integer-1 LOOP
   IF NOT ((cx+cy*p_cells_w)=ANY(p_visible)) THEN RETURN false;END IF;
  END LOOP;
 END LOOP;
 RETURN true;
END $fn$;


-- STEP 3: A map-scoped opaque authorization generation. No wall fields,
-- hidden door states, character values or private identifiers are exposed.
-- Do not let clients read the underlying version table (or bump it directly).
CREATE TABLE IF NOT EXISTS forge_visibility.navigation_permission_generations (
 map_id uuid PRIMARY KEY REFERENCES public.battle_maps(id) ON DELETE CASCADE,
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0)
);
ALTER TABLE forge_visibility.navigation_permission_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_visibility.navigation_permission_generations
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION forge_visibility.bump_navigation_permission_generation(
 p_map uuid,p_emit_viewer_ticks boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $permission$
BEGIN
 IF p_map IS NULL THEN RETURN;END IF;
 INSERT INTO forge_visibility.navigation_permission_generations(map_id,generation)
 VALUES(p_map,1) ON CONFLICT(map_id) DO UPDATE
 SET generation=forge_visibility.navigation_permission_generations.generation+1;
 -- At deployment, the existing private viewer tick function is replaced by
 -- the sanitized frame publisher in the next migration. No geometry is sent.
 IF p_emit_viewer_ticks THEN
  PERFORM forge_visibility.bump_tick(p_map);
 END IF;
END $permission$;
REVOKE ALL ON FUNCTION forge_visibility.bump_navigation_permission_generation(uuid,boolean)
 FROM PUBLIC,anon,authenticated;

-- Reuse the already-installed character trigger. A general field change can
-- alter an undisclosed movementAt gate even when sight and scene stay fixed.
-- We intentionally do not inspect which field changed, avoiding a secret-
-- barrier side channel through selectively changing generation numbers.
CREATE OR REPLACE FUNCTION forge_visibility.tick_character_elevation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $character$
DECLARE affected record;
BEGIN
 IF NEW.field_values IS NOT DISTINCT FROM OLD.field_values THEN RETURN NEW;END IF;
 FOR affected IN
  SELECT DISTINCT t.map_id FROM public.map_tokens t
  JOIN forge_visibility.map_rules r ON r.map_id=t.map_id
  WHERE t.character_id=NEW.id AND (r.collision_enforced OR r.fog_enforced)
 LOOP
  PERFORM forge_visibility.bump_navigation_permission_generation(affected.map_id,true);
 END LOOP;
 RETURN NEW;
END $character$;
REVOKE ALL ON FUNCTION forge_visibility.tick_character_elevation()
 FROM PUBLIC,anon,authenticated;

-- Map-token ownership, NPC fields or footprint changes already call the
-- installed tick_tokens() trigger. Increment the generation BEFORE its
-- existing authorized viewer-tick publication (alphabetical trigger order),
-- avoiding a second fog rebuild for the same write.
CREATE OR REPLACE FUNCTION forge_visibility.tick_navigation_token_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $token$
BEGIN
 IF OLD.npc_values IS DISTINCT FROM NEW.npc_values OR
    OLD.owner_id IS DISTINCT FROM NEW.owner_id OR
    OLD.character_id IS DISTINCT FROM NEW.character_id OR
    OLD.visible IS DISTINCT FROM NEW.visible OR
    OLD.span_x IS DISTINCT FROM NEW.span_x OR
    OLD.span_y IS DISTINCT FROM NEW.span_y OR
    OLD.map_id IS DISTINCT FROM NEW.map_id THEN
  PERFORM forge_visibility.bump_navigation_permission_generation(NEW.map_id,false);
  IF OLD.map_id IS DISTINCT FROM NEW.map_id THEN
   PERFORM forge_visibility.bump_navigation_permission_generation(OLD.map_id,false);
  END IF;
 END IF;
 RETURN NEW;
END $token$;
REVOKE ALL ON FUNCTION forge_visibility.tick_navigation_token_permissions()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS forge_navigation_token_permissions ON public.map_tokens;
CREATE TRIGGER forge_navigation_token_permissions
 AFTER UPDATE OF npc_values,owner_id,character_id,visible,span_x,span_y,map_id
 ON public.map_tokens FOR EACH ROW
 EXECUTE FUNCTION forge_visibility.tick_navigation_token_permissions();

-- Issued tools can have mutable attribute-derived movement gates without
-- any corresponding map-token updates. These changes must send viewer ticks.
CREATE OR REPLACE FUNCTION forge_visibility.tick_navigation_tool_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $tool$
BEGIN
 IF OLD.state IS DISTINCT FROM NEW.state OR
    OLD.config IS DISTINCT FROM NEW.config OR
    OLD.owner_id IS DISTINCT FROM NEW.owner_id OR
    OLD.party_shared IS DISTINCT FROM NEW.party_shared OR
    OLD.held_by_token_id IS DISTINCT FROM NEW.held_by_token_id THEN
  PERFORM forge_visibility.bump_navigation_permission_generation(NEW.map_id,true);
 END IF;
 RETURN NEW;
END $tool$;
REVOKE ALL ON FUNCTION forge_visibility.tick_navigation_tool_permissions()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS forge_navigation_tool_permissions ON public.campaign_tool_issues;
CREATE TRIGGER forge_navigation_tool_permissions
 AFTER UPDATE OF state,config,owner_id,party_shared,held_by_token_id
 ON public.campaign_tool_issues FOR EACH ROW
 EXECUTE FUNCTION forge_visibility.tick_navigation_tool_permissions();

CREATE OR REPLACE FUNCTION public.get_authorized_map_navigation(
 p_map uuid,p_kind text,p_piece uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 actor uuid:=auth.uid();
 m record;t record;u record;scene jsonb;attrs jsonb:='{}'::jsonb;
 bx integer;by integer;map_w integer;map_h integer;span_w double precision;
 span_h double precision;fog_frame jsonb;fog_on boolean;collision_on boolean;
 env_revision bigint:=0;permission_generation bigint:=0;
 visible_cells integer[];nodes jsonb:='[]'::jsonb;
 gx integer;gy integer;tx integer;ty integer;mask integer;
 dir record;allowed boolean;dm boolean;
 -- Parse collidable walls only once per grant. The final transaction still
 -- executes validate_piece_trajectory independently on the committed path.
 barrier jsonb;points jsonb;segment_idx integer;scan_idx integer;
 segment_count integer:=0;blockers double precision[]:=ARRAY[]::double precision[];
 ax double precision;ay double precision;ex double precision;ey double precision;
 -- An origin-connected component is essential: remote party-shared sight
 -- must never allow a player to survey disconnected wall/door collision.
 candidate_masks jsonb:='{}'::jsonb;candidate_nodes jsonb;
 reachable jsonb:='{}'::jsonb;pending_cells integer[];
 queue_index integer:=1;qx integer;qy integer;neighbour_key text;
 node jsonb;origin_key text;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR p_piece IS NULL OR
  p_kind NOT IN ('token','tool') THEN RAISE EXCEPTION 'Navigation unavailable';END IF;
 -- Collapse parallel requests from multiple browser tabs for the SAME
 -- authorized piece. Never let concurrent callers trigger duplicate, costly
 -- graph builds or use request timing as a high-frequency collision oracle.
 IF NOT pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtextextended(
   actor::text||':'||p_map::text||':'||p_kind||':'||p_piece::text,1793))
 THEN RAISE EXCEPTION 'Navigation temporarily unavailable';END IF;
 SELECT b.campaign_id,b.width,b.height,b.grid_size INTO m
 FROM public.battle_maps b WHERE b.id=p_map;
 IF NOT FOUND OR m.grid_size<=0 OR
  NOT public.can_view_campaign_map(m.campaign_id,p_map)
 THEN RAISE EXCEPTION 'Navigation unavailable';END IF;
 map_w:=pg_catalog.floor(m.width::numeric/m.grid_size)::integer;
 map_h:=pg_catalog.floor(m.height::numeric/m.grid_size)::integer;
 IF map_w NOT BETWEEN 1 AND 1000 OR map_h NOT BETWEEN 1 AND 1000
 THEN RAISE EXCEPTION 'Invalid navigation grid';END IF;
 dm:=public.is_campaign_dm(m.campaign_id);
 IF p_kind='token' THEN
  SELECT mt.* INTO t FROM public.map_tokens mt WHERE mt.id=p_piece
   AND mt.map_id=p_map AND mt.campaign_id=m.campaign_id;
  IF NOT FOUND OR (NOT dm AND
    (t.owner_id IS DISTINCT FROM actor OR t.visible IS DISTINCT FROM true))
  THEN RAISE EXCEPTION 'Navigation piece unavailable';END IF;
  bx:=t.x;by:=t.y;span_w:=t.span_x;span_h:=t.span_y;
  attrs:=coalesce(t.npc_values,'{}'::jsonb);
  IF t.character_id IS NOT NULL THEN
   SELECT coalesce(c.field_values,'{}'::jsonb) INTO attrs FROM public.characters c
    WHERE c.id=t.character_id AND c.campaign_id=m.campaign_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Character unavailable';END IF;
  END IF;
 ELSE
  SELECT ci.* INTO u FROM public.campaign_tool_issues ci
  WHERE ci.id=p_piece AND ci.map_id=p_map AND ci.campaign_id=m.campaign_id;
  IF NOT FOUND OR u.held_by_token_id IS NOT NULL OR
   (NOT dm AND u.owner_id IS DISTINCT FROM actor AND u.party_shared IS DISTINCT FROM true)
  THEN RAISE EXCEPTION 'Navigation tool unavailable';END IF;
  bx:=u.x;by:=u.y;
  span_w:=CASE WHEN u.kind='mount' THEN
   coalesce((u.config->>'span')::double precision,2) ELSE 1 END;
  span_h:=span_w;attrs:=coalesce(u.state->'attrs','{}'::jsonb);
 END IF;
 IF bx IS NULL OR by IS NULL OR span_w IS NULL OR span_h IS NULL OR
  span_w<=0 OR span_h<=0 OR span_w>12 OR span_h>12
 THEN RAISE EXCEPTION 'Invalid navigation footprint';END IF;
 SELECT coalesce(e.live,'{}'::jsonb),coalesce(e.revision,0)
  INTO scene,env_revision FROM public.map_environments e
 WHERE e.map_id=p_map;
 scene:=coalesce(scene,'{}'::jsonb);
 SELECT coalesce(r.collision_enforced,false) INTO collision_on
 FROM forge_visibility.map_rules r WHERE r.map_id=p_map;
 collision_on:=coalesce(collision_on,false);
 SELECT coalesce(g.generation,0) INTO permission_generation
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=p_map;
 permission_generation:=coalesce(permission_generation,0);
 IF collision_on AND (pg_catalog.jsonb_typeof(scene->'objects')<>'array' OR
   pg_catalog.jsonb_array_length(scene->'objects')>120)
 THEN RAISE EXCEPTION 'Navigation scene unavailable';END IF;
 -- This existing viewer RPC computes sight and lighting using the ACTUAL
 -- signed-in user; its result contains no raw scene, NPC or wall metadata.
 fog_frame:=public.get_authorized_map_fog_v2(p_map);
 IF fog_frame->>'mapId' IS DISTINCT FROM p_map::text OR
  fog_frame->>'protocolVersion' IS DISTINCT FROM '2'
 THEN RAISE EXCEPTION 'Visibility authorization unavailable';END IF;
 fog_on:=coalesce((fog_frame->>'enabled')::boolean,true);
 SELECT pg_catalog.array_agg(value::integer) INTO visible_cells
 FROM pg_catalog.jsonb_array_elements_text(fog_frame->'visible') value;
 -- Do not call validate_piece_trajectory for every possible edge: that
 -- function reparses up to 120 walls for each of ~5,000 candidate transitions.
 -- Precompute exactly the barriers that the existing movement rule would
 -- block, retaining its state/attribute handling and swept footprint tests.
 IF collision_on THEN
  FOR barrier IN SELECT value FROM pg_catalog.jsonb_array_elements(scene->'objects') LOOP
   IF barrier->>'type' NOT IN ('wall','door','window') THEN CONTINUE;END IF;
   IF barrier->>'type' IN ('door','window') AND barrier->>'state'='broken'
   THEN CONTINUE;END IF;
   IF forge_visibility.wall_passes(barrier,attrs,'movement') THEN CONTINUE;END IF;
   points:=barrier->'points';
   IF pg_catalog.jsonb_typeof(points)<>'array' OR
      pg_catalog.jsonb_array_length(points) NOT BETWEEN 2 AND 80
   THEN RAISE EXCEPTION 'Navigation wall geometry unavailable';END IF;
   FOR segment_idx IN 1..pg_catalog.jsonb_array_length(points)-1 LOOP
    -- The native float-array contains no geometry in the RPC response.
    blockers:=blockers||ARRAY[
      (points->(segment_idx-1)->>'x')::double precision,
      (points->(segment_idx-1)->>'y')::double precision,
      (points->segment_idx->>'x')::double precision,
      (points->segment_idx->>'y')::double precision
    ];
    segment_count:=segment_count+1;
   END LOOP;
  END LOOP;
 END IF;
 -- The full 60 ft radius is preauthorized once, NOT checked per pointer step.
 -- Do not expose a remote lookup origin parameter (would permit map probing).
 FOR gx IN pg_catalog.greatest(0,bx-12)..
  pg_catalog.least(map_w-1,bx+12) LOOP
  FOR gy IN pg_catalog.greatest(0,by-12)..
   pg_catalog.least(map_h-1,by+12) LOOP
   IF NOT forge_visibility.navigation_position_observed(
    gx,gy,span_w,span_h,map_w,map_h,visible_cells,fog_on) THEN CONTINUE;END IF;
   mask:=0;
   FOR dir IN SELECT * FROM (VALUES
    (0,1,0),(1,-1,0),(2,0,1),(3,0,-1),
    (4,1,1),(5,1,-1),(6,-1,1),(7,-1,-1)
   ) AS directions(bit,dx,dy) LOOP
    tx:=gx+dir.dx;ty:=gy+dir.dy;
    IF NOT forge_visibility.navigation_position_observed(
      tx,ty,span_w,span_h,map_w,map_h,visible_cells,fog_on)
    THEN CONTINUE;END IF;
    allowed:=true;
    IF collision_on AND segment_count>0 THEN
     FOR scan_idx IN 1..segment_count LOOP
      ax:=blockers[4*scan_idx-3];ay:=blockers[4*scan_idx-2];
      ex:=blockers[4*scan_idx-1];ey:=blockers[4*scan_idx];
      -- Conservative broad-phase: only call the existing exact swept
      -- collision helper for segments intersecting the swept AABB.
      -- An epsilon-expansion prevents false negatives at shared boundaries.
      IF pg_catalog.greatest(ax,ex)<
           pg_catalog.least(gx,tx)-0.000001 OR
         pg_catalog.least(ax,ex)>
           pg_catalog.greatest(gx,tx)+span_w+0.000001 OR
         pg_catalog.greatest(ay,ey)<
           pg_catalog.least(gy,ty)-0.000001 OR
         pg_catalog.least(ay,ey)>
           pg_catalog.greatest(gy,ty)+span_h+0.000001
      THEN CONTINUE;END IF;
      IF forge_visibility.swept_hits_segment(
           gx,gy,span_w,span_h,tx,ty,ax,ay,ex,ey) OR
         forge_visibility.swept_hits_segment(
           tx,ty,span_w,span_h,tx,ty,ax,ay,ex,ey)
      THEN allowed:=false;EXIT;END IF;
     END LOOP;
    END IF;
    IF allowed THEN mask:=mask|(1<<dir.bit);END IF;
   END LOOP;
   nodes:=nodes||pg_catalog.jsonb_build_array(
     pg_catalog.jsonb_build_array(gx,gy,mask));
  END LOOP;
 END LOOP;
 -- Graphs contain only the component that is physically reachable from
 -- the controlled token/tool. Merely party-visible but disconnected cells
 -- cannot disclose remote, hidden portal/wall movement rules.
 candidate_nodes:=nodes;
 FOR node IN SELECT value FROM pg_catalog.jsonb_array_elements(candidate_nodes) LOOP
  candidate_masks:=candidate_masks||pg_catalog.jsonb_build_object(
   (node->>0)||':'||(node->>1),(node->>2)::integer);
 END LOOP;
 nodes:='[]'::jsonb;
 origin_key:=bx::text||':'||by::text;
 IF candidate_masks ? origin_key THEN
  reachable:=pg_catalog.jsonb_build_object(origin_key,true);
  pending_cells:=ARRAY[bx,by]::integer[];
  WHILE queue_index<=coalesce(pg_catalog.array_length(pending_cells,1),0) LOOP
   qx:=pending_cells[queue_index];qy:=pending_cells[queue_index+1];
   queue_index:=queue_index+2;
   mask:=(candidate_masks->>(qx::text||':'||qy::text))::integer;
   FOR dir IN SELECT * FROM (VALUES
     (0,1,0),(1,-1,0),(2,0,1),(3,0,-1),
     (4,1,1),(5,1,-1),(6,-1,1),(7,-1,-1)
    ) AS directions(bit,dx,dy) LOOP
    IF (mask & (1<<dir.bit))=0 THEN CONTINUE;END IF;
    tx:=qx+dir.dx;ty:=qy+dir.dy;
    neighbour_key:=tx::text||':'||ty::text;
    IF (candidate_masks ? neighbour_key) AND NOT (reachable ? neighbour_key) THEN
     reachable:=reachable||pg_catalog.jsonb_build_object(neighbour_key,true);
     pending_cells:=pending_cells||ARRAY[tx,ty];
    END IF;
   END LOOP;
  END LOOP;
  FOR node IN SELECT value FROM pg_catalog.jsonb_array_elements(candidate_nodes) LOOP
   IF reachable ? ((node->>0)||':'||(node->>1)) THEN
    nodes:=nodes||pg_catalog.jsonb_build_array(node);
   END IF;
  END LOOP;
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'version',1,'mapId',p_map,'pieceId',p_piece,'kind',p_kind,
  'origin',pg_catalog.jsonb_build_array(bx,by),'footprint',pg_catalog.jsonb_build_array(span_w,span_h),
  'gridWidth',map_w,'gridHeight',map_h,'visibilityRevision',
  (fog_frame->>'revision')::bigint,
  'environmentRevision',env_revision,'collisionEnabled',collision_on,
  'permissionGeneration',permission_generation,'nodes',nodes);
END $fn$;

REVOKE ALL ON FUNCTION forge_visibility.navigation_position_observed(
 integer,integer,double precision,double precision,integer,integer,integer[],boolean)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_authorized_map_navigation(uuid,text,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_authorized_map_navigation(uuid,text,uuid)
 TO authenticated,service_role;
