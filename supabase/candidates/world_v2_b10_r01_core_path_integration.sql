-- B10-R01 STAGING CANDIDATE ONLY. NEVER RUN AGAINST LIVE SUPABASE.
-- Dependency: released World Engine V2, B03 candidate, B07 then B08 candidates.
-- This replaces the existing PRIVATE advance_core_v2 body, not public RPCs.
-- The existing public.advance_world_motion_v2 B08 wrapper retains:
-- actor-bound session + exact-payload replay, recipient-private LOS broadcast,
-- and the same result schema. No new GRANT, table, index or transport.
--
-- B03 is the sole newly accepted-path calculator for FRESH advances.
-- The old core's duplicated per-step attribute-fetch/collision loop is
-- removed; B03 reads actor-bound frozen selection and current server attrs
-- once per batch and returns only private route bookkeeping.
CREATE OR REPLACE FUNCTION forge_world_v2.advance_core_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $b10_r01$
DECLARE
 s forge_world_v2.motion_sessions%ROWTYPE;
 candidate jsonb;
 accepted jsonb; steps jsonb; endpoint jsonb;
 attempted integer;processed integer;
 blocked boolean;reply jsonb;updated_session uuid;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL OR
  forge_world_v2.valid_point(p_from) IS DISTINCT FROM true OR
  jsonb_typeof(p_targets) IS DISTINCT FROM 'array' OR
  jsonb_array_length(p_targets) NOT BETWEEN 1 AND 8
 THEN RETURN NULL;END IF;

 -- Preserve identical completed-Advance replay and reject any fresh
 -- request on a revoked/expired session. The public B08 wrapper owns the
 -- exact-payload idempotency fingerprint; private Core is not a public API.
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_seq=s.last_seq AND s.last_reply IS NOT NULL THEN
  IF forge_world_v2.session_valid(s) IS TRUE THEN
   RETURN s.last_reply;
  END IF;
  RETURN NULL;
 END IF;
 IF p_seq<>s.last_seq+1 OR s.batches>=64 OR s.attempted_cells>=128 OR
  s.environment_revision IS DISTINCT FROM p_environment_revision OR
  s.permission_generation IS DISTINCT FROM p_permission_generation OR
  forge_world_v2.session_valid(s) IS DISTINCT FROM true
 THEN RETURN NULL;END IF;
 IF (p_from->>'x')::integer<>s.last_x OR
    (p_from->>'y')::integer<>s.last_y
 THEN RETURN NULL;END IF;

 -- B03 uses FOR UPDATE on the same owned session, current map/permission,
 -- current server-authored scene, frozen server-owned piece footprints and
 -- swept footprints at every intermediate tile. No UI-supplied collision.
 candidate:=forge_world_v2.validate_motion_path_batch_b03(
  p_session,p_seq,p_from,p_targets,
  p_environment_revision,p_permission_generation);
 IF candidate IS NULL OR
  jsonb_typeof(candidate) IS DISTINCT FROM 'object' OR
  candidate <> jsonb_strip_nulls(candidate) OR
  jsonb_typeof(candidate->'accepted') IS DISTINCT FROM 'array' OR
  jsonb_typeof(candidate->'routeSteps') IS DISTINCT FROM 'array' OR
  jsonb_typeof(candidate->'blocked') IS DISTINCT FROM 'boolean' OR
  forge_world_v2.valid_point(candidate->'endpoint') IS DISTINCT FROM true OR
  jsonb_typeof(candidate->'attemptedCells') IS DISTINCT FROM 'number' OR
  jsonb_typeof(candidate->'acceptedCells') IS DISTINCT FROM 'number'
 THEN RETURN NULL;END IF;

 -- Structural assertions make the public ack fail closed if a future
 -- internal candidate accidentally changes its contract.
 IF candidate <> jsonb_build_object(
  'accepted',candidate->'accepted',
  'blocked',candidate->'blocked',
  'endpoint',candidate->'endpoint',
  'routeSteps',candidate->'routeSteps',
  'attemptedCells',candidate->'attemptedCells',
  'acceptedCells',candidate->'acceptedCells')
 THEN RETURN NULL;END IF;

 attempted:=(candidate->>'attemptedCells')::integer;
 processed:=(candidate->>'acceptedCells')::integer;
 blocked:=(candidate->>'blocked')::boolean;
 accepted:=candidate->'accepted';
 steps:=candidate->'routeSteps';
 endpoint:=candidate->'endpoint';

 IF attempted<0 OR attempted>24 OR
  s.attempted_cells+attempted>128 OR
  processed<0 OR processed>attempted OR processed>24 OR
  processed<>jsonb_array_length(accepted) OR
  jsonb_array_length(steps)>64 OR
  (NOT blocked AND processed=0) OR
  (processed=0 AND endpoint IS DISTINCT FROM
   jsonb_build_object('x',s.last_x,'y',s.last_y)) OR
  (processed>0 AND endpoint IS DISTINCT FROM
   accepted->(jsonb_array_length(accepted)-1))
 THEN RETURN NULL;END IF;
 -- Route steps are never exposed to browser payloads; the public ACK is
 -- the same approved prefix, blocked flag and sequential identity as V2.
 reply:=jsonb_build_object(
  'version',2,'sessionId',s.id,'seq',p_seq,
  'blocked',blocked,'accepted',accepted);
 UPDATE forge_world_v2.motion_sessions
 SET last_x=(endpoint->>'x')::integer,
  last_y=(endpoint->>'y')::integer,
  last_seq=p_seq,
  accepted_steps=steps,
  accepted_cells=accepted_cells+processed,
  attempted_cells=attempted_cells+attempted,
  batches=batches+1,
  last_reply=reply,
  expires_at=least(created_at+interval '60 seconds',
   clock_timestamp()+interval '10 seconds')
 WHERE id=s.id AND actor_id=auth.uid() AND status='active'
  AND last_seq=s.last_seq AND environment_revision=p_environment_revision
  AND permission_generation=p_permission_generation
 RETURNING id INTO updated_session;
 IF updated_session IS NULL THEN RETURN NULL;END IF;
 RETURN reply;
END
$b10_r01$;

-- No schema USAGE or EXECUTE to browsers. Existing public RPC grants
-- continue to be governed by B08. Do not revoke public.advance_*.
REVOKE ALL ON FUNCTION forge_world_v2.advance_core_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_world_v2.validate_motion_path_batch_b03(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
FROM PUBLIC,anon,authenticated;
