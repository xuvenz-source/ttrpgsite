-- B10-R18-83 start: Disposable PostgreSQL 17 source-real phase attribution.
-- Run ONLY inside R18-54 BEGIN/ROLLBACK and immediately before existing
-- R18-68 original-Commit benchmark. Does not execute another movement session.
-- Does NOT run on connected Supabase or modify live track_functions.
\set ON_ERROR_STOP on
DO $r83_preflight$
DECLARE trigger_count integer;
BEGIN
 IF current_database()<>'world_v2_b10_r05' OR current_user<>'postgres'
 OR to_regclass('pg_temp.r54_samples') IS NULL
 OR to_regclass('pg_temp.r68_samples') IS NOT NULL
 OR to_regclass('pg_temp.r83_functions_before') IS NOT NULL
 OR md5(pg_get_functiondef(
  'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure))
  <>'f87014e7a967d1db1262dabe9e125552'
 OR md5(pg_get_functiondef(
  'forge_visibility.tick_tokens()'::regprocedure))
  <>'f6c2eef860141bff253024e0f6d8c7ba'
 OR md5(pg_get_functiondef(
  'forge_visibility.enforce_collision()'::regprocedure))
  <>'7e652f0f2334980ccc724e1748d334ba'
 OR (SELECT x=1 AND y=1 FROM public.map_tokens
     WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
     IS DISTINCT FROM true
 OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)')
     IS NOT NULL
 THEN RAISE EXCEPTION 'R83 refuses nonisolated, source-drifted or mutated Commit fixture';END IF;
 -- The R54 original source-real fixture deliberately installs ONLY two
 -- of the SIX production x/y-trigger paths. NEVER label it full-live parity.
 SELECT count(*) INTO trigger_count FROM pg_trigger t
 JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='map_tokens'
 AND NOT t.tgisinternal AND t.tgenabled<>'D'
 AND (t.tgtype & 16)=16
 AND (t.tgattr::text='' OR EXISTS (
   SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum=ANY(t.tgattr)
    AND a.attname IN('x','y')));
 IF trigger_count<>2 THEN
  RAISE EXCEPTION 'R83 fixture trigger coverage drift: expected two source-real movement triggers';
 END IF;
END $r83_preflight$;

-- PostgreSQL 17 ephemeral superuser session only. This is an existing local
-- R54 transaction; ROLLBACK restores the prior setting and all temp objects.
-- Connected Supabase remains track_functions=none and is NEVER modified.
SET LOCAL track_functions = 'all';
DO $r83_track_guard$
BEGIN
 IF current_setting('track_functions')<>'all'
 THEN RAISE EXCEPTION 'R83 cannot sample source-real PL/pgSQL function costs';END IF;
END $r83_track_guard$;

CREATE TEMP TABLE r83_functions_before ON COMMIT DROP AS
SELECT funcid,calls,total_time,self_time
FROM pg_stat_xact_user_functions;

DO $r83_ready$
BEGIN
 PERFORM public.b08_assert(
  to_regclass('pg_temp.r83_functions_before') IS NOT NULL AND
  to_regclass('pg_temp.r68_samples') IS NULL AND
  (SELECT count(*)=2 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='map_tokens'
    AND t.tgname IN('forge_player_collision','forge_visibility_token_tick')
    AND t.tgenabled='O'),
  'R83-01 original 2-of-6 collision/fog trigger fixture and isolated function tracking');
END $r83_ready$;
