-- Phase 5 security/transport tests: synthetic disposable PostgreSQL only.
-- Runs AFTER Phase 4's contract (owned token is x=2,y=1; permission rev=4).
DO $$
BEGIN
 IF has_function_privilege('anon','public.get_world_observer_cursor_v2(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
  'public.get_world_observer_cursor_v2(uuid)','EXECUTE')
 OR has_table_privilege('authenticated','forge_world_v2.viewer_streams','SELECT')
 OR has_function_privilege('authenticated',
  'forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'V2 observer endpoint/grants exposed';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime'
  AND tablename='messages'
  AND policyname='World V2 private observers receive only their map stream'
  AND cmd='SELECT')
 THEN RAISE EXCEPTION 'V2 private observer RLS policy absent';END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime'
  AND tablename='messages' AND cmd='INSERT' AND
  (coalesce(with_check,'') LIKE '%forge-world-v2%'))
 THEN RAISE EXCEPTION 'V2 browser broadcast INSERT policy detected';END IF;
END $$;

-- Invalid or missing map/actor must never expose viewer cursor or roster.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
DO $$
DECLARE map_id uuid:='10000000-0000-4000-8000-000000000001';r jsonb;
BEGIN
 r:=public.get_world_observer_cursor_v2(map_id);
 IF r->>'viewerId'<>'30000000-0000-4000-8000-000000000002'
 OR r->>'cursor'<>'0' OR r->>'environmentRevision'<>'7'
 OR r->>'permissionGeneration'<>'4'
 THEN RAISE EXCEPTION 'viewer cursor missing or unscoped: %',r;END IF;
 IF public.get_world_observer_cursor_v2(
 '99999999-9999-4999-8999-999999999999') IS NOT NULL
 THEN RAISE EXCEPTION 'non-member map observer cursor granted';END IF;
END $$;
RESET ROLE;

-- Valid actor movement is broadcast once to each CURRENTLY authorized
-- recipient, not to the actor themselves or an unrestricted map topic.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE session uuid; r jsonb; selected jsonb:='[
 {"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]'::jsonb;
BEGIN
 session:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  selected,'{"x":2,"y":1}','drag',7,4)->>'sessionId')::uuid;
 IF session IS NULL THEN RAISE EXCEPTION 'V2 transport actor session denied';END IF;
 r:=public.advance_world_motion_v2(session,1,'{"x":2,"y":1}',
 '[{"x":2,"y":3}]',7,4);
 IF r->>'blocked'<>'false' OR jsonb_array_length(r->'accepted')<>2
 THEN RAISE EXCEPTION 'V2 batched motion rejected: %',r;END IF;
 IF public.advance_world_motion_v2(session,1,'{"x":2,"y":1}',
  '[{"x":2,"y":3}]',7,4) IS DISTINCT FROM r
 THEN RAISE EXCEPTION 'replay changed V2 motion reply';END IF;
 r:=public.commit_world_motion_v2(session,2,'{"x":2,"y":3}',7,4);
 IF r->'endpoint'<>'{"x":2,"y":3}'::jsonb
 THEN RAISE EXCEPTION 'V2 stream actor commit failed: %',r;END IF;
END $$;
RESET ROLE;

DO $$
DECLARE envelope jsonb;
BEGIN
 IF (SELECT count(*) FROM realtime.messages
   WHERE topic LIKE 'forge-world-v2:%')<>2
 THEN RAISE EXCEPTION 'expected two recipient frames, no actor frame';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages m
  WHERE m.topic LIKE 'forge-world-v2:%' AND
  (m.private IS DISTINCT FROM true OR m.event<>'world-motion-v2' OR
   m.payload->>'version'<>'2' OR m.payload->>'seq'<>'1'))
 THEN RAISE EXCEPTION 'invalid private frame envelope';END IF;
 SELECT m.payload INTO envelope FROM realtime.messages m
  WHERE m.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000002';
 IF envelope IS NULL OR
  (envelope->'items'->0->>'action')<>'path' OR
  jsonb_array_length(envelope->'items'->0->'path')<>3
 THEN RAISE EXCEPTION 'authorized viewer missed full truthful path: %',envelope;END IF;
 IF envelope::text LIKE '%hidden-internal-id%' OR
  envelope::text LIKE '%blocksMovement%' OR
  envelope::text LIKE '%npc_values%' OR
  envelope::text LIKE '%actor_id%'
 THEN RAISE EXCEPTION 'private map/identity data leaked';END IF;
