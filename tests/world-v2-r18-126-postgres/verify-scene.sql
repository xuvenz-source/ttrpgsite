-- Fully synthetic DB role, sender, recipient, RLS and revocation exercises.
\set ON_ERROR_STOP on
-- P1 and P2 + DM get legitimate server-bound private epoch topics.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('r126.p1',
 coalesce(public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),'INVALID'),false);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r126.p2',
 coalesce(public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),'INVALID'),false);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',true);
SELECT pg_catalog.set_config('r126.dm',
 coalesce(public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),'INVALID'),false);
COMMIT;

-- Original scene generation is persisted exactly once; new sender emits
-- only to existing legitimate active/DM private V3 epoch topics.
DO $assert$
DECLARE gen bigint;
BEGIN
 gen:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 IF gen<>1 OR (SELECT count(*) FROM realtime.messages)<>3
 THEN RAISE EXCEPTION 'R126 first publication did not emit three private notices';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages
   WHERE topic LIKE 'forge-world-scene-v2:%' OR
    topic NOT LIKE 'forge-world-scene-v3:%' OR
    event<>'scene-revision-v2' OR private IS DISTINCT FROM true OR
    payload->>'mapId'<>'00000000-0000-4000-8000-000000000201' OR
    payload->>'sceneGeneration'<>'1' OR
    payload->>'version'<>'2')
 THEN RAISE EXCEPTION 'R126 emitted public, legacy or malformed scene notices';END IF;
 IF (SELECT count(*) FROM realtime.messages
     WHERE topic=pg_catalog.current_setting('r126.p1'))<>1
 OR (SELECT count(*) FROM realtime.messages
     WHERE topic=pg_catalog.current_setting('r126.p2'))<>1
 OR (SELECT count(*) FROM realtime.messages
     WHERE topic=pg_catalog.current_setting('r126.dm'))<>1
 THEN RAISE EXCEPTION 'R126 wrong per-recipient distribution';END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime'
   AND tablename='messages'
   AND policyname='World V2 scene publication receive')
 THEN RAISE EXCEPTION 'R126 old shared receiver policy remains';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime'
   AND tablename='messages' AND policyname='R126 V3 recipient scene receive')
 THEN RAISE EXCEPTION 'R126 new scoped receiver policy missing';END IF;
END $assert$;

-- Synthetic authenticated SELECT obeys our exact current member/epoch
-- and current private channel topic. Other viewers remain invisible.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r126.p1'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>1 THEN
  RAISE EXCEPTION 'R126 P1 RLS rows=%, actor=%, topic=%, predicate=%', (SELECT count(*) FROM realtime.messages), auth.uid(), realtime.topic(), forge_scene_revoke.can_receive_scene_topic_v3(realtime.topic());END IF;
END $assert$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r126.p2'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>0 THEN
  RAISE EXCEPTION 'R126 P1 could read P2 private broadcast';END IF;
END $assert$;
COMMIT;

-- Current active user removed. FK cascade removes old epoch, sender must
-- never target old recipient after the membership DELETE commits.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000302';
DO $assert$
DECLARE gen bigint;
BEGIN
 gen:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 IF gen<>2 OR (SELECT count(*) FROM realtime.messages
  WHERE payload->>'sceneGeneration'='2')<>2
 THEN RAISE EXCEPTION 'R126 removed P1 changed generation or other viewers';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages
  WHERE payload->>'sceneGeneration'='2'
  AND topic=pg_catalog.current_setting('r126.p1'))
 THEN RAISE EXCEPTION 'R126 revoked P1 received post-delete publication';END IF;
 IF (SELECT count(*) FROM realtime.messages WHERE
  payload->>'sceneGeneration'='2' AND
  topic=pg_catalog.current_setting('r126.p2'))<>1
 THEN RAISE EXCEPTION 'R126 unaffected P2 notification missing';END IF;
END $assert$;

-- Even previously recorded messages are hidden by the synthetic RLS policy
-- from a removed P1's old topic at a NEW authorization evaluation.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 pg_catalog.current_setting('r126.p1'),true);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>0 THEN
  RAISE EXCEPTION 'R126 removed P1 still passes private channel RLS';END IF;
END $assert$;
COMMIT;

-- Restoration creates a brand new lease; the previous V3 topic remains
-- forbidden after reinstatement. No old-socket publication is possible.
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('r126.p1new',
 public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
DO $assert$
DECLARE gen bigint;
BEGIN
 IF pg_catalog.current_setting('r126.p1')=
    pg_catalog.current_setting('r126.p1new')
 THEN RAISE EXCEPTION 'R126 restored P1 reused old subscribed topic';END IF;
 gen:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 IF gen<>3 OR (SELECT count(*) FROM realtime.messages
  WHERE payload->>'sceneGeneration'='3')<>3
 THEN RAISE EXCEPTION 'R126 restoration distribution failed';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages WHERE
  payload->>'sceneGeneration'='3'
  AND topic=pg_catalog.current_setting('r126.p1'))
 THEN RAISE EXCEPTION 'R126 old revoked P1 topic got new event';END IF;
END $assert$;

-- Simulated Realtime outage for just P2 does NOT roll back generation
-- and leaves other recipients' messages available; no shared fallback.
SELECT pg_catalog.set_config('r126.fail_viewer',
 '00000000-0000-4000-8000-000000000303',false);
DO $assert$
DECLARE gen bigint;
BEGIN
 gen:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 IF gen<>4 OR (SELECT count(*) FROM realtime.messages
  WHERE payload->>'sceneGeneration'='4')<>2
 THEN RAISE EXCEPTION 'R126 controlled broadcast failure rolled back scene';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages WHERE
  payload->>'sceneGeneration'='4'
  AND topic=pg_catalog.current_setting('r126.p2'))
 THEN RAISE EXCEPTION 'R126 fake failure still sent to failing P2';END IF;
END $assert$;
SELECT pg_catalog.set_config('r126.fail_viewer','',false);

-- Off-map P1 cannot be messaged on old map even though epoch still exists.
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000302',
 '00000000-0000-4000-8000-000000000202');
DO $assert$
DECLARE gen bigint;
BEGIN
 gen:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 IF gen<>5 OR (SELECT count(*) FROM realtime.messages
  WHERE payload->>'sceneGeneration'='5')<>2
 THEN RAISE EXCEPTION 'R126 old-map viewer was still notified';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages WHERE
  payload->>'sceneGeneration'='5'
  AND topic=pg_catalog.current_setting('r126.p1new'))
 THEN RAISE EXCEPTION 'R126 reassigned P1 received old-map event';END IF;
END $assert$;

-- Check no outsider, no leaking of a public topic in any recorded message.
DO $assert$
BEGIN
 IF EXISTS(SELECT 1 FROM realtime.messages
  WHERE topic NOT LIKE 'forge-world-scene-v3:%'
   OR topic LIKE '%00000000-0000-4000-8000-000000000304%'
   OR private IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'R126 public/outsider leak';END IF;
END $assert$;
\echo 'R126 synthetic PG17 PASS: private publisher, deny policy, revocation, recovery, off-map and failure isolation.'
