-- B10-R03 STAGING ONLY. Dependencies: source-real B03 -> B07 -> B08 -> R01.
-- NEVER run on live Supabase without a versioned release migration and
-- explicit protected-map DM/P1/P2 acceptance evidence.
--
-- Defect: B08 preserves unsent path frames after a successful canonical
-- Commit when the global Realtime allowance is exhausted. An identical
-- Commit ACK retry can publish these OLD routes after a newer signed
-- canonical sight, including an equal-origin return path. A client cannot
-- infer the source session of the old frame from its authorized coordinate.
--
-- Resolution: drain at most four frames ONCE inside the successful Commit,
-- then permanently retire all unsent *path* frames for this terminal session.
-- Retain only previously certified, bounded, deduplicated hide items in a
-- private queue, for an opportunistic future authorized retry. A current
-- signed get_world_visibility_v2 provides canonical endpoint/roster and
-- conceals hidden actors even if the physical broadcast budget is depleted.
--
-- Wire remains version 2; public RPC, RLS grants, session/recipient identities,
-- Realtime topics and canonical map-token mutations are UNCHANGED.
CREATE OR REPLACE FUNCTION forge_world_v2.drain_committed_observers_b08(
 p_session uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b10_r03$
DECLARE s forge_world_v2.motion_sessions%ROWTYPE;
 recipient record;pending_row forge_world_v2.observer_pending_b07%ROWTYPE;
 i integer;sent integer:=0;result integer;
 hides jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_now IS NULL
 THEN RETURN 0;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() AND status='committed'
  AND p_now<=expires_at FOR UPDATE;
 IF NOT FOUND THEN RETURN 0;END IF;

 -- Preserve B08's bounded same-transaction final flush ON THE FIRST COMMIT:
 -- a live Realtime budget can still finish at most four real approved frames
 -- per recipient. Nothing is ever sent until B07 independently checks
 -- current recipient membership, map, environment, generation and LOS.
 BEGIN
  FOR recipient IN
   SELECT viewer_id FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session ORDER BY viewer_id LIMIT 32
  LOOP
   FOR i IN 1..4 LOOP
    result:=forge_world_v2.flush_recipient_observer_b07(
     s,recipient.viewer_id,p_now);
    sent:=sent+result;
    EXIT WHEN result<>1;
   END LOOP;
  END LOOP;
 EXCEPTION WHEN OTHERS THEN
  -- B08's public Commit intentionally does NOT roll back canonical data
  -- for broadcaster outages. Even if terminal flushing fails unexpectedly,
  -- continue retiring unsent old paths before returning to that wrapper.
  RAISE WARNING 'B10-R03 terminal path publication deferred';
 END;

 -- Terminal canonical sight must supersede remaining old unsent routes.
 -- This loop covers ALL rows, not just the 32 direct recipients, so an
 -- unexpected stale queue can never be left for a later B08 ACK retry.
 FOR pending_row IN
  SELECT * FROM forge_world_v2.observer_pending_b07
  WHERE session_id=p_session ORDER BY viewer_id FOR UPDATE
 LOOP
  -- An unrelated or stale queue is never eligible for later delivery.
  IF pending_row.actor_id IS DISTINCT FROM s.actor_id OR
    pending_row.campaign_id IS DISTINCT FROM s.campaign_id OR
    pending_row.map_id IS DISTINCT FROM s.map_id OR
    pending_row.environment_revision IS DISTINCT FROM s.environment_revision OR
    pending_row.permission_generation IS DISTINCT FROM s.permission_generation OR
    p_now>pending_row.expires_at
  THEN
   DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
   CONTINUE;
  END IF;

  -- Merge all certified hide items from pending + bounded deferred FIFO.
  -- Distinct by (kind,id); never preserve any path or its coordinates.
  -- A hide can be valid only for a piece the original publisher selected.
  SELECT coalesce(jsonb_agg(h.item ORDER BY h.kind,h.id),'[]'::jsonb)
  INTO hides
  FROM (
   SELECT DISTINCT ON (v.item->>'kind',v.item->>'id')
    v.item, v.item->>'kind' AS kind,v.item->>'id' AS id
   FROM (
    SELECT value AS item
    FROM jsonb_array_elements(pending_row.pending)
    UNION ALL
    SELECT entry.value AS item
    FROM jsonb_array_elements(pending_row.deferred) frame
    CROSS JOIN LATERAL jsonb_array_elements(frame.value) entry
   ) v
   WHERE v.item->>'action'='hide'
   ORDER BY v.item->>'kind',v.item->>'id'
  ) h;
  IF hides='[]'::jsonb THEN
   DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
   CONTINUE;
  END IF;
  -- Fail closed rather than truncate an overflowed private hide set.
  IF jsonb_array_length(hides)>48 OR
   forge_world_v2.valid_observer_items_b07(hides) IS DISTINCT FROM true
  THEN
   DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
   CONTINUE;
  END IF;
  UPDATE forge_world_v2.observer_pending_b07
  SET pending=hides,deferred='[]'::jsonb,updated_at=p_now
  WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
  -- Best effort for certified hides under B07's separate priority budget.
  -- If the budget is exhausted, retain *hides only* until actor exact retry;
  -- R02 signed canonical sight will independently revoke hidden pieces.
  BEGIN
   sent:=sent+forge_world_v2.flush_recipient_observer_b07(
    s,pending_row.viewer_id,p_now);
  EXCEPTION WHEN OTHERS THEN
   -- Only certified coordinate-free hides remain, so a failed send may
   -- safely wait for a future signed sight/identical ACK retry.
   RAISE WARNING 'B10-R03 certified hide dispatch deferred';
  END;
 END LOOP;
 DELETE FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session AND pending='[]'::jsonb
  AND deferred='[]'::jsonb;
 RETURN sent;
END $b10_r03$;

-- Private function only: never expose a new schema API or widen grants.
REVOKE ALL ON FUNCTION forge_world_v2.drain_committed_observers_b08(
 uuid,timestamptz)
FROM PUBLIC,anon,authenticated;
