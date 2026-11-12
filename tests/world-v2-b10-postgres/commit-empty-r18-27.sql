-- B10-R18-27: disposable PG17, after exact R05 -> wall -> map guard ->
-- affinity -> R18-26 rollback. Never execute on a connected Supabase project.
-- This transaction copies the original R05 commit and original R03 drain
-- into isolated internal references, then overlays the staged R18-27 code.
-- All fixtures, privileged calls, and function replacements ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE r27_original AS
SELECT
 md5(pg_get_functiondef('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure)) AS commit_md5,
 md5(pg_get_functiondef('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)'::regprocedure)) AS drain_md5;
SELECT replace(pg_get_functiondef(
 'forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)'::regprocedure),
 'FUNCTION forge_world_v2.drain_committed_observers_b08(',
 'FUNCTION forge_world_v2.drain_reference_r18_27(') AS source
\gexec
SELECT replace(pg_get_functiondef(
 'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure),
 'FUNCTION public.commit_world_motion_v2(',
 'FUNCTION forge_world_v2.commit_reference_r18_27(') AS source
\gexec
\i supabase/candidates/world_v2_r18_27_commit_empty_work.sql
-- A narrow test-only transparent observer wrapper counts actual calls,
-- then invokes the ORIGINAL production-source drain unchanged.
CREATE TEMP TABLE r27_drain_calls(session_id uuid PRIMARY KEY,call_count int NOT NULL);
CREATE OR REPLACE FUNCTION forge_world_v2.drain_committed_observers_b08(
 p_session uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $r27_test_counter$
BEGIN
 INSERT INTO pg_temp.r27_drain_calls(session_id,call_count)
 VALUES(p_session,1)
 ON CONFLICT(session_id) DO UPDATE
 SET call_count=pg_temp.r27_drain_calls.call_count+1;
 RETURN forge_world_v2.drain_reference_r18_27(p_session,p_now);
END $r27_test_counter$;

DO $r27_movement$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 stranger uuid:='00000000-0000-4000-8000-000000000013';
 other uuid:='00000000-0000-4000-8000-000000000012';
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
 sid uuid;ack jsonb;advanced jsonb;committed jsonb;
 deny jsonb;calls integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 -- Token-only: zero tool IDs and no observer queue must not call drain.
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(ack ? 'sessionId',
  'R27-01 real post-R05 Begin accepts a player-owned token');
 sid:=(ack->>'sessionId')::uuid;
 advanced:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  advanced->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'R27-02 real post-R05 Advance accepts token step');
 DELETE FROM forge_world_v2.observer_pending_b07 WHERE session_id=sid;
 PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
 deny:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(deny IS NULL AND
  (SELECT x=1 FROM public.map_tokens WHERE id=token),
  'R27-03 other actor cannot commit or move a selected token');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 committed:=public.commit_world_motion_v2(
  sid,2,'{"x":2,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  committed->'endpoint'='{"x":2,"y":1}'::jsonb AND
  (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=0 FROM pg_temp.r27_drain_calls WHERE session_id=sid),
  'R27-04 token-only commit preserves canonical endpoint and skips empty terminal drain');
 PERFORM public.b08_assert(
  public.commit_world_motion_v2(sid,2,'{"x":3,"y":1}'::jsonb,1,1)
   IS NULL AND
  (SELECT count(*)=0 FROM pg_temp.r27_drain_calls WHERE session_id=sid),
  'R27-05 changed replay cannot reuse ACK or trigger private drain');
 PERFORM public.b08_assert(
  public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1)
   IS NOT NULL AND
  (SELECT count(*)=0 FROM pg_temp.r27_drain_calls WHERE session_id=sid),
  'R27-06 identical ACK retry remains idempotent when no queue exists');
 -- Tool-only: ensure empty token UPDATE skipped without skipping checkpoint.
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','tool','id',tool)),
  '{"x":1,"y":7}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(ack ? 'sessionId',
  'R27-07 real post-R05 Begin accepts a 2x2 player-owned mount');
 sid:=(ack->>'sessionId')::uuid;
 advanced:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":7}'::jsonb,'[{"x":2,"y":7}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  advanced->'accepted'='[{"x":2,"y":7}]'::jsonb,
  'R27-08 real post-R05 Advance accepts full mount footprint');
 -- Explicit queued private hide: must invoke ORIGINAL drain, never skip.
 DELETE FROM forge_world_v2.observer_pending_b07 WHERE session_id=sid;
 INSERT INTO forge_world_v2.observer_pending_b07(
  session_id,viewer_id,map_id,campaign_id,actor_id,
  environment_revision,permission_generation,pending,deferred,expires_at)
 VALUES(sid,other,test_map,campaign,actor,1,1,
  jsonb_build_array(jsonb_build_object('kind','tool','id',tool,'action','hide')),
  '[]'::jsonb,clock_timestamp()+interval '10 seconds');
 committed:=public.commit_world_motion_v2(
  sid,2,'{"x":2,"y":7}'::jsonb,1,1);
 SELECT call_count INTO calls FROM pg_temp.r27_drain_calls WHERE session_id=sid;
 PERFORM public.b08_assert(
  committed->'endpoint'='{"x":2,"y":7}'::jsonb AND
  (SELECT x=2 AND y=7 FROM public.campaign_tool_issues WHERE id=tool)
  AND calls=1,
  'R27-09 tool canonical checkpoint writes and nonempty private queue invokes original drain');
 PERFORM public.b08_assert(
  NOT EXISTS(SELECT 1 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid AND deferred<>'[]'::jsonb),
  'R27-10 terminal private queue never retains stale path frames');
 PERFORM public.b08_assert(
  NOT EXISTS(SELECT 1 FROM realtime.b07_outbox
   WHERE NOT is_private),
  'R27-11 any emitted observer message is private');
 PERFORM public.b08_assert(
  NOT has_schema_privilege('anon','forge_world_v2','USAGE') AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_function_privilege('anon',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE') AND
  has_function_privilege('authenticated',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE'),
  'R27-12 original private schema restrictions and public authenticated-only RPC grants persist');
END $r27_movement$;
ROLLBACK;
DO $r27_final$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('forge_world_v2.commit_reference_r18_27(uuid,bigint,jsonb,bigint,bigint)') IS NULL AND
  to_regprocedure('forge_world_v2.drain_reference_r18_27(uuid,timestamptz)') IS NULL AND
  to_regclass('pg_temp.r27_drain_calls') IS NULL,
  'R27-13 all original function clones, test wrappers and rows ROLLED BACK');
 RAISE NOTICE 'R18-27: all 13 canonical+observer-gate assertions PASSED in rollback-only PG17';
END $r27_final$;
