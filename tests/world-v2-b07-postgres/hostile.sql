-- B07 source-real observer fanout and per-recipient budget attack tests.
-- Executed ONLY in ephemeral Postgres 17, in a rollback-only transaction.
BEGIN;
DO $test$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 player uuid:='00000000-0000-4000-8000-000000000012';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 camp uuid:='00000000-0000-4000-8000-000000000001';
 map_uuid uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 npc uuid:='00000000-0000-4000-8000-000000000103';
 session_uuid uuid;second_uuid uuid;hidden_uuid uuid;
 body jsonb;next_body jsonb;merged jsonb;response jsonb;
 old_cursor bigint;old_sent integer;rows_count integer;
 s forge_world_v2.motion_sessions%ROWTYPE;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 body:='[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
  "action":"path","path":[{"x":1,"y":1},{"x":2,"y":1}]}]'::jsonb;
 next_body:='[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
  "action":"path","path":[{"x":2,"y":1},{"x":3,"y":1}]}]'::jsonb;
 PERFORM public.b07_assert(forge_world_v2.valid_observer_items_b07(body),
  'P01 valid contiguous one-piece observer frame accepted');
 PERFORM public.b07_assert(NOT forge_world_v2.valid_observer_items_b07(
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
  "action":"path","path":[{"x":1,"y":1},{"x":4,"y":1}]}]'::jsonb),
  'H01 endpoint teleport without intermediate cells rejected');
 PERFORM public.b07_assert(NOT forge_world_v2.valid_observer_items_b07(
  body||body),'H02 duplicated piece ID in same frame rejected');
 PERFORM public.b07_assert(NOT forge_world_v2.valid_observer_items_b07(
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
  "action":"path","path":[{"x":1,"y":1},{"x":2,"y":1}],"secretWalls":[]}]'::jsonb),
  'H03 forbidden private geometry field rejected');
 PERFORM public.b07_assert(NOT forge_world_v2.valid_observer_items_b07(
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
  "action":"hide","path":[{"x":1,"y":1}]}]'::jsonb),
  'H04 hide packets never carry a path or position');
 PERFORM public.b07_assert(NOT forge_world_v2.valid_observer_items_b07(
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
  "action":"path","path":[{"x":1.5,"y":1},{"x":2,"y":1}]}]'::jsonb),
  'H05 fractional/noncanonical wire path rejected');

 merged:=forge_world_v2.merge_observer_items_b07(body,next_body);
 PERFORM public.b07_assert(
  jsonb_array_length(merged->0->'path')=3 AND
  merged->0->'path'->0='{"x":1,"y":1}'::jsonb AND
  merged->0->'path'->2='{"x":3,"y":1}'::jsonb,
  'P02 contiguous hidden-safe path concatenation preserves origin+turn order');
 PERFORM public.b07_assert(
  forge_world_v2.merge_observer_items_b07(body,
   '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
     "action":"path","path":[{"x":6,"y":1},{"x":7,"y":1}]}]'::jsonb)
  IS NULL,'H06 mismatched origin refuses shortcut');
 merged:=forge_world_v2.merge_observer_items_b07(body,
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101",
    "action":"hide"}]'::jsonb);
 PERFORM public.b07_assert(merged->0->>'action'='hide' AND
  NOT (merged->0 ? 'path'),'P03 hide supersedes queued path without leaking destination');
 merged:=forge_world_v2.merge_observer_items_b07(merged,next_body);
 PERFORM public.b07_assert(merged->0->>'action'='hide',
  'H07 hidden piece cannot reappear from old accumulated progress');

 response:=public.begin_world_motion_v2(
  map_uuid,jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 PERFORM public.b07_assert(response ? 'sessionId',
  'P04 source-real authenticated Begin created actor-owned motion session');
 session_uuid:=(response->>'sessionId')::uuid;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=session_uuid;

 response:=public.advance_world_motion_v2(
  session_uuid,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b07_assert(response->'accepted'=
  '[{"x":2,"y":1}]'::jsonb,
  'P05 actual protected Advance approves first one-cell route');
 PERFORM public.b07_assert(
  (SELECT count(*)=2 FROM realtime.b07_outbox) AND
  (SELECT bool_and(is_private AND event='world-motion-v2' AND
    topic='forge-world-v2:'||map_uuid::text||':'||
      (message->>'viewerId'))
   FROM realtime.b07_outbox),
  'P06 first accepted route immediately reaches two private recipient topics');
 PERFORM public.b07_assert(
  (SELECT count(*)=2 FROM forge_world_v2.viewer_streams
    WHERE seq=1 AND map_id=map_uuid),
  'P07 each recipient has its own monotonic cursor, not a global actor cursor');

 response:=public.advance_world_motion_v2(
  session_uuid,2,'{"x":2,"y":1}','[{"x":3,"y":1}]',1,1);
 response:=public.advance_world_motion_v2(
  session_uuid,3,'{"x":3,"y":1}','[{"x":4,"y":1}]',1,1);
 PERFORM public.b07_assert(
  (SELECT count(*)=2 FROM realtime.b07_outbox) AND
  (SELECT count(*)=2 FROM forge_world_v2.observer_pending_b07
    WHERE session_id=session_uuid AND
    jsonb_array_length(pending)=1),
  'P08 two rapid segments coalesce in pending private per-viewer queues');
 PERFORM public.b07_assert(
  (SELECT bool_and(jsonb_array_length(pending->0->'path')=3)
   FROM forge_world_v2.observer_pending_b07
   WHERE session_id=session_uuid),
  'P09 buffered paths preserve every original step, not only last endpoint');

 UPDATE forge_world_v2.observer_pending_b07
 SET last_sent_at=clock_timestamp()-interval '250 milliseconds'
 WHERE session_id=session_uuid;
 response:=public.advance_world_motion_v2(
  session_uuid,4,'{"x":4,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b07_assert(
  (SELECT count(*)=4 FROM realtime.b07_outbox) AND
  (SELECT count(*)=2 FROM forge_world_v2.viewer_streams
   WHERE map_id=map_uuid AND seq=2),
  'P10 later approved segment flushes at 200ms cadence without gaps');
 PERFORM public.b07_assert(
  (SELECT bool_and(jsonb_array_length(
   message->'items'->0->'path')=4)
   FROM realtime.b07_outbox
   WHERE (message->>'seq')::bigint=2),
  'P11 receiver sees exact intermediate 3-step route after coalescing');
 old_sent:=(SELECT count(*) FROM realtime.b07_outbox);
 response:=public.advance_world_motion_v2(
  session_uuid,4,'{"x":4,"y":1}','[{"x":5,"y":1}]',1,1);
 PERFORM public.b07_assert(
  (SELECT count(*)=old_sent FROM realtime.b07_outbox),
  'H08 identical advance retry cannot rebroadcast or consume cursor');

 -- Simulate a transient Realtime send error on already accepted motion:
 -- the private pending route and receiver cursor must remain intact.
 response:=public.advance_world_motion_v2(
  session_uuid,5,'{"x":5,"y":1}','[{"x":6,"y":1}]',1,1);
 UPDATE forge_world_v2.observer_pending_b07
 SET last_sent_at=clock_timestamp()-interval '250 milliseconds'
 WHERE session_id=session_uuid;
 PERFORM set_config('b07.fail_broadcast','1',true);
 response:=public.advance_world_motion_v2(
  session_uuid,6,'{"x":6,"y":1}','[{"x":7,"y":1}]',1,1);
 PERFORM public.b07_assert(
  (SELECT count(*)=4 FROM realtime.b07_outbox) AND
  (SELECT bool_and(jsonb_array_length(pending->0->'path')=3)
   FROM forge_world_v2.observer_pending_b07 WHERE session_id=session_uuid),
  'H09 failed broadcast retains entire buffered approved prefix for retry');
 PERFORM set_config('b07.fail_broadcast','0',true);
 SELECT * INTO s FROM forge_world_v2.motion_sessions WHERE id=session_uuid;
 PERFORM forge_world_v2.flush_recipient_observer_b07(s,player);
 PERFORM forge_world_v2.flush_recipient_observer_b07(s,dm);
 PERFORM public.b07_assert(
  (SELECT count(*)=6 FROM realtime.b07_outbox) AND
  (SELECT count(*)=2 FROM forge_world_v2.viewer_streams
   WHERE map_id=map_uuid AND seq=3),
  'P12 retry after Realtime outage sends one contiguous packet per recipient');

 -- Actual per-recipient viewer role/membership is rechecked at send time.
 response:=public.advance_world_motion_v2(
  session_uuid,7,'{"x":7,"y":1}','[{"x":8,"y":1}]',1,1);
 DELETE FROM public.campaign_members
 WHERE user_id=player AND campaign_id=camp;
 SELECT * INTO s FROM forge_world_v2.motion_sessions WHERE id=session_uuid;
 PERFORM forge_world_v2.flush_recipient_observer_b07(s,player);
 PERFORM public.b07_assert(
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=session_uuid AND viewer_id=player) AND
  (SELECT seq=3 FROM forge_world_v2.viewer_streams
   WHERE map_id=map_uuid AND viewer_id=player),
  'H10 revoked map viewer cannot receive queued old progress');
 INSERT INTO public.campaign_members VALUES(camp,player,'player');

 -- Hard global free-tier movement-publish ceiling: no cursor or send is
 -- consumed when exhausted; the approved route stays queued.
 UPDATE forge_world_v2.observer_budget_b07
 SET emitted=20,window_started=clock_timestamp() WHERE id=1;
 old_sent:=(SELECT count(*) FROM realtime.b07_outbox);
 UPDATE forge_world_v2.observer_pending_b07
 SET last_sent_at=clock_timestamp()-interval '250 milliseconds'
 WHERE session_id=session_uuid;
 PERFORM forge_world_v2.flush_recipient_observer_b07(s,dm);
 PERFORM public.b07_assert(
  (SELECT count(*)=old_sent FROM realtime.b07_outbox) AND
  (SELECT jsonb_array_length(pending)>0
   FROM forge_world_v2.observer_pending_b07
   WHERE session_id=session_uuid AND viewer_id=dm),
  'H11 global cap defers and retains safe progress without consuming cursor');
 UPDATE forge_world_v2.observer_budget_b07
 SET window_started=clock_timestamp()-interval '2 seconds',emitted=0 WHERE id=1;
 PERFORM forge_world_v2.flush_recipient_observer_b07(s,dm);
 PERFORM public.b07_assert(
  (SELECT count(*)=old_sent+1 FROM realtime.b07_outbox),
  'P13 exhausted global budget recovers when next window opens');

 -- Simulated committed session: B08 still MUST wire this call after
 -- authenticated final core commit succeeds (not implemented by B07).
 response:=public.advance_world_motion_v2(
  session_uuid,8,'{"x":8,"y":1}','[{"x":9,"y":1}]',1,1);
 UPDATE forge_world_v2.motion_sessions SET status='committed'
 WHERE id=session_uuid;
 old_sent:=(SELECT count(*) FROM realtime.b07_outbox);
 PERFORM public.b07_assert(
  forge_world_v2.flush_session_observers_b07(session_uuid)=1 AND
  (SELECT count(*)=old_sent+1 FROM realtime.b07_outbox),
  'P14 terminal flush drains only genuinely pending authorized recipients');
 PERFORM set_config('request.jwt.claim.sub',player::text,true);
 PERFORM public.b07_assert(
  forge_world_v2.flush_session_observers_b07(session_uuid)=0,
  'H12 a foreign actor cannot terminal-flush another session');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM public.b07_assert(
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_schema_privilege('anon','forge_world_v2','USAGE') AND
  NOT has_function_privilege('authenticated',
   'forge_world_v2.queue_recipient_observer_b07(forge_world_v2.motion_sessions,uuid,jsonb,timestamptz)','EXECUTE'),
  'G01 server-only queue and private schema deny browser roles');
 PERFORM public.b07_assert(
  (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.observer_pending_b07'::regclass) AND
  (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.observer_budget_b07'::regclass),
  'G02 private recipient buffer and global budget preserve RLS');
 PERFORM public.b07_assert(
  (SELECT bool_and(is_private) FROM realtime.b07_outbox),
  'G03 no public Realtime topic was used');
 RAISE NOTICE 'B07 candidate completed source-real actor/recipient protocol tests.';
END $test$;
ROLLBACK;
