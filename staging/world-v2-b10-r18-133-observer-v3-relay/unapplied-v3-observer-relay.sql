-- B10-R18-133 SOURCE-ONLY / UNAPPLIED / PG17 ISOLATED PROTOTYPE.
-- NEVER RUN AGAINST ORIGINAL OR HOSTED QA; not a versioned migration.
-- Prerequisites in disposable PG17: R125 synthetic+epoch SQL, R126
-- recipient scene policy and sender, R132 scene-publisher drain SQL.
--
-- Scope: NEW V3 observer receive topic and one trusted relay API.
-- It does NOT replace any of the six existing legacy SQL realtime.send
-- call sites. Until their source definitions are safely rewritten and
-- verified, an already-joined forge-observer: / forge-world-v2: listener
-- may still receive legacy messages. NO total server stream cutoff.
BEGIN;
CREATE SCHEMA forge_observer_v3;
REVOKE ALL ON SCHEMA forge_observer_v3 FROM PUBLIC,anon,authenticated;
-- A safe PRIVATE-schema receiver predicate is called by RLS for clients.
-- Never expose the private relay or epoch data to clients.
GRANT USAGE ON SCHEMA forge_observer_v3 TO authenticated;

CREATE FUNCTION forge_observer_v3.can_receive_observer_topic_v3(p_topic text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $receive$
DECLARE scene_topic text;
BEGIN
 IF auth.uid() IS NULL OR p_topic IS NULL OR
  p_topic !~ '^forge-world-observer-v3:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false;END IF;
 -- Reuse R125's current membership, map, user and epoch authorization.
 -- A boolean predicate never exposes another viewer's private topic.
 scene_topic:='forge-world-scene-v3:'||
  substr(p_topic,length('forge-world-observer-v3:')+1);
 RETURN forge_scene_revoke.can_receive_scene_topic_v3(scene_topic);
END $receive$;
REVOKE ALL ON FUNCTION
 forge_observer_v3.can_receive_observer_topic_v3(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 forge_observer_v3.can_receive_observer_topic_v3(text)
 TO authenticated;

CREATE POLICY "R133 V3 recipient observer receive"
 ON realtime.messages FOR SELECT TO authenticated
 USING (
   extension='broadcast'
   AND forge_observer_v3.can_receive_observer_topic_v3(
       (SELECT realtime.topic()))
 );

-- Trusted app DEFINER callers only. A client cannot call this helper
-- directly: callers must also retain their individual actor ownership,
-- collision, approved path, LOS and fog concealment checks.
-- The helper is NOT a substitute for those checks.
CREATE FUNCTION forge_observer_v3.dispatch_authorized_observer_v3(
 p_map uuid,p_viewer uuid,p_event text,p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $dispatch$
DECLARE
 actor uuid:=auth.uid();
 camp uuid;
 old_scene_topic text;
 private_topic text;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR p_viewer IS NULL OR
  p_event NOT IN ('motion','world-motion-v2','world-vision-v2') OR
  p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR
  pg_catalog.pg_column_size(p_payload)>8192 OR
  p_payload->>'mapId' IS DISTINCT FROM p_map::text OR
  (p_payload ? 'actor' AND
   p_payload->>'actor' IS DISTINCT FROM actor::text) OR
  (p_payload ? 'viewerId' AND
   p_payload->>'viewerId' IS DISTINCT FROM p_viewer::text) OR
  (p_event='motion' AND NOT(p_payload ? 'actor')) OR
  (p_event='world-vision-v2' AND NOT(p_payload ? 'viewerId'))
 THEN RETURN false;END IF;

 -- Same R132 transaction-scoped FOR SHARE gate as the scene publisher.
 -- Maintenance fencing waits until this guarded delivery commits.
 IF NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN false;END IF;

 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm
 WHERE bm.id=p_map;
 IF camp IS NULL THEN RETURN false;END IF;

 -- Re-check the signed ACTOR, locking the row against concurrent removal.
 -- Recipient locking and assignment happen inside R125's trusted resolver.
 PERFORM 1 FROM public.campaign_members cm
 WHERE cm.campaign_id=camp AND cm.user_id=actor
  AND cm.role IN ('player','dm') FOR SHARE;
 IF NOT FOUND OR NOT public.can_view_campaign_map(camp,p_map)
 THEN RETURN false;END IF;

 old_scene_topic:=forge_scene_revoke.current_recipient_scene_topic_v3(
  p_map,p_viewer);
 IF old_scene_topic IS NULL OR
   old_scene_topic NOT LIKE 'forge-world-scene-v3:%'
 THEN RETURN false;END IF;

 private_topic:='forge-world-observer-v3:'||
  substr(old_scene_topic,length('forge-world-scene-v3:')+1);
 BEGIN
  PERFORM realtime.send(p_payload,p_event,private_topic,true);
 EXCEPTION WHEN OTHERS THEN
  -- No broadcast fallback to any V2 observer topic.
  RAISE WARNING 'R133 authorized V3 observer notice unavailable';
  RETURN false;
 END;
 RETURN true;
END $dispatch$;
REVOKE ALL ON FUNCTION
 forge_observer_v3.dispatch_authorized_observer_v3(uuid,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;

COMMIT;

-- Still absent: updating the original six legacy SQL function bodies,
-- proving LOS/visibility under signed real users, V3 observer client
-- integration, non-SQL client/Edge send paths, WebSocket delivery ordering,
-- and old topic transport retirement. R132 controls only one original
-- server publisher; R133 adds a future safer relay, not full coverage.
