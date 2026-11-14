-- B10-R18-57: DISPOSABLE PG17 ONLY, source-real synchronous-fog optimization.
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
 THEN RAISE EXCEPTION 'R57 refuses nonisolated, partial, moved or atomic fixture';END IF;
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



-- All 91 history records come from the pinned R18-08 and R18-48 manifests.
\i tests/world-v2-b10-postgres/r57-synthetic-91-version-gate.sql
-- These are the current LIVE grants, applied to this disposable source copy.
REVOKE ALL ON FUNCTION forge_visibility.authorized_viewer_fog_frame(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
\i tests/world-v2-b10-postgres/r57-source-original-alias.sql

-- Expand from 2 to 8 synthetic signed map participants; no separate JWTs,
-- Realtime subscribers or real account credentials are created here.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
SELECT '00000000-0000-4000-8000-000000000001'::uuid,
 ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'player'
FROM generate_series(14,19) n;
INSERT INTO public.map_tokens(
 id,campaign_id,map_id,owner_id,visible,x,y,span_x,span_y,npc_values
)
SELECT ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 '00000000-0000-4000-8000-000000000021'::uuid,
 ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 true,n-10,n-10,1,1,'{}'::jsonb
FROM generate_series(14,19) n;

CREATE TEMP TABLE r57_measurements(
 variant text NOT NULL CHECK(variant IN ('original','fastpath')),
 phase text NOT NULL CHECK(phase IN ('open','wall-heavy')),
 iteration integer NOT NULL CHECK(iteration BETWEEN 1 AND 4),
 commit_ms double precision NOT NULL CHECK(commit_ms>=0),
 viewer_count integer NOT NULL CHECK(viewer_count=8),
 PRIMARY KEY(variant,phase,iteration));

CREATE TEMP TABLE r57_scenes(label text PRIMARY KEY,scene jsonb NOT NULL);
INSERT INTO pg_temp.r57_scenes(label,scene) VALUES
('open','{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb),
('wall-heavy',jsonb_build_object(
 'objects',(SELECT jsonb_agg(jsonb_build_object(
   'type','wall','points',jsonb_build_array(
    jsonb_build_object('x',5.5+(n%8),'y',0),
    jsonb_build_object('x',5.5+(n%8),'y',15)
   )))
   FROM generate_series(1,24) n),
 'ambient',25,
 'fog',jsonb_build_object('partyShared',false))),
('wall-heavy-lit',jsonb_build_object(
 'objects',(SELECT jsonb_agg(jsonb_build_object(
   'type','wall','points',jsonb_build_array(
    jsonb_build_object('x',5.5+(n%8),'y',0),
    jsonb_build_object('x',5.5+(n%8),'y',15)
   )))
   FROM generate_series(1,24) n),
 'ambient',60,
 'fog',jsonb_build_object('partyShared',false)));

DO $r57_fixture_guard$
DECLARE fn regprocedure:=to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)');
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(fn))='ee3356af321fec1a3e167a75c6245e86'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc WHERE oid=fn)
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player')
  AND (SELECT count(*)=8 FROM public.map_tokens WHERE visible AND owner_id IS NOT NULL)
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations),
  'R57-01 original source, private ACL, 8 participants, 91 history rows');
END $r57_fixture_guard$;

