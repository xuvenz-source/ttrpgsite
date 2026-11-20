-- R18-134 isolated PG17 post-compile executable vision assertions.
\set ON_ERROR_STOP on

-- P2 obtains authorized R125 V3 epoch without exposing any other viewer.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r134.p2scene',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
SELECT pg_catalog.set_config('r134.p2observer',
 replace(pg_catalog.current_setting('r134.p2scene'),
 'forge-world-scene-v3:','forge-world-observer-v3:'),false);
SELECT pg_catalog.set_config('request.jwt.claim.sub','',false);

-- IMPORTANT: this is a TRUSTED database execution WITHOUT a signed JWT.
-- The player-only relay would reject it; trigger-originated fog cannot
-- silently stop working during an upgrade.
DO $check$
DECLARE next_epoch bigint;
BEGIN
 next_epoch:=forge_world_v2.bump_vision_epoch_v2(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303');
 IF next_epoch<>1 OR (SELECT count(*) FROM realtime.messages)<>0
 THEN RAISE EXCEPTION 'R134 fenced trigger vision emitted or lost counter';END IF;
END $check$;

-- Fictional trusted maintainer unlocks V3, never user/anon.
UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only'
 WHERE singleton=true;
DO $check$
DECLARE next_epoch bigint;
BEGIN
 next_epoch:=forge_world_v2.bump_vision_epoch_v2(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303');
 IF next_epoch<>2 OR (SELECT count(*) FROM realtime.messages)<>1
 THEN RAISE EXCEPTION 'R134 unsigned system vision did not send V3 once';END IF;
 IF NOT EXISTS(SELECT 1 FROM realtime.messages
  WHERE topic=pg_catalog.current_setting('r134.p2observer')
    AND event='world-vision-v2'
    AND payload->>'visionEpoch'='2'
    AND payload->>'environmentRevision'='9'
    AND payload->>'permissionGeneration'='11'
    AND payload->>'viewerId'='00000000-0000-4000-8000-000000000303'
    AND payload->>'mapId'='00000000-0000-4000-8000-000000000201')
 THEN RAISE EXCEPTION 'R134 vision payload or private recipient epoch mismatch';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages
  WHERE topic LIKE 'forge-observer:%' OR topic LIKE 'forge-world-v2:%')
 THEN RAISE EXCEPTION 'R134 replacement emitted any old V2 observer topic';END IF;
END $check$;

-- Identity/ACL: the private system-origin function is not a public RPC.
-- The runner tests direct authenticated/anon denial separately.

-- Membership removal means *new* scene notices stop; old queued messages
-- are not deleted and actual WebSocket ejection is NOT proved.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
   AND user_id='00000000-0000-4000-8000-000000000303';
DO $check$
BEGIN
 IF forge_world_v2.bump_vision_epoch_v2(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303') IS NOT NULL
 OR (SELECT count(*) FROM realtime.messages)<>1
 THEN RAISE EXCEPTION 'R134 removed viewer still receives fresh vision';END IF;
END $check$;

INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000303','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r134.p2newscene',
 public.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',false);
DO $check$
BEGIN
 IF pg_catalog.current_setting('r134.p2scene')
    =pg_catalog.current_setting('r134.p2newscene')
 THEN RAISE EXCEPTION 'R134 reinstated recipient reused old epoch';END IF;
 IF forge_world_v2.bump_vision_epoch_v2(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303')<>3
 THEN RAISE EXCEPTION 'R134 reinstated vision counter failed';END IF;
 IF (SELECT count(*) FROM realtime.messages)<>2 OR
   NOT EXISTS(SELECT 1 FROM realtime.messages
     WHERE topic=replace(pg_catalog.current_setting('r134.p2newscene'),
       'forge-world-scene-v3:','forge-world-observer-v3:')
      AND payload->>'visionEpoch'='3')
 THEN RAISE EXCEPTION 'R134 reinstated recipient did not rotate V3 topic';END IF;
END $check$;

-- Off-map recipient does not receive vision even without actor JWT.
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000303',
 '00000000-0000-4000-8000-000000000202');
DO $check$
BEGIN
 IF forge_world_v2.bump_vision_epoch_v2(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000303') IS NOT NULL OR
  (SELECT count(*) FROM realtime.messages)<>2
 THEN RAISE EXCEPTION 'R134 off-map P2 got new vision';END IF;
END $check$;

-- Emergency fence permanently blocks new sending by the converted
-- vision path while preserving counters for authorized active viewers.
UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced'
 WHERE singleton=true;
DO $check$
DECLARE result boolean;
BEGIN
 result:=forge_observer_v3.dispatch_trusted_vision_v3(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000301',
  '{"version":2,"mapId":"00000000-0000-4000-8000-000000000201",
    "viewerId":"00000000-0000-4000-8000-000000000301"}');
 IF result IS DISTINCT FROM false OR
 (SELECT count(*) FROM realtime.messages)<>2
 THEN RAISE EXCEPTION 'R134 maintenance failed to fence trusted vision';END IF;
END $check$;

-- Current source's no-auth-user movement RPC early rejections survive.
DO $check$
DECLARE f1 boolean;f2 boolean;f3 boolean;
BEGIN
 f1:=public.advance_map_motion_session(NULL,0,0,1);
 f2:=public.advance_map_motion_session_path(NULL,'[]'::jsonb,1);
 f3:=forge_visibility.dispatch_movement_preview(
  '00000000-0000-4000-8000-000000000201','token',NULL,1,1,1,false);
 IF f1 IS DISTINCT FROM false OR f2 IS DISTINCT FROM false
 OR f3 IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R134 legacy caller actor/null safeguards changed';END IF;
END $check$;

\echo 'R134 PG17 PASS: six exact original function definitions compiled, trusted no-JWT vision V3, revocation, epoch rotation, off-map and maintenance.'
