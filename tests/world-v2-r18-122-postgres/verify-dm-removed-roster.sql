-- B10-R18-122: wholly synthetic PostgreSQL17 DM-only removed-player roster.
-- These identities and invites are fabricated; no hosted SQL, no JWTs.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.join_campaign('a1b2c3d4e5f60708') IS DISTINCT FROM
 '00000000-0000-4000-8000-000000000101'::uuid THEN
  RAISE EXCEPTION 'R122 first synthetic member join failed';
 END IF;
END $verify$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$
BEGIN
 PERFORM public.join_campaign('a1b2c3d4e5f60708');
END $verify$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.dm_list_removed_campaign_players(
  '00000000-0000-4000-8000-000000000101'))<>0 THEN
  RAISE EXCEPTION 'R122 fresh campaign had unexpected removed members';
 END IF;
 IF public.dm_remove_campaign_player(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'R122 DM removal failed';
 END IF;
 IF (SELECT count(*) FROM public.dm_list_removed_campaign_players(
  '00000000-0000-4000-8000-000000000101'))<>1 THEN
  RAISE EXCEPTION 'R122 DM must see one revoked account';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.dm_list_removed_campaign_players(
    '00000000-0000-4000-8000-000000000101') AS r
  WHERE r.user_id='00000000-0000-4000-8000-000000000302'::uuid
    AND r.removed_at IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'R122 wrong revoked member returned';
 END IF;
END $verify$;
COMMIT;

-- Under caller privileges, a different campaign DM cannot list others.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $verify$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM 1 FROM public.dm_list_removed_campaign_players(
   '00000000-0000-4000-8000-000000000101');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN
  RAISE EXCEPTION 'R122 cross-campaign DM could list removed players';
 END IF;
 IF (SELECT count(*) FROM public.dm_list_removed_campaign_players(
  '00000000-0000-4000-8000-000000000102'))<>0 THEN
  RAISE EXCEPTION 'R122 second campaign unexpectedly has revoked accounts';
 END IF;
END $verify$;
COMMIT;

-- Current player cannot use a DM-only roster API.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM 1 FROM public.dm_list_removed_campaign_players(
   '00000000-0000-4000-8000-000000000101');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'R122 player accessed revoked roster';END IF;
END $verify$;
COMMIT;

-- No membership / NULL auth is denied without disclosing its existence.
BEGIN;
SET LOCAL ROLE authenticated;
DO $verify$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM 1 FROM public.dm_list_removed_campaign_players(
   '00000000-0000-4000-8000-000000000101');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'R122 NULL actor accessed revoked roster';END IF;
END $verify$;
COMMIT;

-- Key UPDATE of another member into an already revoked identity MUST fail.
-- This is run as the local synthetic administrator (postgres), not as DM.
DO $verify$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  UPDATE public.campaign_members
   SET user_id='00000000-0000-4000-8000-000000000302'
   WHERE campaign_id='00000000-0000-4000-8000-000000000101'
     AND user_id='00000000-0000-4000-8000-000000000303';
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'R122 direct key UPDATE bypassed revocation';END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.campaign_members
  WHERE campaign_id='00000000-0000-4000-8000-000000000101'
  AND user_id='00000000-0000-4000-8000-000000000303'
  AND role='player'
 ) THEN
  RAISE EXCEPTION 'R122 failed update changed unrelated membership';
 END IF;
END $verify$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$
BEGIN
 IF public.dm_reinstate_campaign_player(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'R122 DM reinstatement failed';
 END IF;
 IF (SELECT count(*) FROM public.dm_list_removed_campaign_players(
  '00000000-0000-4000-8000-000000000101'))<>0 THEN
  RAISE EXCEPTION 'R122 reinstated member remains on removed roster';
 END IF;
END $verify$;
COMMIT;

\echo 'R122 SCRATCH PG17 PASS: current DM-only removed roster, outsider/anon boundaries, and revoked-key UPDATE denial.'
