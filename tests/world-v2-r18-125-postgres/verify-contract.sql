-- R18-125 disposable SQL security contract for scene-specific stream epochs.
-- This does NOT model realtime WebSocket disconnection or hosted broadcasts.
\set ON_ERROR_STOP on

-- Client P1 receives their own opaque stream topic once, bound to a live
-- membership and the currently assigned map; re-request reuses same epoch.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('r125.p1_old',
 coalesce(public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),'INVALID'),false);
DO $assert$
DECLARE t text:=pg_catalog.current_setting('r125.p1_old');
BEGIN
 IF t NOT LIKE 'forge-world-scene-v3:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000302:%'
 THEN RAISE EXCEPTION 'R125 did not create a viewer-scoped P1 topic';END IF;
 IF public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM t
 THEN RAISE EXCEPTION 'R125 stable membership unexpectedly rotated epoch';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(t) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R125 current member cannot join their own topic';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  'forge-world-scene-v2:00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 accepted legacy map-wide topic as new private topic';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  'forge-world-scene-v3:bad') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 malformed topic permitted';END IF;
END $assert$;
COMMIT;

-- P2 and DM independently obtain different current authorized topics.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r125.p2',
 coalesce(public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),'INVALID'),false);
DO $assert$
BEGIN
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.p1_old')) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 P2 could join P1 recipient stream';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.p2')) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R125 P2 own channel unavailable';END IF;
END $assert$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',true);
SELECT pg_catalog.set_config('r125.dm',
 coalesce(public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),'INVALID'),false);
DO $assert$
BEGIN
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.p1_old')) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 DM could subscribe to someone else private stream';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.dm')) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R125 DM own scene channel not allowed';END IF;
END $assert$;
COMMIT;

-- An unrelated signed DM cannot join campaign A or mint a channel for it.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',true);
DO $assert$
BEGIN
 IF public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R125 outsider minted first campaign scene topic';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.p1_old')) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 outsider joined P1 topic';END IF;
END $assert$;
COMMIT;

-- Synthetic postgres = future server sender; no client gets this helper.
-- It resolves only current recipient epochs, never a map-wide topic.
DO $assert$
BEGIN
 IF forge_scene_revoke.current_recipient_scene_topic_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000302') IS DISTINCT FROM
    pg_catalog.current_setting('r125.p1_old')
 THEN RAISE EXCEPTION 'R125 trusted publisher cannot resolve P1 recipient';END IF;
 IF forge_scene_revoke.current_recipient_scene_topic_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000304') IS NOT NULL
 THEN RAISE EXCEPTION 'R125 trusted publisher included outsider';END IF;
END $assert$;

-- DM removes P1 as a simulated admin transaction; FK cascade must erase P1
-- leases without erasing P2 or DM epochs. Realtime sockets aren't simulated.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
  AND user_id='00000000-0000-4000-8000-000000000302';
DO $assert$
BEGIN
 IF EXISTS(SELECT 1 FROM forge_scene_revoke.member_scene_epochs l
  WHERE l.user_id='00000000-0000-4000-8000-000000000302')
 THEN RAISE EXCEPTION 'R125 member deletion did not cascade stream epoch';END IF;
 IF forge_scene_revoke.current_recipient_scene_topic_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000302') IS NOT NULL
 THEN RAISE EXCEPTION 'R125 sender still targets removed P1';END IF;
 IF forge_scene_revoke.current_recipient_scene_topic_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303') IS DISTINCT FROM
    pg_catalog.current_setting('r125.p2')
 THEN RAISE EXCEPTION 'R125 removal unexpectedly disabled P2';END IF;
END $assert$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $assert$
BEGIN
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.p1_old')) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 removed P1 still authorizes cached topic';END IF;
 IF public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R125 removed P1 minted a new stream';END IF;
END $assert$;
COMMIT;

-- Explicit reinstatement creates a *new* opaque epoch, so cached pre-kick
-- channels remain untrusted even though P1 has valid membership again.
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000302','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('r125.p1_new',
 coalesce(public.get_authorized_scene_channel_v3(
 '00000000-0000-4000-8000-000000000201'),'INVALID'),false);
DO $assert$
DECLARE old_topic text:=pg_catalog.current_setting('r125.p1_old');
 new_topic text:=pg_catalog.current_setting('r125.p1_new');
BEGIN
 IF new_topic='INVALID' OR new_topic=old_topic
 THEN RAISE EXCEPTION 'R125 reinstated P1 reused revoked stream epoch';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(old_topic) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 reinstatement re-enabled old subscribed topic';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(new_topic) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R125 reinstated current topic unavailable';END IF;
END $assert$;
COMMIT;

-- Map reassignment should deny future joins and publisher targeting to
-- the previous map, even with an existing membership and lease.
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id) VALUES
 ('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000302',
 '00000000-0000-4000-8000-000000000202');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $assert$
BEGIN
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.p1_new')) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 moved P1 kept previous map permission';END IF;
 IF public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R125 moved P1 minted old-map topic';END IF;
 IF public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000202') IS NULL
 THEN RAISE EXCEPTION 'R125 moved P1 cannot join assigned map';END IF;
END $assert$;
COMMIT;
DO $assert$
BEGIN
 IF forge_scene_revoke.current_recipient_scene_topic_v3(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000302') IS NOT NULL
 THEN RAISE EXCEPTION 'R125 publisher still emits old-map topic';END IF;
END $assert$;

-- Authenticated database role with no signed identity is NOT a membership.
BEGIN;
SET LOCAL ROLE authenticated;
DO $assert$
BEGIN
 IF public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000202') IS NOT NULL
 THEN RAISE EXCEPTION 'R125 null actor obtained private scene stream';END IF;
 IF forge_scene_revoke.can_receive_scene_topic_v3(
  pg_catalog.current_setting('r125.p2')) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R125 null actor passed receiver policy';END IF;
END $assert$;
COMMIT;
\echo 'R125 isolated SQL PASS: P1/P2/DM/outsider, removal, epoch rotation, map reassignment, null identity.'
