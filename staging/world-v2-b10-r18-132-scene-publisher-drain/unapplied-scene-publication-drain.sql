-- B10-R18-132 SOURCE-ONLY UNAPPLIED PostgreSQL 17 prototype.
-- FOR DISPOSABLE PG17 AFTER R125 AND R126 SQL CANDIDATES, NEVER HOSTED.
--
-- This fences precisely ONE server publisher:
--   forge_world_v2.bump_scene_publication_v2(uuid)
-- It does not fence the other six known Realtime sender functions, direct
-- realtime.send callers, client Broadcast, Presence, Postgres Changes, Storage
-- links, external services or already queued/delivered WebSocket messages.
-- No RLS change disconnects an already joined old V2 channel.
-- State begins FENCED; no legacy V2 or default-unfence path exists.
--
-- The FOR SHARE row lock stays held until the publisher transaction commits.
-- A subsequent UPDATE to 'fenced' waits for those in-flight guarded sends.
-- This serializes *this publisher* with the gate transition; it does NOT
-- guarantee when asynchronous Realtime delivers previously queued bytes.
BEGIN;
CREATE SCHEMA forge_scene_drain;
REVOKE ALL ON SCHEMA forge_scene_drain FROM PUBLIC,anon,authenticated;

CREATE TABLE forge_scene_drain.scene_publication_gate(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton = true),
 mode text NOT NULL CHECK(mode IN ('fenced','v3-only')),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forge_scene_drain.scene_publication_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_scene_drain.scene_publication_gate
 FROM PUBLIC,anon,authenticated;
INSERT INTO forge_scene_drain.scene_publication_gate(singleton,mode)
 VALUES(true,'fenced');

-- No privileges to anon/authenticated; only a reviewed trusted transaction
-- can inspect or modify the gate and call this private publisher predicate.
CREATE FUNCTION forge_scene_drain.scene_v3_publish_allowed()
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $gate$
DECLARE current_mode text;
BEGIN
 SELECT g.mode INTO current_mode
 FROM forge_scene_drain.scene_publication_gate g
 WHERE g.singleton=true
 FOR SHARE;
 RETURN coalesce(current_mode='v3-only',false);
END $gate$;
REVOKE ALL ON FUNCTION forge_scene_drain.scene_v3_publish_allowed()
 FROM PUBLIC,anon,authenticated;

-- Existing environment/rules triggers keep the bigint generation contract.
-- Gate check occurs BEFORE mutation and BEFORE any outbound sends.
-- Even while fenced, generation persists for a future authenticated V3 join.
-- A recipient needs a current signed R125 epoch, membership and map access;
-- FOR SHARE on campaign membership in R125 serializes revoke-vs-send.
CREATE OR REPLACE FUNCTION forge_world_v2.bump_scene_publication_v2(p_map uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $publisher$
DECLARE
  camp uuid;
  next_generation bigint;
  allowed boolean;
  recipient record;
  recipient_topic text;
BEGIN
  allowed:=forge_scene_drain.scene_v3_publish_allowed();
  SELECT bm.campaign_id INTO camp
    FROM public.battle_maps bm WHERE bm.id=p_map;
  IF camp IS NULL THEN RETURN NULL;END IF;

  INSERT INTO forge_world_v2.scene_publications(
    map_id,campaign_id,generation,changed_at)
  VALUES(p_map,camp,1,clock_timestamp())
  ON CONFLICT(map_id) DO UPDATE SET
    generation=forge_world_v2.scene_publications.generation+1,
    campaign_id=excluded.campaign_id,
    changed_at=clock_timestamp()
  RETURNING generation INTO next_generation;

  IF allowed IS NOT TRUE THEN RETURN next_generation;END IF;

  FOR recipient IN
    SELECT lease.user_id
    FROM forge_scene_revoke.member_scene_epochs lease
    JOIN public.campaign_members cm
      ON cm.campaign_id=lease.campaign_id AND cm.user_id=lease.user_id
    WHERE lease.campaign_id=camp AND lease.map_id=p_map
      AND cm.role IN ('dm','player')
    ORDER BY lease.user_id
  LOOP
    -- This R125 function must return the CURRENT recipient topic or NULL.
    -- Never fall back to forge-world-scene-v2:<map>, even on an RPC error.
    recipient_topic:=forge_scene_revoke.current_recipient_scene_topic_v3(
      p_map,recipient.user_id);
    IF recipient_topic IS NULL THEN CONTINUE;END IF;
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('version',2,'mapId',p_map,
                           'sceneGeneration',next_generation),
        'scene-revision-v2',recipient_topic,true);
    EXCEPTION WHEN OTHERS THEN
      -- Realtime transport outage may skip a notice, but generation persists
      -- and the next authenticated V3 join can recover the new generation.
      RAISE WARNING 'R132 V3 recipient scene notice unavailable';
    END;
  END LOOP;
  RETURN next_generation;
END $publisher$;
REVOKE ALL ON FUNCTION forge_world_v2.bump_scene_publication_v2(uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;

-- NO automatic GRANT/UPDATE/unfence is defined. A future signed, reviewed
-- maintenance release must enable 'v3-only' in a separately controlled
-- transaction after all client/server compatibility prerequisites pass.
-- An unguarded trusted postgres/service_role function can still send to
-- legacy channels: the seven-publisher and external sender inventory is a
-- hard release blocker, not waived by this source-only scene gate.
