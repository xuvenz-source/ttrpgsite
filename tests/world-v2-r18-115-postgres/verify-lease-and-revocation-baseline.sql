-- R115 original source exact lease behavior, synthetic PG17 only.
\set ON_ERROR_STOP on
-- Verify original EXECUTE ACLs before evaluating permission outcomes.
DO $acl$ BEGIN
 IF NOT has_function_privilege('authenticated',
   'public.claim_campaign_sheet_item(uuid,text,uuid,text,uuid,boolean)','EXECUTE')
   OR NOT has_function_privilege('authenticated',
   'public.mutate_campaign_sheet_item(uuid,text,uuid,text,uuid,jsonb,boolean)','EXECUTE')
   OR NOT has_function_privilege('authenticated',
   'public.release_campaign_sheet_item(uuid,text,uuid,text,uuid)','EXECUTE')
   OR has_function_privilege('anon',
   'public.claim_campaign_sheet_item(uuid,text,uuid,text,uuid,boolean)','EXECUTE')
   OR has_table_privilege('authenticated','public.campaign_sheet_item_leases','UPDATE')
 THEN RAISE EXCEPTION 'R115 original lease privileges incorrect'; END IF;
END $acl$;

-- R115 P1_CLAIM_ITEM_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'P1 lease owner mismatch';END IF;
END $assert$;
COMMIT;

-- R115 P2_CANNOT_CLAIM_P1_ITEM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'No access to this inventory' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 P2_CANNOT_CLAIM_P1_ITEM unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

-- R115 DM_CLAIM_DISTINCT_ITEM_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000702',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000301'::uuid THEN RAISE EXCEPTION 'DM other item lease mismatch';END IF;
END $assert$;
COMMIT;

-- R115 P1_MUTATE_HELD_ITEM_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT public.mutate_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701','{"name":"P1 updated potion"}'::jsonb,false) INTO data;
IF data->0->>'name' IS DISTINCT FROM 'P1 updated potion' THEN RAISE EXCEPTION 'P1 item mutation mismatch';END IF;
END $assert$;
COMMIT;

-- R115 DM_MUTATE_HELD_ITEM_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT public.mutate_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000702','{"name":"DM updated scroll"}'::jsonb,false) INTO data;
IF data->1->>'name' IS DISTINCT FROM 'DM updated scroll' THEN RAISE EXCEPTION 'DM item mutation mismatch';END IF;
END $assert$;
COMMIT;

-- R115 P1_CANNOT_CLAIM_DM_HELD_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000702',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'That item is in use by another player' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 P1_CANNOT_CLAIM_DM_HELD_702 unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

-- R115 DM_CANNOT_STEAL_P1_LEASE_WITHOUT_TAKEOVER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'That item is in use by another player' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 DM_CANNOT_STEAL_P1_LEASE_WITHOUT_TAKEOVER unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

-- R115 DM_EXPLICIT_TAKEOVER_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701',true);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000301'::uuid THEN RAISE EXCEPTION 'DM takeover failed';END IF;
END $assert$;
COMMIT;

