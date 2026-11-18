-- R18-114 MOVEMENT: exact Git/live dispatch_movement_preview source under
-- synthetic auth.uid/is_campaign_dm/observers; no Realtime network or hosted DB.
\set ON_ERROR_STOP on
INSERT INTO public.campaign_tool_issues(
 id,campaign_id,map_id,owner_id,party_shared,x,y,kind,config,state) VALUES
 ('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000302',
  false,1,1,'tool','{}'::jsonb,'{}'::jsonb),
 ('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000303',
  false,1,1,'tool','{}'::jsonb,'{}'::jsonb);

-- MOVE NULL_IDENTITY
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE NULL_IDENTITY unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_DENY_P2_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000402',4,3,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_DENY_P2_TOKEN unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_DENY_HIDDEN_OWN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000403',5,4,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_DENY_HIDDEN_OWN unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_DENY_COLLISION_OVERRIDE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,true) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_DENY_COLLISION_OVERRIDE unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE DM_B_DENY_FOREIGN_CAMPAIGN_OVERRIDE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,true) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE DM_B_DENY_FOREIGN_CAMPAIGN_OVERRIDE unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE OUTSIDER_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE OUTSIDER_DENIED unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_FOREIGN_MAP_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000204','token','00000000-0000-4000-8000-000000000404',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_FOREIGN_MAP_DENIED unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_UNKNOWN_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000499',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_UNKNOWN_TOKEN unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_UNKNOWN_MAP
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000299','token','00000000-0000-4000-8000-000000000401',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_UNKNOWN_MAP unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_INVALID_KIND
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','alien','00000000-0000-4000-8000-000000000401',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_INVALID_KIND unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_INVALID_SEQ_0
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,0,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_INVALID_SEQ_0 unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_INVALID_NULL_IGNORE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,NULL) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_INVALID_NULL_IGNORE unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_OFF_GRID
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',90,90,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_OFF_GRID unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_ALLOW_OWN_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 MOVE P1_ALLOW_OWN_TOKEN unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_REPLAY_SEQUENCE_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_REPLAY_SEQUENCE_DENIED unexpected authorization result';END IF;
END $check$;
COMMIT;

-- Force a future rate deadline so immediate next seq cannot pass by CI timing.
UPDATE forge_visibility.movement_preview_rates
 SET last_sent=pg_catalog.clock_timestamp()+interval '30 seconds'
 WHERE actor_id='00000000-0000-4000-8000-000000000302'
   AND piece_id='00000000-0000-4000-8000-000000000401';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,2,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 RATE_LIMIT rapid movement accepted';END IF;
END $check$;
COMMIT;

-- MOVE P2_ALLOW_OWN_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000402',4,3,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 MOVE P2_ALLOW_OWN_TOKEN unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE DM_A_ALLOW_OWN_CAMPAIGN_OVERRIDE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',4,2,1,true) INTO accepted;
 IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 MOVE DM_A_ALLOW_OWN_CAMPAIGN_OVERRIDE unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE DM_B_ALLOW_OWN_CAMPAIGN_OVERRIDE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000204','token','00000000-0000-4000-8000-000000000404',4,2,1,true) INTO accepted;
 IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 MOVE DM_B_ALLOW_OWN_CAMPAIGN_OVERRIDE unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_UNKNOWN_TOOL_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','tool','00000000-0000-4000-8000-000000000802',3,3,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_UNKNOWN_TOOL_DENIED unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_DENY_P2_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','tool','00000000-0000-4000-8000-000000000802',3,3,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_DENY_P2_TOOL unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_ALLOW_OWN_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','tool','00000000-0000-4000-8000-000000000801',2,2,1,false) INTO accepted;
 IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 MOVE P1_ALLOW_OWN_TOOL unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE P1_DENY_TOOL_OVERRIDE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','tool','00000000-0000-4000-8000-000000000801',2,2,2,true) INTO accepted;
 IF accepted IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 MOVE P1_DENY_TOOL_OVERRIDE unexpected authorization result';END IF;
END $check$;
COMMIT;

-- MOVE DM_A_ALLOW_TOOL_OVERRIDE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE accepted boolean;BEGIN
 SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','tool','00000000-0000-4000-8000-000000000801',2,2,1,true) INTO accepted;
 IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 MOVE DM_A_ALLOW_TOOL_OVERRIDE unexpected authorization result';END IF;
END $check$;
COMMIT;

-- After these authorized and denied previews, no persisted token coordinate
-- may be rewritten, and exactly 6 accepted private per-actor/piece rates exist.
DO $state$ DECLARE rates integer;BEGIN
 SELECT count(*) INTO rates FROM forge_visibility.movement_preview_rates;
 IF rates<>6 THEN RAISE EXCEPTION 'R114 movement accepted-rate count invalid: %',rates;END IF;
 IF (SELECT (x,y) FROM public.map_tokens
     WHERE id='00000000-0000-4000-8000-000000000401')
    IS DISTINCT FROM ROW(2,2)
 THEN RAISE EXCEPTION 'R114 movement preview changed persistent token coords';END IF;
 IF (SELECT last_seq FROM forge_visibility.movement_preview_rates
     WHERE actor_id='00000000-0000-4000-8000-000000000302'
       AND piece_id='00000000-0000-4000-8000-000000000401') <> 1
 THEN RAISE EXCEPTION 'R114 replay or rate limit incorrectly advanced sequence';END IF;
END $state$;

-- Source-exact can_view_campaign_map must reject P1 immediately after
-- membership revocation; the dispatch must also deny without changing rate.
DELETE FROM public.campaign_members
WHERE campaign_id='00000000-0000-4000-8000-000000000101'
AND user_id='00000000-0000-4000-8000-000000000302';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $revoked$ BEGIN
 IF public.r114_movement_probe(
   '00000000-0000-4000-8000-000000000201','token',
   '00000000-0000-4000-8000-000000000401',3,2,99,false)
 IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R114 revoked P1 retained movement permission';END IF;
END $revoked$;
COMMIT;
DO $post$ BEGIN
 IF (SELECT count(*) FROM forge_visibility.movement_preview_rates) <> 6
 THEN RAISE EXCEPTION 'R114 revoked actor mutated movement state';END IF;
END $post$;

\echo 'R114 MOVEMENT PASS: 25 source-exact dispatch role/path/rate/revocation scenarios (synthetic claims)' 
