-- Check intentionally old active-map and owner-only predicates before rewrite.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ BEGIN
 IF public.get_token_monitor_values('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'pre-patch assigned non-active monitor was not denied';END IF;
 IF public.post_token_reference('00000000-0000-4000-8000-000000000401','X') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'pre-patch owner-only token reference bypass not reproduced';END IF;
END $verify$;
COMMIT;
