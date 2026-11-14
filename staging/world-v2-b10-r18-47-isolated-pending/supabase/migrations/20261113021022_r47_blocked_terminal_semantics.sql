-- B10-R18-30 STAGING-ONLY, UNVERSIONED post-R05, post-R18-28
-- SQL candidate. NEVER execute against production Supabase.
-- Exact R18-28 public.finalize_world_motion_v2 body with ONLY:
-- (1) an actor+revision-rechecked cached no-motion cancellation receipt,
-- (2) blocked-only last batch => canonical Commit of PREVIOUSLY accepted
--     cells, if any, rather than silently discarding valid progress, and
-- (3) no-motion first blocked step => cancel session with exact receipt,
--     no token/tool writes and no private position/observer broadcast.
-- All previous Advance/Commit/auth/LOS/revocation/ACL/function SQL unchanged.
-- Exact original R18-28 source blob pinned in 18-30 Node parity tests.
-- No new GRANT; R18-28 authenticated-only EXECUTE remains in force.
CREATE OR REPLACE FUNCTION public.finalize_world_motion_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $r18_28$
DECLARE
 s forge_world_v2.motion_sessions%ROWTYPE;
 fingerprint jsonb;
 advanced jsonb;canonical jsonb;endpoint jsonb;combined jsonb;
 last_accepted integer;updated uuid;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR
    p_seq IS NULL OR p_seq NOT BETWEEN 1 AND 9223372036854775806::bigint OR
    p_environment_revision IS NULL OR p_permission_generation IS NULL OR
    p_environment_revision<0 OR p_permission_generation<0 OR
    forge_world_v2.valid_point(p_from) IS DISTINCT FROM true OR
    jsonb_typeof(p_targets) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_targets) NOT BETWEEN 1 AND 8
 THEN RETURN NULL;END IF;

 fingerprint:=jsonb_build_object(
  'seq',p_seq,'from',p_from,'targets',p_targets,
  'environmentRevision',p_environment_revision,
  'permissionGeneration',p_permission_generation);

 -- The session lock serializes all actor-bound requests; no new permission
 -- policy is introduced and no endpoint is ever supplied by the browser.
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;

 -- R18-30: first-step fully blocked attempts can be safely finalized
 -- as a zero-movement cancellation, with an exact bounded retry receipt.
 -- There is NO canonical position write and no private path to broadcast.
 IF s.status='cancelled' THEN
  IF s.accepted_cells<>0 OR
     s.final_request_r28 IS DISTINCT FROM fingerprint OR
     s.final_reply_r28->'noMotion' IS DISTINCT FROM 'true'::jsonb OR
     s.final_reply_r28->>'sessionId' IS DISTINCT FROM p_session::text OR
     s.final_reply_r28->'seq' IS DISTINCT FROM to_jsonb(p_seq) OR
     clock_timestamp()>s.expires_at OR
     NOT public.can_view_campaign_map(s.campaign_id,s.map_id) OR
     (SELECT coalesce(g.generation,0)
      FROM forge_visibility.navigation_permission_generations g
      WHERE g.map_id=s.map_id) IS DISTINCT FROM s.permission_generation OR
     (SELECT e.revision FROM public.map_environments e
      WHERE e.map_id=s.map_id AND e.campaign_id=s.campaign_id)
      IS DISTINCT FROM s.environment_revision
  THEN RETURN NULL;END IF;
  RETURN s.final_reply_r28;
 END IF;

 IF s.status='committed' THEN
  IF s.last_seq IS DISTINCT FROM p_seq+1 OR
     s.final_request_r28 IS DISTINCT FROM fingerprint OR
     s.final_reply_r28 IS NULL OR
     clock_timestamp()>s.expires_at
  THEN RETURN NULL;END IF;
  endpoint:=jsonb_build_object('x',s.last_x,'y',s.last_y);
  -- The ORIGINAL exact-retry implementation must still approve access and
  -- current revisions. It also processes authorized pending private hides.
  canonical:=public.commit_world_motion_v2(
   p_session,p_seq+1,endpoint,
   p_environment_revision,p_permission_generation);
  IF canonical IS NULL OR canonical->>'sessionId' IS DISTINCT FROM
      p_session::text OR (canonical->>'seq')::bigint IS DISTINCT FROM p_seq+1 OR
     canonical->'endpoint' IS DISTINCT FROM endpoint
  THEN RETURN NULL;END IF;
  RETURN s.final_reply_r28;
 END IF;

 IF s.status<>'active' OR s.mode='preview' OR
    s.last_seq IS DISTINCT FROM p_seq-1 OR
    forge_world_v2.session_valid(s) IS DISTINCT FROM true OR
    p_from IS DISTINCT FROM jsonb_build_object('x',s.last_x,'y',s.last_y)
 THEN RETURN NULL;END IF;

 -- Failure after a successful Advance MUST roll back its state and
 -- recipient-private writes; catching only this intentional SQLSTATE keeps
 -- unrelated database errors visible and fail-closed.
 BEGIN
  advanced:=public.advance_world_motion_v2(
   p_session,p_seq,p_from,p_targets,
   p_environment_revision,p_permission_generation);
  IF advanced IS NULL OR
     advanced->>'sessionId' IS DISTINCT FROM p_session::text OR
     (advanced->>'seq')::bigint IS DISTINCT FROM p_seq OR
     jsonb_typeof(advanced->'accepted') IS DISTINCT FROM 'array' OR
     jsonb_typeof(advanced->'blocked') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'R28 rejected final Advance'
    USING ERRCODE='PZ828';END IF;
  IF jsonb_array_length(advanced->'accepted')=0 THEN
   -- Only an explicitly server-blocked route can have zero new approved
   -- cells. Caller-supplied targets never authorize the current endpoint.
   IF advanced->'blocked' IS DISTINCT FROM 'true'::jsonb
   THEN RAISE EXCEPTION 'R30 missing blocked acknowledgement'
     USING ERRCODE='PZ828';END IF;
   endpoint:=jsonb_build_object('x',s.last_x,'y',s.last_y);
   IF s.accepted_cells=0 THEN
    -- First cell blocked: close this session as a NO-MOTION gesture.
    -- Do not fabricate a canonical Commit (which requires accepted_cells>0).
    -- Store the actor-bound exact receipt for safe lost-ACK retries.
    combined:=jsonb_build_object(
     'version',2,'sessionId',p_session,'seq',p_seq,
     'commitSeq',p_seq+1,'accepted','[]'::jsonb,
     'blocked',true,'endpoint',endpoint,
     'finalized',true,'noMotion',true);
    UPDATE forge_world_v2.motion_sessions
    SET status='cancelled',last_seq=p_seq+1,
     final_request_r28=fingerprint,final_reply_r28=combined,
     expires_at=clock_timestamp()+interval '10 seconds'
    WHERE id=p_session AND actor_id=auth.uid()
     AND status='active' AND last_seq=p_seq
     AND accepted_cells=0 AND accepted_steps='[]'::jsonb
     AND last_x=s.last_x AND last_y=s.last_y
    RETURNING id INTO updated;
    IF updated IS NULL
    THEN RAISE EXCEPTION 'R30 no-motion receipt unavailable'
      USING ERRCODE='PZ828';END IF;
    RETURN combined;
   END IF;
   -- Older, already-approved batches exist. Canonical Commit must still
   -- validate and persist those accepted legs, even when this final
   -- attempted cell was entirely blocked. NoMotion is intentionally ABSENT.
  ELSE
   last_accepted:=jsonb_array_length(advanced->'accepted')-1;
   endpoint:=advanced->'accepted'->last_accepted;
  END IF;
  IF forge_world_v2.valid_point(endpoint) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'R28 invalid canonical endpoint'
    USING ERRCODE='PZ828';END IF;
  canonical:=public.commit_world_motion_v2(
   p_session,p_seq+1,endpoint,
   p_environment_revision,p_permission_generation);
  IF canonical IS NULL OR
     canonical->>'sessionId' IS DISTINCT FROM p_session::text OR
     (canonical->>'seq')::bigint IS DISTINCT FROM p_seq+1 OR
     canonical->'endpoint' IS DISTINCT FROM endpoint
  THEN RAISE EXCEPTION 'R28 canonical Commit denied'
    USING ERRCODE='PZ828';END IF;

  combined:=jsonb_build_object(
   'version',2,'sessionId',p_session,'seq',p_seq,
   'commitSeq',p_seq+1,'accepted',advanced->'accepted',
   'blocked',advanced->'blocked','endpoint',endpoint,
   'finalized',true);
  -- Exact immutable retry proof. Keep existing last_reply (the legacy
  -- Commit ACK) untouched so old clients can still use their own retry.
  UPDATE forge_world_v2.motion_sessions
  SET final_request_r28=fingerprint,final_reply_r28=combined
  WHERE id=p_session AND actor_id=auth.uid()
    AND status='committed' AND last_seq=p_seq+1
  RETURNING id INTO updated;
  IF updated IS NULL
  THEN RAISE EXCEPTION 'R28 commit receipt unavailable'
    USING ERRCODE='PZ828';END IF;
 EXCEPTION WHEN SQLSTATE 'PZ828' THEN
  -- Rolls back BOTH old RPCs and all session/outbox writes in this
  -- inner subtransaction; caller receives no accidental partial approval.
  RETURN NULL;
 END;
 RETURN combined;
END $r18_28$;