END $$;

-- Topic policy is not global membership: a different viewer or anon
-- cannot subscribe even if same campaign and already received their topic.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000002';
DO $$
DECLARE visible_count integer;
BEGIN
 SELECT count(*) INTO visible_count FROM realtime.messages;
 IF visible_count<>2 THEN
  -- The table physically contains 2 frames; topic-scoped RLS limits who
  -- may connect, not which historical rows a joined topic can request.
  -- SELECT is used here to verify the actual authorization probe.
  RAISE EXCEPTION 'own private observer topic policy failed: %',visible_count;END IF;
END $$;
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000003';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>0
 THEN RAISE EXCEPTION 'cross-viewer private topic readable';END IF;
END $$;
SET request.realtime.topic='forge-world-v2:99999999-9999-4999-8999-999999999999:30000000-0000-4000-8000-000000000002';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>0
 THEN RAISE EXCEPTION 'cross-map private topic readable';END IF;
END $$;
-- Realtime transport never grants browser INSERT.
DO $$
BEGIN
 BEGIN
  INSERT INTO realtime.messages(topic,event,payload,private)
   VALUES('forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000002',
    'world-motion-v2','{"version":2}'::jsonb,true);
  RAISE EXCEPTION 'forged client motion unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;END;
END $$;
RESET ROLE;
SET ROLE anon;
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000002';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>0
 THEN RAISE EXCEPTION 'anonymous observer subscribed';END IF;
END $$;
RESET ROLE;

-- Explicit DM preview does NOT broadcast, even when a private recipient
-- could see the path: it is a local simulation, not a public movement.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE s uuid;r jsonb;
BEGIN
 s:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
  '{"x":2,"y":3}','preview',7,4)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'DM preview session denied';END IF;
 r:=public.advance_world_motion_v2(s,1,'{"x":2,"y":3}',
  '[{"x":2,"y":4}]',7,4);
 IF r->>'blocked'<>'false' THEN RAISE EXCEPTION 'DM preview blocked: %',r;END IF;
 PERFORM public.cancel_world_motion_v2(s);
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>2
 THEN RAISE EXCEPTION 'DM private preview leaked to observers';END IF;
END $$;

-- An NPC hidden by DM remains unknown to player audiences, despite valid
-- authorized DM movement and being on the same map.
INSERT INTO public.map_tokens(id,campaign_id,map_id,owner_id,visible,x,y)
VALUES('40000000-0000-4000-8000-000000000009',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 NULL,false,1,8);
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE s uuid;r jsonb;
BEGIN
 s:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000009"}]',
  '{"x":1,"y":8}','drag',7,4)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'DM hidden NPC movement denied';END IF;
 r:=public.advance_world_motion_v2(s,1,'{"x":1,"y":8}',
  '[{"x":1,"y":9}]',7,4);
 IF r->>'blocked'<>'false' THEN RAISE EXCEPTION 'hidden NPC move failed: %',r;END IF;
 PERFORM public.cancel_world_motion_v2(s);
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>2
 THEN RAISE EXCEPTION 'DM-only NPC identity leaked to players';END IF;
END $$;

