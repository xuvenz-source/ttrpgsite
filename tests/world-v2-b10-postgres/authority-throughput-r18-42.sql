-- B10-R18-42. Disposable localhost PostgreSQL 17 only; called ONLY after
-- loading the exact released V2 Begin/Advance/Commit definitions in the
-- isolated R05 fixture and BEFORE touching the frozen R05 migration.
-- The original private observer publisher is a TEST-ONLY sink in this fixture.
-- There are no production network round trips, real map-token triggers or
-- independently authenticated P1/P2 streams. Timings are advisory, not a SLA.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE r42_samples(
 variant text NOT NULL CHECK(variant IN ('paced-23','single-batch-23')),
 phase text NOT NULL CHECK(phase IN ('begin','advance','commit')),
 iteration int NOT NULL CHECK(iteration BETWEEN 1 AND 6),
 rpc_count int NOT NULL CHECK(rpc_count BETWEEN 1 AND 23),
 duration_ms double precision NOT NULL CHECK(duration_ms>=0),
 PRIMARY KEY(variant,phase,iteration)
);
DO $r42_original$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL
  AND to_regclass('forge_world_v2.observer_pending_b07') IS NULL
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid),
  'R42-01 starts on original live-shape protocol, NOT installed R05/atomic finalizer');
END $r42_original$;
-- This ephemeral fixture is 16 cells wide, too short for a 23-cell crossing.
-- Expand the disposable map only; no map edit is made on connected Supabase.
UPDATE public.battle_maps SET width=320
 WHERE id='00000000-0000-4000-8000-000000000021'::uuid;
DO $r42_benchmark$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 pieces jsonb:=jsonb_build_array(
  jsonb_build_object('kind','token','id',token));
 a jsonb;ack jsonb;committed jsonb;from_pt jsonb;to_pt jsonb;
 sid uuid;variant text;i integer;j integer;
 started timestamptz;duration double precision;advance_ms double precision;
 advance_calls integer;seq integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 FOR i IN 1..6 LOOP
  -- Alternate ordering across iterations to limit first-run warm cache bias.
  FOR variant IN
   SELECT CASE WHEN mod(i,2)=0 THEN label
    ELSE CASE WHEN label='paced-23' THEN 'single-batch-23'
      ELSE 'paced-23' END END
   FROM unnest(ARRAY['paced-23','single-batch-23']) AS label
  LOOP
   PERFORM public.b08_assert(
    (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
    'R42-02 fixture starts each variant at the same canonical signed origin');
   started:=clock_timestamp();
   a:=public.begin_world_motion_v2(test_map,pieces,
    '{"x":1,"y":1}'::jsonb,'keyboard',1,1,false);
   duration:=extract(epoch FROM clock_timestamp()-started)*1000;
   PERFORM public.b08_assert(a->>'version'='2' AND a ? 'sessionId',
    'R42-03 source-real Begin grants selected player token');
   sid:=(a->>'sessionId')::uuid;
   INSERT INTO pg_temp.r42_samples VALUES(variant,'begin',i,1,duration);

   advance_ms:=0;advance_calls:=0;seq:=0;
   IF variant='paced-23' THEN
    -- 23 independent user key-repeat deliveries: every step requires
    -- the preceding server response. Do not introduce artificial sleeps:
    -- this measures SQL work and RPC COUNT, never the HTTPS RTT.
    FOR j IN 1..23 LOOP
     from_pt:=jsonb_build_object('x',j,'y',1);
     to_pt:=jsonb_build_object('x',j+1,'y',1);
     started:=clock_timestamp();
     ack:=public.advance_world_motion_v2(
      sid,j,from_pt,jsonb_build_array(to_pt),1,1);
     advance_ms:=advance_ms+
      extract(epoch FROM clock_timestamp()-started)*1000;
     advance_calls:=advance_calls+1;seq:=j;
     PERFORM public.b08_assert(
      ack->>'blocked'='false' AND
      ack->'accepted'=jsonb_build_array(to_pt) AND
      ack->>'seq'=j::text,
      'R42-04 every paced cell independently server-approved');
    END LOOP;
   ELSE
    started:=clock_timestamp();
    ack:=public.advance_world_motion_v2(sid,1,
     '{"x":1,"y":1}'::jsonb,
     '[{"x":24,"y":1}]'::jsonb,1,1);
    advance_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
    advance_calls:=1;seq:=1;
    PERFORM public.b08_assert(
     ack->>'blocked'='false' AND
     jsonb_array_length(ack->'accepted')=23 AND
     ack->'accepted'->0='{"x":2,"y":1}'::jsonb AND
     ack->'accepted'->22='{"x":24,"y":1}'::jsonb,
     'R42-05 one bounded batch still validates every one of 23 cells');
   END IF;
   PERFORM public.b08_assert(
    (SELECT last_x=24 AND last_y=1 AND
     attempted_cells=23 AND accepted_cells=23 AND
     batches=advance_calls AND last_seq=seq
     FROM forge_world_v2.motion_sessions WHERE id=sid),
    'R42-06 exact signed 23-cell endpoint and resource budget parity');
   INSERT INTO pg_temp.r42_samples
    VALUES(variant,'advance',i,advance_calls,advance_ms);

   started:=clock_timestamp();
   committed:=public.commit_world_motion_v2(sid,seq+1,
     '{"x":24,"y":1}'::jsonb,1,1);
   duration:=extract(epoch FROM clock_timestamp()-started)*1000;
   PERFORM public.b08_assert(
    committed->'endpoint'='{"x":24,"y":1}'::jsonb AND
    (SELECT x=24 AND y=1 FROM public.map_tokens WHERE id=token) AND
    (SELECT status='committed' FROM forge_world_v2.motion_sessions
     WHERE id=sid),
    'R42-07 original canonical Commit rechecks every accepted cell');
   INSERT INTO pg_temp.r42_samples VALUES(variant,'commit',i,1,duration);

   -- Return through ordinary actor-authorized public RPCs, not a
   -- privileged map-token UPDATE, to preserve equal start state.
   a:=public.begin_world_motion_v2(test_map,pieces,
    '{"x":24,"y":1}'::jsonb,'keyboard',1,1,false);
   PERFORM public.b08_assert(a ? 'sessionId',
    'R42-08 source-real reverse Begin');
   sid:=(a->>'sessionId')::uuid;
   ack:=public.advance_world_motion_v2(sid,1,
    '{"x":24,"y":1}'::jsonb,
    '[{"x":1,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(
    ack->>'blocked'='false' AND
    jsonb_array_length(ack->'accepted')=23,
    'R42-09 reverse path is fully server-authorized');
   committed:=public.commit_world_motion_v2(sid,2,
    '{"x":1,"y":1}'::jsonb,1,1);
   PERFORM public.b08_assert(
    committed->'endpoint'='{"x":1,"y":1}'::jsonb AND
    (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
    'R42-10 canonical reset via public RPC succeeds');
  END LOOP;
 END LOOP;
END $r42_benchmark$;
-- Hostile wall and foreign actor checks on the same source-real authority.
UPDATE public.map_environments
 SET live='{"objects":[{"type":"wall","blocksMovement":true,
 "points":[{"x":2.5,"y":0},{"x":2.5,"y":10}]}]}'::jsonb
 WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
