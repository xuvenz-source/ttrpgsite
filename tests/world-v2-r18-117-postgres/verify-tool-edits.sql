-- R117 current original source function fingerprints, disposable PG17 only.
-- No hosted Supabase SQL or actual invitation token operations.
\set ON_ERROR_STOP on

-- R117_CASE 01 P1_EDIT_SHARED_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"P1 update 702"}'::jsonb,false) INTO got;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(got) j WHERE j->>'_inventoryId'='00000000-0000-4000-8000-000000000702' AND j->>'name'='P1 update 702') THEN RAISE EXCEPTION 'R117 P1_EDIT_SHARED_702: item mutation value missing'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 02 P2_CANNOT_EDIT_P1_HELD_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"ILLEGAL"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item claim expired; select the item again' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P2_CANNOT_EDIT_P1_HELD_702 allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 03 P2_ADD_CLAIMED_704
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000704','{"name":"P2 addition 704"}'::jsonb,false) INTO got;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(got) j WHERE j->>'_inventoryId'='00000000-0000-4000-8000-000000000704' AND j->>'name'='P2 addition 704') THEN RAISE EXCEPTION 'R117 P2_ADD_CLAIMED_704: item mutation value missing'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 04 P1_EDIT_702_PRESERVES_704
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"P1 final 702"}'::jsonb,false) INTO got;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(got) j WHERE j->>'_inventoryId'='00000000-0000-4000-8000-000000000702' AND j->>'name'='P1 final 702') THEN RAISE EXCEPTION 'R117 P1_EDIT_702_PRESERVES_704: item mutation value missing'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 05 P1_REJECT_FORGED_INVENTORY_ID
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"spoof","_inventoryId":"00000000-0000-4000-8000-000000000701"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Invalid inventory item update' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P1_REJECT_FORGED_INVENTORY_ID allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 06 P1_REJECT_SCALAR_ITEM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','[]'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Invalid inventory item update' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P1_REJECT_SCALAR_ITEM allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 07 OUTSIDER_DENY_SHARED_EDIT
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"evil"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 OUTSIDER_DENY_SHARED_EDIT allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 08 CROSS_CAMPAIGN_DM_DENY_EDIT
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"evil"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 CROSS_CAMPAIGN_DM_DENY_EDIT allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 09 P1_CANNOT_REMOVE_UNLEASED_OTHER_ITEM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000704','{}'::jsonb,true); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item claim expired; select the item again' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P1_CANNOT_REMOVE_UNLEASED_OTHER_ITEM allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 10 P1_CLAIM_NEW_705
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT holder_id INTO held FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000705',false);
IF held IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'R117 P1_CLAIM_NEW_705: claim not held';END IF;
END $assert$;
COMMIT;

-- R117_CASE 11 P1_CANNOT_REMOVE_NONEXISTENT_ITEM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000705','{}'::jsonb,true); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item no longer exists' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P1_CANNOT_REMOVE_NONEXISTENT_ITEM allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 12 P1_ADD_NEW_705
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000705','{"name":"P1 item 705"}'::jsonb,false) INTO got;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(got) j WHERE j->>'_inventoryId'='00000000-0000-4000-8000-000000000705' AND j->>'name'='P1 item 705') THEN RAISE EXCEPTION 'R117 P1_ADD_NEW_705: item mutation value missing'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 13 P2_REMOVE_OWN_HELD_704
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000704','{}'::jsonb,true) INTO got;

END $assert$;
COMMIT;

-- R117_CASE 14 P2_CANNOT_MUTATE_DELETED_WITHOUT_NEW_ROW_LEASE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000704','{}'::jsonb,true); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item no longer exists' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P2_CANNOT_MUTATE_DELETED_WITHOUT_NEW_ROW_LEASE allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 15 P1_CANNOT_EDIT_MOUNT_ATTRS
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',NULL,'{"capacity":10}'::jsonb); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Only DMs can edit mount attributes' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P1_CANNOT_EDIT_MOUNT_ATTRS allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 16 P1_TOGGLE_OWN_MOUNT_LIGHT
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',true,NULL) INTO got;
IF got->'lit' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'R117 P1_TOGGLE_OWN_MOUNT_LIGHT: state patch missing';END IF;
END $assert$;
COMMIT;

-- R117_CASE 17 DM_PATCH_MOUNT_ATTRS
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',NULL,'{"capacity":2}'::jsonb) INTO got;
IF got->'attrs' IS DISTINCT FROM '{"capacity":2}'::jsonb THEN RAISE EXCEPTION 'R117 DM_PATCH_MOUNT_ATTRS: state patch missing';END IF;
END $assert$;
COMMIT;

