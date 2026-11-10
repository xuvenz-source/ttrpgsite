-- B08 source-real canonical commit, replay and private observer queue tests.
-- All data is isolated and rolled back, never run against a live database.
BEGIN;
DO $b08_test$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 player uuid:='00000000-0000-4000-8000-000000000012';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 map_uuid uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 sid uuid;sid2 uuid;sid3 uuid;
 ack jsonb;duplicate jsonb;body jsonb;long_route jsonb;
 count_before integer;cursor_before bigint;j integer;
 session_row forge_world_v2.motion_sessions%ROWTYPE;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 -- Real server Begin, source-real validated Advance and B08 Commit.
 body:=public.begin_world_motion_v2(map_uuid,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(body ? 'sessionId','P01 actor-owned real Begin');
 sid:=(body->>'sessionId')::uuid;
 ack:=public.advance_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(ack->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'P02 real approved prefix');
 count_before:=(SELECT count(*) FROM realtime.b07_outbox);
 duplicate:=public.advance_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(duplicate=ack AND
   (SELECT count(*) FROM realtime.b07_outbox)=count_before,
   'P03 exact Advance replay preserves ACK without duplicate private send');
 PERFORM public.b08_assert(
  public.advance_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
    '[{"x":3,"y":1}]'::jsonb,1,1) IS NULL AND
  public.advance_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
    '[{"x":2,"y":1}]'::jsonb,1,999) IS NULL AND
  (SELECT last_x=2 AND last_seq=1 FROM forge_world_v2.motion_sessions WHERE id=sid),
  'H01 changed same-sequence payload/revisions rejected with no mutation');
 ack:=public.advance_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,
  '[{"x":3,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
   (SELECT count(*)=2 FROM forge_world_v2.observer_pending_b07
    WHERE session_id=sid AND pending<>'[]'::jsonb),
   'P04 rapid second Advance remains private and buffered until commit');
 PERFORM public.b08_assert(
   public.commit_world_motion_v2(sid,3,'{"x":2,"y":1}'::jsonb,1,1) IS NULL,
   'H02 wrong final endpoint never commits');
 ack:=public.commit_world_motion_v2(sid,3,'{"x":3,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  ack->'endpoint'='{"x":3,"y":1}'::jsonb AND
  (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token) AND
  (SELECT status='committed' AND last_seq=3
   FROM forge_world_v2.motion_sessions WHERE id=sid),
  'P05 exact final endpoint atomically written and acknowledged');
 PERFORM public.b08_assert(
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07 WHERE session_id=sid) AND
  (SELECT count(*)=4 FROM realtime.b07_outbox),
  'P06 final commit drains bounded recipient FIFO on two private topics');
 count_before:=(SELECT count(*) FROM realtime.b07_outbox);
 duplicate:=public.commit_world_motion_v2(sid,3,'{"x":3,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(duplicate=ack AND
  (SELECT x=3 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*) FROM realtime.b07_outbox)=count_before,
  'P07 identical lost-ACK retry is idempotent without resending');
 PERFORM public.b08_assert(
  public.commit_world_motion_v2(sid,3,'{"x":4,"y":1}'::jsonb,1,1) IS NULL AND
  public.commit_world_motion_v2(sid,3,'{"x":3,"y":1}'::jsonb,999,1) IS NULL AND
  public.commit_world_motion_v2(sid,4,'{"x":3,"y":1}'::jsonb,1,1) IS NULL,
  'H03 changed endpoint/revision/sequence cannot recover cached commit ACK');
 PERFORM public.b08_assert(
  public.advance_world_motion_v2(sid,4,'{"x":3,"y":1}'::jsonb,
   '[{"x":4,"y":1}]'::jsonb,1,1) IS NULL,
  'H04 committed session cannot accept another Advance');
 -- Simulate all Realtime movement budget consumed: commit remains canonical.
 body:=public.begin_world_motion_v2(map_uuid,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":3,"y":1}'::jsonb,'drag',1,1,false);
 sid2:=(body->>'sessionId')::uuid;
 UPDATE forge_world_v2.observer_budget_b07 SET emitted=30,
  window_started=clock_timestamp() WHERE id=1;
 ack:=public.advance_world_motion_v2(sid2,1,'{"x":3,"y":1}'::jsonb,
   '[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM forge_world_v2.observer_pending_b07 WHERE session_id=sid2),
  'P08 capped Realtime budget preserves full approved pending queues');
 cursor_before:=(SELECT seq FROM forge_world_v2.viewer_streams
  WHERE map_id=map_uuid AND viewer_id=player);
 ack:=public.commit_world_motion_v2(sid2,2,'{"x":4,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  ack->'endpoint'='{"x":4,"y":1}'::jsonb AND
  (SELECT x=4 FROM public.map_tokens WHERE id=token) AND
  (SELECT count(*)=2 FROM forge_world_v2.observer_pending_b07 WHERE session_id=sid2),
  'P09 exhausted budget does not roll back canonical commit or lose queue');
 UPDATE forge_world_v2.observer_budget_b07
  SET emitted=0,window_started=clock_timestamp()-interval '2 seconds'
 WHERE id=1;
 duplicate:=public.commit_world_motion_v2(sid2,2,'{"x":4,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(duplicate=ack AND
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07 WHERE session_id=sid2) AND
  (SELECT seq=cursor_before+1 FROM forge_world_v2.viewer_streams
    WHERE map_id=map_uuid AND viewer_id=player),
  'P10 exact replay resumes deferred private drain, no canonical double-write');
 -- A recipient loses current map access; stale queued path must NOT publish.
 body:=public.begin_world_motion_v2(map_uuid,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":4,"y":1}'::jsonb,'drag',1,1,false);
 sid2:=(body->>'sessionId')::uuid;
 UPDATE forge_world_v2.observer_budget_b07 SET emitted=30,
  window_started=clock_timestamp() WHERE id=1;
 ack:=public.advance_world_motion_v2(sid2,1,'{"x":4,"y":1}'::jsonb,
   '[{"x":5,"y":1}]'::jsonb,1,1);
 DELETE FROM public.campaign_members
 WHERE user_id=player AND role='player';
 count_before:=(SELECT count(*) FROM realtime.b07_outbox);
 ack:=public.commit_world_motion_v2(sid2,2,'{"x":5,"y":1}'::jsonb,1,1);
 UPDATE forge_world_v2.observer_budget_b07 SET emitted=0,
  window_started=clock_timestamp()-interval '2 seconds' WHERE id=1;
 duplicate:=public.commit_world_motion_v2(sid2,2,'{"x":5,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  (SELECT count(*) FROM realtime.b07_outbox WHERE
    (message->>'viewerId')=player::text)=3 AND
  (SELECT count(*) FROM realtime.b07_outbox)>=count_before,
  'H05 revoked viewer receives no stale buffered coordinates');
 -- Invalid actor replay denied without disclosing endpoint.
 PERFORM set_config('request.jwt.claim.sub',player::text,true);
 PERFORM public.b08_assert(public.commit_world_motion_v2(
   sid,3,'{"x":3,"y":1}'::jsonb,1,1) IS NULL,
   'H06 foreign actor cannot read canonical cached ACK');
 -- B08 hide priority: queued stale paths must never overtake a certified
 -- hide, even when the first 25-point frame AND deferred FIFO were occupied.
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
  ('00000000-0000-4000-8000-000000000001',player,'player');
 sid3:='00000000-0000-4000-8000-000000000399';
 PERFORM public.b04_issue_token_session(sid3,actor,token);
 SELECT * INTO session_row FROM forge_world_v2.motion_sessions WHERE id=sid3;
 long_route:='[]'::jsonb;
 FOR j IN 0..24 LOOP
  long_route:=long_route||jsonb_build_array(
    jsonb_build_object('x',5+(j%2),'y',1));
 END LOOP;
 UPDATE forge_world_v2.observer_budget_b07
 SET emitted=30,window_started=clock_timestamp() WHERE id=1;
 PERFORM forge_world_v2.queue_recipient_observer_b07(session_row,player,
  jsonb_build_array(jsonb_build_object('kind','token','id',token,
   'action','path','path',long_route)));
 PERFORM forge_world_v2.queue_recipient_observer_b07(session_row,player,
  jsonb_build_array(jsonb_build_object('kind','token','id',token,
   'action','path','path','[{"x":5,"y":1},{"x":6,"y":1}]'::jsonb)));
 PERFORM public.b08_assert(
  (SELECT jsonb_array_length(pending->0->'path')=25 AND
   jsonb_array_length(deferred)=1 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3 AND viewer_id=player),
  'P11 saturated 25-point head and deferred paths retained before hide');
 cursor_before:=(SELECT seq FROM forge_world_v2.viewer_streams
  WHERE map_id=map_uuid AND viewer_id=player);
 PERFORM forge_world_v2.queue_recipient_observer_b07(session_row,player,
  jsonb_build_array(jsonb_build_object('kind','token','id',token,
   'action','hide')));
 PERFORM public.b08_assert(
  (SELECT pending->0->>'action'='hide' AND
   jsonb_array_length(deferred)=0 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=sid3 AND viewer_id=player) AND
  (SELECT seq=cursor_before FROM forge_world_v2.viewer_streams
   WHERE map_id=map_uuid AND viewer_id=player),
  'H07 urgent hide preempts and deletes every older unsent concealed path');
 UPDATE forge_world_v2.observer_budget_b07
 SET emitted=0,window_started=clock_timestamp()-interval '2 seconds'
 WHERE id=1;
 PERFORM public.b08_assert(
  forge_world_v2.flush_recipient_observer_b07(session_row,player)=1 AND
  (SELECT message->'items'->0->>'action'='hide' AND
   NOT (message->'items'->0 ? 'path') FROM realtime.b07_outbox
   WHERE (message->>'viewerId')=player::text
   ORDER BY id DESC LIMIT 1) AND
  (SELECT seq=cursor_before+1 FROM forge_world_v2.viewer_streams
   WHERE map_id=map_uuid AND viewer_id=player),
  'P12 recovered priority broadcast contains hide only and advances cursor once');
  RAISE NOTICE 'B08 source-real commit replay and authorized private recovery PASS';
END $b08_test$;
ROLLBACK;