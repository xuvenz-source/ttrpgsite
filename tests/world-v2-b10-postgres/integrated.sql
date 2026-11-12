-- B10 integration tests: disposable PG17 only, explicit rollback.
-- Exercises B03/B07/B08 together after original World Engine V2 schema.
-- The live advance_core_v2 still does not call B03; coexistence != wiring.
BEGIN;
DO $b10$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 map_uuid uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 sid uuid;
 begin_ack jsonb; b03_check jsonb; advanced jsonb; committed jsonb;
 original_seq bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 begin_ack:=public.begin_world_motion_v2(map_uuid,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(begin_ack ? 'sessionId',
  'I01 one source-real actor-owned Begin in shared B03/B07/B08 schema');
 sid:=(begin_ack->>'sessionId')::uuid;
 original_seq:=(SELECT last_seq FROM forge_world_v2.motion_sessions
  WHERE id=sid);
 b03_check:=forge_world_v2.validate_motion_path_batch_b03(
  sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  b03_check->'accepted'='[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb AND
  b03_check->>'blocked'='false' AND
  NOT (b03_check ? 'wallGeometry') AND
  (SELECT last_seq=original_seq FROM forge_world_v2.motion_sessions
   WHERE id=sid),
  'I02 B03 private swept path is read-only and does not leak geometry');
 advanced:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  advanced->'accepted'=b03_check->'accepted' AND
  (SELECT last_seq=1 FROM forge_world_v2.motion_sessions WHERE id=sid),
  'I03 deployed V2 authority independently matches B03 candidate prefix');
 committed:=public.commit_world_motion_v2(
  sid,2,'{"x":3,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  committed->'endpoint'='{"x":3,"y":1}'::jsonb AND
  (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token) AND
  (SELECT status='committed' AND last_seq=2
   FROM forge_world_v2.motion_sessions WHERE id=sid),
  'I04 B08 canonical commit reaches approved endpoint in combined schema');
 PERFORM public.b08_assert(
  public.commit_world_motion_v2(
   sid,2,'{"x":4,"y":1}'::jsonb,1,1) IS NULL AND
  public.advance_world_motion_v2(
   sid,3,'{"x":3,"y":1}'::jsonb,'[{"x":4,"y":1}]'::jsonb,1,1)
   IS NULL,
  'I05 altered final retry and postcommit advance both fail closed');
 PERFORM public.b08_assert(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid='forge_world_v2.observer_pending_b07'::regclass) AND
  (SELECT relrowsecurity FROM pg_class
   WHERE oid='forge_world_v2.observer_budget_b07'::regclass) AND
  (SELECT relrowsecurity FROM pg_class
   WHERE oid='forge_world_v2.motion_sessions'::regclass) AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_function_privilege(
   'authenticated',
   'forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE'),
  'I06 private geometry, queue and session ACLs remain denied/RLS');
 PERFORM public.b08_assert(
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid),
  'I07 postcommit private viewer queue reclaimed after allowed sends');
 RAISE NOTICE 'B10 isolated coexistence checks passed; NOT a live SQL migration or human QA';
END $b10$;
ROLLBACK;
