-- B10-R18-55: DISPOSABLE PG17 ONLY; original R54 physical schema and hashes.
-- NEVER connect this script to Supabase; the wrapper guards DB/host/role.
-- Native V2 Begin/Advance/Commit from the existing R05 fixture are unchanged.
-- Replays twelve exact pre-R05 production fog/collision functions by MD5.
-- No authorized private sight or map geometry is emitted in CI logs.
\set ON_ERROR_STOP on
BEGIN;
DO $r54_environment$
BEGIN
 IF current_database()<>'world_v2_b10_r05'
 OR to_regprocedure('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)') IS NULL
 OR to_regclass('forge_visibility.viewer_fog_snapshots') IS NOT NULL
 OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL
 OR (SELECT count(*) FROM forge_world_v2.motion_sessions)<>0
 OR (SELECT x<>1 OR y<>1 FROM public.map_tokens
     WHERE id='00000000-0000-4000-8000-000000000101') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R55 refuses nonisolated, partial, moved or atomic fixture';END IF;
END $r54_environment$;

-- Minimal TEST-ONLY physical rows; columns exactly correspond to the
-- referenced live schema. The SQL function BODIES are unmodified originals.
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN fog_enforced boolean NOT NULL DEFAULT true;
CREATE TABLE public.map_visibility_ticks(
 map_id uuid PRIMARY KEY,campaign_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now(),
 fog_enforced boolean NOT NULL DEFAULT false);
CREATE TABLE public.map_viewer_visibility_ticks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 map_id uuid NOT NULL,campaign_id uuid NOT NULL,user_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 0,
 fog_enforced boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 authorized_frame jsonb,UNIQUE(map_id,user_id));
CREATE TABLE forge_visibility.viewer_fog_snapshots(
 map_id uuid NOT NULL,user_id uuid NOT NULL,epoch uuid NOT NULL DEFAULT gen_random_uuid(),
 revision bigint NOT NULL DEFAULT 0,sequence bigint NOT NULL DEFAULT 0,
 frame jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(map_id,user_id));
CREATE TABLE forge_visibility.exploration(
 campaign_id uuid NOT NULL,map_id uuid NOT NULL,user_id uuid NOT NULL,
 explored_cells jsonb NOT NULL DEFAULT '[]'::jsonb,
 revision bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(map_id,user_id));
CREATE TABLE forge_visibility.movement_preview_rates(
 actor_id uuid NOT NULL,piece_id uuid NOT NULL,
 last_sent timestamptz NOT NULL DEFAULT now(),last_seq bigint NOT NULL,
 map_id uuid NOT NULL,kind text NOT NULL,base_x integer NOT NULL,
 base_y integer NOT NULL,last_x integer NOT NULL,last_y integer NOT NULL,
 PRIMARY KEY(actor_id,piece_id,kind));
CREATE TABLE public.campaign_tool_map_tokens(
 issue_id uuid NOT NULL,campaign_id uuid NOT NULL,map_id uuid NOT NULL,
 name text NOT NULL,icon text NOT NULL,kind text NOT NULL,
 x integer NOT NULL,y integer NOT NULL,span integer NOT NULL DEFAULT 1,
 light_bright integer NOT NULL DEFAULT 0,light_dim integer NOT NULL DEFAULT 0,
 light_color text NOT NULL DEFAULT '#ffce7a',
 light_intensity integer NOT NULL DEFAULT 0,
 light_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),held_by_token_id uuid,
 PRIMARY KEY(issue_id));
-- The two real fixture players exist in the B04 fixture; map membership
-- is the already loaded B07 fixture (NOT a newly minted test role/JWT).
UPDATE public.map_environments SET live=
 '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
-- Source-exact, digest-pinned production implementations.
\i tests/world-v2-b10-postgres/r54-live-fog-function-sources.sql

