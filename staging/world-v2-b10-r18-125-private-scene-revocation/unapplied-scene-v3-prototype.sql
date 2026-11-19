-- B10-R18-125 SOURCE-ONLY, UNAPPLIED PostgreSQL 17 PROTOTYPE.
-- DO NOT RUN AGAINST ORIGINAL OR HOSTED QA.
-- This is a recipient-scoped scene channel authority *building block*, not
-- a complete release migration. No legacy V2 senders, subscribers or RLS
-- policies are changed by this file. It does NOT revoke existing sockets.
--
-- IMPORTANT: Existing V2 forge-world-scene-v2:<map> fanout MUST be disabled
-- during a coordinated, separately reviewed server/client cutover. Otherwise
-- revoked connected clients still hear the old, map-wide revision messages.
-- The receiver-side realtime.messages policy for this new topic is NOT
-- installed here. Do not deploy an unfinished partial protocol.
BEGIN;

CREATE SCHEMA forge_scene_revoke;
REVOKE ALL ON SCHEMA forge_scene_revoke FROM PUBLIC,anon,authenticated;

-- Epoch belongs to a specific user + map under an existing member identity.
-- Referential DELETE cascade makes an old epoch disappear atomically with
-- the membership row. Explicit reinstatement generates a distinct epoch.
-- Authenticated callers may invoke only the safe boolean predicate; never
-- grant direct table read/write access to this schema.
GRANT USAGE ON SCHEMA forge_scene_revoke TO authenticated;

CREATE TABLE forge_scene_revoke.member_scene_epochs (
 campaign_id uuid NOT NULL,
 map_id uuid NOT NULL,
 user_id uuid NOT NULL,
 epoch uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
 PRIMARY KEY(campaign_id,map_id,user_id),
 UNIQUE(map_id,user_id,epoch),
 FOREIGN KEY(campaign_id,user_id)
   REFERENCES public.campaign_members(campaign_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(campaign_id,map_id)
   REFERENCES public.battle_maps(campaign_id,id) ON DELETE CASCADE
);
ALTER TABLE forge_scene_revoke.member_scene_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_scene_revoke.member_scene_epochs
 FROM PUBLIC,anon,authenticated;

-- After signed membership and map access are re-proven, reveal only the
-- actor's own opaque recipient topic. Not a credential for authorization.
-- FOR SHARE orders issuing an epoch against concurrent membership DELETE.
CREATE FUNCTION public.get_authorized_scene_channel_v3(p_map uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $topic$
DECLARE actor uuid:=auth.uid(); camp uuid; fresh_epoch uuid;
BEGIN
 IF actor IS NULL OR p_map IS NULL THEN RETURN NULL;END IF;
 SELECT bm.campaign_id INTO camp
 FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL THEN RETURN NULL;END IF;

 PERFORM 1 FROM public.campaign_members cm
 WHERE cm.campaign_id=camp AND cm.user_id=actor
  AND cm.role IN ('dm','player') FOR SHARE;
 IF NOT FOUND OR NOT public.can_view_campaign_map(camp,p_map)
 THEN RETURN NULL;END IF;

 INSERT INTO forge_scene_revoke.member_scene_epochs(campaign_id,map_id,user_id)
 VALUES(camp,p_map,actor) ON CONFLICT(campaign_id,map_id,user_id)
 DO NOTHING;
 SELECT l.epoch INTO fresh_epoch
 FROM forge_scene_revoke.member_scene_epochs l
 WHERE l.campaign_id=camp AND l.map_id=p_map AND l.user_id=actor;
 IF fresh_epoch IS NULL THEN RETURN NULL;END IF;

 RETURN 'forge-world-scene-v3:'||p_map::text||':'||
  actor::text||':'||fresh_epoch::text;
END $topic$;
REVOKE ALL ON FUNCTION public.get_authorized_scene_channel_v3(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_authorized_scene_channel_v3(uuid)
 TO authenticated;

-- Predicate for a FUTURE private realtime.messages SELECT policy.
-- A stale topic fails at reconnect after remove/reinstate or changed map.
-- Already-joined sockets are not automatically detached by this predicate.
CREATE FUNCTION forge_scene_revoke.can_receive_scene_topic_v3(p_topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $receive$
DECLARE map_id uuid;viewer_id uuid;topic_epoch uuid;
BEGIN
 IF auth.uid() IS NULL OR p_topic IS NULL OR
  p_topic !~ '^forge-world-scene-v3:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false;END IF;
 map_id:=split_part(p_topic,':',2)::uuid;
 viewer_id:=split_part(p_topic,':',3)::uuid;
 topic_epoch:=split_part(p_topic,':',4)::uuid;
 IF viewer_id IS DISTINCT FROM auth.uid() THEN RETURN false;END IF;
 RETURN EXISTS(
  SELECT 1 FROM forge_scene_revoke.member_scene_epochs l
  JOIN public.campaign_members cm
   ON cm.campaign_id=l.campaign_id AND cm.user_id=l.user_id
  JOIN public.battle_maps bm
   ON bm.campaign_id=l.campaign_id AND bm.id=l.map_id
  WHERE l.map_id=map_id AND l.user_id=viewer_id
   AND l.epoch=topic_epoch AND cm.role IN ('dm','player')
   AND public.can_view_campaign_map(l.campaign_id,l.map_id)
 );
END $receive$;
REVOKE ALL ON FUNCTION forge_scene_revoke.can_receive_scene_topic_v3(text)
 FROM PUBLIC,anon,authenticated;
-- This exact boolean predicate is the only caller grant needed by a FUTURE
-- private realtime.messages SELECT policy. No membership/epoch rows are exposed.
GRANT EXECUTE ON FUNCTION forge_scene_revoke.can_receive_scene_topic_v3(text)
 TO authenticated;

-- Only trusted server-side fanout can resolve another user's current topic.
-- FOR SHARE serializes a prospective send with membership removal.
-- This returns NULL for removed users, outsiders and off-map recipients.
-- It must be called and used WITHIN the future sender transaction; returning
-- a topic to an untrusted client is strictly forbidden.
CREATE FUNCTION forge_scene_revoke.current_recipient_scene_topic_v3(
 p_map uuid,p_viewer uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fanout$
DECLARE camp uuid; topic_epoch uuid;
BEGIN
 IF p_map IS NULL OR p_viewer IS NULL THEN RETURN NULL;END IF;
 SELECT bm.campaign_id INTO camp
 FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL THEN RETURN NULL;END IF;
 PERFORM 1 FROM public.campaign_members cm
 WHERE cm.campaign_id=camp AND cm.user_id=p_viewer
  AND cm.role IN ('dm','player') FOR SHARE;
 IF NOT FOUND OR forge_world_v2.viewer_on_map(camp,p_map,p_viewer) IS NULL
 THEN RETURN NULL;END IF;
 SELECT l.epoch INTO topic_epoch
 FROM forge_scene_revoke.member_scene_epochs l
 WHERE l.campaign_id=camp AND l.map_id=p_map AND l.user_id=p_viewer;
 IF topic_epoch IS NULL THEN RETURN NULL;END IF;
 RETURN 'forge-world-scene-v3:'||p_map::text||':'||
  p_viewer::text||':'||topic_epoch::text;
END $fanout$;
REVOKE ALL ON FUNCTION forge_scene_revoke.current_recipient_scene_topic_v3(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

COMMIT;

-- NOT INCLUDED: a realtime.messages receiver policy (requires separate
-- review), replacing old global sender, frontend scene channel transition,
-- removing old V2 RLS and sender routes, signed URL repair, true connected
-- socket removal and verified production migration. Production remains NO_GO.