-- R115 P1_MUTATION_REJECTED_AFTER_TAKEOVER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.mutate_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701','{"name":"STALE_ILLEGAL_WRITE"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item claim expired; select it again' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 P1_MUTATION_REJECTED_AFTER_TAKEOVER unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

-- R115 DM_MUTATES_TAKEN_ITEM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT public.mutate_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701','{"name":"DM takeover potion"}'::jsonb,false) INTO data;
IF data->0->>'name' IS DISTINCT FROM 'DM takeover potion' THEN RAISE EXCEPTION 'DM taken item mutation failed';END IF;
END $assert$;
COMMIT;

-- R115 DM_CANNOT_SPOOF_INVENTORY_ID
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.mutate_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701','{"name":"bad","_inventoryId":"00000000-0000-4000-8000-000000000702"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Invalid inventory item' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 DM_CANNOT_SPOOF_INVENTORY_ID unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

-- R115 P2_CANNOT_RELEASE_DM_LEASE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
IF public.release_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Wrong owner released lease';END IF;
END $assert$;
COMMIT;

-- R115 DM_RELEASE_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
IF public.release_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701') IS DISTINCT FROM true THEN RAISE EXCEPTION 'DM release failed';END IF;
END $assert$;
COMMIT;

-- R115 P1_RECLAIM_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'P1 cannot re-claim';END IF;
END $assert$;
COMMIT;

-- R115 P1_RELEASE_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
IF public.release_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701') IS DISTINCT FROM true THEN RAISE EXCEPTION 'P1 release failed';END IF;
END $assert$;
COMMIT;

-- R115 CROSS_CAMPAIGN_DM_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'No access to this inventory' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 CROSS_CAMPAIGN_DM_DENIED unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

-- R115 P1_CROSS_CAMPAIGN_CHARACTER_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000102','character','00000000-0000-4000-8000-000000000504','bag','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'No access to this inventory' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 P1_CROSS_CAMPAIGN_CHARACTER_DENIED unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

-- Expire DM's item702 lease on scratch postgres clock; no sleeps.
UPDATE public.campaign_sheet_item_leases SET expires_at=now()-interval '1 second'
WHERE source_id='00000000-0000-4000-8000-000000000501' AND item_id='00000000-0000-4000-8000-000000000702';

-- R115 P1_TAKES_EXPIRED_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000702',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'expired lease was not transferable';END IF;
END $assert$;
COMMIT;

-- R115 P1_MUTATES_EXPIRED_RECLAIM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT public.mutate_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000702','{"name":"P1 resumed scroll"}'::jsonb,false) INTO data;
IF data->1->>'name' IS DISTINCT FROM 'P1 resumed scroll' THEN RAISE EXCEPTION 'expired lease mutation failed';END IF;
END $assert$;
COMMIT;

-- Force lease expiry once more, to prove mutation fails.
UPDATE public.campaign_sheet_item_leases SET expires_at=now()-interval '1 second'
WHERE source_id='00000000-0000-4000-8000-000000000501' AND item_id='00000000-0000-4000-8000-000000000702';

-- R115 P1_EXPIRED_MUTATION_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
BEGIN PERFORM public.mutate_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000702','{"name":"ILLEGAL_EXPIRED"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item claim expired; select it again' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'R115 P1_EXPIRED_MUTATION_DENIED unexpectedly allowed'; END IF;
END $assert$;
COMMIT;

DO $data$ DECLARE j jsonb;BEGIN
 SELECT field_values->'bag' INTO j FROM public.characters WHERE id='00000000-0000-4000-8000-000000000501';
 IF jsonb_array_length(j) <> 2 OR j->0->>'_inventoryId' IS DISTINCT FROM '00000000-0000-4000-8000-000000000701'
   OR j->1->>'_inventoryId' IS DISTINCT FROM '00000000-0000-4000-8000-000000000702'
   OR j->0->>'name' IS DISTINCT FROM 'DM takeover potion'
   OR j->1->>'name' IS DISTINCT FROM 'P1 resumed scroll'
 THEN RAISE EXCEPTION 'R115 interleaved edits lost updates or altered item identities';END IF;
END $data$;

-- Revoke membership WITHOUT clearing character ownership. This deliberately
-- probes a source-level authorization boundary, not a real user account.
DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302';

-- R115 BASELINE_REVOKED_P1_CAN_STILL_CLAIM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_sheet_item('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag','00000000-0000-4000-8000-000000000701',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'R115 expected to reproduce stale-owner permission after campaign removal';END IF;
END $assert$;
COMMIT;

-- R115 BASELINE_REVOKED_P1_CAN_STILL_PATCH
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','{"hp":41}'::jsonb,'{}'::jsonb) INTO data;
IF data->'field_values'->'hp' IS DISTINCT FROM '41'::jsonb THEN RAISE EXCEPTION 'R115 stale-owner PATCH source bug not reproduced';END IF;
END $assert$;
COMMIT;

-- R115 BASELINE_REVOKED_P1_CAN_STILL_GET
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; data jsonb; blocked boolean:=false;BEGIN
SELECT public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag') INTO data;
IF jsonb_array_length(data) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'R115 stale-owner inventory read not reproduced';END IF;
END $assert$;
COMMIT;

\echo 'R115 BASELINE: 23 source-exact claim/mutate/release cases, including revoked-member sheet access, reproduced in scratch'