DO $r54_sources$
DECLARE row record;
BEGIN
 FOR row IN SELECT * FROM (VALUES
 ('forge_visibility.cross2(double precision,double precision,double precision,double precision)','65c4bff8aaa6ecf38e335a44e95d874e'),
 ('forge_visibility.wall_passes(jsonb,jsonb,text,text)','5c52255db93f2a9ed892e684dd11f898'),
 ('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)','a9fc198168c29fd5d80041b05337017e'),
 ('forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)','cec916b326a14937ceee2e170619cca2'),
 ('forge_visibility.fog_cells_diff(jsonb,jsonb)','0c477595f2fd916d3520a792bbe52cd7'),
 ('forge_visibility.viewers_affected_by_token_move(public.map_tokens,public.map_tokens)','18ee8bd8e81d681dc22aecd50eb66425'),
 ('forge_visibility.bump_viewer_ticks(uuid,uuid[])','fead41e37dfd6e2fa30499829e24bd02'),
 ('forge_visibility.bump_tick_scoped(uuid,uuid[])','f75e231c06bef2912c9b013ea9735cdc'),
 ('forge_visibility.bump_tick(uuid)','adfc0d91e3e7e6011b46a98d14c83ad9'),
 ('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','ee3356af321fec1a3e167a75c6245e86'),
 ('forge_visibility.tick_tokens()','f6c2eef860141bff253024e0f6d8c7ba'),
 ('forge_visibility.enforce_collision()','7e652f0f2334980ccc724e1748d334ba'),
 ('forge_world_v2.commit_allows_piece_v2(text,uuid,uuid,uuid,integer,integer,integer,integer)','7298cb6051ba259a9c5be1963e1a46a5')
 ) AS expected(signature,hash) LOOP
  IF to_regprocedure(row.signature) IS NULL OR
   md5(pg_get_functiondef(to_regprocedure(row.signature)))<>row.hash
  THEN RAISE EXCEPTION 'R54 original fog source hash mismatch: %',row.signature;END IF;
 END LOOP;
 PERFORM public.b08_assert(
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'R54 original V2 session schema stays private with real fog functions');
END $r54_sources$;

-- This is the EXACT production trigger definition, but attached only
-- inside the rolled-back disposable DB. It processes true canonical x/y.
CREATE TRIGGER forge_visibility_token_tick
 AFTER INSERT OR DELETE OR UPDATE ON public.map_tokens
 FOR EACH ROW EXECUTE FUNCTION forge_visibility.tick_tokens();
CREATE TRIGGER forge_player_collision
 BEFORE UPDATE OF x,y,span_x,span_y,map_id ON public.map_tokens
 FOR EACH ROW EXECUTE FUNCTION forge_visibility.enforce_collision();


-- Original R54 source-real physical fixture and original triggers are now
-- loaded and digest checked. R55 modifies only the private refresh path.
CREATE TEMP TABLE r55_samples(
 mode text NOT NULL CHECK (mode IN ('original-full','dirty-only')),
 n integer NOT NULL CHECK(n BETWEEN 1 AND 8),
 commit_ms double precision NOT NULL CHECK(commit_ms>=0),
 revision_delta bigint NOT NULL CHECK(revision_delta>=0),
 PRIMARY KEY(mode,n));
CREATE TEMP TABLE r55_refresh_samples(
 n integer PRIMARY KEY CHECK(n BETWEEN 1 AND 8),
 p1_refresh_ms double precision NOT NULL CHECK(p1_refresh_ms>=0),
 p2_refresh_ms double precision NOT NULL CHECK(p2_refresh_ms>=0));

