-- Synthetic SQL test. Never connect this file to live Supabase.
DO $$
BEGIN
 IF has_function_privilege('anon','public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)','EXECUTE')
 OR has_function_privilege('anon','public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
 OR has_function_privilege('anon','public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE')
 OR has_function_privilege('anon','public.cancel_world_motion_v2(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'anonymous V2 RPC execution exposed';END IF;
 IF NOT has_function_privilege('authenticated',
  'public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)','EXECUTE')
 OR has_table_privilege('authenticated','forge_world_v2.motion_sessions','SELECT')
 OR has_table_privilege('authenticated','forge_world_v2.gesture_budgets','INSERT')
 THEN RAISE EXCEPTION 'V2 privileges incorrect';END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE session_id uuid; reply jsonb; token jsonb:='[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]'::jsonb;
 map_id uuid:='10000000-0000-4000-8000-000000000001';
BEGIN
 reply:=public.begin_world_motion_v2(map_id,token,'{"x":0,"y":1}','drag',7,3);
 IF reply->>'version'<>'2' OR reply->>'sessionId' IS NULL
 THEN RAISE EXCEPTION 'actor cannot begin owned token';END IF;
 session_id:=(reply->>'sessionId')::uuid;
 reply:=public.advance_world_motion_v2(session_id,1,'{"x":0,"y":1}',
  '[{"x":1,"y":1}]',7,3);
 IF reply->>'blocked'<>'false' OR
   reply->'accepted'<>'[{"x":1,"y":1}]'::jsonb
 THEN RAISE EXCEPTION 'normal permitted step rejected: %',reply;END IF;
 IF public.advance_world_motion_v2(session_id,1,'{"x":0,"y":1}',
  '[{"x":1,"y":1}]',7,3) IS DISTINCT FROM reply
 THEN RAISE EXCEPTION 'duplicate ACK is not idempotent';END IF;
 IF public.advance_world_motion_v2(session_id,3,'{"x":1,"y":1}',
  '[{"x":2,"y":1}]',7,3) IS NOT NULL
 THEN RAISE EXCEPTION 'out-of-order sequence accepted';END IF;
 reply:=public.commit_world_motion_v2(session_id,2,'{"x":1,"y":1}',7,3);
 IF reply->'endpoint'<>'{"x":1,"y":1}'::jsonb
 THEN RAISE EXCEPTION 'canonical commit mismatch: %',reply;END IF;
 IF public.commit_world_motion_v2(session_id,2,'{"x":1,"y":1}',7,3)
   IS DISTINCT FROM reply
 THEN RAISE EXCEPTION 'duplicate commit not idempotent';END IF;
 IF public.begin_world_motion_v2(map_id,
   '[{"kind":"token","id":"40000000-0000-4000-8000-000000000002"}]',
   '{"x":0,"y":5}','drag',7,3) IS NOT NULL
 THEN RAISE EXCEPTION 'foreign token ownership bypass';END IF;
 IF public.begin_world_motion_v2(map_id,token,'{"x":0,"y":1}','drag',7,3)
 IS NOT NULL THEN RAISE EXCEPTION 'forged origin accepted';END IF;
 IF public.begin_world_motion_v2(map_id,token,'{"x":1,"y":1}','drag',7,999)
 IS NOT NULL THEN RAISE EXCEPTION 'forged permission version accepted';END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.map_tokens
 WHERE id='40000000-0000-4000-8000-000000000001' AND x=1 AND y=1)
 THEN RAISE EXCEPTION 'canonical token update missing';END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE s uuid; r jsonb;
BEGIN
 s:=(public.begin_world_motion_v2(
 '10000000-0000-4000-8000-000000000001',
 '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
 '{"x":1,"y":1}','drag',7,3)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'second gesture failed'; END IF;
 r:=public.advance_world_motion_v2(s,1,'{"x":1,"y":1}',
 '[{"x":7,"y":1}]',7,3);
 IF r->>'blocked'<>'true' OR r->'accepted'<>'[{"x":2,"y":1}]'::jsonb
 THEN RAISE EXCEPTION 'wall boundary not enforced: %',r;END IF;
 IF r::text LIKE '%hidden-internal-id%' OR
  r::text LIKE '%wall%' OR r::text LIKE '%private%'
 THEN RAISE EXCEPTION 'secret blocker identity disclosed'; END IF;
 IF public.cancel_world_motion_v2(s) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'actor cancellation failed';END IF;
 IF public.advance_world_motion_v2(s,2,'{"x":2,"y":1}',
  '[{"x":3,"y":1}]',7,3) IS NOT NULL
 THEN RAISE EXCEPTION 'cancelled session resumed';END IF;
END $$;
RESET ROLE;

-- Shared tools are permitted but unrelated players cannot borrow token rights.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.begin_world_motion_v2(
 '10000000-0000-4000-8000-000000000001',
 '[{"kind":"tool","id":"50000000-0000-4000-8000-000000000001"}]',
 '{"x":0,"y":6}','drag',7,3);
 IF r->>'sessionId' IS NULL THEN RAISE EXCEPTION 'party-shared tool denied';END IF;
 IF NOT public.cancel_world_motion_v2((r->>'sessionId')::uuid)
 THEN RAISE EXCEPTION 'tool session cancel denied';END IF;
END $$;
RESET ROLE;

-- Verify a bounded mixed group as an atomic movement transaction.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE s uuid;r jsonb; selected jsonb:='[
 {"kind":"token","id":"40000000-0000-4000-8000-000000000001"},
 {"kind":"tool","id":"50000000-0000-4000-8000-000000000001"}]'::jsonb;
BEGIN
 s:=(public.begin_world_motion_v2('10000000-0000-4000-8000-000000000001',
 selected,'{"x":1,"y":1}','drag',7,3)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'mixed group begin failed';END IF;
 r:=public.advance_world_motion_v2(s,1,'{"x":1,"y":1}',
 '[{"x":2,"y":1}]',7,3);
 IF r->>'blocked'<>'false' THEN RAISE EXCEPTION 'mixed group step blocked: %',r;END IF;
 r:=public.commit_world_motion_v2(s,2,'{"x":2,"y":1}',7,3);
 IF r->'endpoint'<>'{"x":2,"y":1}'::jsonb
 THEN RAISE EXCEPTION 'mixed group commit failed: %',r;END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.map_tokens
 WHERE id='40000000-0000-4000-8000-000000000001' AND x=2)
 OR NOT EXISTS(SELECT 1 FROM public.campaign_tool_issues
 WHERE id='50000000-0000-4000-8000-000000000001' AND x=1)
 THEN RAISE EXCEPTION 'group was not atomically applied';END IF;
END $$;

-- A DM may explicitly ask to bypass collision. No implicit bypass for players.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 IF public.begin_world_motion_v2('10000000-0000-4000-8000-000000000001',
 '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
 '{"x":2,"y":1}','drag',7,3,true) IS NOT NULL
 THEN RAISE EXCEPTION 'player DM override accepted';END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE s uuid;r jsonb;
BEGIN
 s:=(public.begin_world_motion_v2('10000000-0000-4000-8000-000000000001',
 '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
 '{"x":2,"y":1}','drag',7,3,true)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'DM override begin denied';END IF;
 r:=public.advance_world_motion_v2(s,1,'{"x":2,"y":1}',
 '[{"x":6,"y":1}]',7,3);
 IF r->>'blocked'<>'false' OR jsonb_array_length(r->'accepted')<>4
 THEN RAISE EXCEPTION 'DM explicit collision override failed: %',r;END IF;
 IF NOT public.cancel_world_motion_v2(s) THEN RAISE EXCEPTION 'DM cancel failed';END IF;
END $$;
RESET ROLE;

-- Revocation cannot be ignored by an already-open movement session.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE fixture_revocation_session(session_id uuid);
INSERT INTO fixture_revocation_session(session_id)
 SELECT (public.begin_world_motion_v2('10000000-0000-4000-8000-000000000001',
 '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
 '{"x":2,"y":1}','drag',7,3)->>'sessionId')::uuid;
DO $
DECLARE s uuid;r jsonb;
BEGIN
 SELECT session_id INTO s FROM fixture_revocation_session;
 r:=public.advance_world_motion_v2(s,1,'{"x":2,"y":1}',
 '[{"x":2,"y":2}]',7,3);
 IF r->>'blocked'<>'false' THEN
  RAISE EXCEPTION 'pre-revocation step rejected: %',r;END IF;
END $;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
DO $
DECLARE s uuid;
BEGIN
 SELECT session_id INTO s FROM fixture_revocation_session;
 IF public.advance_world_motion_v2(s,1,'{"x":2,"y":1}',
  '[{"x":2,"y":2}]',7,3) IS NOT NULL
 THEN RAISE EXCEPTION 'foreign actor replay was accepted';END IF;
 IF public.cancel_world_motion_v2(s)
 THEN RAISE EXCEPTION 'foreign actor cancelled another session';END IF;
END $;
RESET ROLE;
UPDATE forge_visibility.navigation_permission_generations SET generation=4;
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE s uuid;
BEGIN
 SELECT session_id INTO s FROM fixture_revocation_session;
 IF public.advance_world_motion_v2(s,1,'{"x":2,"y":1}',
 '[{"x":2,"y":2}]',7,3) IS NOT NULL THEN
  RAISE EXCEPTION 'revoked actor replay returned stale accepted route';END IF;
 IF public.advance_world_motion_v2(s,2,'{"x":2,"y":2}',
 '[{"x":2,"y":3}]',7,3) IS NOT NULL THEN
  RAISE EXCEPTION 'revoked navigation permission accepted';END IF;
END $$;
RESET ROLE;

-- Browser roles cannot update canonical position directly in the fixture.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
BEGIN
 BEGIN
  UPDATE public.map_tokens SET x=x+1
   WHERE id='40000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'Direct write unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT 'world-engine-v2-SQL-fixture-passed' AS result;
