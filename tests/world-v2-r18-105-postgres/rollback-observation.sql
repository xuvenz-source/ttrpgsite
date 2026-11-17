-- B10-R18-105: after restoring exact historical body in TEMPORARY DB ONLY,
-- demonstrate restoring this old function reinstates the metadata exposure.
\set ON_ERROR_STOP on
DO $historical$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname='is_map_fog_published'
 AND octet_length(p.prosrc)=102
 AND p.prosrc !~ 'can_view_campaign_map'
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE');
 IF n<>1 THEN RAISE EXCEPTION 'R105 historical function not restored in local clone'; END IF;
END $historical$;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $disclosure$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'R105 source rollback failed to show original metadata exposure';
 END IF;
 IF (SELECT count(*) FROM public.map_combats)<>0 THEN
  RAISE EXCEPTION 'R105 source rollback unexpectedly exposed combat roster';
 END IF;
END $disclosure$;
COMMIT;
\echo 'R105 DISPOSABLE SOURCE ROLLBACK VERIFIED: old definition restores original metadata exposure; never reuse as production rollback'
