-- B10-R18-28. EXPERIMENTAL, UNVERSIONED POST-R05 CANDIDATE.
-- NEVER INSTALL ON LIVE SUPABASE. Depends on reviewed R05 -> R18-17 ->
-- R18-19 -> R18-20 -> R18-26 -> R18-27 source stack.
-- One *optional*, actor-bound public RPC joins the EXACT existing Advance
-- and Commit RPCs inside a single database transaction. It does not alter
-- normal V2 callers; the frontend never invokes this candidate until a
-- separately reviewed protocol and genuine Auth/LOS acceptance release.
--
-- If either phase fails, a deliberate SQLSTATE exception rolls back the
-- inner subtransaction: no partial session change, checkpoint, pending
-- observer outbox, or canonical token update may survive a NULL reply.
-- A blocked route with NO accepted prefix fails closed without changing
-- session state. Accepted blocked prefixes may commit only their accepted
-- server-validated final cell, as in the existing two-RPC flow.
--
-- Exact idempotent retry is stored on the private actor session. A retry
-- re-enters the original Commit retry function to recheck revocation,
-- current map/permission/environment and drain only eligible private hides.
-- The old normal Advance/Commit replay fields and reply are unchanged.
-- No client-supplied endpoint or private sight is ever trusted.
ALTER TABLE forge_world_v2.motion_sessions
 ADD COLUMN final_request_r28 jsonb,
 ADD COLUMN final_reply_r28 jsonb;

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
     jsonb_typeof(advanced->'blocked') IS DISTINCT FROM 'boolean' OR
     jsonb_array_length(advanced->'accepted')<1
  THEN RAISE EXCEPTION 'R28 rejected final Advance'
    USING ERRCODE='PZ828';END IF;
  last_accepted:=jsonb_array_length(advanced->'accepted')-1;
  endpoint:=advanced->'accepted'->last_accepted;
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

-- This is a new *public* SECURITY DEFINER RPC. Deny PUBLIC / anon first;
-- only independently authenticated users may enter its actor-bound logic.
REVOKE ALL ON FUNCTION public.finalize_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) TO authenticated;
-- Private session table columns inherit existing restrictive RLS/grants.