DO $r42_blocked$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 foreign_actor uuid:='00000000-0000-4000-8000-000000000012';
 map_id uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 a jsonb;r jsonb;sid uuid;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 a:=public.begin_world_motion_v2(map_id,
  jsonb_build_array(jsonb_build_object('kind','token','id',token)),
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(a->>'sessionId')::uuid;
 PERFORM public.b08_assert(sid IS NOT NULL,'R42-11 blocked fixture authenticated');
 PERFORM set_config('request.jwt.claim.sub',foreign_actor::text,true);
 r:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":1}'::jsonb,'[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(r IS NULL,
  'R42-12 another actor cannot use or probe this movement session');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 r:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":1}'::jsonb,'[{"x":4,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  r->>'blocked'='true' AND
  jsonb_array_length(r->'accepted')<3 AND
  NOT(r ? 'wallGeometry') AND NOT(r ? 'scene') AND
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
  'R42-13 solid wall never becomes client-authorized / canonical token never penetrates');
END $r42_blocked$;
-- Advisory, low-sample, source-real SQL timings only.
SELECT variant,phase,count(*) samples,sum(rpc_count) total_rpc_calls,
 round(avg(duration_ms)::numeric,3) mean_sql_ms,
 round((percentile_cont(0.5) WITHIN GROUP(ORDER BY duration_ms))::numeric,3) p50_sql_ms,
 round((percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms))::numeric,3) p95_sql_ms,
 round(max(duration_ms)::numeric,3) max_sql_ms
FROM pg_temp.r42_samples
GROUP BY variant,phase ORDER BY phase,variant;
DO $r42_count$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=36 FROM pg_temp.r42_samples) AND
  (SELECT sum(rpc_count)=138 FROM pg_temp.r42_samples
   WHERE variant='paced-23' AND phase='advance') AND
  (SELECT sum(rpc_count)=6 FROM pg_temp.r42_samples
   WHERE variant='single-batch-23' AND phase='advance') AND
  (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'),
  'R42-14 exactly 36 isolated samples; 138 vs 6 approved Advances; canonical home');
END $r42_count$;
ROLLBACK;
DO $r42_restored$
BEGIN
 PERFORM public.b08_assert(
  to_regclass('pg_temp.r42_samples') IS NULL AND
  (SELECT width=160 FROM public.battle_maps
   WHERE id='00000000-0000-4000-8000-000000000021'::uuid) AND
  (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid) AND
  (SELECT live='{"objects":[]}'::jsonb FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid) AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions) AND
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL,
  'R42-15 all test data/map dimensions/source protocol restored; no finalizer installed');
 RAISE NOTICE 'R18-42 PASS: original V2 Begin/Advance/Commit, 6x23 paced vs 6x23 batched route, wall and auth fail-closed; ROLLED BACK';
END $r42_restored$;
