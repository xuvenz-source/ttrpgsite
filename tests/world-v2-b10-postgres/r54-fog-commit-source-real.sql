-- B10-R18-54: DISPOSABLE PG17 ONLY, inside R05 source-real test DB.
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
 THEN RAISE EXCEPTION 'R54 refuses nonisolated, partial, moved or atomic fixture';END IF;
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

CREATE TEMP TABLE r54_samples(
 mode text NOT NULL CHECK(mode IN ('fog-off','fog-on')),
 iteration integer NOT NULL CHECK(iteration BETWEEN 1 AND 8),
 duration_ms double precision NOT NULL CHECK(duration_ms>=0),
 viewer_delta bigint NOT NULL CHECK(viewer_delta>=0),
 PRIMARY KEY(mode,iteration));
-- R18-68 inherits this source-exact original R54 fog/collision fixture and
-- its OPEN transaction, then restores home/scene before the original test.
-- This is local, bounded, and rolled back with R54; never a live migration.
\i tests/world-v2-b10-postgres/r68-commit-cost-attribution.sql
DO $r54_benchmark$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 viewer2 uuid:='00000000-0000-4000-8000-000000000012';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 selection jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',token));
 sid uuid;begin_result jsonb;adv jsonb;committed jsonb;
 before_ticks bigint;after_ticks bigint;started timestamptz;elapsed double precision;
 cfg text;iteration integer;is_fog boolean;
 p1_frame jsonb;p2_frame jsonb;revoke_rejected boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 -- Warm up source-real execution plans and exploration on the fixture.
 p1_frame:=forge_visibility.authorized_viewer_fog_frame(test_map,actor);
 p2_frame:=forge_visibility.authorized_viewer_fog_frame(test_map,viewer2);
 PERFORM public.b08_assert(
  jsonb_array_length(p1_frame->'visible')>0 AND
  jsonb_array_length(p2_frame->'visible')>0 AND
  p1_frame->'visible' IS DISTINCT FROM p2_frame->'visible',
  'R54-01 real signed, per-viewer fog is nonempty and audience-specific');

 FOR iteration IN 1..8 LOOP
  -- Alternate first-run branch to mitigate warm-cache/order effects.
  FOR cfg IN SELECT label FROM unnest(
   CASE WHEN iteration%2=0 THEN ARRAY['fog-off','fog-on']
   ELSE ARRAY['fog-on','fog-off'] END) t(label)
  LOOP
   is_fog:=cfg='fog-on';
   UPDATE forge_visibility.map_rules SET fog_enforced=is_fog WHERE map_id=test_map;
   PERFORM public.b08_assert(
    (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
    'R54-02 each source-real signed run starts at canonical home');
   begin_result:=public.begin_world_motion_v2(test_map,selection,
    '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
   sid:=(begin_result->>'sessionId')::uuid;
   PERFORM public.b08_assert(sid IS NOT NULL,'R54-03 signed Begin succeeds');
   adv:=public.advance_world_motion_v2(sid,1,
    '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(
    adv->>'blocked'='false' AND
    adv->'accepted'='[{"x":2,"y":1}]'::jsonb,
    'R54-04 actual Advance approves one legal cell; no client authority bypass');
   SELECT coalesce(sum(revision),0) INTO before_ticks
    FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
   started:=clock_timestamp();
   committed:=public.commit_world_motion_v2(sid,2,
    '{"x":2,"y":1}'::jsonb,1,1);
   elapsed:=extract(epoch FROM clock_timestamp()-started)*1000;
   SELECT coalesce(sum(revision),0) INTO after_ticks
    FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
   PERFORM public.b08_assert(
    committed->'endpoint'='{"x":2,"y":1}'::jsonb
    AND (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=token),
    'R54-05 real Commit writes one canonical server-approved x/y');
   PERFORM public.b08_assert(
    (is_fog AND after_ticks>=before_ticks+2) OR
    (NOT is_fog AND after_ticks=before_ticks),
    'R54-06 only fog-on canonical Commit invokes real private viewer refresh');
   INSERT INTO pg_temp.r54_samples VALUES(cfg,iteration,elapsed,after_ticks-before_ticks);
   -- Untimed reverse with the same real authority. Every run starts at
   -- the same canonical point; never directly UPDATE token coordinates.
   begin_result:=public.begin_world_motion_v2(test_map,selection,
    '{"x":2,"y":1}'::jsonb,'drag',1,1,false);
   sid:=(begin_result->>'sessionId')::uuid;
   adv:=public.advance_world_motion_v2(sid,1,
    '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
   committed:=public.commit_world_motion_v2(sid,2,
    '{"x":1,"y":1}'::jsonb,1,1);
   PERFORM public.b08_assert(
    adv->>'blocked'='false' AND
    committed->'endpoint'='{"x":1,"y":1}'::jsonb,
    'R54-07 reversed canonical via real signed movement');
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=16 FROM pg_temp.r54_samples) AND
  (SELECT min(viewer_delta)>=2 FROM pg_temp.r54_samples WHERE mode='fog-on') AND
  (SELECT max(viewer_delta)=0 FROM pg_temp.r54_samples WHERE mode='fog-off'),
  'R54-08 sixteen paired real commits, distinct fog-on recalculation effects');
 -- A real source-verified wall must still block the canonical route, and
 -- an opaque server refusal must not include any private wall geometry.
 UPDATE public.map_environments SET live=
  '{"objects":[{"type":"wall","blocksMovement":true,
   "points":[{"x":2.5,"y":0},{"x":2.5,"y":10}]}],
   "ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id=test_map;
 begin_result:=public.begin_world_motion_v2(test_map,selection,
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(begin_result->>'sessionId')::uuid;
 adv:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  adv->>'blocked'='true' AND jsonb_array_length(adv->'accepted')=0
  AND NOT(adv ? 'wallGeometry') AND NOT(adv ? 'scene')
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
  'R54-09 original wall blocks unauthorized crossing without leaking geometry');
 -- Test revocation while all data is in the throwaway transaction.
 UPDATE public.campaign_members SET role='spectator'
 WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid AND user_id=viewer2;
 BEGIN
  PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,viewer2);
 EXCEPTION WHEN others THEN
  revoke_rejected:=true;
 END;
 PERFORM public.b08_assert(revoke_rejected,
  'R54-10 revoked fixture viewer cannot request an authorized fog frame');
