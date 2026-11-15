-- B10-R18-85: disposable LOCAL PostgreSQL 17 signed phase isolation.
-- INCLUDE ONLY after R84's 72 signed token / eight signed tool Commits,
-- inside R54's open BEGIN/ROLLBACK. No source/RPC/trigger bypass or writes
-- to real Supabase. Tracks original Begin+Advance vs original Commit using
-- immediate pg_stat_xact_user_functions snapshots per phase, not an invented
-- subtraction of separate R83/R84 aggregate benchmark runs.
\set ON_ERROR_STOP on
DO $r85_preflight$
DECLARE starts integer;
BEGIN
 IF current_database()<>'world_v2_b10_r05' OR current_user<>'postgres'
 OR current_setting('track_functions')<>'all'
 OR to_regclass('pg_temp.r84_function_delta') IS NULL
 OR to_regclass('pg_temp.r84_tool_function_delta') IS NULL
 OR to_regclass('pg_temp.r85_phase_samples') IS NOT NULL
 OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL
 OR md5(pg_get_functiondef(
  'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure))
   <>'f87014e7a967d1db1262dabe9e125552'
 OR (SELECT count(*)<>36 FROM pg_temp.r68_samples)
 OR (SELECT count(*)<>4 FROM pg_temp.r84_tool_samples)
 OR (SELECT count(*)<>6 FROM pg_trigger t
  WHERE t.tgrelid='public.map_tokens'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
 OR (SELECT count(*)<>4 FROM pg_trigger t
  WHERE t.tgrelid='public.campaign_tool_issues'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
 OR (SELECT x=1 AND y=1 FROM public.map_tokens
  WHERE id='00000000-0000-4000-8000-000000000101'::uuid) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R85 refuses missing R84 source-real full triggers or unisolated host';END IF;
 -- R54 used 32 signed gesture sessions + one rejected-wall Begin;
 -- R68 added 72; R84 tool added 8 signed + 2 hostile Begin = 115.
 -- Four more original signed sessions MUST keep unchanged 120/60s cap.
 SELECT gb.starts INTO starts FROM forge_world_v2.gesture_budgets gb
 WHERE gb.actor_id='00000000-0000-4000-8000-000000000011'::uuid
  AND gb.map_id='00000000-0000-4000-8000-000000000021'::uuid;
 IF starts IS NULL OR starts NOT BETWEEN 112 AND 116
 THEN RAISE EXCEPTION 'R85 refuses changed actor-signed session budget';END IF;
 PERFORM public.b08_assert(
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE')
  AND NOT has_schema_privilege('anon','forge_world_v2','USAGE'),
  'R85-01 isolated original private motion authority, all ten position triggers');
END $r85_preflight$;

CREATE TEMP TABLE r85_phase_samples (
 fog text NOT NULL CHECK (fog IN ('fog-off','fog-on')),
 phase text NOT NULL CHECK (phase IN ('begin_advance','commit')),
 request_ms double precision NOT NULL CHECK (request_ms>=0),
 viewer_revision_delta bigint NOT NULL DEFAULT 0,
 PRIMARY KEY (fog,phase)
) ON COMMIT DROP;
CREATE TEMP TABLE r85_function_before (
 funcid oid PRIMARY KEY, calls bigint NOT NULL,
 total_time double precision NOT NULL,self_time double precision NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE r85_function_delta (
 fog text NOT NULL, phase text NOT NULL,
 function_schema text NOT NULL, function_name text NOT NULL,
 calls bigint NOT NULL, inclusive_ms double precision NOT NULL,
 self_ms double precision NOT NULL,
 PRIMARY KEY(fog,phase,function_schema,function_name)
) ON COMMIT DROP;

DO $r85_measure$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011'::uuid;
 test_map uuid:='00000000-0000-4000-8000-000000000021'::uuid;
 token uuid:='00000000-0000-4000-8000-000000000101'::uuid;
 selection jsonb:=jsonb_build_array(jsonb_build_object(
  'kind','token','id','00000000-0000-4000-8000-000000000101'));
 fog_mode text; begin_ack jsonb;adv jsonb;committed jsonb; sid uuid;
 started timestamptz;elapsed double precision;pre_ticks bigint;post_ticks bigint;
 phase_name text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 -- Use EXACT same off-route, 24-wall source environment as the R68 fixture
 -- (not an artificial open scene), unchanged original collision and fog.
 UPDATE public.map_environments SET live=(SELECT scene
  FROM pg_temp.r68_scenes WHERE scenario='wall-heavy')
 WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT jsonb_array_length(live->'objects')=24
   FROM public.map_environments WHERE map_id=test_map),
  'R85-02 24 original wall objects, source-real map validation');

 -- Reverse fog order relative to earlier R68's alternating experiment.
 -- Each fog state has one true signed forward + reverse Commit. This is
 -- a CALL ATTRIBUTION experiment with n=1 per state, NOT a p95 benchmark.
 FOREACH fog_mode IN ARRAY ARRAY['fog-on','fog-off'] LOOP
  UPDATE forge_visibility.map_rules
   SET fog_enforced=(fog_mode='fog-on') WHERE map_id=test_map;
  PERFORM public.b08_assert(
   (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
   'R85-03 canonical origin before original signed phase measurements');
  DELETE FROM pg_temp.r85_function_before;
  PERFORM pg_stat_clear_snapshot();
  INSERT INTO pg_temp.r85_function_before
   SELECT funcid,calls,total_time,self_time
   FROM pg_stat_xact_user_functions;
  started:=clock_timestamp();
  begin_ack:=public.begin_world_motion_v2(test_map,selection,
   '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(begin_ack->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,
   'R85-04 signed Begin retains original access/rate-limit authority');
  adv:=public.advance_world_motion_v2(sid,1,
   '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
  elapsed:=extract(epoch FROM clock_timestamp()-started)*1000;
  PERFORM public.b08_assert(
   adv->>'blocked'='false' AND
   adv->'accepted'='[{"x":2,"y":1}]'::jsonb,
   'R85-05 original signed Advance validates true off-route-wall step');
  INSERT INTO pg_temp.r85_phase_samples(fog,phase,request_ms)
   VALUES(fog_mode,'begin_advance',elapsed);
  -- Track user-function counts separately from the next Commit.
  PERFORM pg_stat_clear_snapshot();
  INSERT INTO pg_temp.r85_function_delta
  SELECT fog_mode,'begin_advance',n.nspname,p.proname,
    a.calls-coalesce(b.calls,0),
    greatest(0,a.total_time-coalesce(b.total_time,0)),
    greatest(0,a.self_time-coalesce(b.self_time,0))
  FROM pg_stat_xact_user_functions a
  LEFT JOIN pg_temp.r85_function_before b ON b.funcid=a.funcid
  JOIN pg_proc p ON p.oid=a.funcid
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE a.calls>coalesce(b.calls,0)
    AND n.nspname IN('public','forge_visibility','forge_world_v2');

  DELETE FROM pg_temp.r85_function_before;
  PERFORM pg_stat_clear_snapshot();
  INSERT INTO pg_temp.r85_function_before
   SELECT funcid,calls,total_time,self_time
   FROM pg_stat_xact_user_functions;
  SELECT coalesce(sum(revision),0) INTO pre_ticks
    FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  started:=clock_timestamp();
  committed:=public.commit_world_motion_v2(sid,2,
   '{"x":2,"y":1}'::jsonb,1,1);
  elapsed:=extract(epoch FROM clock_timestamp()-started)*1000;
  SELECT coalesce(sum(revision),0) INTO post_ticks
    FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  PERFORM public.b08_assert(
   committed->'endpoint'='{"x":2,"y":1}'::jsonb
   AND (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=token)
   AND ((fog_mode='fog-on' AND post_ticks>=pre_ticks+2)
      OR (fog_mode='fog-off' AND post_ticks=pre_ticks)),
   'R85-06 original source-real Commit and audience-scoped fog effects');
  INSERT INTO pg_temp.r85_phase_samples
   VALUES(fog_mode,'commit',elapsed,post_ticks-pre_ticks);
  PERFORM pg_stat_clear_snapshot();
  INSERT INTO pg_temp.r85_function_delta
  SELECT fog_mode,'commit',n.nspname,p.proname,
    a.calls-coalesce(b.calls,0),
    greatest(0,a.total_time-coalesce(b.total_time,0)),
    greatest(0,a.self_time-coalesce(b.self_time,0))
  FROM pg_stat_xact_user_functions a
  LEFT JOIN pg_temp.r85_function_before b ON b.funcid=a.funcid
  JOIN pg_proc p ON p.oid=a.funcid
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE a.calls>coalesce(b.calls,0)
   AND n.nspname IN('public','forge_visibility','forge_world_v2');

  -- Untimed reverse is also source-real, never an UPDATE outside authority.
  begin_ack:=public.begin_world_motion_v2(test_map,selection,
   '{"x":2,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(begin_ack->>'sessionId')::uuid;
  adv:=public.advance_world_motion_v2(sid,1,
   '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
  committed:=public.commit_world_motion_v2(sid,2,
   '{"x":1,"y":1}'::jsonb,1,1);
  PERFORM public.b08_assert(
   adv->>'blocked'='false'
   AND committed->'endpoint'='{"x":1,"y":1}'::jsonb
   AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
   'R85-07 original signed return preserves canonical source/home');
 END LOOP;
 -- Restore both original scene and fog flag before R54 rollback postflight.
 UPDATE forge_visibility.map_rules SET fog_enforced=true WHERE map_id=test_map;
 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
  WHERE map_id=test_map;
END $r85_measure$;

-- Crucial: verify phase isolation, not only that aggregate stats exist.
DO $r85_phase_assert$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM pg_temp.r85_phase_samples)
  AND (SELECT count(*)=2 FROM pg_temp.r85_phase_samples
       WHERE phase='commit')
  AND (SELECT count(*)=2 FROM pg_temp.r85_function_delta
       WHERE phase='commit' AND function_schema='public'
       AND function_name='commit_world_motion_v2' AND calls=1)
  AND (SELECT count(*)=2 FROM pg_temp.r85_function_delta
       WHERE phase='begin_advance' AND function_schema='public'
       AND function_name='begin_world_motion_v2' AND calls=1)
  AND (SELECT count(*)=2 FROM pg_temp.r85_function_delta
       WHERE phase='begin_advance' AND function_schema='public'
       AND function_name='advance_world_motion_v2' AND calls=1)
  AND NOT EXISTS(SELECT 1 FROM pg_temp.r85_function_delta
       WHERE phase='begin_advance' AND function_schema='public'
       AND function_name='commit_world_motion_v2')
  AND (SELECT count(*)=2 FROM pg_temp.r85_function_delta
       WHERE phase='commit' AND function_schema='forge_visibility'
       AND function_name='tick_tokens' AND calls=1)
  AND (SELECT count(*)=2 FROM pg_temp.r85_function_delta
       WHERE phase='commit' AND function_schema='forge_visibility'
       AND function_name='enforce_collision' AND calls=1)
  AND (SELECT count(*)=8 FROM pg_temp.r85_function_delta
       WHERE phase='commit' AND function_schema='public'
       AND function_name IN('reject_direct_sheet_inventory_overwrite',
          'protect_token_fields','touch_updated_at','validate_token_map')
       AND calls=1),
  'R85-08 phase counts isolate two Begin+Advance from original single signed Commits, full six triggers');
 PERFORM public.b08_assert(
  (SELECT viewer_revision_delta>=2 FROM pg_temp.r85_phase_samples
       WHERE fog='fog-on' AND phase='commit')
  AND (SELECT viewer_revision_delta=0 FROM pg_temp.r85_phase_samples
       WHERE fog='fog-off' AND phase='commit')
  AND (SELECT calls>=2 FROM pg_temp.r85_function_delta
       WHERE fog='fog-on' AND phase='commit'
       AND function_schema='forge_visibility'
       AND function_name='authorized_viewer_fog_frame')
  AND NOT EXISTS (SELECT 1 FROM pg_temp.r85_function_delta
       WHERE fog='fog-off' AND phase='commit'
       AND function_schema='forge_visibility'
       AND function_name='authorized_viewer_fog_frame')
  AND (SELECT calls>0 FROM pg_temp.r85_function_delta
       WHERE fog='fog-on' AND phase='commit'
       AND function_schema='forge_visibility'
       AND function_name='ray_blocked')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE')
  AND NOT has_schema_privilege('anon','forge_world_v2','USAGE'),
  'R85-09 synchronous private fog cost is in signed Commit, not disabled collision/permission checks');
 PERFORM public.b08_assert(
  (SELECT x=1 AND y=1 FROM public.map_tokens
    WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
       FROM public.map_environments
       WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND (SELECT starts<=120 FROM forge_world_v2.gesture_budgets
       WHERE actor_id='00000000-0000-4000-8000-000000000011'::uuid
       AND map_id='00000000-0000-4000-8000-000000000021'::uuid),
  'R85-10 no session throttle bypass, canonical source restored before rollback');
 RAISE NOTICE 'R18-85 PASS: signed wall-heavy Commit phase isolation, full 6 token/4 tool triggers, 4 extra sessions; not production/browser p95';
END $r85_phase_assert$;

-- Allowed bounded aggregate-only output, no actor/map/scene geometry data.
-- pg_stat_xact_user_functions inclusive costs NEST, so do not sum them.
SELECT fog,phase,count(*) AS samples,
 round(avg(request_ms)::numeric,3) AS local_request_ms,
 max(viewer_revision_delta) AS viewer_revision_delta
FROM pg_temp.r85_phase_samples
GROUP BY fog,phase ORDER BY fog,phase;
SELECT fog,phase,function_schema,function_name,calls,
 round(inclusive_ms::numeric,3) AS inclusive_ms,
 round(self_ms::numeric,3) AS self_ms
FROM pg_temp.r85_function_delta
WHERE (function_schema,function_name) IN (
 ('public','begin_world_motion_v2'),
 ('public','advance_world_motion_v2'),
 ('public','commit_world_motion_v2'),
 ('public','protect_token_fields'),
 ('public','validate_token_map'),
 ('forge_world_v2','step_allowed'),
 ('forge_visibility','enforce_collision'),
 ('forge_visibility','tick_tokens'),
 ('forge_visibility','authorized_viewer_fog_frame'),
 ('forge_visibility','bump_viewer_ticks'),
 ('forge_visibility','ray_blocked'),
 ('forge_visibility','is_lit'))
ORDER BY fog,phase,function_schema,function_name;