-- One authorized canonical Commmit exercised using identical source-real
-- Begin/Advance/Commit and unchanged collision / synchronous visibility
-- triggers; no client-authoritative token location updates.
CREATE OR REPLACE FUNCTION pg_temp.r57_signed_cycle(
 p_variant text,p_label text,p_repeat integer,p_map uuid,p_token uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $r57_cycle$
DECLARE
 s jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',p_token));
 b jsonb;adv jsonb;c jsonb;sid uuid;
 t0 timestamptz;db_ms double precision;oldcount bigint;newcount bigint;
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',p_actor::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
 b:=public.begin_world_motion_v2(p_map,s,'{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(b->>'sessionId')::uuid;
 adv:=public.advance_world_motion_v2(sid,1,
   '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(adv->'accepted'='[{"x":2,"y":1}]'::jsonb,
   'R57-02 signed Advance approved in '||p_variant||' / '||p_label);
 SELECT coalesce(sum(revision),0) INTO oldcount
 FROM public.map_viewer_visibility_ticks WHERE map_id=p_map;
 t0:=clock_timestamp();
 c:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
 db_ms:=extract(epoch FROM clock_timestamp()-t0)*1000;
 SELECT coalesce(sum(revision),0) INTO newcount
 FROM public.map_viewer_visibility_ticks WHERE map_id=p_map;
 PERFORM public.b08_assert(
  c->'endpoint'='{"x":2,"y":1}'::jsonb AND newcount>=oldcount+8
  AND (SELECT count(*)=8 FROM public.map_viewer_visibility_ticks
    WHERE map_id=p_map AND authorized_frame IS NOT NULL)
  AND (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=p_token),
  'R57-03 all 8 protected recipients refreshed synchronously');
 INSERT INTO pg_temp.r57_measurements
 VALUES(p_variant,p_label,p_repeat,db_ms,8);
 -- Untimed reversal returns canonical position through genuine authority.
 b:=public.begin_world_motion_v2(p_map,s,'{"x":2,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(b->>'sessionId')::uuid;
 adv:=public.advance_world_motion_v2(sid,1,
  '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
 c:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  adv->>'blocked'='false' AND c->'endpoint'='{"x":1,"y":1}'::jsonb,
  'R57-04 eight-recipient canonical reverse no drift');
END $r57_cycle$;

DO $r57_baseline$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 actor uuid:='00000000-0000-4000-8000-000000000011';
 piece uuid:='00000000-0000-4000-8000-000000000101';
 r record;i integer;
BEGIN
 FOR r IN SELECT * FROM pg_temp.r57_scenes WHERE label IN ('open','wall-heavy')
 ORDER BY label LOOP
  UPDATE public.map_environments SET live=r.scene WHERE map_id=test_map;
  FOR i IN 1..4 LOOP
   PERFORM pg_temp.r57_signed_cycle('original',r.label,i,test_map,piece,actor);
  END LOOP;
 END LOOP;
END $r57_baseline$;

-- This is the actual independently reviewable UNVERSIONED candidate file.
-- The opt-in here exists ONLY under the outer rollback transaction.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql

DO $r57_applied$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))=
   'f37c8d13e8d48bea123b4c811ae6de4d'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
   WHERE oid=to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')),
 'R57-05 actual opt-in candidate sealed source and unchanged ACL');
END $r57_applied$;

-- R18-69: optional private fog source must match the original full frame
-- for ALL eight fixture viewers under shared, dark, portal and hostile scenes.
-- This runs only inside this existing disposable BEGIN/ROLLBACK transaction.
\i tests/world-v2-b10-postgres/r69-eight-viewer-fog-parity.sql
-- R18-70 only in this original disposable transaction: measure the exact
-- ray vs light function calls and restore tracking before original R57 tests.
\i tests/world-v2-b10-postgres/r70-fog-function-cost-profile.sql

DO $r57_compare_and_measure$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 actor uuid:='00000000-0000-4000-8000-000000000011';
 piece uuid:='00000000-0000-4000-8000-000000000101';
 person uuid;r record;i integer;source_frame jsonb;candidate_frame jsonb;
 revoked boolean:=false;revoked2 boolean:=false;
