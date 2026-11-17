-- B10-R18-105: verify re-applying the exact candidate after the disposable
-- original-source restore re-establishes the intended guard and RLS behavior.
\set ON_ERROR_STOP on
DO $state$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
 WHERE s.nspname='public' AND p.proname='is_map_fog_published'
  AND p.prosecdef AND p.provolatile='s'
  AND p.prosrc ~ 'can_view_campaign_map'
  AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE');
 IF n<>1 THEN RAISE EXCEPTION 'R105 reinstallation failed to restore hardened source'; END IF;
END $state$;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $foreign$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false OR
    public.is_map_fog_published('00000000-0000-4000-8000-000000000205') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'R105 source re-installation preserved metadata disclosure';
 END IF;
END $foreign$;
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $authorized$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false OR
    (SELECT count(*) FROM public.map_combats)<>1 THEN
  RAISE EXCEPTION 'R105 source re-installation broke valid nonfog combat roster';
 END IF;
END $authorized$;
COMMIT;
\echo 'R105 RE-APPLY PASS: candidate re-secured fog status and preserved nonfog RLS in disposable PG17'
