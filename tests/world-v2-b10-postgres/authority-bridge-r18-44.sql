-- R18-44: hostile terminal bridge cases. DISPOSABLE CI POSTGRES 17 ONLY.
-- Runs on source-real R05->R17->R19->R20 chain, with R28+R30 inside
-- this rolled-back transaction. It is NOT a migration or production script.
\set ON_ERROR_STOP on
BEGIN;
\i supabase/candidates/world_v2_r18_28_atomic_finalize.sql
\i supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql
DO $r44_hostile$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 other_actor uuid:='00000000-0000-4000-8000-000000000013';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 selection jsonb:=jsonb_build_array(
  jsonb_build_object('kind','token','id',token));
 a jsonb; reply jsonb; sid uuid; saved jsonb; old_updated timestamptz;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.b08_assert(
  has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'R44-01 finalizer exposed to authenticated only; internal session schema remains private');
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   gen_random_uuid(),1,'{"x":1,"y":1}'::jsonb,
   '[{"x":2,"y":1}]'::jsonb,1,1) IS NULL,
  'R44-02 caller cannot invent or probe a finalization session');
 a:=public.begin_world_motion_v2(test_map,selection,
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(a->>'sessionId')::uuid;
 PERFORM public.b08_assert(sid IS NOT NULL,
  'R44-03 original Begin grants a source-validated actor-bound session');
 PERFORM set_config('request.jwt.claim.sub',other_actor::text,true);
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":1}'::jsonb,
   '[{"x":2,"y":1}]'::jsonb,1,1) IS NULL
   AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
  'R44-04 another signed actor cannot finalize or move a token');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   sid,0,'{"x":1,"y":1}'::jsonb,
   '[{"x":2,"y":1}]'::jsonb,1,1) IS NULL
   AND public.finalize_world_motion_v2(
   sid,2,'{"x":1,"y":1}'::jsonb,
   '[{"x":2,"y":1}]'::jsonb,1,1) IS NULL
   AND public.finalize_world_motion_v2(
   sid,1,'{"x":2,"y":1}'::jsonb,
   '[{"x":3,"y":1}]'::jsonb,1,1) IS NULL
   AND public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":1}'::jsonb,
   '[{"x":2,"y":1}]'::jsonb,99,1) IS NULL
   AND public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":1}'::jsonb,
   '[{"x":2,"y":1}]'::jsonb,1,99) IS NULL
   AND (SELECT status='active' AND last_seq=0 AND
    accepted_cells=0 AND last_x=1 AND last_y=1
    FROM forge_world_v2.motion_sessions WHERE id=sid),
  'R44-05 bad seq/from/scene/permission cannot create partial canonical progress');
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":1}'::jsonb,
   '[{"x":2,"y":1},{"x":3,"y":1},{"x":4,"y":1},
     {"x":5,"y":1},{"x":6,"y":1},{"x":7,"y":1},
     {"x":8,"y":1},{"x":9,"y":1},{"x":10,"y":1}]'::jsonb,
   1,1) IS NULL AND
   (SELECT last_seq=0 AND accepted_cells=0
    FROM forge_world_v2.motion_sessions WHERE id=sid),
  'R44-06 more than eight targets cannot evade terminal batch bounds');
 reply:=public.finalize_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  reply->>'finalized'='true' AND
  reply->'endpoint'='{"x":2,"y":1}'::jsonb AND
  reply->'accepted'='[{"x":2,"y":1}]'::jsonb AND
  (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=token) AND
  (SELECT status='committed' AND last_seq=2
   FROM forge_world_v2.motion_sessions WHERE id=sid),
  'R44-07 valid final one-cell batch uses original canonical Commit');
 saved:=reply;
 SELECT updated_at INTO old_updated FROM public.map_tokens WHERE id=token;
 reply:=public.finalize_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  reply=saved AND
  (SELECT x=2 AND updated_at=old_updated FROM public.map_tokens WHERE id=token),
  'R44-08 identical terminal retry cannot write canonical state twice');
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":1}'::jsonb,
   '[{"x":3,"y":1}]'::jsonb,1,1) IS NULL,
  'R44-09 altered route cannot reuse an already committed receipt');
 PERFORM public.b08_assert(
  NOT EXISTS(SELECT 1 FROM realtime.b07_outbox WHERE NOT is_private),
  'R44-10 finalizer never exposes public actor path/hidden geometry');
END $r44_hostile$;
ROLLBACK;
DO $r44_restored$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure(
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'
  ) IS NULL
  AND (SELECT count(*)=0 FROM information_schema.columns
   WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
   AND column_name IN ('final_request_r28','final_reply_r28'))
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT count(*)=0 FROM forge_world_v2.motion_sessions)
  AND to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'R44-11 rollback removed finalization function/receipt/state but preserved R05 source');
 RAISE NOTICE 'R18-44: 11 final bridge path, actor, atomic receipt and rollback assertions PASS';
END $r44_restored$;
