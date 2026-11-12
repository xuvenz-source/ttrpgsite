-- B10-R18-28. DISPOSABLE POSTGRES:17 ONLY; after post-R05 R18-22 stack,
-- plus rollback-only R18-26/27. Never invoke against a live database.
\set ON_ERROR_STOP on
BEGIN;
\i supabase/candidates/world_v2_r18_28_atomic_finalize.sql
DO $r28_check$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 stranger uuid:='00000000-0000-4000-8000-000000000013';
 viewer uuid:='00000000-0000-4000-8000-000000000012';
 campaign uuid:='00000000-0000-4000-8000-000000000001';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 tool uuid:='00000000-0000-4000-8000-000000000201';
 sid uuid;ack jsonb;reply jsonb;again jsonb;
 touched timestamptz;before_events bigint;reason text;
BEGIN
 PERFORM public.b08_assert(
  has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'R28-01 authenticated-only final RPC; private schema stays closed');

 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(ack->>'sessionId')::uuid;
 PERFORM public.b08_assert(sid IS NOT NULL,
  'R28-02 ordinary actor-owned Begin remains the only entry to a valid session');

 PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
 reply:=public.finalize_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(reply IS NULL AND
  (SELECT x=1 FROM public.map_tokens WHERE id=token),
  'R28-03 wrong actor cannot finalize someone elses session');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 reply:=public.finalize_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  reply->>'finalized'='true' AND reply->>'commitSeq'='2' AND
  reply->'accepted'='[{"x":2,"y":1}]'::jsonb AND
  reply->'endpoint'='{"x":2,"y":1}'::jsonb AND
  (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=token) AND
  (SELECT status='committed' AND last_seq=2
   FROM forge_world_v2.motion_sessions WHERE id=sid),
  'R28-04 exact original Advance+canonical Commit atomically move token');
 SELECT updated_at INTO touched FROM public.map_tokens WHERE id=token;
 again:=public.finalize_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(again=reply AND
  (SELECT updated_at=touched FROM public.map_tokens WHERE id=token),
  'R28-05 identical final retry returns exact cached receipt; no second token write');
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":3,"y":1}]'::jsonb,1,1)
  IS NULL AND
  public.finalize_world_motion_v2(
   sid,1,'{"x":2,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1)
  IS NULL AND
  public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,99,1)
  IS NULL,
  'R28-06 changed target, origin or revision cannot reuse final ACK');

 -- A 2x2 mounted tool follows the source-real tool trigger and checkpoint.
 -- Inject one certified private hide into the actor's session to establish
 -- that terminal observer filtering is not silently suppressed.
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','tool','id',tool)),
  '{"x":1,"y":7}'::jsonb,'drag',1,1,false);
 sid:=(ack->>'sessionId')::uuid;
 INSERT INTO forge_world_v2.observer_pending_b07(
  session_id,viewer_id,map_id,campaign_id,actor_id,
  environment_revision,permission_generation,pending,deferred,expires_at)
 VALUES(sid,viewer,test_map,campaign,actor,1,1,
  jsonb_build_array(jsonb_build_object('kind','tool','id',tool,'action','hide')),
  '[]'::jsonb,clock_timestamp()+interval '10 seconds');
 reply:=public.finalize_world_motion_v2(
  sid,1,'{"x":1,"y":7}'::jsonb,'[{"x":2,"y":7}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  reply->'endpoint'='{"x":2,"y":7}'::jsonb AND
  (SELECT x=2 AND y=7 FROM public.campaign_tool_issues WHERE id=tool) AND
  (SELECT status='committed' FROM forge_world_v2.motion_sessions WHERE id=sid),
  'R28-07 atomic finalization preserves 2x2 mounted-tool canonical checkpoint');
 PERFORM public.b08_assert(
  NOT EXISTS(SELECT 1 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid AND deferred<>'[]'::jsonb)
  AND NOT EXISTS(SELECT 1 FROM realtime.b07_outbox WHERE NOT is_private),
  'R28-08 source-real private observer drain cannot retain old path or publish publicly');
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   sid,1,'{"x":1,"y":7}'::jsonb,'[{"x":2,"y":7}]'::jsonb,1,1)=reply,
  'R28-09 exact mounted-tool retry preserves canonical ACK and private drain');

 -- R18-17 wall at 3.95 permits 5% edge overlap but denies the deeper
 -- follow-up. The original Advance returns the accepted prefix only.
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":2,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(ack->>'sessionId')::uuid;
 reply:=public.finalize_world_motion_v2(
  sid,1,'{"x":2,"y":1}'::jsonb,'[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  reply->>'blocked'='true' AND
  reply->'accepted'='[{"x":3,"y":1}]'::jsonb AND
  reply->'endpoint'='{"x":3,"y":1}'::jsonb AND
  (SELECT x=3 FROM public.map_tokens WHERE id=token),
  'R28-10 blocked multi-cell final batch commits ONLY accepted server prefix');
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":3,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(ack->>'sessionId')::uuid;
 SELECT count(*) INTO before_events FROM realtime.b07_outbox;
 reply:=public.finalize_world_motion_v2(
  sid,1,'{"x":3,"y":1}'::jsonb,'[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  reply IS NULL AND
  (SELECT status='active' AND last_seq=0 AND accepted_cells=0
   FROM forge_world_v2.motion_sessions WHERE id=sid) AND
  (SELECT x=3 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=before_events FROM realtime.b07_outbox),
  'R28-11 wholly blocked final step rolls back Advance and private outbox');

 -- A future caller cannot bypass map/permission revision guards.
 PERFORM public.b08_assert(
  public.finalize_world_motion_v2(
   sid,1,'{"x":3,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,99)
   IS NULL AND
  (SELECT last_seq=0 FROM forge_world_v2.motion_sessions WHERE id=sid),
  'R28-12 mismatched permission generation cannot commit a cell');
END $r28_check$;

-- Exercise a real canonical-write failure AFTER the final Advance. The
-- original Commit must not leave any changed motion session or outbox rows.
CREATE FUNCTION pg_temp.r28_fault_trigger() RETURNS trigger
 LANGUAGE plpgsql AS $fault$
BEGIN
 RAISE EXCEPTION 'R28 isolated canonical failure' USING ERRCODE='PZ829';
END $fault$;
CREATE TRIGGER r28_fault_injected BEFORE UPDATE ON public.map_tokens
 FOR EACH ROW EXECUTE FUNCTION pg_temp.r28_fault_trigger();

DO $r28_fault$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 ack jsonb;sid uuid;reply jsonb;before_events bigint;sqlstate_seen text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 ack:=public.begin_world_motion_v2(test_map,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":3,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(ack->>'sessionId')::uuid;
 SELECT count(*) INTO before_events FROM realtime.b07_outbox;
 sqlstate_seen:=NULL;
 BEGIN
  reply:=public.finalize_world_motion_v2(
   sid,1,'{"x":3,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 EXCEPTION WHEN OTHERS THEN sqlstate_seen:=SQLSTATE;
 END;
 PERFORM public.b08_assert(
  sqlstate_seen='PZ829' AND
  (SELECT status='active' AND last_seq=0 AND accepted_cells=0
   FROM forge_world_v2.motion_sessions WHERE id=sid) AND
  (SELECT x=3 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=before_events FROM realtime.b07_outbox),
  'R28-13 failed canonical write cannot persist Advance session or private observer event');
END $r28_fault$;
DROP TRIGGER r28_fault_injected ON public.map_tokens;
DROP FUNCTION pg_temp.r28_fault_trigger();

-- Final staged RPC must expose no private SQL helper or direct anon access.
DO $r28_security$
BEGIN
 PERFORM public.b08_assert(
  NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE')
  AND NOT has_table_privilege('authenticated',
   'forge_world_v2.motion_sessions','SELECT'),
  'R28-14 new public entrypoint cannot grant client access to private sessions');
END $r28_security$;
ROLLBACK;
DO $r28_after$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL
  AND (SELECT count(*)=0 FROM information_schema.columns
    WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
      AND column_name IN ('final_request_r28','final_reply_r28')),
  'R28-15 new RPC, retry fields and all fixture writes rolled back');
 RAISE NOTICE 'R18-28: 15 rollback-only atomic-finalize and security assertions PASSED';
END $r28_after$;