BEGIN
 -- Validate exact FULL signed frame, 8 viewers, not merely cell counts.
 FOR r IN SELECT * FROM pg_temp.r57_scenes ORDER BY label LOOP
  UPDATE public.map_environments SET live=r.scene WHERE map_id=test_map;
  FOR person IN
   SELECT cm.user_id FROM public.campaign_members cm
   WHERE cm.role='player' ORDER BY cm.user_id LOOP
   source_frame:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
   candidate_frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   PERFORM public.b08_assert(source_frame IS NOT DISTINCT FROM candidate_frame,
    'R57-06 exact 8-viewer full frame parity '||r.label);
  END LOOP;
 END LOOP;
 -- Enabled torch + 24 blockers must preserve exact source semantics.
 UPDATE public.map_environments SET live=
 (SELECT scene FROM pg_temp.r57_scenes WHERE label='wall-heavy')
 WHERE map_id=test_map;
 INSERT INTO public.campaign_tool_map_tokens(
  issue_id,campaign_id,map_id,name,icon,kind,x,y,
  light_bright,light_dim,light_enabled)
 VALUES('00000000-0000-4000-8000-000000000909'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,test_map,
  'fixture torch','torch','torch',8,8,40,20,true);
 FOR person IN SELECT user_id FROM public.campaign_members WHERE role='player' LOOP
  source_frame:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
  candidate_frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
  PERFORM public.b08_assert(source_frame IS NOT DISTINCT FROM candidate_frame,
   'R57-07 eight-viewer wall-heavy held-light exact parity');
 END LOOP;
 DELETE FROM public.campaign_tool_map_tokens
 WHERE issue_id='00000000-0000-4000-8000-000000000909'::uuid;
 -- Candidate canonical Commit under BOTH open and 24-wall maps.
 FOR r IN SELECT * FROM pg_temp.r57_scenes WHERE label IN('open','wall-heavy')
 ORDER BY label LOOP
  UPDATE public.map_environments SET live=r.scene WHERE map_id=test_map;
  FOR i IN 1..4 LOOP
   PERFORM pg_temp.r57_signed_cycle('fastpath',r.label,i,test_map,piece,actor);
  END LOOP;
 END LOOP;
 -- Even after the optimization, a crossing into the wall-heavy map refuses.
 UPDATE public.map_environments SET live=
  '{"objects":[{"type":"wall","blocksMovement":true,
   "points":[{"x":2.5,"y":0},{"x":2.5,"y":10}]}],
   "ambient":25,"fog":{"partyShared":false}}'::jsonb WHERE map_id=test_map;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
 DECLARE
  response jsonb;sid uuid;
 BEGIN
  response:=public.begin_world_motion_v2(test_map,
   jsonb_build_array(jsonb_build_object('kind','token','id',piece)),
   '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
  sid:=(response->>'sessionId')::uuid;
  response:=public.advance_world_motion_v2(sid,1,
   '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
  PERFORM public.b08_assert(
   response->>'blocked'='true' AND jsonb_array_length(response->'accepted')=0
   AND NOT(response?'wallGeometry') AND NOT(response?'scene') AND
   (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=piece),
   'R57-08 original wall authority and private geometry protected');
 END;
 UPDATE public.campaign_members SET role='spectator'
 WHERE user_id='00000000-0000-4000-8000-000000000019'::uuid;
 BEGIN
  PERFORM forge_visibility.r57_unmodified_fog_frame(test_map,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN others THEN revoked:=true;
 END;
 BEGIN
  PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN others THEN revoked2:=true;
 END;
 PERFORM public.b08_assert(revoked AND revoked2,
  'R57-09 revoked user refused by both original and optimized');
END $r57_compare_and_measure$;

SELECT variant,phase,count(*) AS trials,
 round(avg(commit_ms)::numeric,3) AS mean_commit_ms,
 round((percentile_cont(.5) WITHIN GROUP (ORDER BY commit_ms))::numeric,3) AS p50_commit_ms,
 round((percentile_cont(.95) WITHIN GROUP (ORDER BY commit_ms))::numeric,3) AS p95_commit_ms,
 min(viewer_count) AS min_affected_viewers
FROM pg_temp.r57_measurements GROUP BY variant,phase
ORDER BY phase,variant;

-- Rollback against ACTUAL guarded unversioned inverse, not an invented copy.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql
DO $r57_restored$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))=
   'ee3356af321fec1a3e167a75c6245e86'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
   WHERE oid=to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')),
  'R57-10 exact original source and private privileges restored');
END $r57_restored$;

-- Source-drift attack: correct GUC/history, altered function properties.
-- Actual operator DO must reject and leave no authorized candidate in place.
SAVEPOINT r57_source_drift;
ALTER FUNCTION forge_visibility.authorized_viewer_fog_frame(uuid,uuid) COST 999;
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R57 PASS: source-drift application rejected'
\else
SELECT 1/0 AS r57_source_drift_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r57_source_drift;

-- History-drift attack: the exact R18-48 seal version has gone missing.
SAVEPOINT r57_history_drift;
DELETE FROM supabase_migrations.schema_migrations
 WHERE version='20261113024116';
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R57 PASS: missing release migration rejected'
\else
SELECT 1/0 AS r57_history_drift_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r57_history_drift;

-- Wrong approval attack: separate authorization GUC must be exact.
SAVEPOINT r57_missing_approval;
SET LOCAL forge.r18_57_release_authorization='unauthorized';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R57 PASS: incorrect approval rejected'
\else
SELECT 1/0 AS r57_wrong_approval_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r57_missing_approval;

DO $r57_negative_gates$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))=
   'ee3356af321fec1a3e167a75c6245e86',
  'R57-11 all three negative operator gates left original source/history intact');
END $r57_negative_gates$;

ROLLBACK;
DO $r57_noresidue$
BEGIN
 PERFORM public.b08_assert(
  to_regclass('supabase_migrations.schema_migrations') IS NULL
  AND to_regprocedure('forge_visibility.r57_unmodified_fog_frame(uuid,uuid)') IS NULL
  AND to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)') IS NULL
  AND (SELECT count(*)=0 FROM forge_world_v2.motion_sessions)
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid),
  'R57-12 no opt-in, rollback or 91-history test residue persisted');
 RAISE NOTICE 'R57: exact 8-viewer signed synchronous fog candidate AND rollback PASS in disposable PG17; RELEASE NO-GO';
END $r57_noresidue$;
