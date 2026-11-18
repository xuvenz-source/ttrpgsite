-- R18-121: campaign cascade must remain legal after revocation triggers.
-- All records are synthetic. Fixture PostgreSQL17 only; never hosted SQL.
\set ON_ERROR_STOP on
BEGIN;
-- Remove entire second campaign; its DM membership row cascades.
DELETE FROM public.campaigns WHERE id='00000000-0000-4000-8000-000000000102';
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM public.campaigns
  WHERE id='00000000-0000-4000-8000-000000000102') THEN
  RAISE EXCEPTION 'R121 campaign not deleted';
 END IF;
 IF EXISTS(SELECT 1 FROM public.campaign_members
  WHERE campaign_id='00000000-0000-4000-8000-000000000102') THEN
  RAISE EXCEPTION 'R121 cascading member rows remain';
 END IF;
 IF EXISTS(SELECT 1 FROM forge_security.campaign_member_revocations
  WHERE campaign_id='00000000-0000-4000-8000-000000000102') THEN
  RAISE EXCEPTION 'R121 cascade left invalid revocations';
 END IF;
END $verify$;
COMMIT;
\echo 'R121 CAMPAIGN CASCADE PASS: deleted campaign removes membership and tombstones.'
