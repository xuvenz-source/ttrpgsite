-- B10-R18-30. Source-real, disposable postgres:17 only.
-- Starts after the full R05 -> R18-17/19/20 chain, and after R18-26/27/28
-- isolated tests ROLLED BACK. Must NEVER run against production Supabase.
\set ON_ERROR_STOP on
BEGIN;
\i supabase/candidates/world_v2_r18_28_atomic_finalize.sql
\i supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql
CREATE TEMP TABLE r30_wire(
 scenario text PRIMARY KEY,from_point jsonb NOT NULL,
 targets jsonb NOT NULL,seq bigint NOT NULL,
 previous_motion boolean NOT NULL,
 reply jsonb NOT NULL,
 canonical_position jsonb NOT NULL,
 expected_no_motion boolean NOT NULL
);
DO $r30_cases$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 stranger uuid:='00000000-0000-4000-8000-000000000013';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 sid uuid;no_motion_sid uuid;prior_sid uuid;
 result jsonb;first_reply jsonb;no_motion jsonb;
 original_rev bigint;original_permission bigint;
 advanced jsonb;before_events bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.b08_assert(
  has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'R30-01 final RPC remains authenticated-only, internal session schema private');
 UPDATE public.map_environments e SET
  live='{"objects":[{"type":"wall","points":[{"x":3.95,"y":0},{"x":3.95,"y":16}],"blocksMovement":true}]}'::jsonb
 WHERE e.map_id=test_map;

 -- First a valid movement to x3; still cannot cross x4 wall.
 result:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(result->>'sessionId')::uuid;
 result:=public.finalize_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":3,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  result->'accepted'='[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb
  AND result->'endpoint'='{"x":3,"y":1}'::jsonb AND
  NOT (result ? 'noMotion') AND
  (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token),
  'R30-02 valid ordinary finalization still performs canonical movement');
 INSERT INTO pg_temp.r30_wire VALUES(
  'normal','{"x":1,"y":1}','[{"x":3,"y":1}]',1,false,result,
  '{"x":3,"y":1}',false);

 -- First attempt at an immediate, impermeable wall: NO approved movement.
 result:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":3,"y":1}'::jsonb,'drag',1,1,false);
 no_motion_sid:=(result->>'sessionId')::uuid;
 SELECT count(*) INTO before_events FROM realtime.b07_outbox;
 no_motion:=public.finalize_world_motion_v2(
  no_motion_sid,1,'{"x":3,"y":1}'::jsonb,
  '[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  no_motion->>'finalized'='true'
  AND no_motion->'noMotion'='true'::jsonb
  AND no_motion->'blocked'='true'::jsonb
  AND no_motion->'accepted'='[]'::jsonb
  AND no_motion->'endpoint'='{"x":3,"y":1}'::jsonb
  AND (SELECT status='cancelled' AND accepted_cells=0 AND last_seq=2
    AND final_reply_r28=no_motion AND last_x=3
   FROM forge_world_v2.motion_sessions WHERE id=no_motion_sid)
  AND (SELECT x=3 FROM public.map_tokens WHERE id=token)
  AND (SELECT count(*)=before_events FROM realtime.b07_outbox),
  'R30-03 first-cell wall collision becomes zero-motion receipt, no canonical write/outbox');
 INSERT INTO pg_temp.r30_wire VALUES(
  'no-motion','{"x":3,"y":1}','[{"x":4,"y":1}]',1,false,
  no_motion,'{"x":3,"y":1}',true);

 result:=public.finalize_world_motion_v2(
  no_motion_sid,1,'{"x":3,"y":1}'::jsonb,
  '[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(result=no_motion AND
  (SELECT x=3 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=before_events FROM realtime.b07_outbox),
  'R30-04 identical dropped-ACK retry returns exact no-motion result, no duplicate event');
 INSERT INTO pg_temp.r30_wire VALUES(
  'no-motion-retry','{"x":3,"y":1}','[{"x":4,"y":1}]',1,false,
  result,'{"x":3,"y":1}',true);

 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   no_motion_sid,1,'{"x":3,"y":1}'::jsonb,
   '[{"x":5,"y":1}]'::jsonb,1,1) IS NULL
  AND public.finalize_world_motion_v2(
   no_motion_sid,1,'{"x":3,"y":1}'::jsonb,
   '[{"x":4,"y":1}]'::jsonb,99,1) IS NULL,
  'R30-05 changed target or environment revision cannot reuse blocked-only receipt');
 PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   no_motion_sid,1,'{"x":3,"y":1}'::jsonb,
   '[{"x":4,"y":1}]'::jsonb,1,1) IS NULL,
  'R30-06 different signed actor cannot replay a wall collision receipt');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 UPDATE forge_visibility.navigation_permission_generations
 SET generation=generation+1 WHERE map_id=test_map;
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   no_motion_sid,1,'{"x":3,"y":1}'::jsonb,
   '[{"x":4,"y":1}]'::jsonb,1,1) IS NULL,
  'R30-07 revocation blocks cached no-motion ACK after permission generation change');
 UPDATE forge_visibility.navigation_permission_generations
 SET generation=generation-1 WHERE map_id=test_map;

 -- Return to x1 through original signed canonical Commit; no privileged
 -- test-only direct token position update or checkpoint bypass.
 result:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":3,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(result->>'sessionId')::uuid;
 result:=public.finalize_world_motion_v2(
  sid,1,'{"x":3,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(result->'endpoint'='{"x":1,"y":1}'::jsonb AND
  (SELECT x=1 FROM public.map_tokens WHERE id=token),
  'R30-08 position reset occurs through original authenticated canonical movement');

 -- Advance through valid x2,x3; final x3->x4 is immediately blocked.
 result:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 prior_sid:=(result->>'sessionId')::uuid;
 advanced:=public.advance_world_motion_v2(
  prior_sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":3,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(advanced->'accepted'=
  '[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb AND
  (SELECT x=1 FROM public.map_tokens WHERE id=token),
  'R30-09 earlier accepted cells remain provisional until source-real Commit');
 result:=public.finalize_world_motion_v2(
  prior_sid,2,'{"x":3,"y":1}'::jsonb,
  '[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(result->>'finalized'='true'
  AND result->'blocked'='true'::jsonb
  AND result->'accepted'='[]'::jsonb
  AND result->'endpoint'='{"x":3,"y":1}'::jsonb
  AND NOT (result ? 'noMotion')
  AND (SELECT status='committed' AND accepted_cells=2 AND last_seq=3
   FROM forge_world_v2.motion_sessions WHERE id=prior_sid)
  AND (SELECT x=3 FROM public.map_tokens WHERE id=token),
  'R30-10 blocked final cell commits PREVIOUSLY approved steps, no wall penetration');
 first_reply:=result;
 INSERT INTO pg_temp.r30_wire VALUES(
  'prior-approved','{"x":3,"y":1}','[{"x":4,"y":1}]',2,true,
  result,'{"x":3,"y":1}',false);

 result:=public.finalize_world_motion_v2(
  prior_sid,2,'{"x":3,"y":1}'::jsonb,
  '[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(result=first_reply AND
  (SELECT x=3 FROM public.map_tokens WHERE id=token),
  'R30-11 exact replay of prior-approved blocked Commit remains idempotent');
 INSERT INTO pg_temp.r30_wire VALUES(
  'prior-approved-retry','{"x":3,"y":1}','[{"x":4,"y":1}]',2,true,
  result,'{"x":3,"y":1}',false);

 PERFORM public.b08_assert(
  NOT EXISTS(SELECT 1 FROM realtime.b07_outbox WHERE NOT is_private)
  AND NOT EXISTS(SELECT 1 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=prior_sid AND deferred<>'[]'::jsonb),
  'R30-12 prior-approved terminal path remains recipient-private with stale routes retired');
END $r30_cases$;

-- Export genuine source-real wire JSON to the isolated GitHub CI runner.
-- This is fixed-only public TEST fixture data; never real map/user data.
\copy (SELECT jsonb_build_object('scenario',scenario,'from',from_point,'targets',targets,'seq',seq,'previousMotion',previous_motion,'reply',reply,'canonicalPosition',canonical_position,'noMotion',expected_no_motion)::text FROM pg_temp.r30_wire ORDER BY scenario) TO '/tmp/world_v2_b10_r18_30_wire.jsonl';

ROLLBACK;
DO $r30_final$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL
  AND (SELECT count(*)=0 FROM information_schema.columns
   WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
    AND column_name IN ('final_request_r28','final_reply_r28'))
  AND to_regclass('pg_temp.r30_wire') IS NULL,
  'R30-13 all R18-28/30 procedures, receipt fields and tests rolled back');
 RAISE NOTICE 'R18-30: 13 isolated PostgreSQL wall, replay, privacy, revocation and rollback gates PASSED';
END $r30_final$;
