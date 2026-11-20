-- R135 disposable PG17 source-only. Fake Realtime message log is NOT
-- Supabase's socket server. These standing legacy topic strings simulate
-- previous V2 joins; they are not actual connected WebSocket clients.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',true);
SELECT pg_catalog.set_config('r135.dm',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r135.p2',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',false);

-- The three V2 socket topic names would still be known to an old browser:
-- forge-world-scene-v2:<map>, forge-world-v2:<map>:<viewer>,
-- forge-observer:<map>:<viewer>. Even an already joined client must see
-- zero NEW candidate-generated messages on those topic names.
CREATE TEMP TABLE r135_old_joined_topics(topic text PRIMARY KEY);
INSERT INTO r135_old_joined_topics(topic) VALUES
 ('forge-world-scene-v2:00000000-0000-4000-8000-000000000201'),
 ('forge-world-v2:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000303'),
 ('forge-observer:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000303');

-- Trusted fictional maintainer activates V3 only, not V2.
UPDATE forge_scene_drain.scene_publication_gate
 SET mode='v3-only' WHERE singleton=true;
DO $assert$
DECLARE scene_generation bigint;vision_epoch bigint;
BEGIN
 scene_generation:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 vision_epoch:=forge_world_v2.bump_vision_epoch_v2(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303');
 IF scene_generation<>1 OR vision_epoch<>1 THEN
  RAISE EXCEPTION 'R135 original-generation counters changed unexpectedly';END IF;
 IF (SELECT count(*) FROM realtime.messages)<>3
 THEN RAISE EXCEPTION 'R135 expected two private scene and one private vision notice';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages m
  JOIN r135_old_joined_topics old ON old.topic=m.topic)
 THEN RAISE EXCEPTION 'R135 candidate sent new information to an old joined V2 topic';END IF;
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=pg_catalog.current_setting('r135.dm'))<>1 OR
    (SELECT count(*) FROM realtime.messages
     WHERE topic=pg_catalog.current_setting('r135.p2'))<>1 OR
    (SELECT count(*) FROM realtime.messages
     WHERE topic=replace(pg_catalog.current_setting('r135.p2'),
      'forge-world-scene-v3:','forge-world-observer-v3:'))<>1
 THEN RAISE EXCEPTION 'R135 recipient V3 epoch fanout unexpected';END IF;
END $assert$;

-- Signed P2 removed. The already joined V3 epoch is no longer targeted.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';
DO $assert$
DECLARE scene_generation bigint;vision_epoch bigint;
BEGIN
 scene_generation:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 vision_epoch:=forge_world_v2.bump_vision_epoch_v2(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303');
 IF scene_generation<>2 OR vision_epoch IS NOT NULL
 THEN RAISE EXCEPTION 'R135 revoked recipient has new vision generation';END IF;
 IF (SELECT count(*) FROM realtime.messages)<>4 OR
    (SELECT count(*) FROM realtime.messages
     WHERE topic=pg_catalog.current_setting('r135.p2'))<>1
 THEN RAISE EXCEPTION 'R135 revoked viewer received new scene or observer data';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages m JOIN r135_old_joined_topics old
  ON old.topic=m.topic)
 THEN RAISE EXCEPTION 'R135 converted candidate sent revoked V2 notice';END IF;
END $assert$;

-- Emergency gate blocks FUTURE candidate scene and vision fanout.
UPDATE forge_scene_drain.scene_publication_gate
 SET mode='fenced' WHERE singleton=true;
DO $assert$
BEGIN
 PERFORM forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 IF (SELECT count(*) FROM realtime.messages)<>4
 THEN RAISE EXCEPTION 'R135 fenced candidate still publishes';END IF;
END $assert$;

-- INTENTIONAL NEGATIVE CONTROL. A privileged unconverted sender can
-- still send to an OLD already joined V2 topic, despite the candidate
-- publication gate. There is NO total provider-level revocation proof.
DO $assert$
BEGIN
 PERFORM realtime.send('{"fixture":"unguarded"}'::jsonb,
  'old-joined-bypass',
  'forge-world-v2:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000303',
  true);
 IF (SELECT count(*) FROM realtime.messages m
     JOIN r135_old_joined_topics old ON old.topic=m.topic
     WHERE m.event='old-joined-bypass')<>1
 THEN RAISE EXCEPTION 'R135 bypass negative control was not demonstrated';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
  IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R135 unguarded bypass changed maintenance mode';END IF;
END $assert$;
\echo 'R135 PG17 candidate-only PASS: standing old topic strings see no converted scene/vision sends; privileged bypass remains a NO_GO.'
