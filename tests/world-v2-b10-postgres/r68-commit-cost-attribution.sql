-- R18-68: DISPOSABLE PostgreSQL 17 ONLY. Included INSIDE R18-54's
-- already-open BEGIN/ROLLBACK transaction after exact original fog/collision
-- source functions and REAL map-token triggers have been installed.
-- NEVER run independently or against Supabase. No original SQL altered.
-- Profiles Commit (not Advance) across 1/6/12 server-approved cells,
-- fog OFF/ON and open/24-wall scenes in the same canonical signed fixture.
-- This tests causation in a source-real local fixture, NOT browser RTT/p95.
\set ON_ERROR_STOP on
DO $r68_guard$
BEGIN
 IF current_database()<>'world_v2_b10_r05'
 OR current_user<>'postgres'
 OR to_regclass('pg_temp.r54_samples') IS NULL
 OR to_regclass('forge_visibility.viewer_fog_snapshots') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c
   ON c.oid=t.tgrelid WHERE c.relname='map_tokens'
   AND t.tgname='forge_visibility_token_tick' AND t.tgenabled='O')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c
   ON c.oid=t.tgrelid WHERE c.relname='map_tokens'
   AND t.tgname='forge_player_collision' AND t.tgenabled='O')
 OR md5(pg_get_functiondef(
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure))
   <>'f87014e7a967d1db1262dabe9e125552'
 OR md5(pg_get_functiondef(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   <>'ee3356af321fec1a3e167a75c6245e86'
 OR (SELECT x<>1 OR y<>1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
 OR (SELECT collision_enforced IS DISTINCT FROM true
     FROM forge_visibility.map_rules
     WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
 THEN RAISE EXCEPTION 'R68 refuses nonisolated, altered, triggerless or moved fixture';END IF;
END $r68_guard$;

CREATE TEMP TABLE r68_samples (
 scenario text NOT NULL CHECK(scenario IN ('open','wall-heavy')),
 fog text NOT NULL CHECK(fog IN ('fog-off','fog-on')),
 depth integer NOT NULL CHECK(depth IN (1,6,12)),
 repeat integer NOT NULL CHECK(repeat BETWEEN 1 AND 4),
 commit_ms double precision NOT NULL CHECK(commit_ms>=0),
 viewer_revision_delta bigint NOT NULL CHECK(viewer_revision_delta>=0),
 PRIMARY KEY(scenario,fog,depth,repeat)
);
CREATE TEMP TABLE r68_scenes (
 scenario text PRIMARY KEY,
 scene jsonb NOT NULL
);
INSERT INTO pg_temp.r68_scenes
 VALUES ('open','{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb);
-- The walls force all 24 obstacle checks but are NOT in the move route
-- (y=1, canonical x starts at 1 and stops by x=13). No wall is bypassed.
INSERT INTO pg_temp.r68_scenes
 SELECT 'wall-heavy',jsonb_build_object(
   'objects',(SELECT jsonb_agg(jsonb_build_object(
     'type','wall','blocksMovement',true,
     'points',jsonb_build_array(
       jsonb_build_object('x',14.1+((n%3)::numeric/10),'y',3),
       jsonb_build_object('x',14.1+((n%3)::numeric/10),'y',15)
     )) ORDER BY n) FROM generate_series(1,24) AS q(n)),
   'ambient',25,
   'fog',jsonb_build_object('partyShared',false));

DO $r68_measure$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 sel jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',token));
 cfg record; fog_mode text; route_depth integer; iteration integer;
 begin_ack jsonb;advance_ack jsonb;commit_ack jsonb;sid uuid;
 target jsonb;start_at timestamptz;elapsed double precision;
 pre_revisions bigint;post_revisions bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 -- Populate only the fixture's original per-viewer authorized frames before
 -- timing; never modify the original function or invent public recipients.
 PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,actor);
 PERFORM forge_visibility.authorized_viewer_fog_frame(
  test_map,'00000000-0000-4000-8000-000000000012'::uuid);
 FOR iteration IN 1..4 LOOP
  FOR cfg IN SELECT scenario,scene FROM pg_temp.r68_scenes
   ORDER BY CASE WHEN iteration%2=0 THEN scenario ELSE
    CASE WHEN scenario='open' THEN 'z' ELSE 'a' END END
  LOOP
   -- Reverse fog order between repeats to reduce warm-cache bias.
   FOREACH fog_mode IN ARRAY (
    CASE WHEN iteration%2=0 THEN ARRAY['fog-on','fog-off']
         ELSE ARRAY['fog-off','fog-on'] END)
   LOOP
    UPDATE forge_visibility.map_rules SET fog_enforced=(fog_mode='fog-on')
     WHERE map_id=test_map;
    UPDATE public.map_environments SET live=cfg.scene WHERE map_id=test_map;
    FOREACH route_depth IN ARRAY (
     CASE WHEN iteration%2=0 THEN ARRAY[12,6,1] ELSE ARRAY[1,6,12] END)
    LOOP
     PERFORM public.b08_assert(
      (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
      'R68-01 each sample starts from same authentic canonical origin');
     target:=jsonb_build_object('x',1+route_depth,'y',1);
     begin_ack:=public.begin_world_motion_v2(test_map,sel,
      '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
     sid:=(begin_ack->>'sessionId')::uuid;
     PERFORM public.b08_assert(sid IS NOT NULL,
      'R68-02 real actor Begin grants canonical session');
     advance_ack:=public.advance_world_motion_v2(
      sid,1,'{"x":1,"y":1}'::jsonb,jsonb_build_array(target),1,1);
     PERFORM public.b08_assert(
      advance_ack->>'blocked'='false'
      AND advance_ack->'accepted'->0='{"x":2,"y":1}'::jsonb
      AND jsonb_array_length(advance_ack->'accepted')=route_depth
      AND advance_ack->'accepted'->(route_depth-1)=target
      AND (SELECT accepted_cells=route_depth
        AND last_x=1+route_depth AND last_y=1
        FROM forge_world_v2.motion_sessions WHERE id=sid),
      'R68-03 every one of 1/6/12 cells is server-authorized');
     SELECT coalesce(sum(revision),0) INTO pre_revisions
      FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
     start_at:=clock_timestamp();
     commit_ack:=public.commit_world_motion_v2(sid,2,target,1,1);
     elapsed:=extract(epoch FROM clock_timestamp()-start_at)*1000;
     SELECT coalesce(sum(revision),0) INTO post_revisions
      FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
     PERFORM public.b08_assert(
      commit_ack->'endpoint'=target
      AND (SELECT x=1+route_depth AND y=1
       FROM public.map_tokens WHERE id=token)
      AND ((fog_mode='fog-on' AND post_revisions>=pre_revisions+2)
        OR (fog_mode='fog-off' AND post_revisions=pre_revisions)),
      'R68-04 true canonical Commit; fog-only scoped viewer recompute');
     INSERT INTO pg_temp.r68_samples VALUES(cfg.scenario,fog_mode,
      route_depth,iteration,elapsed,post_revisions-pre_revisions);
     -- Only ordinary actor-signed authority may return token home.
     begin_ack:=public.begin_world_motion_v2(test_map,sel,target,
      'drag',1,1,false);
     sid:=(begin_ack->>'sessionId')::uuid;
     advance_ack:=public.advance_world_motion_v2(
      sid,1,target,'[{"x":1,"y":1}]'::jsonb,1,1);
     commit_ack:=public.commit_world_motion_v2(sid,2,
      '{"x":1,"y":1}'::jsonb,1,1);
     PERFORM public.b08_assert(
      advance_ack->>'blocked'='false' AND
      jsonb_array_length(advance_ack->'accepted')=route_depth
      AND commit_ack->'endpoint'='{"x":1,"y":1}'::jsonb
      AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
      'R68-05 canonical reverse restores original signed position');
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 UPDATE forge_visibility.map_rules SET fog_enforced=true WHERE map_id=test_map;
 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
  WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT count(*)=48 FROM pg_temp.r68_samples)
  AND (SELECT count(DISTINCT (scenario,fog,depth))=12 FROM pg_temp.r68_samples)
  AND (SELECT min(viewer_revision_delta)>=2 FROM pg_temp.r68_samples
       WHERE fog='fog-on')
  AND (SELECT max(viewer_revision_delta)=0 FROM pg_temp.r68_samples
       WHERE fog='fog-off')
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
  'R68-06 48 fully signed, bounded, balanced source-real Commit samples');
END $r68_measure$;

-- Advisory local PostgreSQL timings only. 4 samples per grouped scenario;
-- local warm-cache/CPU noise and test-only viewer/observer fixture remain.
-- Neither browser p95 nor any remote Supabase time can be inferred.
SELECT scenario,fog,depth,count(*) AS samples,
 round(avg(commit_ms)::numeric,3) AS mean_commit_ms,
 round((percentile_cont(0.50) WITHIN GROUP (ORDER BY commit_ms))::numeric,3) AS p50_commit_ms,
 round((percentile_cont(0.95) WITHIN GROUP (ORDER BY commit_ms))::numeric,3) AS p95_commit_ms,
 round(max(commit_ms)::numeric,3) AS max_commit_ms,
 min(viewer_revision_delta) AS min_viewer_revisions,
 max(viewer_revision_delta) AS max_viewer_revisions
FROM pg_temp.r68_samples
GROUP BY scenario,fog,depth ORDER BY scenario,fog,depth;
DO $r68_done$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=48 FROM pg_temp.r68_samples)
  AND (SELECT count(*)=0 FROM pg_temp.r68_samples
     WHERE commit_ms<0)
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
    WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
    FROM public.map_environments
    WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid),
  'R68-07 unchanged canonical home, original scene and exact samples');
 RAISE NOTICE 'R18-68 PASS: 48 real signed Commit source-real samples, fog ON/OFF, 1/6/12 cells, open/24-wall, all rolled back with R54';
END $r68_done$;