-- A DM-authorized move into concealed space sends generic HIDE without
-- any destination, path, wall ID or hidden position to players.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE s uuid;r jsonb;
BEGIN
 s:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
  '{"x":2,"y":3}','drag',7,4,true)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'explicit DM concealed test denied';END IF;
 r:=public.advance_world_motion_v2(s,1,'{"x":2,"y":3}',
  '[{"x":4,"y":3}]',7,4);
 IF r->>'blocked'<>'false' THEN RAISE EXCEPTION 'DM override refused: %',r;END IF;
 PERFORM public.cancel_world_motion_v2(s);
END $$;
RESET ROLE;
DO $$
DECLARE frame jsonb;
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>4
 THEN RAISE EXCEPTION 'expected one hide per entitled player only';END IF;
 SELECT payload INTO frame FROM realtime.messages
 WHERE topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000002'
 ORDER BY id DESC LIMIT 1;
 IF frame->>'seq'<>'2' OR
   frame->'items'->0->>'action'<>'hide' OR
   (frame->'items'->0 ? 'path') OR
   frame::text LIKE '%"x"%' OR frame::text LIKE '%"y"%'
 THEN RAISE EXCEPTION 'concealed trajectory disclosed: %',frame;END IF;
END $$;

-- One mixed token/tool group sends one bounded frame per recipient, not
-- separate messages for every member or each intermediate grid step.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE session uuid;result jsonb;
BEGIN
 session:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"},
    {"kind":"tool","id":"50000000-0000-4000-8000-000000000001"}]',
  '{"x":2,"y":3}','drag',7,4)->>'sessionId')::uuid;
 IF session IS NULL THEN RAISE EXCEPTION 'Phase 5 mixed group begin denied';END IF;
 result:=public.advance_world_motion_v2(
  session,1,'{"x":2,"y":3}','[{"x":2,"y":4}]',7,4);
 IF result->>'blocked'<>'false' OR
   jsonb_array_length(result->'accepted')<>1
 THEN RAISE EXCEPTION 'Phase 5 group movement invalid: %',result;END IF;
 result:=public.commit_world_motion_v2(session,2,'{"x":2,"y":4}',7,4);
 IF result->'endpoint'<>'{"x":2,"y":4}'::jsonb
 THEN RAISE EXCEPTION 'Phase 5 group did not commit atomically: %',result;END IF;
END $$;
RESET ROLE;
DO $$
DECLARE newest jsonb;
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>6
 THEN RAISE EXCEPTION 'Mixed group did not produce exactly two recipient frames';END IF;
 SELECT payload INTO newest FROM realtime.messages WHERE
 topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000002'
 ORDER BY id DESC LIMIT 1;
 IF newest->>'seq'<>'3' OR
  jsonb_array_length(newest->'items')<>2 OR
  newest->'items'->0->>'action'<>'path' OR
  newest->'items'->1->>'action'<>'path'
 THEN RAISE EXCEPTION 'Group path packing/sequence failed: %',newest;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.map_tokens
   WHERE id='40000000-0000-4000-8000-000000000001' AND x=2 AND y=4)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_tool_issues
   WHERE id='50000000-0000-4000-8000-000000000001' AND x=1 AND y=7)
 THEN RAISE EXCEPTION 'Group canonical commit did not preserve offsets';END IF;
END $$;

-- A map assignment change must immediately bar a listener from a topic
-- even if the WebSocket previously subscribed successfully.
INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
VALUES('10000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000001',1000,1000,100);
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
VALUES('20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
SET request.realtime.topic='forge-world-v2:10000000-0000-4000-8000-000000000001:30000000-0000-4000-8000-000000000002';
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages)<>0
 THEN RAISE EXCEPTION 'reassigned player still authorized to prior stream';END IF;
 IF public.get_world_observer_cursor_v2(
  '10000000-0000-4000-8000-000000000001') IS NOT NULL
 THEN RAISE EXCEPTION 'reassigned player retained cursor RPC';END IF;
END $$;
RESET ROLE;

SELECT 'world-engine-v2-private-observer-contract-passed' AS result;