DO $r55_original_run$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 viewer2 uuid:='00000000-0000-4000-8000-000000000012';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 parts jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',token));
 a jsonb;b jsonb;c jsonb;sid uuid;
 started timestamptz;delta bigint;before_rev bigint;n integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.b08_assert(
  jsonb_array_length(forge_visibility.authorized_viewer_fog_frame(test_map,actor)->'visible')>0
  AND jsonb_array_length(forge_visibility.authorized_viewer_fog_frame(test_map,viewer2)->'visible')>0,
  'R55-01 real source per-viewer fog nonempty');
 FOR n IN 1..8 LOOP
  a:=public.begin_world_motion_v2(test_map,parts,'{"x":1,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
  PERFORM public.b08_assert(b->'accepted'='[{"x":2,"y":1}]'::jsonb,
   'R55-02 source-full accepted route must be server-authorized');
  SELECT coalesce(sum(revision),0) INTO before_rev
   FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  started:=clock_timestamp();
  c:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
  INSERT INTO pg_temp.r55_samples
  SELECT 'original-full',n,
   extract(epoch FROM clock_timestamp()-started)*1000,
   coalesce(sum(revision),0)-before_rev
  FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  PERFORM public.b08_assert(
   c->'endpoint'='{"x":2,"y":1}'::jsonb AND
   (SELECT count(*)>=2 FROM public.map_viewer_visibility_ticks
     WHERE map_id=test_map AND authorized_frame IS NOT NULL),
   'R55-03 source-full canonical endpoint and two private authorized frames');
  a:=public.begin_world_motion_v2(test_map,parts,'{"x":2,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
  c:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
  PERFORM public.b08_assert(b->>'blocked'='false' AND
   c->'endpoint'='{"x":1,"y":1}'::jsonb,
   'R55-04 source-full reverse uses original canonical RPCs');
 END LOOP;
END $r55_original_run$;

-- Install only the isolated experimental implementation, retaining original
-- source under a distinct private name for authenticated postcommit refresh.
\i tests/world-v2-b10-postgres/r55-dirty-fog-candidate.sql

DO $r55_candidate_test$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 viewer2 uuid:='00000000-0000-4000-8000-000000000012';
 dm uuid:='00000000-0000-4000-8000-000000000013';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 parts jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',token));
 a jsonb;b jsonb;c jsonb;sid uuid;
 before_rev bigint;after_rev bigint;
 first_view jsonb;second_view jsonb;
 seq_before bigint;seq_after bigint;
 started timestamptz;n integer;
 p1_ms double precision;p2_ms double precision;
BEGIN
 PERFORM public.b08_assert(
  NOT has_function_privilege('authenticated','forge_visibility.r55_refresh_for_caller(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','forge_visibility.r55_refresh_for_caller(uuid)','EXECUTE')
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE'),
  'R55-05 experimental functions remain internal and not client-callable');
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 FOR n IN 1..8 LOOP
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  a:=public.begin_world_motion_v2(test_map,parts,'{"x":1,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
  SELECT coalesce(sum(revision),0) INTO before_rev
   FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  started:=clock_timestamp();
  c:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
  INSERT INTO pg_temp.r55_samples
  SELECT 'dirty-only',n,
   extract(epoch FROM clock_timestamp()-started)*1000,
   coalesce(sum(revision),0)-before_rev
  FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  SELECT coalesce(sum(revision),0) INTO after_rev
   FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  PERFORM public.b08_assert(
   b->>'blocked'='false' AND c->'endpoint'='{"x":2,"y":1}'::jsonb
   AND (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=token)
   AND after_rev>=before_rev+2,
   'R55-06 dirty-only Commit still canonical and per-viewer revision bumped');
  PERFORM public.b08_assert(
   (SELECT count(*)=2 FROM public.map_viewer_visibility_ticks
    WHERE map_id=test_map AND authorized_frame IS NULL)
   AND (SELECT count(*)=2 FROM forge_visibility.viewer_fog_snapshots
    WHERE map_id=test_map AND frame='{}'::jsonb)
   AND forge_visibility.r55_try_authorized_frame(test_map) IS NULL,
   'R55-07 dirty Commit synchronously scrubs all previously cached frames');
  PERFORM set_config('request.jwt.claim.sub',viewer2::text,true);
  PERFORM public.b08_assert(
   forge_visibility.r55_try_authorized_frame(test_map) IS NULL,
   'R55-08 independent viewer cannot read old authorized fog while dirty');
  -- Another canonical movement arrives while all viewer frames are dirty.
  -- Two revisions coalesce into one eventual fresh per-recipient snapshot.
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  a:=public.begin_world_motion_v2(test_map,parts,'{"x":2,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
  c:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
  PERFORM public.b08_assert(
   b->>'blocked'='false' AND c->'endpoint'='{"x":1,"y":1}'::jsonb
   AND forge_visibility.r55_try_authorized_frame(test_map) IS NULL,
   'R55-09 second legal motion remains pending/dirty; no stale exposure');
  started:=clock_timestamp();
  first_view:=forge_visibility.r55_refresh_for_caller(test_map);
  p1_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
  PERFORM public.b08_assert(
   first_view IS NOT NULL AND (first_view->>'mode')='snapshot'
   AND first_view->>'protocolVersion'='2'
   AND jsonb_array_length(first_view->'visible')>0,
   'R55-10 first player lazily obtains fresh signed snapshot only after auth');
  SELECT sequence INTO seq_before FROM forge_visibility.viewer_fog_snapshots
   WHERE map_id=test_map AND user_id=actor;
  PERFORM public.b08_assert(
   forge_visibility.r55_refresh_for_caller(test_map)=first_view,
   'R55-11 idempotent same-viewer refresh returns same frame');
  SELECT sequence INTO seq_after FROM forge_visibility.viewer_fog_snapshots
   WHERE map_id=test_map AND user_id=actor;
  PERFORM public.b08_assert(seq_before=seq_after,
   'R55-12 duplicate refresh does not re-publish or recompute');
  PERFORM set_config('request.jwt.claim.sub',viewer2::text,true);
  started:=clock_timestamp();
  second_view:=forge_visibility.r55_refresh_for_caller(test_map);
  p2_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
  INSERT INTO pg_temp.r55_refresh_samples VALUES(n,p1_ms,p2_ms);
  PERFORM public.b08_assert(
   second_view IS NOT NULL AND (second_view->>'mode')='snapshot'
   AND second_view->'visible' IS DISTINCT FROM first_view->'visible',
   'R55-13 second player receives distinct current authorized fog');
  PERFORM set_config('request.jwt.claim.sub',dm::text,true);
  PERFORM public.b08_assert(
   forge_visibility.r55_try_authorized_frame(test_map) IS NULL AND
   forge_visibility.r55_refresh_for_caller(test_map) IS NULL,
   'R55-14 unrelated actor cannot request someone else signed private frame');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM public.b08_assert(
  (SELECT count(*)=16 FROM pg_temp.r55_samples) AND
  (SELECT min(revision_delta)>=2 FROM pg_temp.r55_samples),
  'R55-15 exactly 8+8 original/candidate signed canonical Commit samples');

 -- A real solid wall still rejects the route and never returns geometry.
 UPDATE public.map_environments SET live=
 '{"objects":[{"type":"wall","blocksMovement":true,
  "points":[{"x":2.5,"y":0},{"x":2.5,"y":10}]}],
  "ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id=test_map;
 a:=public.begin_world_motion_v2(test_map,parts,'{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(a->>'sessionId')::uuid;
 b:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  b->>'blocked'='true' AND jsonb_array_length(b->'accepted')=0
  AND NOT(b ? 'wallGeometry') AND NOT(b ? 'scene')
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
  'R55-16 original wall/collision authority preserved by dirty candidate');

 PERFORM set_config('request.jwt.claim.sub',viewer2::text,true);
 PERFORM public.b08_assert(
  forge_visibility.r55_try_authorized_frame(test_map) IS NOT NULL,
  'R55-17 second player had a legitimate signed frame before revocation');
 UPDATE public.campaign_members SET role='spectator'
 WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
  AND user_id=viewer2;
 PERFORM public.b08_assert(
  forge_visibility.r55_try_authorized_frame(test_map) IS NULL
  AND forge_visibility.r55_refresh_for_caller(test_map) IS NULL,
  'R55-18 postrevocation fresh reads fail closed even with cached row');
END $r55_candidate_test$;

-- Eight samples per group, local SQL-only; comparison is order-confounded
-- because original is run before candidate, and schema has only two viewers.
SELECT s.mode,count(*) samples,
 round(avg(s.commit_ms)::numeric,3) mean_sql_commit_ms,
 round((percentile_cont(.5) WITHIN GROUP(ORDER BY s.commit_ms))::numeric,3) p50_ms,
 round((percentile_cont(.95) WITHIN GROUP(ORDER BY s.commit_ms))::numeric,3) p95_ms,
 round(max(s.commit_ms)::numeric,3) max_ms,
 round(avg(coalesce(fr.p1_refresh_ms+fr.p2_refresh_ms,0))::numeric,3) mean_refresh_ms,
 round(avg(s.commit_ms+coalesce(fr.p1_refresh_ms+fr.p2_refresh_ms,0))::numeric,3) mean_commit_plus_refresh_ms,
 round((percentile_cont(.5) WITHIN GROUP(
  ORDER BY s.commit_ms+coalesce(fr.p1_refresh_ms+fr.p2_refresh_ms,0)))::numeric,3)
  p50_commit_plus_refresh_ms,
 min(s.revision_delta) min_viewer_revision_bumps
FROM pg_temp.r55_samples s
LEFT JOIN pg_temp.r55_refresh_samples fr ON s.mode='dirty-only' AND fr.n=s.n
GROUP BY s.mode ORDER BY s.mode;
ROLLBACK;
DO $r55_postrollback$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('forge_visibility.r55_refresh_for_caller(uuid)') IS NULL
  AND to_regprocedure('forge_visibility.r55_source_full_bump_viewer_ticks(uuid,uuid[])') IS NULL
  AND to_regprocedure('forge_visibility.bump_viewer_ticks(uuid,uuid[])') IS NULL
  AND to_regclass('forge_visibility.viewer_fog_snapshots') IS NULL
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id='00000000-0000-4000-8000-000000000101')
  AND (SELECT count(*)=0 FROM forge_world_v2.motion_sessions),
  'R55-19 all prototype functions/tables/roles/positions rolled back');
 RAISE NOTICE 'R55 isolated only: original vs dirty Commit and guarded authenticated recovery tested; RELEASE NO-GO';
END $r55_postrollback$;
