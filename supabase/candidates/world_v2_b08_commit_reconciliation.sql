-- B08 NONAPPLIED SQL CANDIDATE. REQUIRES the complete B07 candidate first.
-- Staging only; not under supabase/migrations; do not apply to live Supabase.
-- Source-derived from the actual V2 public Advance wrapper and Commit RPC.
-- No new public RPC, role grant, Realtime topic or client-selected position.
-- Uses the same atomic checkpoint, sorted row locks and collision rechecks.
-- Supabase auth.uid(), current map authorization and current LOS still apply.
ALTER TABLE forge_world_v2.motion_sessions
 ADD COLUMN last_advance_request_b08 jsonb,
 ADD COLUMN last_commit_request_b08 jsonb;

CREATE OR REPLACE FUNCTION forge_world_v2.drain_committed_observers_b08(
 p_session uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b08$
DECLARE s forge_world_v2.motion_sessions%ROWTYPE;
 recipient record; i integer; sent integer:=0;result integer;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_now IS NULL
 THEN RETURN 0;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() AND status='committed'
  AND p_now<=expires_at FOR UPDATE;
 IF NOT FOUND THEN RETURN 0;END IF;
 -- B07's flush rechecks the current viewer, scene, permission and LOS
 -- under its own locks. A budget outage leaves the exact FIFO intact.
 FOR recipient IN
  SELECT viewer_id FROM forge_world_v2.observer_pending_b07
  WHERE session_id=p_session ORDER BY viewer_id LIMIT 32
 LOOP
  -- Bounded: never turn terminal commit into 64 RPCs per viewer.
  FOR i IN 1..4 LOOP
   result:=forge_world_v2.flush_recipient_observer_b07(
    s,recipient.viewer_id,p_now);
   sent:=sent+result;
   EXIT WHEN result<>1;
  END LOOP;
 END LOOP;
 DELETE FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session AND pending='[]'::jsonb
  AND deferred='[]'::jsonb;
 RETURN sent;
END $b08$;

-- Exact-payload sequence replay hardening for the existing public RPC.
CREATE OR REPLACE FUNCTION public.advance_world_motion_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE before_seq bigint;current_session forge_world_v2.motion_sessions%rowtype;
 result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL
 THEN RETURN NULL;END IF;
 SELECT * INTO current_session FROM forge_world_v2.motion_sessions
  WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Bind replay to the EXACT previous request. Same sequence with a
 -- changed path, revisions or from-point is not an idempotent retry.
 IF p_seq<current_session.last_seq THEN RETURN NULL;END IF;
 IF p_seq=current_session.last_seq AND
   current_session.last_advance_request_b08 IS DISTINCT FROM
    jsonb_build_object('from',p_from,'targets',p_targets,
     'environmentRevision',p_environment_revision,
     'permissionGeneration',p_permission_generation)
 THEN RETURN NULL;END IF;
 before_seq:=current_session.last_seq;
 result:=forge_world_v2.advance_core_v2(
  p_session,p_seq,p_from,p_targets,
  p_environment_revision,p_permission_generation);
 IF result IS NULL THEN RETURN NULL;END IF;
 IF p_seq>before_seq THEN
  UPDATE forge_world_v2.motion_sessions
  SET last_advance_request_b08=jsonb_build_object(
    'from',p_from,'targets',p_targets,
    'environmentRevision',p_environment_revision,
    'permissionGeneration',p_permission_generation)
  WHERE id=p_session AND actor_id=auth.uid()
   AND status='active' AND last_seq=p_seq;
 END IF;
 -- Duplicate/replayed ACKs must never broadcast a route twice.
 IF p_seq>before_seq AND result->'accepted' IS NOT NULL AND
  jsonb_typeof(result->'accepted')='array' AND
  jsonb_array_length(result->'accepted')>0 AND
  current_session.mode<>'preview'
 THEN
  -- A missing Realtime daily partition/broadcast outage cannot rewrite
  -- previously approved session state or expose unauthorised coordinates.
  BEGIN
   PERFORM forge_world_v2.publish_approved_observers(
    current_session,p_from,result->'accepted');
  EXCEPTION WHEN others THEN
   RAISE WARNING 'V2 private motion broadcast unavailable';
  END;
 END IF;
 RETURN result;
END $$;

-- Atomic canonical commit and opportunistic, bounded observer drainage.
CREATE OR REPLACE FUNCTION public.commit_world_motion_v2(
 p_session uuid,p_seq bigint,p_endpoint jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE s forge_world_v2.motion_sessions%rowtype;
 part jsonb;token_ids uuid[]:=array[]::uuid[];tool_ids uuid[]:=array[]::uuid[];
 token_count integer;tool_count integer;step jsonb;cx integer;cy integer;
 revcheck jsonb;scene jsonb;attrs jsonb;grid record;t record;u record;
 endpoint_x integer;endpoint_y integer;reply jsonb;is_dm boolean;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL OR
  NOT forge_world_v2.valid_point(p_endpoint) THEN RETURN NULL;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
  WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF s.status='committed' THEN
  -- A lost ACK may be retried with the SAME idempotency request; a
  -- different endpoint, sequence or revision must never reuse the ACK.
  IF s.last_seq IS DISTINCT FROM p_seq OR
    s.last_commit_request_b08 IS DISTINCT FROM
      jsonb_build_object('endpoint',p_endpoint,
       'environmentRevision',p_environment_revision,
       'permissionGeneration',p_permission_generation)
    OR clock_timestamp()>s.expires_at OR
    NOT public.can_view_campaign_map(s.campaign_id,s.map_id) OR
    (SELECT coalesce(g.generation,0)
     FROM forge_visibility.navigation_permission_generations g
     WHERE g.map_id=s.map_id) IS DISTINCT FROM s.permission_generation OR
    (SELECT e.revision FROM public.map_environments e
     WHERE e.map_id=s.map_id AND e.campaign_id=s.campaign_id)
     IS DISTINCT FROM s.environment_revision
   THEN RETURN NULL;END IF;
  -- Retry opportunistically drains retained private progress; it cannot
  -- write tokens twice or return a different canonical endpoint.
  BEGIN
   PERFORM forge_world_v2.drain_committed_observers_b08(s.id);
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'B08 observer terminal drain deferred';
  END;
  RETURN s.last_reply;
 END IF;
 IF p_seq<>s.last_seq+1 OR s.mode='preview' OR
   s.accepted_cells<1 OR s.accepted_steps='[]'::jsonb OR
   p_environment_revision IS DISTINCT FROM s.environment_revision OR
   p_permission_generation IS DISTINCT FROM s.permission_generation OR
   NOT forge_world_v2.session_valid(s) OR
   s.last_x<>(p_endpoint->>'x')::integer OR
   s.last_y<>(p_endpoint->>'y')::integer THEN RETURN NULL;END IF;
 -- Lock all selected rows in stable ID order before re-checking and writing.
 SELECT count(*) INTO token_count FROM (
  SELECT id FROM public.map_tokens WHERE map_id=s.map_id
   AND campaign_id=s.campaign_id AND
   id IN (SELECT (value->>'id')::uuid FROM
     jsonb_array_elements(s.selection) WHERE value->>'kind'='token')
   ORDER BY id FOR UPDATE
 ) owned;
 SELECT count(*) INTO tool_count FROM (
  SELECT id FROM public.campaign_tool_issues WHERE map_id=s.map_id
   AND campaign_id=s.campaign_id AND
   id IN (SELECT (value->>'id')::uuid FROM
     jsonb_array_elements(s.selection) WHERE value->>'kind'='tool')
   ORDER BY id FOR UPDATE
 ) owned;
 IF token_count<>(SELECT count(*) FROM jsonb_array_elements(s.selection)
   WHERE value->>'kind'='token')
 OR tool_count<>(SELECT count(*) FROM jsonb_array_elements(s.selection)
   WHERE value->>'kind'='tool')
 OR NOT forge_world_v2.session_valid(s) THEN RETURN NULL;END IF;
 SELECT e.live INTO scene FROM public.map_environments e WHERE e.map_id=s.map_id;
 SELECT floor(m.width/m.grid_size)::integer AS w,
  floor(m.height/m.grid_size)::integer AS h INTO grid FROM public.battle_maps m
  WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Hold environment, rule and permission revisions stable for the commit
 -- transaction so a concurrent DM edit cannot race our last validation.
 PERFORM 1 FROM public.map_environments
  WHERE map_id=s.map_id AND campaign_id=s.campaign_id FOR SHARE;
 PERFORM 1 FROM forge_visibility.map_rules
  WHERE map_id=s.map_id FOR SHARE;
 PERFORM 1 FROM forge_visibility.navigation_permission_generations
  WHERE map_id=s.map_id FOR SHARE;
 IF NOT forge_world_v2.session_valid(s) THEN RETURN NULL;END IF;
 -- Independently verify all previously accepted legs against current scene.
 -- A stored approved route cannot bypass a changed rule or a bad endpoint.
 FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
  attrs:='{}'::jsonb;
  IF part->>'kind'='token' THEN
   SELECT tok.character_id,tok.npc_values INTO t FROM public.map_tokens tok
    WHERE tok.id=(part->>'id')::uuid;
   attrs:=coalesce(t.npc_values,'{}'::jsonb);
   IF t.character_id IS NOT NULL THEN
    SELECT coalesce(ch.field_values,'{}'::jsonb) INTO attrs
    FROM public.characters ch WHERE ch.id=t.character_id AND ch.campaign_id=s.campaign_id;
   END IF;
   token_ids:=array_append(token_ids,(part->>'id')::uuid);
  ELSE
   SELECT coalesce(tool.state->'attrs','{}'::jsonb) INTO attrs
   FROM public.campaign_tool_issues tool WHERE tool.id=(part->>'id')::uuid;
   tool_ids:=array_append(tool_ids,(part->>'id')::uuid);
  END IF;
  cx:=(part->>'x')::integer;cy:=(part->>'y')::integer;
  FOR step IN SELECT value FROM jsonb_array_elements(s.accepted_steps) LOOP
   IF NOT forge_world_v2.step_allowed(scene,attrs,cx,cy,
     cx+(step->>'dx')::integer,cy+(step->>'dy')::integer,
     (part->>'spanX')::double precision,(part->>'spanY')::double precision,
     grid.w,grid.h,s.collision_on AND NOT s.dm_override)
   THEN RETURN NULL;END IF;
   cx:=cx+(step->>'dx')::integer;cy:=cy+(step->>'dy')::integer;
  END LOOP;
  IF cx<>(part->>'x')::integer+s.last_x-s.origin_x OR
   cy<>(part->>'y')::integer+s.last_y-s.origin_y THEN RETURN NULL;END IF;
 END LOOP;
 -- A trusted transaction checkpoint replaces every legacy GUC route hint.
 INSERT INTO forge_world_v2.commit_checkpoints(
  transaction_id,session_id,actor_id,campaign_id,map_id)
 VALUES(txid_current(),s.id,s.actor_id,s.campaign_id,s.map_id);
 UPDATE public.map_tokens tok SET x=tok.x+s.last_x-s.origin_x,
  y=tok.y+s.last_y-s.origin_y
 WHERE tok.id=ANY(token_ids) AND tok.map_id=s.map_id
  AND tok.campaign_id=s.campaign_id;
 UPDATE public.campaign_tool_issues tool SET
  x=tool.x+s.last_x-s.origin_x,
  y=tool.y+s.last_y-s.origin_y
 WHERE tool.id=ANY(tool_ids) AND tool.map_id=s.map_id
  AND tool.campaign_id=s.campaign_id;
 DELETE FROM forge_world_v2.commit_checkpoints
 WHERE transaction_id=txid_current() AND session_id=s.id;
 reply:=jsonb_build_object('version',2,'sessionId',s.id,'seq',p_seq,
  'endpoint',jsonb_build_object('x',s.last_x,'y',s.last_y));
 UPDATE forge_world_v2.motion_sessions SET status='committed',
  last_seq=p_seq,last_reply=reply,
  last_commit_request_b08=jsonb_build_object(
   'endpoint',p_endpoint,
   'environmentRevision',p_environment_revision,
   'permissionGeneration',p_permission_generation),
  expires_at=clock_timestamp()+interval '10 seconds'
 WHERE id=s.id;
 -- Canonical token/tool updates are already atomic. A private broadcast
 -- outage never undoes or duplicates the canonical commit.
 BEGIN
  PERFORM forge_world_v2.drain_committed_observers_b08(s.id);
 EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'B08 observer terminal drain deferred';
 END;
 RETURN reply;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.commit_world_motion_v2(
 uuid,bigint,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_world_motion_v2(
 uuid,bigint,jsonb,bigint,bigint) TO authenticated;