END $r54_benchmark$;
-- Advisory 8-paired-sample local SQL-only timings; no network, no live
-- production token triggers beyond the source-exact selected two; observer
-- publisher is the B04 test-only sink. Not a performance release gate.
SELECT mode,count(*) AS samples,
 round(avg(duration_ms)::numeric,3) AS mean_commit_ms,
 round((percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms))::numeric,3) AS p50_commit_ms,
 round((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::numeric,3) AS p95_commit_ms,
 round(max(duration_ms)::numeric,3) AS max_commit_ms,
 min(viewer_delta) AS min_fog_viewer_revisions
FROM pg_temp.r54_samples GROUP BY mode ORDER BY mode;
ROLLBACK;
DO $r54_restore$
BEGIN
 PERFORM public.b08_assert(
  to_regclass('forge_visibility.viewer_fog_snapshots') IS NULL AND
  to_regprocedure('forge_visibility.bump_viewer_ticks(uuid,uuid[])') IS NULL AND
  NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relname='map_tokens' AND t.tgname='forge_visibility_token_tick') AND
  (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid) AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions),
  'R54-11 rollback removes fog functions/triggers, reverts canonical token and sessions');
 RAISE NOTICE 'R18-54 PASS: source-real fog-on vs fog-off one-cell signed Commit; PRIVATE viewer scopes, test-only rollback';
END $r54_restore$;
