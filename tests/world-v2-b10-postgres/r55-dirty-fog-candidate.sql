-- R18-55 EXPERIMENT: fail-closed lazy fog refresh ONLY in disposable PG17.
-- Candidate does not touch release SQL, production, RLS grants or the browser.
-- Unlike the baseline, Commit writes an audience-scoped dirty INVALIDATION
-- and scrubs internal cached frame. Separate authenticated read refreshes.
-- This may never ship without signed Realtime/visibility consumer changes.
\set ON_ERROR_STOP on
DO $r55_guard$
BEGIN
 IF current_database()<>'world_v2_b10_r05'
 OR to_regprocedure('public.b08_assert(boolean,text)') IS NULL
 OR to_regprocedure('forge_visibility.bump_viewer_ticks(uuid,uuid[])') IS NULL
 OR to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)') IS NULL
 OR to_regclass('forge_visibility.viewer_fog_snapshots') IS NULL
 OR to_regprocedure('forge_world_v2.commit_allows_piece_v2(text,uuid,uuid,uuid,integer,integer,integer,integer)') IS NULL
 THEN RAISE EXCEPTION 'R55 candidate refused outside source-real local fixture';END IF;
END $r55_guard$;

-- Preserve the exact R54 hash-proven source to use as a trusted refresh
-- later. Only the function NAME changes, not original implementation.
ALTER FUNCTION forge_visibility.bump_viewer_ticks(uuid,uuid[])
 RENAME TO r55_source_full_bump_viewer_ticks;

CREATE OR REPLACE FUNCTION forge_visibility.bump_viewer_ticks(
 p_map uuid,p_viewers uuid[] DEFAULT NULL::uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r55_dirty$
BEGIN
 IF p_map IS NULL THEN RETURN;END IF;
 -- Exactly the original recipient selection (sorted LIMIT 32).
 -- No fog frame, ray trace, lighting, exploration or visible geometry.
 WITH recipients AS MATERIALIZED (
  SELECT m.id AS map_id,m.campaign_id,cm.user_id,
         coalesce(r.fog_enforced,false) AS fog_on
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
 ), marked AS (
  INSERT INTO public.map_viewer_visibility_ticks(
   map_id,campaign_id,user_id,revision,fog_enforced,updated_at,authorized_frame
  )
  SELECT map_id,campaign_id,user_id,1,fog_on,now(),NULL::jsonb
  FROM recipients
  ON CONFLICT(map_id,user_id) DO UPDATE SET
   revision=public.map_viewer_visibility_ticks.revision+1,
   fog_enforced=excluded.fog_enforced,updated_at=now(),
   authorized_frame=NULL
  RETURNING map_id,user_id
 )
 UPDATE forge_visibility.viewer_fog_snapshots f
 SET frame='{}'::jsonb,updated_at=now()
 FROM marked d
 WHERE f.map_id=d.map_id AND f.user_id=d.user_id;
END $r55_dirty$;

-- Experimental guarded read: NO recipient ID input, derive only auth.uid.
-- This must remain private/test-only; production has different signed RPCs.
CREATE OR REPLACE FUNCTION forge_visibility.r55_try_authorized_frame(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r55_guarded$
DECLARE actor uuid:=auth.uid();frame jsonb;revision_now bigint;
 permission_now bigint;environment_now bigint;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
    current_setting('request.jwt.claim.role',true)<>'authenticated'
 THEN RETURN NULL;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.battle_maps m
  JOIN public.campaigns c ON c.id=m.campaign_id
  JOIN public.campaign_members cm
   ON cm.campaign_id=m.campaign_id AND cm.user_id=actor
  LEFT JOIN public.campaign_player_maps pm
   ON pm.campaign_id=m.campaign_id AND pm.user_id=actor
  WHERE m.id=p_map AND cm.role='player'
   AND coalesce(pm.map_id,c.active_map_id)=m.id
 ) THEN RETURN NULL;END IF;
 SELECT authorized_frame,revision INTO frame,revision_now
 FROM public.map_viewer_visibility_ticks
 WHERE map_id=p_map AND user_id=actor;
 SELECT coalesce(g.generation,0) INTO permission_now
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=p_map;
 permission_now:=coalesce(permission_now,0);
 SELECT coalesce(e.revision,0) INTO environment_now
 FROM public.map_environments e WHERE e.map_id=p_map;
 environment_now:=coalesce(environment_now,0);
 IF frame IS NULL OR jsonb_typeof(frame)<>'object' OR
    (frame->>'revision') !~ '^[0-9]+$' OR
    (frame->>'revision')::bigint IS DISTINCT FROM revision_now OR
    (frame->>'protocolVersion') IS DISTINCT FROM '2' OR
    (frame->>'permissionGeneration') !~ '^[0-9]+$' OR
    (frame->>'permissionGeneration')::bigint IS DISTINCT FROM permission_now OR
    (frame->>'navigationEnvironmentRevision') !~ '^[0-9]+$' OR
    (frame->>'navigationEnvironmentRevision')::bigint IS DISTINCT FROM environment_now
 THEN RETURN NULL;END IF;
 RETURN frame;
EXCEPTION WHEN others THEN
 -- No failure may expose the previous signed frame.
 RETURN NULL;
END $r55_guarded$;

CREATE OR REPLACE FUNCTION forge_visibility.r55_refresh_for_caller(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r55_refresh$
DECLARE actor uuid:=auth.uid();frame jsonb;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
    current_setting('request.jwt.claim.role',true)<>'authenticated'
 THEN RETURN NULL;END IF;
 -- Check membership AT REFRESH TIME before any private snapshot recompute.
 IF NOT EXISTS (
  SELECT 1 FROM public.battle_maps m
  JOIN public.campaigns c ON c.id=m.campaign_id
  JOIN public.campaign_members cm
   ON cm.campaign_id=m.campaign_id AND cm.user_id=actor
  LEFT JOIN public.campaign_player_maps pm
   ON pm.campaign_id=m.campaign_id AND pm.user_id=actor
  WHERE m.id=p_map AND cm.role='player'
   AND coalesce(pm.map_id,c.active_map_id)=m.id
 ) THEN RETURN NULL;END IF;
 -- Serialize with original source, and with same-viewer refresh attempts.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_map::text||':'||actor::text,0));
 frame:=forge_visibility.r55_try_authorized_frame(p_map);
 IF frame IS NOT NULL THEN RETURN frame;END IF;
 PERFORM forge_visibility.r55_source_full_bump_viewer_ticks(
  p_map,ARRAY[actor]::uuid[]);
 -- A post-recomputation membership check refuses a revoked recipient.
 RETURN forge_visibility.r55_try_authorized_frame(p_map);
EXCEPTION WHEN others THEN
 -- Fail closed even if full frame computing/locking fails.
 RETURN NULL;
END $r55_refresh$;

-- Exact internal functions cannot be directly called by browser roles in
-- this experiment. No public RPC or grants are added.
REVOKE ALL ON FUNCTION forge_visibility.bump_viewer_ticks(uuid,uuid[])
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_visibility.r55_source_full_bump_viewer_ticks(uuid,uuid[])
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_visibility.r55_try_authorized_frame(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_visibility.r55_refresh_for_caller(uuid)
 FROM PUBLIC,anon,authenticated;
