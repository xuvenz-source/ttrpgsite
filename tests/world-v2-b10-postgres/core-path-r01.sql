-- B10-R01 private Advance Core integration hostile checks.
-- Only run inside the disposable world_v2_b10 database. Every test mutation
-- is rolled back. The original hostile suites also rerun after this patch.
BEGIN;
DO $r01$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 stranger uuid:='00000000-0000-4000-8000-000000000012';
 map_id uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 sid uuid;start_ack jsonb;approved jsonb;duplicate jsonb;
 bad jsonb;after_reject forge_world_v2.motion_sessions%ROWTYPE;
 func_body text;
BEGIN
 -- Verify the private backend that PUBLIC Advance calls actually delegates
 -- to the B03 geometry contract, not just an unused parallel SQL helper.
 SELECT pg_get_functiondef(
  'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure
 ) INTO func_body;
 PERFORM public.b08_assert(
  position('validate_motion_path_batch_b03' IN func_body)>0,
  'R01-01 installed private Advance Core delegates to B03 validator');

 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 start_ack:=public.begin_world_motion_v2(map_id,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(start_ack ? 'sessionId',
  'R01-02 real public Begin remains actor-scoped');
 sid:=(start_ack->>'sessionId')::uuid;

 -- A loose client-supplied coordinate object was tolerated by the old
 -- candidate path; B03 requires exact x/y and rejects extra data.
 bad:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1,"forged":"attribute"}',
  '[{"x":2,"y":1}]',1,1);
 SELECT * INTO after_reject FROM forge_world_v2.motion_sessions WHERE id=sid;
 PERFORM public.b08_assert(bad IS NULL AND after_reject.last_seq=0
  AND after_reject.accepted_cells=0 AND after_reject.attempted_cells=0,
  'R01-03 forged from-object cannot change cursor, counter or published path');

 -- Force rejected path past map bounds, check the complete batch is denied
 -- without consuming a server session or revealing wall geometry.
 bad:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}',
  '[{"x":900,"y":900}]',1,1);
 SELECT * INTO after_reject FROM forge_world_v2.motion_sessions WHERE id=sid;
 PERFORM public.b08_assert(bad IS NULL AND after_reject.last_seq=0,
  'R01-04 overlong route does not consume a sequence or leak geometry');

 approved:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}',
  '[{"x":2,"y":1},{"x":3,"y":1}]',1,1);
 SELECT * INTO after_reject FROM forge_world_v2.motion_sessions WHERE id=sid;
 PERFORM public.b08_assert(
  approved->>'version'='2' AND
  approved->'accepted'='[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb AND
  approved->>'blocked'='false' AND
  jsonb_object_length(approved)=5 AND
  NOT (approved ? 'routeSteps') AND
  NOT (approved ? 'attemptedCells') AND
  NOT (approved ? 'acceptedCells') AND
  after_reject.last_seq=1 AND
  after_reject.last_x=3 AND after_reject.last_y=1 AND
  after_reject.accepted_cells=2 AND after_reject.attempted_cells=2 AND
  after_reject.batches=1,
  'R01-05 new Core writes exact legal prefix while preserving public ACK privacy');

 duplicate:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}',
  '[{"x":2,"y":1},{"x":3,"y":1}]',1,1);
 SELECT * INTO after_reject FROM forge_world_v2.motion_sessions WHERE id=sid;
 PERFORM public.b08_assert(
  duplicate=approved AND after_reject.last_seq=1 AND
  after_reject.accepted_cells=2 AND after_reject.batches=1,
  'R01-06 identical sequence replay does not double-write');
 bad:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}',
  '[{"x":3,"y":1}]',1,1);
 PERFORM public.b08_assert(bad IS NULL,
  'R01-07 same-seq altered target cannot recover cached ACK');

 PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
 bad:=public.advance_world_motion_v2(
  sid,2,'{"x":3,"y":1}',
  '[{"x":4,"y":1}]',1,1);
 PERFORM public.b08_assert(bad IS NULL,
  'R01-08 foreign actor cannot advance an owned session');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 bad:=public.advance_world_motion_v2(
  sid,2,'{"x":3,"y":1}',
  '[{"x":4,"y":1}]',1,2);
 PERFORM public.b08_assert(bad IS NULL,
  'R01-09 stale signed permission generation cannot advance');
 PERFORM public.b08_assert(
  (SELECT last_seq=1 FROM forge_world_v2.motion_sessions WHERE id=sid),
  'R01-10 failed actor/revision requests leave canonical prefix unchanged');

 -- Private schema/function ACL survives the backend rewrite; the only
 -- remaining browser interface is the pre-existing authenticated public RPC.
 PERFORM public.b08_assert(
  NOT has_schema_privilege('anon','forge_world_v2','USAGE') AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_function_privilege('anon',
   'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE') AND
  NOT has_function_privilege('authenticated',
   'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE') AND
  (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=
   'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure),
  'R01-11 private Core remains SECURITY DEFINER and uncallable by browser roles');
 RAISE NOTICE 'B10-R01 source-real B03 Core integration hostile tests PASS';
END $r01$;
ROLLBACK;
