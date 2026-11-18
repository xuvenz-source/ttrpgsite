-- R114 proof of existing live-source UUID bug in scratch PostgreSQL ONLY.
-- The pristine Git/source-verified getter is installed here, not the candidate.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $churn$ DECLARE first_id text;second_id text; BEGIN
 SELECT public.get_campaign_sheet_inventory(
   '00000000-0000-4000-8000-000000000101','character',
   '00000000-0000-4000-8000-000000000501','bag')->0->>'_inventoryId'
 INTO first_id;
 SELECT public.get_campaign_sheet_inventory(
   '00000000-0000-4000-8000-000000000101','character',
   '00000000-0000-4000-8000-000000000501','bag')->0->>'_inventoryId'
 INTO second_id;
 IF first_id IS NULL OR second_id IS NULL
   OR first_id='00000000-0000-4000-8000-000000000701'
   OR second_id=first_id
   OR first_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR second_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 THEN RAISE EXCEPTION 'R114 original source UUID identity churn not reproduced';END IF;
END $churn$;
COMMIT;
DO $original$ BEGIN
 IF (SELECT field_values->'bag'->0->>'_inventoryId' FROM public.characters
    WHERE id='00000000-0000-4000-8000-000000000501')
 = '00000000-0000-4000-8000-000000000701'
 THEN RAISE EXCEPTION 'R114 original getter did not mutate persisted item UUID';END IF;
END $original$;
\echo 'R114 ORIGINAL BASELINE: confirmed valid inventory IDs change on each inventory GET'
-- Restore synthetic snapshot so the repaired candidate is tested against
-- the exact same canonical baseline; no production/campaign data is involved.
UPDATE public.characters SET field_values='{"hp":10,"bag":[{"_inventoryId":"00000000-0000-4000-8000-000000000701","name":"A potion"}]}'::jsonb
 WHERE id='00000000-0000-4000-8000-000000000501';
