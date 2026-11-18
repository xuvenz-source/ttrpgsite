-- R18-115 only after source-exact revoked-owner access is reproduced.
-- The one-predicate membership candidate is installed only in scratch PG17.
\set ON_ERROR_STOP on
-- Still assigned as owner, but removed from public.campaign_members:
-- all source-dependent privileged operations MUST now reject P1.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $denied$ DECLARE blocked boolean; BEGIN
 blocked:=false;
 BEGIN
  PERFORM public.claim_campaign_sheet_item(
   '00000000-0000-4000-8000-000000000101','character',
   '00000000-0000-4000-8000-000000000501','bag',
   '00000000-0000-4000-8000-000000000701',false);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'No access to this inventory' THEN RAISE;END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 candidate revoked user claim allowed';END IF;

 blocked:=false;
 BEGIN
  PERFORM public.get_campaign_sheet_inventory(
   '00000000-0000-4000-8000-000000000101','character',
   '00000000-0000-4000-8000-000000000501','bag');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE;END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 candidate revoked user inventory read allowed';END IF;

 blocked:=false;
 BEGIN
  PERFORM public.mutate_campaign_sheet_item(
   '00000000-0000-4000-8000-000000000101','character',
   '00000000-0000-4000-8000-000000000501','bag',
   '00000000-0000-4000-8000-000000000701',
   '{"name":"UNAUTHORIZED AFTER REVOCATION"}'::jsonb,false);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'No access to this inventory' THEN RAISE;END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 candidate revoked user mutation allowed';END IF;

 blocked:=false;
 BEGIN
  PERFORM public.patch_campaign_sheet_noninventory(
   '00000000-0000-4000-8000-000000000101','character',
   '00000000-0000-4000-8000-000000000501',
   '{"hp":999}'::jsonb,'{}'::jsonb);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'No permission to update sheet' THEN RAISE;END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 candidate revoked user sheet PATCH allowed';END IF;

 -- Release one's own orphaned lease is intentionally permitted as cleanup.
 IF public.release_campaign_sheet_item(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000501','bag',
  '00000000-0000-4000-8000-000000000701') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R115 revoked lease cleanup should remain permitted';END IF;
END $denied$;
COMMIT;

-- The campaign DM remains authorized to inspect and edit P1's assigned sheet.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $dm$ DECLARE items jsonb; BEGIN
 SELECT public.get_campaign_sheet_inventory(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000501','bag') INTO items;
 IF jsonb_array_length(items) IS DISTINCT FROM 2 THEN
  RAISE EXCEPTION 'R115 candidate incorrectly revoked DM permission';
 END IF;
END $dm$;
COMMIT;

-- Cross-campaign DM still cannot edit a foreign sheet.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $foreign$ DECLARE blocked boolean:=false;BEGIN
 BEGIN
  PERFORM public.patch_campaign_sheet_noninventory(
   '00000000-0000-4000-8000-000000000101','character',
   '00000000-0000-4000-8000-000000000501',
   '{"hp":999}'::jsonb,'{}'::jsonb);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'No permission to update sheet' THEN RAISE;END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 foreign DM gained permission';END IF;
END $foreign$;
COMMIT;

-- Restore membership only in the scratch fixture.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
VALUES ('00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000302','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $restored$ DECLARE items jsonb;BEGIN
 SELECT public.get_campaign_sheet_inventory(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000501','bag') INTO items;
 IF jsonb_array_length(items) IS DISTINCT FROM 2 THEN
  RAISE EXCEPTION 'R115 restored player membership not recognized';
 END IF;
END $restored$;
COMMIT;

-- No unauthorized write may reach the synthetic character row.
DO $immutability$ BEGIN
 IF (SELECT field_values->'hp' FROM public.characters
     WHERE id='00000000-0000-4000-8000-000000000501') IS DISTINCT FROM '41'::jsonb
 THEN RAISE EXCEPTION 'R115 failed candidate still allowed revoked HP write'; END IF;
 IF (SELECT field_values->'bag'->0->>'_inventoryId'
     FROM public.characters
     WHERE id='00000000-0000-4000-8000-000000000501')
 IS DISTINCT FROM '00000000-0000-4000-8000-000000000701'
 THEN RAISE EXCEPTION 'R115 lost stable canonical item identity'; END IF;
END $immutability$;
\echo 'R115 CANDIDATE PASS: revoked player denied claim/get/mutate/patch, self lease cleanup allowed, DM and restored player retained'
