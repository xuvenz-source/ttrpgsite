-- B10-R18-126 SOURCE-ONLY UNAPPLIED CUTOVER CANDIDATE.
-- INSTALL ONLY IN DISPOSABLE PG17 AFTER R125 UNAPPLIED PROTOTYPE.
-- NOT AN APPROVED HOSTED MIGRATION. No feature is deployed by this file.
-- Must ship only with a verified V3 client, R123 eviction, safe rollback and
-- QA migration bootstrap. Never allow an active legacy V2 shared sender.
BEGIN;

-- Receive-only role-scoped V3 topic authorization. Current map, membership
-- and opaque epoch are validated by the reviewed private R125 predicate.
-- Existing V2 scene SELECT policy MUST be retired in the SAME release that
-- replaces every V2 publisher; otherwise old sockets may still observe data.
CREATE POLICY "R126 V3 recipient scene receive"
 ON realtime.messages FOR SELECT TO authenticated
 USING (
   extension = 'broadcast'
   AND forge_scene_revoke.can_receive_scene_topic_v3(
     (SELECT realtime.topic())
   )
 );

-- Preserve the exact legacy counter upsert semantics and output type.
-- Replace ONLY shared publication fanout (no map-wide V2 send remains).
-- This runs from the existing environment/rules AFTER triggers.
-- Publishers only target recipients who already obtained current V3 epochs.
-- Membership FOR SHARE inside current_recipient_scene_topic_v3 coordinates
-- in-transaction fanout against concurrent membership removal.
CREATE OR REPLACE FUNCTION forge_world_v2.bump_scene_publication_v2(p_map uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $scene$
DECLARE camp uuid;next_generation bigint;recipient record;topic text;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL THEN RETURN NULL;END IF;
 INSERT INTO forge_world_v2.scene_publications(
  map_id,campaign_id,generation,changed_at)
 VALUES(p_map,camp,1,clock_timestamp())
 ON CONFLICT(map_id) DO UPDATE SET
  generation=forge_world_v2.scene_publications.generation+1,
  campaign_id=excluded.campaign_id,changed_at=clock_timestamp()
 RETURNING generation INTO next_generation;

 -- Only connected/previously connected V3 viewers need push notices;
 -- all others recover the persisted generation at authenticated join.
 -- A sent notice is a version-2 scene generation hint, not geometry.
 FOR recipient IN
  SELECT lease.user_id
  FROM forge_scene_revoke.member_scene_epochs AS lease
  JOIN public.campaign_members AS cm
   ON cm.campaign_id=lease.campaign_id AND cm.user_id=lease.user_id
  WHERE lease.campaign_id=camp AND lease.map_id=p_map
   AND cm.role IN ('dm','player')
  ORDER BY lease.user_id
 LOOP
  BEGIN
   topic:=forge_scene_revoke.current_recipient_scene_topic_v3(
     p_map,recipient.user_id);
   IF topic IS NOT NULL THEN
    PERFORM realtime.send(
     jsonb_build_object('version',2,'mapId',p_map,
                        'sceneGeneration',next_generation),
     'scene-revision-v2',topic,true);
   END IF;
  EXCEPTION WHEN others THEN
   -- Preserve the previous contract: a Realtime outage must not abort
   -- the authenticated, persisted scene publication.
   RAISE WARNING 'V3 recipient scene publication notification unavailable';
  END;
 END LOOP;
 RETURN next_generation;
END $scene$;
REVOKE ALL ON FUNCTION forge_world_v2.bump_scene_publication_v2(uuid)
 FROM PUBLIC,anon,authenticated;

COMMIT;

-- THIS IS NOT A LIVE REPLACEMENT. Open requirements:
-- (a) versioned migration review of all 83 private originals and dependencies;
-- (b) remove old V2 scene receiver policy and every other shared publisher;
-- (c) coordinate the protected frontend SceneTransport V3 transition;
-- (d) connect R123 synchronous mask/teardown; test real signed DM/P1/P2;
-- (e) prove the expected bounded Realtime quota/latency on $0 resources;
-- (f) preexisting Storage signed URLs (#231) remain valid until expiry.
