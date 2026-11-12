-- B10-R03 actor-owned terminal queue retirement tests.
-- The only database is ephemeral local PostgreSQL 17, and ALL test
-- mutations are rolled back. Prior B08 tests run against original B08.
BEGIN;
DO $r03$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 player uuid:='00000000-0000-4000-8000-000000000012';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 map_id uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 sid uuid;sid2 uuid;sid3 uuid;
 first jsonb;ack jsonb;duplicate jsonb;
 before_broadcast integer;after_broadcast integer;
 actor_session forge_world_v2.motion_sessions%ROWTYPE;
 first_cursor bigint;hidden_items integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- R03-01: exact private RPC remains a replace-only core, not exposed.
 PERFORM public.b08_assert(
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_function_privilege('authenticated',
   'forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)','EXECUTE') AND
  (SELECT p.prosecdef=false FROM pg_proc p WHERE p.oid=
   'forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)'::regprocedure),
  'R03-01 terminal queue owner remains private SECURITY INVOKER');

 -- R03-02: with normal budget, original low-latency final flush behavior
 -- remains. No new sight RPC or image/renderer transport required.
 first:=public.begin_world_motion_v2(map_id,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(first->>'sessionId')::uuid;
 PERFORM public.b08_assert(sid IS NOT NULL,'R03-02 actor Begin still works');
 ack:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(ack->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'R03-03 approved path is intact');
 before_broadcast:=(SELECT count(*) FROM realtime.b07_outbox);
 ack:=public.advance_world_motion_v2(
  sid,2,'{"x":2,"y":1}'::jsonb,'[{"x":3,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(ack->'accepted'='[{"x":3,"y":1}]'::jsonb,
  'R03-04 later approved path intact');
 ack:=public.commit_world_motion_v2(
  sid,3,'{"x":3,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  ack->'endpoint'='{"x":3,"y":1}'::jsonb AND
  (SELECT x=3 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid) AND
  (SELECT count(*)=4 FROM realtime.b07_outbox),
  'R03-05 normal budget finalizes allowed buffered route and clears queue');
 after_broadcast:=(SELECT count(*) FROM realtime.b07_outbox);
 duplicate:=public.commit_world_motion_v2(
  sid,3,'{"x":3,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  duplicate=ack AND
  (SELECT count(*) FROM realtime.b07_outbox)=after_broadcast,
  'R03-06 exact ACK retry sends no new old paths after successful terminal drain');

 -- R03-07/08: global Realtime budget entirely spent, so no Advance frame
 -- was sent. Canonical Commit must delete unsent PATH data regardless.
 first:=public.begin_world_motion_v2(map_id,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":3,"y":1}'::jsonb,'drag',1,1,false);
 sid2:=(first->>'sessionId')::uuid;
 UPDATE forge_world_v2.observer_budget_b07
  SET window_started=clock_timestamp(),emitted=30 WHERE id=1;
 before_broadcast:=(SELECT count(*) FROM realtime.b07_outbox);
 PERFORM public.advance_world_motion_v2(sid2,1,
  '{"x":3,"y":1}'::jsonb,'[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid2) AND
  (SELECT count(*) FROM realtime.b07_outbox)=before_broadcast,
  'R03-07 fully exhausted budget leaves unsent actor-owned paths before Commit');
 ack:=public.commit_world_motion_v2(
  sid2,2,'{"x":4,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  ack->'endpoint'='{"x":4,"y":1}'::jsonb AND
  (SELECT x=4 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid2) AND
  (SELECT count(*) FROM realtime.b07_outbox)=before_broadcast,
  'R03-08 canonical Commit survives exhausted budget and retires ALL old paths');

 -- R03-09: after budget resets and newer actor session starts, an exact
 -- old Commit retry may NEVER resurrect an old path with equal origin.
 UPDATE forge_world_v2.observer_budget_b07
  SET emitted=0,window_started=clock_timestamp()-interval '2 seconds'
 WHERE id=1;
 first:=public.begin_world_motion_v2(map_id,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":4,"y":1}'::jsonb,'drag',1,1,false);
 sid3:=(first->>'sessionId')::uuid;
 PERFORM public.advance_world_motion_v2(sid3,1,
  '{"x":4,"y":1}'::jsonb,'[{"x":5,"y":1}]'::jsonb,1,1);
 after_broadcast:=(SELECT count(*) FROM realtime.b07_outbox);
 duplicate:=public.commit_world_motion_v2(sid2,2,'{"x":4,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(duplicate=ack AND
   (SELECT count(*) FROM realtime.b07_outbox)=after_broadcast AND
   (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
    WHERE session_id=sid2) AND
   (SELECT x=4 FROM public.map_tokens WHERE id=token),
  'R03-09 old ACK retry cannot emit stale path after newer gesture');

 -- R03-10: prepare a *certified hide* for the currently active session.
 -- B07 already validates actor/map/selection and preempts any older paths
 -- of the same selected piece. A saturated hide budget leaves this hide
 -- in the private queue while terminal scrub removes unrelated old paths.
 SELECT * INTO actor_session FROM forge_world_v2.motion_sessions WHERE id=sid3;
 UPDATE forge_world_v2.observer_budget_b07
  SET emitted=30,window_started=clock_timestamp() WHERE id=1;
 PERFORM forge_world_v2.queue_recipient_observer_b07(
  actor_session,player,
  jsonb_build_array(jsonb_build_object('kind','token','id',token,
   'action','hide')));
 PERFORM public.b08_assert(
  (SELECT pending->0->>'action'='hide'
   FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3 AND viewer_id=player),
  'R03-10 certified private hide buffered under saturated budget');
 -- Adversarial fixture: simulate an old deferred coordinate frame that
 -- survived an interrupted earlier publisher operation behind that hide.
 -- It is not client-writable: private-schema RLS/ACL is enforced separately.
 -- R03 must retire this route without retiring the certified hide.
 UPDATE forge_world_v2.observer_pending_b07
 SET deferred=jsonb_build_array(jsonb_build_array(jsonb_build_object(
  'kind','token','id',token,'action','path',
  'path','[{"x":4,"y":1},{"x":5,"y":1}]'::jsonb)))
 WHERE session_id=sid3 AND viewer_id=player;
 ack:=public.commit_world_motion_v2(
  sid3,2,'{"x":5,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  ack->'endpoint'='{"x":5,"y":1}'::jsonb AND
  (SELECT count(*)=1 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3) AND
  (SELECT pending->0->>'action'='hide' AND deferred='[]'::jsonb
   FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3 AND viewer_id=player) AND
  (SELECT count(*) FROM forge_world_v2.observer_pending_b07 q
   WHERE q.session_id=sid3 AND
    (EXISTS(SELECT 1 FROM jsonb_array_elements(q.pending) i
      WHERE i->>'action'='path') OR
     EXISTS(SELECT 1 FROM jsonb_array_elements(q.deferred) f,
      LATERAL jsonb_array_elements(f.value) i
      WHERE i->>'action'='path')))=0,
  'R03-11 after Commit ONLY certified hide remains, no old path');

 -- R03-12: an exact retry is permitted to send hide only (no coordinates)
 -- when budget recovers. Altered endpoint/actor never recovers the ACK.
 UPDATE forge_world_v2.observer_budget_b07
 SET emitted=0,window_started=clock_timestamp()-interval '2 seconds'
 WHERE id=1;
 before_broadcast:=(SELECT count(*) FROM realtime.b07_outbox);
 duplicate:=public.commit_world_motion_v2(
  sid3,2,'{"x":5,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  duplicate=ack AND
  (SELECT count(*) FROM realtime.b07_outbox)=before_broadcast+1 AND
  (SELECT message->'items'->0->>'action'='hide'
   FROM realtime.b07_outbox ORDER BY id DESC LIMIT 1) AND
  (SELECT NOT (message->'items'->0 ? 'path')
   FROM realtime.b07_outbox ORDER BY id DESC LIMIT 1) AND
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3),
  'R03-12 recovery may send authenticated hide only, never stale coordinates');
 PERFORM public.b08_assert(
  public.commit_world_motion_v2(sid3,2,'{"x":6,"y":1}'::jsonb,1,1) IS NULL,
  'R03-13 changed final endpoint denied after retirement');
 PERFORM set_config('request.jwt.claim.sub',dm::text,true);
 PERFORM public.b08_assert(
  public.commit_world_motion_v2(sid3,2,'{"x":5,"y":1}'::jsonb,1,1) IS NULL,
  'R03-14 foreign observer cannot recover actor ACK');

 -- R03-15/16: the source-real ephemeral realtime.send deliberately throws.
 -- Canonical Commit must succeed despite the outage, and the terminal
 -- private path must be deleted so later ACK retry never replays old motion.
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 UPDATE forge_world_v2.observer_budget_b07
  SET emitted=0,window_started=clock_timestamp()-interval '2 seconds'
 WHERE id=1;
 PERFORM set_config('b07.fail_broadcast','1',true);
 first:=public.begin_world_motion_v2(map_id,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":5,"y":1}'::jsonb,'drag',1,1,false);
 sid3:=(first->>'sessionId')::uuid;
 before_broadcast:=(SELECT count(*) FROM realtime.b07_outbox);
 PERFORM public.advance_world_motion_v2(sid3,1,
  '{"x":5,"y":1}'::jsonb,'[{"x":6,"y":1}]'::jsonb,1,1);
 ack:=public.commit_world_motion_v2(
  sid3,2,'{"x":6,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  ack->'endpoint'='{"x":6,"y":1}'::jsonb AND
  (SELECT x=6 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3) AND
  (SELECT count(*) FROM realtime.b07_outbox)=before_broadcast,
  'R03-15 failed Realtime send cannot strand old postcommit coordinate queue');
 PERFORM set_config('b07.fail_broadcast','0',true);
 duplicate:=public.commit_world_motion_v2(
  sid3,2,'{"x":6,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(duplicate=ack AND
  (SELECT count(*) FROM realtime.b07_outbox)=before_broadcast AND
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3),
  'R03-16 retry after recovering from failed publish cannot broadcast old path');
 RAISE NOTICE 'B10-R03 terminal queue retirement and no stale postcommit path PASS';
END $r03$;
ROLLBACK;
