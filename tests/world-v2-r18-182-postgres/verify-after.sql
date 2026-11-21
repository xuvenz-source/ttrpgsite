-- R182 after synthetic rewrite: role-correct assigned map and owner-map coupling.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ BEGIN
 IF public.get_token_monitor_values('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'assigned player lost authorized nonactive monitor';END IF;
 IF public.get_token_monitor_values('00000000-0000-4000-8000-000000000203') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'unassigned monitor was visible';END IF;
 IF public.post_token_reference('00000000-0000-4000-8000-000000000401','X') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'unassigned owned token reference was accepted';END IF;
END $verify$;
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $verify$ BEGIN
 IF public.get_token_monitor_values('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'foreign DM observed campaign A';END IF;
END $verify$;
COMMIT;
DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000302';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ BEGIN
 IF public.get_token_monitor_values('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'revoked P1 still observes monitor';END IF;
 IF public.post_token_reference('00000000-0000-4000-8000-000000000401','X') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'revoked P1 token reference survived';END IF;
END $verify$;
COMMIT;
\echo 'R182 synthetic chronological guarded patch and role cases PASS'
