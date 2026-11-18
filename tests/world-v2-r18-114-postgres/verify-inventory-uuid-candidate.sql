-- R114 proof of one-regex candidate in scratch only.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $stable$ DECLARE a jsonb;b jsonb;BEGIN
 SELECT public.get_campaign_sheet_inventory(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000501','bag') INTO a;
 SELECT public.get_campaign_sheet_inventory(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000501','bag') INTO b;
 IF a IS DISTINCT FROM b
    OR a->0->>'_inventoryId' IS DISTINCT FROM
       '00000000-0000-4000-8000-000000000701'
 THEN RAISE EXCEPTION 'R114 corrected getter changed preexisting valid UUID'; END IF;
END $stable$;
COMMIT;
-- Legacy items missing an ID must receive exactly one new valid UUID.
UPDATE public.characters
 SET field_values=jsonb_set(field_values,'{bag}','[{"name":"Legacy potion"}]'::jsonb)
 WHERE id='00000000-0000-4000-8000-000000000501';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $legacy$ DECLARE first_id text;second_id text;BEGIN
 SELECT public.get_campaign_sheet_inventory(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000501','bag')->0->>'_inventoryId'
 INTO first_id;
 SELECT public.get_campaign_sheet_inventory(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000501','bag')->0->>'_inventoryId'
 INTO second_id;
 IF first_id IS NULL OR first_id IS DISTINCT FROM second_id
    OR first_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 THEN RAISE EXCEPTION 'R114 candidate did not preserve newly repaired UUID';END IF;
END $legacy$;
COMMIT;
\echo 'R114 CANDIDATE: existing canonical IDs stable, legacy ID repaired once, NO hosted SQL'
