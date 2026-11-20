-- B10-R18-132 disposable PG17 contract. NO hosted Supabase calls.
\set ON_ERROR_STOP on

-- Three signed users obtain their current R125 private recipient topics.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('r132.p1',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r132.p2',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',true);
SELECT pg_catalog.set_config('r132.dm',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;

-- Fence initially denies all scene emission while generation still persists.
DO $assert$
DECLARE generation bigint;
BEGIN
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate
      WHERE singleton=true) IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R132 gate did not default to fenced';END IF;
 IF (SELECT count(*) FROM pg_policies
  WHERE schemaname='realtime' AND
   policyname='World V2 scene publication receive')<>0
 THEN RAISE EXCEPTION 'R132 old V2 receive policy not retired by R126';END IF;
 generation:=forge_world_v2.bump_scene_publication_v2(
   '00000000-0000-4000-8000-000000000201');
 IF generation IS DISTINCT FROM 1 OR
   (SELECT count(*) FROM realtime.messages)<>0
 THEN RAISE EXCEPTION 'R132 closed gate emitted before authorized V3 enable';END IF;
END $assert$;

-- ONLY an isolated trusted fixture changes gate mode. No API/GRANT provides
-- this action to authenticated clients. There is no V2 mode to enable.
UPDATE forge_scene_drain.scene_publication_gate
 SET mode='v3-only',changed_at=clock_timestamp() WHERE singleton=true;

DO $assert$
DECLARE generation bigint;
BEGIN
 generation:=forge_world_v2.bump_scene_publication_v2(
   '00000000-0000-4000-8000-000000000201');
 IF generation IS DISTINCT FROM 2 OR
    (SELECT count(*) FROM realtime.messages)<>3
 THEN RAISE EXCEPTION 'R132 active V3 fanout not three recipients';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages
  WHERE topic NOT LIKE 'forge-world-scene-v3:%' OR
    event<>'scene-revision-v2' OR private IS DISTINCT FROM true OR
    payload->>'sceneGeneration'<>'2')
 THEN RAISE EXCEPTION 'R132 guarded publisher emitted non-V3 topic or data';END IF;
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=pg_catalog.current_setting('r132.p1'))<>1 OR
    (SELECT count(*) FROM realtime.messages
     WHERE topic=pg_catalog.current_setting('r132.p2'))<>1 OR
    (SELECT count(*) FROM realtime.messages
     WHERE topic=pg_catalog.current_setting('r132.dm'))<>1
 THEN RAISE EXCEPTION 'R132 original recipient fanout wrong';END IF;
END $assert$;

-- Actual membership DELETE; R125 epoch cascades and per-recipient sender
-- must not publish any subsequent notification to the old P1 topic.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
  AND user_id='00000000-0000-4000-8000-000000000302';
DO $assert$
DECLARE generation bigint;
BEGIN
 generation:=forge_world_v2.bump_scene_publication_v2(
   '00000000-0000-4000-8000-000000000201');
 IF generation<>3 OR
    (SELECT count(*) FROM realtime.messages
     WHERE payload->>'sceneGeneration'='3')<>2
 THEN RAISE EXCEPTION 'R132 removed P1 changed generation or remaining fanout';END IF;
 IF EXISTS (SELECT 1 FROM realtime.messages
  WHERE payload->>'sceneGeneration'='3' AND
    topic=pg_catalog.current_setting('r132.p1'))
 THEN RAISE EXCEPTION 'R132 removed P1 received new scene notice';END IF;
END $assert$;

-- A fenced transition must again preserve generation without any send.
UPDATE forge_scene_drain.scene_publication_gate
 SET mode='fenced',changed_at=clock_timestamp() WHERE singleton=true;
DO $assert$
DECLARE generation bigint;
BEGIN
 generation:=forge_world_v2.bump_scene_publication_v2(
   '00000000-0000-4000-8000-000000000201');
 IF generation<>4 OR
  (SELECT count(*) FROM realtime.messages
   WHERE payload->>'sceneGeneration'='4')<>0
 THEN RAISE EXCEPTION 'R132 fenced publisher still emits after close';END IF;
 IF (SELECT count(*) FROM realtime.messages)<>5
 THEN RAISE EXCEPTION 'R132 queue model lost already-recorded notices';END IF;
END $assert$;

-- Reinstatement rotates P1 topic. The client may not reuse previous epoch.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000302','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('r132.p1_reinstated',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
DO $assert$
BEGIN
 IF pg_catalog.current_setting('r132.p1') =
    pg_catalog.current_setting('r132.p1_reinstated')
 THEN RAISE EXCEPTION 'R132 rejoined player retained old epoch';END IF;
END $assert$;

-- A forged old topic is denied at a fresh RLS evaluation, independently
-- of whether the old socket was actually ejected (which is NOT proved).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r132.p1'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=realtime.topic())<>0
 THEN RAISE EXCEPTION 'R132 old epoch still passes fresh channel RLS';END IF;
END $assert$;
COMMIT;

-- Explicit bypass proof: a privileged UNGUARDED function can still
-- write a map-wide V2 message despite the scene gate being fenced.
-- This is a fixture limitation demonstrating the HARD release blocker.
DO $assert$
BEGIN
 PERFORM realtime.send(
  jsonb_build_object('version',2,'fixture',true),
  'legacy-bypass-proof',
  'forge-world-scene-v2:00000000-0000-4000-8000-000000000201',
  true
 );
 IF (SELECT count(*) FROM realtime.messages
  WHERE event='legacy-bypass-proof' AND
    topic LIKE 'forge-world-scene-v2:%')<>1
 THEN RAISE EXCEPTION 'R132 unguarded bypass negative control missing';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate
  WHERE singleton=true)<>'fenced'
 THEN RAISE EXCEPTION 'R132 bypass changed gate state';END IF;
END $assert$;
\echo 'R132 synthetic PG17 PASS: fenced default, V3-only fanout, revoked P1, persisted generation, rotated epoch, and explicit unguarded bypass.'