-- R117_CASE 18 DM_CANNOT_PATCH_ATTRS_ON_INVENTORY
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000801',NULL,'{"capacity":4}'::jsonb); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Invalid mount attributes' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 DM_CANNOT_PATCH_ATTRS_ON_INVENTORY allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 19 FOREIGN_DM_DENY_MOUNT_PATCH
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',false,NULL); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Tool unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 FOREIGN_DM_DENY_MOUNT_PATCH allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 20 OUTSIDER_DENY_MOUNT_LIGHT
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',false,NULL); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Tool unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 OUTSIDER_DENY_MOUNT_LIGHT allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 21 P2_CANNOT_RELEASE_P1_LEASE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.release_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702') INTO released;
IF released IS DISTINCT FROM false THEN RAISE EXCEPTION 'R117 P2_CANNOT_RELEASE_P1_LEASE: incorrect release result'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 22 P1_RELEASES_OWN_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.release_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702') INTO released;
IF released IS DISTINCT FROM true THEN RAISE EXCEPTION 'R117 P1_RELEASES_OWN_702: incorrect release result'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 23 P1_RELEASE_REPEATED_FALSE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.release_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702') INTO released;
IF released IS DISTINCT FROM false THEN RAISE EXCEPTION 'R117 P1_RELEASE_REPEATED_FALSE: incorrect release result'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 24 P1_CANNOT_MUTATE_AFTER_RELEASE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"after release"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item claim expired; select the item again' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 P1_CANNOT_MUTATE_AFTER_RELEASE allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302';

-- R117_CASE 25 REVOKED_P1_CANNOT_MUTATE_HELD_705
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000705','{"name":"illegal revoked"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 REVOKED_P1_CANNOT_MUTATE_HELD_705 allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 26 REVOKED_P1_CANNOT_TOGGLE_OWN_MOUNT
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',false,NULL); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Tool unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 REVOKED_P1_CANNOT_TOGGLE_OWN_MOUNT allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 27 REVOKED_P1_CAN_RELEASE_OWN_705
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.release_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000705') INTO released;
IF released IS DISTINCT FROM true THEN RAISE EXCEPTION 'R117 REVOKED_P1_CAN_RELEASE_OWN_705: incorrect release result'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 28 REVOKED_P1_CANNOT_RELEASE_P2_704
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.release_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000704') INTO released;
IF released IS DISTINCT FROM false THEN RAISE EXCEPTION 'R117 REVOKED_P1_CANNOT_RELEASE_P2_704: incorrect release result'; END IF;
END $assert$;
COMMIT;

DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000301';

-- R117_CASE 29 REVOKED_DM_CANNOT_MUTATE_HELD_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701','{"name":"revoked dm"}'::jsonb,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 REVOKED_DM_CANNOT_MUTATE_HELD_701 allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 30 REVOKED_DM_CANNOT_PATCH_MOUNT
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
BEGIN PERFORM public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',false,NULL); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Tool unavailable' THEN RAISE; END IF; blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R117 REVOKED_DM_CANNOT_PATCH_MOUNT allowed unexpectedly'; END IF;
END $assert$;
COMMIT;

-- R117_CASE 31 REVOKED_DM_CAN_RELEASE_OWN_701
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.release_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701') INTO released;
IF released IS DISTINCT FROM true THEN RAISE EXCEPTION 'R117 REVOKED_DM_CAN_RELEASE_OWN_701: incorrect release result'; END IF;
END $assert$;
COMMIT;

INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player');

-- R117_CASE 32 RESTORED_P1_CAN_RECLAIM_702
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT holder_id INTO held FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702',false);
IF held IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'R117 RESTORED_P1_CAN_RECLAIM_702: claim not held';END IF;
END $assert$;
COMMIT;

-- R117_CASE 33 RESTORED_P1_CAN_MUTATE_AGAIN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got jsonb; held uuid; released boolean; blocked boolean:=false; BEGIN
SELECT public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{"name":"Restored 702"}'::jsonb,false) INTO got;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(got) j WHERE j->>'_inventoryId'='00000000-0000-4000-8000-000000000702' AND j->>'name'='Restored 702') THEN RAISE EXCEPTION 'R117 RESTORED_P1_CAN_MUTATE_AGAIN: item mutation value missing'; END IF;
END $assert$;
COMMIT;

DO $final$ DECLARE bag jsonb;BEGIN
 SELECT state->'items' INTO bag FROM public.campaign_tool_issues WHERE id='00000000-0000-4000-8000-000000000802';
 IF jsonb_array_length(bag)<>2 OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bag) j
      WHERE j->>'_inventoryId'='00000000-0000-4000-8000-000000000702' AND j->>'name'='Restored 702') OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bag) j
      WHERE j->>'_inventoryId'='00000000-0000-4000-8000-000000000705' AND j->>'name'='P1 item 705')
 THEN RAISE EXCEPTION 'R117 shared inventory merge or stable UUID failed'; END IF;
 IF (SELECT state->'attrs' FROM public.campaign_tool_issues WHERE id='00000000-0000-4000-8000-000000000804')
 IS DISTINCT FROM '{"capacity":2}'::jsonb THEN
  RAISE EXCEPTION 'R117 attrs damaged by unauthorized edit';END IF;
END $final$;

\echo 'R117 TOOL EDITS: 33/33 source-bound mutation/patch/release/membership cases PASS (simulated identities)'
