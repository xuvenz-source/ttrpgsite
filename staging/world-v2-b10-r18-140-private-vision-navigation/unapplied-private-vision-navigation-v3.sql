-- B10-R18-140 SOURCE-ONLY / UNAPPLIED. NEVER RUN ON ANY HOSTED SUPABASE.
-- Must follow R125 R126 R128 R136 R132 R138 stacked candidates.
-- Inherently UNSAFE TO DEPLOY without full real actor/LOS/Realtime/Storage QA.
-- Adds five private-definer implementations and five exposed INVOKER stubs.
-- All ten new routines explicitly EXECUTE-REVOKED; NO new grants of any kind.
-- This preserves original V2 authorized viewer payload versions (1 / 2).
BEGIN;
DO $r140_preflight$
DECLARE n integer;
BEGIN
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
    pg_catalog.has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R140 R128 public API fence absent';END IF;
 IF pg_catalog.to_regprocedure('forge_scene_drain.scene_v3_publish_allowed()') IS NULL OR
    pg_catalog.to_regprocedure('forge_v3_api.get_authorized_world_sight_v3(uuid)') IS NULL OR
    pg_catalog.to_regprocedure('forge_v3_internal.get_authorized_scene_channel_v3(uuid)') IS NULL
 THEN RAISE EXCEPTION 'R140 requires complete R132 and R138 stacked candidates';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_policies
  WHERE schemaname='realtime' AND tablename='messages'
    AND policyname='World V2 scene publication receive')
 THEN RAISE EXCEPTION 'R140 old V2 shared scene channel still subscribable';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api';
 IF n<>8 THEN RAISE EXCEPTION 'R140 expected exact inherited eight V3 API functions';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal';
 IF n<>8 THEN RAISE EXCEPTION 'R140 expected exact inherited eight private helpers';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api'
 AND (p.prosecdef OR
 (p.proname<>'get_authorized_scene_channel_v3'
  AND (pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
       OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R140 inherited exposed API privileges drifted';END IF;
 IF pg_catalog.to_regprocedure('public.preview_world_visibility_v2(uuid,uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.preview_world_visibility_at_v2(uuid,uuid,uuid,integer,integer)') IS NULL
 OR pg_catalog.to_regprocedure('public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)') IS NULL
 OR pg_catalog.to_regprocedure('public.get_authorized_map_light_masks_v2(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.get_authorized_map_navigation(uuid,text,uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.is_campaign_dm(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_world_v2.viewer_on_map(uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'R140 original signed role/vision/navigation authority absent';END IF;
END $r140_preflight$;


-- Trusted original V2 source remains sole authority. This is NOT a solver.
CREATE FUNCTION forge_v3_internal.get_authorized_world_preview_v3(p_map uuid,p_viewer uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r140_impl$
DECLARE actor uuid:=auth.uid();topic text;reply jsonb;camp uuid;
BEGIN

 IF p_viewer IS NULL THEN RETURN NULL;END IF;

 IF actor IS NULL OR p_map IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL OR NOT public.is_campaign_dm(camp) OR
  forge_world_v2.viewer_on_map(camp,p_map,p_viewer) IS DISTINCT FROM 'player'
 THEN RETURN NULL;END IF;
 -- This original function deliberately does NOT store viewer exploration.
 reply:=public.preview_world_visibility_v2(p_map,p_viewer);
 IF pg_catalog.jsonb_typeof(reply)<>'object' OR
  reply->>'version' IS DISTINCT FROM '2' OR
  reply->>'mapId' IS DISTINCT FROM p_map::text OR
  reply->>'viewerId' IS DISTINCT FROM p_viewer::text OR
  reply->>'scope' IS DISTINCT FROM 'viewer' OR
  pg_catalog.jsonb_typeof(reply->'visible') IS DISTINCT FROM 'array' OR
  pg_catalog.jsonb_typeof(reply->'explored') IS DISTINCT FROM 'array' OR
  pg_catalog.jsonb_typeof(reply->'visiblePieces') IS DISTINCT FROM 'array'
 THEN RETURN NULL;END IF;
 RETURN reply;
END $r140_impl$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_preview_v3(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- Trusted original V2 source remains sole authority. This is NOT a solver.
CREATE FUNCTION forge_v3_internal.get_authorized_world_preview_at_v3(p_map uuid,p_viewer uuid,p_token uuid,p_x integer,p_y integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r140_impl$
DECLARE actor uuid:=auth.uid();topic text;reply jsonb;camp uuid;
BEGIN

 IF p_viewer IS NULL OR p_token IS NULL OR p_x IS NULL OR
    p_y IS NULL OR p_x<0 OR p_y<0 THEN RETURN NULL;END IF;

 IF actor IS NULL OR p_map IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL OR NOT public.is_campaign_dm(camp) OR
  forge_world_v2.viewer_on_map(camp,p_map,p_viewer) IS DISTINCT FROM 'player'
 THEN RETURN NULL;END IF;
 -- Original preview checks token owner, visibility, campaign, footprint and
 -- map bounds; never replace it with caller-provided coordinates as truth.
 reply:=public.preview_world_visibility_at_v2(p_map,p_viewer,p_token,p_x,p_y);
 IF pg_catalog.jsonb_typeof(reply)<>'object' OR
  reply->>'version' IS DISTINCT FROM '2' OR
  reply->>'mapId' IS DISTINCT FROM p_map::text OR
  reply->>'viewerId' IS DISTINCT FROM p_viewer::text OR
  reply->>'scope' IS DISTINCT FROM 'viewer' OR
  pg_catalog.jsonb_typeof(reply->'visible') IS DISTINCT FROM 'array' OR
  pg_catalog.jsonb_typeof(reply->'explored') IS DISTINCT FROM 'array' OR
  pg_catalog.jsonb_typeof(reply->'visiblePieces') IS DISTINCT FROM 'array'
 THEN RETURN NULL;END IF;
 RETURN reply;
END $r140_impl$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_preview_at_v3(uuid,uuid,uuid,integer,integer)
 FROM PUBLIC,anon,authenticated;

-- Trusted original V2 source remains sole authority. This is NOT a solver.
CREATE FUNCTION forge_v3_internal.get_authorized_world_fog_delta_v3(p_map uuid,p_base_epoch uuid DEFAULT NULL,p_base_revision bigint DEFAULT NULL,p_base_sequence bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r140_impl$
DECLARE actor uuid:=auth.uid();topic text;reply jsonb;
BEGIN

 -- Either a complete exact base tuple or a full new snapshot. Partial base
 -- tuples cannot request an ambiguous incremental authorization.
 IF (p_base_epoch IS NULL AND
      (p_base_revision IS NOT NULL OR p_base_sequence IS NOT NULL)) OR
    (p_base_epoch IS NOT NULL AND
      (p_base_revision IS NULL OR p_base_sequence IS NULL OR
       p_base_revision<0 OR p_base_sequence<0))
 THEN RETURN NULL;END IF;

 IF actor IS NULL OR p_map IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 -- Never invoke legacy get_authorized_map_fog() or client fallback.
 -- This original RPC enforces actor-specific epoch/revision/sequence
 -- and serializes the viewer snapshot row with FOR UPDATE.
 reply:=public.get_authorized_map_fog_delta(
  p_map,p_base_epoch,p_base_revision,p_base_sequence);
 IF pg_catalog.jsonb_typeof(reply)<>'object' OR
    reply->>'mapId' IS DISTINCT FROM p_map::text OR
    reply->>'protocolVersion' IS DISTINCT FROM '2' OR
    reply->>'deltaProtocolVersion' IS DISTINCT FROM '1' OR
    (reply->>'mode' IS NULL OR reply->>'mode' NOT IN ('noop','delta','snapshot')) OR
    pg_catalog.jsonb_typeof(reply->'epoch') IS DISTINCT FROM 'string' OR
    pg_catalog.jsonb_typeof(reply->'revision') IS DISTINCT FROM 'number' OR
    pg_catalog.jsonb_typeof(reply->'sequence') IS DISTINCT FROM 'number'
 THEN RETURN NULL;END IF;
 IF reply->>'mode'='snapshot' AND
  (pg_catalog.jsonb_typeof(reply->'visible') IS DISTINCT FROM 'array' OR
   pg_catalog.jsonb_typeof(reply->'explored') IS DISTINCT FROM 'array')
 THEN RETURN NULL;END IF;
 IF reply->>'mode'='delta' AND
  (p_base_epoch IS NULL OR
   reply->>'baseRevision' IS DISTINCT FROM p_base_revision::text OR
   reply->>'baseSequence' IS DISTINCT FROM p_base_sequence::text OR
   pg_catalog.jsonb_typeof(reply->'visibleAdd') IS DISTINCT FROM 'array' OR
   pg_catalog.jsonb_typeof(reply->'visibleRemove') IS DISTINCT FROM 'array' OR
   pg_catalog.jsonb_typeof(reply->'exploredAdd') IS DISTINCT FROM 'array' OR
   pg_catalog.jsonb_typeof(reply->'exploredRemove') IS DISTINCT FROM 'array')
 THEN RETURN NULL;END IF;
 IF reply->>'mode'='noop' AND
  (p_base_epoch IS NULL OR
   reply->>'epoch' IS DISTINCT FROM p_base_epoch::text OR
   reply->>'revision' IS DISTINCT FROM p_base_revision::text OR
   reply->>'sequence' IS DISTINCT FROM p_base_sequence::text)
 THEN RETURN NULL;END IF;
 RETURN reply;
END $r140_impl$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_fog_delta_v3(uuid,uuid,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

-- Trusted original V2 source remains sole authority. This is NOT a solver.
CREATE FUNCTION forge_v3_internal.get_authorized_world_light_masks_v3(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r140_impl$
DECLARE actor uuid:=auth.uid();topic text;reply jsonb;
BEGIN


 IF actor IS NULL OR p_map IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 reply:=public.get_authorized_map_light_masks_v2(p_map);
 IF pg_catalog.jsonb_typeof(reply)<>'object' OR
    reply->>'mapId' IS DISTINCT FROM p_map::text OR
    reply->>'protocolVersion' IS DISTINCT FROM '2' OR
    pg_catalog.jsonb_typeof(reply->'revision') IS DISTINCT FROM 'number' OR
    pg_catalog.jsonb_typeof(reply->'masks') IS DISTINCT FROM 'array'
 THEN RETURN NULL;END IF;
 RETURN reply;
END $r140_impl$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_light_masks_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Trusted original V2 source remains sole authority. This is NOT a solver.
CREATE FUNCTION forge_v3_internal.get_authorized_world_navigation_v3(p_map uuid,p_kind text,p_piece uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r140_impl$
DECLARE actor uuid:=auth.uid();topic text;reply jsonb;
BEGIN

 IF p_piece IS NULL OR p_kind IS NULL OR p_kind NOT IN ('token','tool')
 THEN RETURN NULL;END IF;

 IF actor IS NULL OR p_map IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 -- Original signature and actor-owned collision/LOS graph are unchanged.
 reply:=public.get_authorized_map_navigation(p_map,p_kind,p_piece);
 IF pg_catalog.jsonb_typeof(reply)<>'object' OR
    reply->>'version' IS DISTINCT FROM '1' OR
    reply->>'mapId' IS DISTINCT FROM p_map::text OR
    reply->>'pieceId' IS DISTINCT FROM p_piece::text OR
    reply->>'kind' IS DISTINCT FROM p_kind OR
    pg_catalog.jsonb_typeof(reply->'nodes') IS DISTINCT FROM 'array' OR
    pg_catalog.jsonb_typeof(reply->'environmentRevision') IS DISTINCT FROM 'number' OR
    pg_catalog.jsonb_typeof(reply->'permissionGeneration') IS DISTINCT FROM 'number'
 THEN RETURN NULL;END IF;
 RETURN reply;
END $r140_impl$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_navigation_v3(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;

-- Every public-surface API function is SECURITY INVOKER. The caller would
-- additionally need a future narrow private-helper grant to reach the
-- SECURITY DEFINER, but R140 deliberately makes NONE.

CREATE FUNCTION forge_v3_api.get_authorized_world_preview_v3(p_map uuid,p_viewer uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r140_forward$
 SELECT forge_v3_internal.get_authorized_world_preview_v3(p_map,p_viewer)
$r140_forward$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_preview_v3(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_world_preview_at_v3(p_map uuid,p_viewer uuid,p_token uuid,p_x integer,p_y integer)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r140_forward$
 SELECT forge_v3_internal.get_authorized_world_preview_at_v3(p_map,p_viewer,p_token,p_x,p_y)
$r140_forward$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_preview_at_v3(uuid,uuid,uuid,integer,integer)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_world_fog_delta_v3(p_map uuid,p_base_epoch uuid DEFAULT NULL,p_base_revision bigint DEFAULT NULL,p_base_sequence bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r140_forward$
 SELECT forge_v3_internal.get_authorized_world_fog_delta_v3(p_map,p_base_epoch,p_base_revision,p_base_sequence)
$r140_forward$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_fog_delta_v3(uuid,uuid,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_world_light_masks_v3(p_map uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r140_forward$
 SELECT forge_v3_internal.get_authorized_world_light_masks_v3(p_map)
$r140_forward$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_light_masks_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_world_navigation_v3(p_map uuid,p_kind text,p_piece uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r140_forward$
 SELECT forge_v3_internal.get_authorized_world_navigation_v3(p_map,p_kind,p_piece)
$r140_forward$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_navigation_v3(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;

DO $r140_postflight$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api';
 IF n<>13 THEN RAISE EXCEPTION 'R140 expected eight inherited plus five new API entries';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal';
 IF n<>13 THEN RAISE EXCEPTION 'R140 expected eight inherited plus five new private helpers';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api' AND
  (p.prosecdef OR
   (p.proname<>'get_authorized_scene_channel_v3' AND
    (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
     pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R140 no experimental API can be callable by browser roles';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal' AND
  (NOT p.prosecdef OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
   (p.proname<>'get_authorized_scene_channel_v3' AND
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))))
 THEN RAISE EXCEPTION 'R140 private definer leaked EXECUTE';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
    pg_catalog.has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R140 legacy public RPC schema reopened';END IF;
 IF NOT pg_catalog.has_function_privilege('authenticated',
  'forge_v3_api.get_authorized_scene_channel_v3(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R140 inherited authenticated topic gateway lost access';END IF;
END $r140_postflight$;
COMMIT;
-- NO_GO: source-only/never hosted. Full original semantic auth, LOS,
-- signed DM/P1/P2/outsider, 17 Realtime tables/old sockets, Storage
-- bearer URLs and free-tier movement/fog performance remain unproven.
