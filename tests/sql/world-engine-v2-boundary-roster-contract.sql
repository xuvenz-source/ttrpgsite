-- World Engine V2 Phase 10: an NPC with a concealed origin that crosses
-- into sight must appear via a private, anonymous roster revision. A hidden
-- NPC or movement remaining entirely concealed must not create a signal.
-- Disposable PostgreSQL 17 fixture only, after Phase 7 visibility tests.
DO $$
DECLARE before_epoch bigint;scene jsonb;sources jsonb;lights jsonb;
BEGIN
 SELECT live INTO scene FROM public.map_environments WHERE
  map_id='10000000-0000-4000-8000-000000000001';
 sources:=forge_world_v2.vision_sources_v2(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',scene);
 lights:=forge_world_v2.light_sources_v2(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',scene);
 IF forge_world_v2.is_seen_v2(scene,sources,lights,1.5,5.5)
  OR NOT forge_world_v2.is_seen_v2(scene,sources,lights,2.5,5.5)
 THEN RAISE EXCEPTION 'Invalid concealed-to-visible fixture: unexpected LOS';END IF;
 INSERT INTO public.map_tokens(
  id,campaign_id,map_id,owner_id,visible,x,y,span_x,span_y
 ) VALUES(
  '40000000-0000-4000-8000-000000000090',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  NULL,true,1,5,1,1);
 SELECT coalesce(epoch,0) INTO before_epoch
 FROM forge_world_v2.vision_epochs WHERE
  viewer_id='30000000-0000-4000-8000-000000000001' AND
  map_id='10000000-0000-4000-8000-000000000001';
 PERFORM set_config('fixture.boundary_before',before_epoch::text,false);
 PERFORM set_config('fixture.boundary_offmap_before',(
  SELECT count(*)::text FROM realtime.messages m
  WHERE m.event='world-vision-v2' AND m.payload->>'viewerId'=
   '30000000-0000-4000-8000-000000000002'),false);
 PERFORM set_config('fixture.boundary_env',(
  SELECT revision::text FROM public.map_environments WHERE
  map_id='10000000-0000-4000-8000-000000000001'),false);
 PERFORM set_config('fixture.boundary_perm',(
  SELECT generation::text FROM forge_visibility.navigation_permission_generations
  WHERE map_id='10000000-0000-4000-8000-000000000001'),false);
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE sid uuid;ack jsonb;rev bigint;perm bigint;
BEGIN
 rev:=current_setting('fixture.boundary_env')::bigint;
 perm:=current_setting('fixture.boundary_perm')::bigint;
 sid:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000090"}]'::jsonb,
  '{"x":1,"y":5}'::jsonb,'drag',rev,perm)->>'sessionId')::uuid;
 IF sid IS NULL THEN RAISE EXCEPTION 'DM NPC test gesture rejected';END IF;
 ack:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":5}'::jsonb,'[{"x":2,"y":5}]'::jsonb,rev,perm);
 IF ack IS NULL OR ack->>'blocked'<>'false' THEN
  RAISE EXCEPTION 'NPC entry movement denied: %',ack;END IF;
 ack:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":5}'::jsonb,rev,perm);
 IF ack IS NULL OR ack->'endpoint'<>'{"x":2,"y":5}'::jsonb THEN
  RAISE EXCEPTION 'NPC entry canonical commit failed: %',ack;END IF;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

DO $$
DECLARE before_epoch bigint;after_epoch bigint;last_msg jsonb;
BEGIN
 before_epoch:=current_setting('fixture.boundary_before')::bigint;
 SELECT epoch INTO after_epoch FROM forge_world_v2.vision_epochs
 WHERE viewer_id='30000000-0000-4000-8000-000000000001' AND
  map_id='10000000-0000-4000-8000-000000000001';
 IF after_epoch<>before_epoch+1 THEN
  RAISE EXCEPTION 'NPC entry did not notify its entitled viewer exactly once';END IF;
 SELECT payload INTO last_msg FROM realtime.messages
 WHERE event='world-vision-v2' AND
  payload->>'viewerId'='30000000-0000-4000-8000-000000000001'
 ORDER BY id DESC LIMIT 1;
 IF last_msg IS NULL OR last_msg ? 'tokenId' OR
  last_msg ? 'x' OR last_msg ? 'y' OR last_msg ? 'visible' OR
  last_msg::text LIKE '%40000000-0000-4000-8000-000000000090%'
 THEN RAISE EXCEPTION 'Entry roster hint disclosed hidden identity: %',last_msg;END IF;
 IF (SELECT count(*) FROM realtime.messages m
  WHERE m.event='world-vision-v2' AND
   m.payload->>'viewerId'='30000000-0000-4000-8000-000000000002')<>
   current_setting('fixture.boundary_offmap_before')::integer
 THEN RAISE EXCEPTION 'Off-map viewer notified about an NPC';END IF;
 PERFORM set_config('fixture.boundary_enter_epoch',after_epoch::text,false);
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE frame jsonb;
BEGIN
 frame:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(frame->'visiblePieces') AS p
  WHERE p->>'id'='40000000-0000-4000-8000-000000000090' AND
   p->>'x'='2' AND p->>'y'='5')
 THEN RAISE EXCEPTION 'Player never received newly visible NPC: %',frame;END IF;
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

-- A fully concealed NPC must NOT leak motion or a roster event.
INSERT INTO public.map_tokens(
 id,campaign_id,map_id,owner_id,visible,x,y,span_x,span_y
) VALUES(
 '40000000-0000-4000-8000-000000000091',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 NULL,false,1,4,1,1);
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE sid uuid;ack jsonb;rev bigint;perm bigint;
BEGIN
 rev:=current_setting('fixture.boundary_env')::bigint;
 perm:=current_setting('fixture.boundary_perm')::bigint;
 sid:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000091"}]'::jsonb,
  '{"x":1,"y":4}'::jsonb,'drag',rev,perm)->>'sessionId')::uuid;
 IF sid IS NULL THEN RAISE EXCEPTION 'DM invisible NPC session denied';END IF;
 ack:=public.advance_world_motion_v2(sid,1,'{"x":1,"y":4}'::jsonb,
  '[{"x":2,"y":4}]'::jsonb,rev,perm);
 IF ack IS NULL OR ack->>'blocked'<>'false' THEN
  RAISE EXCEPTION 'DM hidden NPC movement denied: %',ack;END IF;
 PERFORM public.commit_world_motion_v2(sid,2,'{"x":2,"y":4}'::jsonb,rev,perm);
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;
DO $$
BEGIN
 IF (SELECT epoch FROM forge_world_v2.vision_epochs
  WHERE viewer_id='30000000-0000-4000-8000-000000000001' AND
  map_id='10000000-0000-4000-8000-000000000001')<>
  current_setting('fixture.boundary_enter_epoch')::bigint
 THEN RAISE EXCEPTION 'Invisible NPC movement leaked an invalidation';END IF;
END $$;
SELECT 'world-engine-v2-boundary-roster-contract-passed' AS result;
