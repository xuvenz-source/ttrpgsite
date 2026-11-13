-- B10-R18-56: DISPOSABLE PG17 ONLY, source-real synchronous-fog optimization.
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
 THEN RAISE EXCEPTION 'R56 refuses nonisolated, partial, moved or atomic fixture';END IF;
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


-- Original and proposed Commit use the SAME authenticated canonical path.
CREATE TEMP TABLE r56_commit_samples (
 variant text NOT NULL CHECK (variant IN ('original','fastpath')),
 iteration integer NOT NULL CHECK (iteration BETWEEN 1 AND 8),
 commit_ms double precision NOT NULL CHECK (commit_ms>=0),
 viewer_tick_delta bigint NOT NULL CHECK (viewer_tick_delta>=2),
 PRIMARY KEY(variant,iteration));
CREATE TEMP TABLE r56_frame_samples (
 variant text NOT NULL CHECK (variant IN ('original','fastpath')),
 iteration integer NOT NULL CHECK(iteration BETWEEN 1 AND 16),
 duration_ms double precision NOT NULL CHECK(duration_ms>=0),
 PRIMARY KEY(variant,iteration));

-- R56-01: compare actual ORIGINAL signed server Commit with fog ON.
DO $r56_baseline$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 piece_id uuid:='00000000-0000-4000-8000-000000000101';
 sel jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',piece_id));
 a jsonb;b jsonb;c jsonb;sid uuid;n integer;before_rev bigint;
 t0 timestamptz;dt double precision;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.b08_assert(
  jsonb_array_length(forge_visibility.authorized_viewer_fog_frame(test_map,actor)->'visible')>0,
  'R56-01 original source-authorized fog has visible cells');
 FOR n IN 1..8 LOOP
  a:=public.begin_world_motion_v2(test_map,sel,'{"x":1,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
  PERFORM public.b08_assert(b->'accepted'='[{"x":2,"y":1}]'::jsonb,
   'R56-02 original Advance server-authorized');
  SELECT coalesce(sum(revision),0) INTO before_rev
  FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  t0:=clock_timestamp();
  c:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
  dt:=extract(epoch FROM clock_timestamp()-t0)*1000;
  PERFORM public.b08_assert(c->'endpoint'='{"x":2,"y":1}'::jsonb,
   'R56-03 original canonical Commit keeps approved endpoint');
  INSERT INTO pg_temp.r56_commit_samples
  SELECT 'original',n,dt,coalesce(sum(revision),0)-before_rev
   FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  a:=public.begin_world_motion_v2(test_map,sel,'{"x":2,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
  c:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
  PERFORM public.b08_assert(b->>'blocked'='false' AND
   c->'endpoint'='{"x":1,"y":1}'::jsonb,
   'R56-04 original reverse authenticates canonical position');
 END LOOP;
END $r56_baseline$;

-- Keep ORIGINAL precise source under a private alias; the callback now
-- invokes ONLY the replacement for performance and equivalence testing.
ALTER FUNCTION forge_visibility.authorized_viewer_fog_frame(uuid,uuid)
 RENAME TO r56_original_fog_frame;
\i tests/world-v2-b10-postgres/r56-synchronous-fog-fastpath-candidate.sql

DO $r56_equivalence$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 viewer uuid:='00000000-0000-4000-8000-000000000012';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 cfg record;who uuid;expected jsonb;actual jsonb;
 baseline_fail boolean;optimized_fail boolean;
 t0 timestamptz;i integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM public.b08_assert(
  NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE'),
  'R56-05 optimized SECURITY DEFINER remains private, no browser grant');

 -- Each fixture deliberately tests **full byte-equivalent jsonb frames**,
 -- not just counts. Includes zero light, ambient, hard wall, door, window,
 -- authored light, malformed barrier and >120 object fail-closed scenes.
 FOR cfg IN SELECT * FROM (VALUES
  ('open-default', '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
  ('open-dark', '{"objects":[],"ambient":0,"fog":{"partyShared":false}}'::jsonb),
  ('open-bright', '{"objects":[],"ambient":75,"fog":{"partyShared":false}}'::jsonb),
  ('open-shared', '{"objects":[],"ambient":25,"fog":{"partyShared":true}}'::jsonb),
  ('wall', '{"objects":[{"type":"wall","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
  ('door', '{"objects":[{"type":"door","state":"closed","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
  ('window', '{"objects":[{"type":"window","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
  ('light', '{"objects":[{"type":"light","enabled":true,"x":6,"y":5,"bright":20,"dim":15}],"ambient":0,"fog":{"partyShared":false}}'::jsonb),
  ('wall-lit', '{"objects":[{"type":"wall","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]},{"type":"light","enabled":true,"x":6,"y":5,"bright":20,"dim":15}],"ambient":0,"fog":{"partyShared":false}}'::jsonb),
  ('bright-walled', '{"objects":[{"type":"wall","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],"ambient":75,"fog":{"partyShared":false}}'::jsonb),
  ('disabled-light', '{"objects":[{"type":"light","enabled":false,"x":6,"y":5,"bright":20,"dim":15}],"ambient":0,"fog":{"partyShared":false}}'::jsonb),
  ('unknown-decoration', '{"objects":[{"type":"decoration","x":4,"y":4}],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
  ('malformed-null-object', '{"objects":[null],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
  ('malformed-wall', '{"objects":[{"type":"wall","points":"invalid"}],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
  ('malformed-type', '{"objects":[{"name":"untyped"}],"ambient":25,"fog":{"partyShared":false}}'::jsonb)
 ) AS case_data(label,scene)
 LOOP
  UPDATE public.map_environments SET live=cfg.scene WHERE map_id=test_map;
  FOREACH who IN ARRAY ARRAY[actor,viewer] LOOP
   expected:=forge_visibility.r56_original_fog_frame(test_map,who);
   actual:=forge_visibility.authorized_viewer_fog_frame(test_map,who);
   PERFORM public.b08_assert(expected IS NOT DISTINCT FROM actual,
    'R56-06 exact authorized fog/LOS/exploration equivalence: '||cfg.label);
  END LOOP;
 END LOOP;
 -- Invalid 121-element scene: original ray helper refuses all rays.
 UPDATE public.map_environments SET live=jsonb_build_object(
  'objects',(SELECT jsonb_agg(jsonb_build_object('type','decoration'))
             FROM generate_series(1,121)), 'ambient',25,
  'fog',jsonb_build_object('partyShared',false)) WHERE map_id=test_map;
 expected:=forge_visibility.r56_original_fog_frame(test_map,actor);
 actual:=forge_visibility.authorized_viewer_fog_frame(test_map,actor);
 PERFORM public.b08_assert(
  expected IS NOT DISTINCT FROM actual AND
  jsonb_array_length(actual->'visible')=0,
  'R56-07 over-limit 121 object scene never becomes visible');
 -- Enabled portable torch conservatively disables the no-lights shortcut.
 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":0,"fog":{"partyShared":false}}'::jsonb WHERE map_id=test_map;
 INSERT INTO public.campaign_tool_map_tokens
 (issue_id,campaign_id,map_id,name,icon,kind,x,y,light_bright,light_dim,light_enabled)
 VALUES ('00000000-0000-4000-8000-000000000909'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,test_map,
  'fixture torch','torch','torch',8,8,40,20,true);
 expected:=forge_visibility.r56_original_fog_frame(test_map,actor);
 actual:=forge_visibility.authorized_viewer_fog_frame(test_map,actor);
 PERFORM public.b08_assert(expected IS NOT DISTINCT FROM actual,
  'R56-08 torch lighting frame exactly preserved');
 DELETE FROM public.campaign_tool_map_tokens
 WHERE issue_id='00000000-0000-4000-8000-000000000909'::uuid;

 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb WHERE map_id=test_map;
 -- Alternating order of 16 calls controls part of the cache/order bias.
 FOR i IN 1..16 LOOP
  IF i%2=0 THEN
   t0:=clock_timestamp();
   PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,actor);
   INSERT INTO pg_temp.r56_frame_samples
    VALUES('fastpath',i,extract(epoch FROM clock_timestamp()-t0)*1000);
   t0:=clock_timestamp();
   PERFORM forge_visibility.r56_original_fog_frame(test_map,actor);
   INSERT INTO pg_temp.r56_frame_samples
    VALUES('original',i,extract(epoch FROM clock_timestamp()-t0)*1000);
  ELSE
   t0:=clock_timestamp();
   PERFORM forge_visibility.r56_original_fog_frame(test_map,actor);
   INSERT INTO pg_temp.r56_frame_samples
    VALUES('original',i,extract(epoch FROM clock_timestamp()-t0)*1000);
   t0:=clock_timestamp();
   PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,actor);
   INSERT INTO pg_temp.r56_frame_samples
    VALUES('fastpath',i,extract(epoch FROM clock_timestamp()-t0)*1000);
  END IF;
 END LOOP;
END $r56_equivalence$;

DO $r56_candidate_commit$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 piece_id uuid:='00000000-0000-4000-8000-000000000101';
 viewer2 uuid:='00000000-0000-4000-8000-000000000012';
 sel jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',piece_id));
 a jsonb;b jsonb;c jsonb;sid uuid;n integer;before_rev bigint;
 t0 timestamptz;dt double precision;
 source_rejected boolean:=false;candidate_rejected boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 FOR n IN 1..8 LOOP
  a:=public.begin_world_motion_v2(test_map,sel,'{"x":1,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
  PERFORM public.b08_assert(b->'accepted'='[{"x":2,"y":1}]'::jsonb,
   'R56-09 optimized Advance still validates server-side');
  SELECT coalesce(sum(revision),0) INTO before_rev
  FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  t0:=clock_timestamp();
  c:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
  dt:=extract(epoch FROM clock_timestamp()-t0)*1000;
  PERFORM public.b08_assert(
   c->'endpoint'='{"x":2,"y":1}'::jsonb AND
   (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=piece_id),
   'R56-10 optimized canonical Commit returns original endpoint');
  INSERT INTO pg_temp.r56_commit_samples
  SELECT 'fastpath',n,dt,coalesce(sum(revision),0)-before_rev
  FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
  a:=public.begin_world_motion_v2(test_map,sel,'{"x":2,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  b:=public.advance_world_motion_v2(sid,1,
   '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
  c:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
  PERFORM public.b08_assert(b->>'blocked'='false' AND
   c->'endpoint'='{"x":1,"y":1}'::jsonb,
   'R56-11 optimized reverse still uses original signed authority');
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=16 FROM pg_temp.r56_commit_samples)
  AND (SELECT min(viewer_tick_delta)>=2 FROM pg_temp.r56_commit_samples),
  'R56-12 both variants still perform full synchronous per-viewer refresh');
 -- Original source wall and canonical path security remain in place.
 UPDATE public.map_environments SET live=
 '{"objects":[{"type":"wall","blocksMovement":true,
 "points":[{"x":2.5,"y":0},{"x":2.5,"y":10}]}],
 "ambient":25,"fog":{"partyShared":false}}'::jsonb WHERE map_id=test_map;
 a:=public.begin_world_motion_v2(test_map,sel,'{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(a->>'sessionId')::uuid;
 b:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  b->>'blocked'='true' AND jsonb_array_length(b->'accepted')=0
  AND NOT(b ? 'wallGeometry') AND NOT(b ? 'scene')
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=piece_id),
  'R56-13 solid wall still blocks and never leaks private geometry');
 -- The candidate must preserve the unchanged signed membership check.
 UPDATE public.campaign_members SET role='spectator'
 WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
 AND user_id=viewer2;
 BEGIN
  PERFORM forge_visibility.r56_original_fog_frame(test_map,viewer2);
 EXCEPTION WHEN others THEN source_rejected:=true;
 END;
 BEGIN
  PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,viewer2);
 EXCEPTION WHEN others THEN candidate_rejected:=true;
 END;
 PERFORM public.b08_assert(source_rejected AND candidate_rejected,
  'R56-14 revoked viewer denied by original and optimized sight');
END $r56_candidate_commit$;

SELECT variant,count(*) n,
 round(avg(commit_ms)::numeric,3) mean_ms,
 round((percentile_cont(0.5) WITHIN GROUP (ORDER BY commit_ms))::numeric,3) p50_ms,
 round((percentile_cont(0.95) WITHIN GROUP (ORDER BY commit_ms))::numeric,3) p95_ms,
 min(viewer_tick_delta) min_viewer_bumps
FROM pg_temp.r56_commit_samples GROUP BY variant ORDER BY variant;
SELECT variant,count(*) n,
 round(avg(duration_ms)::numeric,3) mean_frame_ms,
 round((percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms))::numeric,3) p50_frame_ms,
 round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::numeric,3) p95_frame_ms
FROM pg_temp.r56_frame_samples GROUP BY variant ORDER BY variant;
ROLLBACK;
DO $r56_clean$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('forge_visibility.r56_original_fog_frame(uuid,uuid)') IS NULL AND
  to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)') IS NULL AND
  to_regclass('forge_visibility.viewer_fog_snapshots') IS NULL AND
  (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid) AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions),
  'R56-15 full fixture rollback reverts authorized frames and canonical position');
 RAISE NOTICE 'R56 isolated only: ORIGINAL vs guarded synchronous fastpath and security equivalence; RELEASE NO-GO';
END $r56_clean$;
