-- R18-114 SHEET: source-hash-anchored 4 live-function-body tests with
-- synthetic is_campaign_dm and simulated Postgres authenticated role only.
\set ON_ERROR_STOP on

-- SHEET-ACL PLAYER_OWN_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag') s;
 IF a IS DISTINCT FROM true OR b IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 SHEET-ACL PLAYER_OWN_CHAR permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL PLAYER_OWN_CHAR_NONINVENTORY
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','hp') s;
 IF a IS DISTINCT FROM true OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL PLAYER_OWN_CHAR_NONINVENTORY permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL PLAYER_DENIED_OTHER_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000502','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL PLAYER_DENIED_OTHER_CHAR permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL PLAYER2_OWN_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000502','bag') s;
 IF a IS DISTINCT FROM true OR b IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 SHEET-ACL PLAYER2_OWN_CHAR permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL DM_A_OTHER_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000502','bag') s;
 IF a IS DISTINCT FROM true OR b IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 SHEET-ACL DM_A_OTHER_CHAR permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL DM_B_DENIED_OTHER_CAMPAIGN_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL DM_B_DENIED_OTHER_CAMPAIGN_CHAR permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL DM_A_DENIED_OTHER_CAMPAIGN_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000102','character','00000000-0000-4000-8000-000000000504','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL DM_A_DENIED_OTHER_CAMPAIGN_CHAR permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL DM_A_NPC_TEMPLATE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','npc_template','00000000-0000-4000-8000-000000000601','bag') s;
 IF a IS DISTINCT FROM true OR b IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 SHEET-ACL DM_A_NPC_TEMPLATE permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL PLAYER_DENIED_NPC_TEMPLATE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','npc_template','00000000-0000-4000-8000-000000000601','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL PLAYER_DENIED_NPC_TEMPLATE permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL DM_A_NPC_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','npc_token','00000000-0000-4000-8000-000000000405','bag') s;
 IF a IS DISTINCT FROM true OR b IS DISTINCT FROM true THEN RAISE EXCEPTION 'R114 SHEET-ACL DM_A_NPC_TOKEN permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL PLAYER_DENIED_NPC_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','npc_token','00000000-0000-4000-8000-000000000405','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL PLAYER_DENIED_NPC_TOKEN permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL DM_A_DENIED_OWNED_TOKEN_AS_NPC
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','npc_token','00000000-0000-4000-8000-000000000401','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL DM_A_DENIED_OWNED_TOKEN_AS_NPC permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL NULL_IDENTITY
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL NULL_IDENTITY permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL OUTSIDER_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL OUTSIDER_DENIED permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL UNKNOWN_SOURCE_TYPE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','alien','00000000-0000-4000-8000-000000000501','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL UNKNOWN_SOURCE_TYPE permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL UNKNOWN_CAMPAIGN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000199','character','00000000-0000-4000-8000-000000000501','bag') s;
 IF a IS DISTINCT FROM false OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL UNKNOWN_CAMPAIGN permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-ACL UNKNOWN_INVENTORY_FIELD
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE a boolean;b boolean;BEGIN
 SELECT s.editable,s.inventory_editable INTO a,b FROM public.r114_sheet_probe('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','invalid') s;
 IF a IS DISTINCT FROM true OR b IS DISTINCT FROM false THEN RAISE EXCEPTION 'R114 SHEET-ACL UNKNOWN_INVENTORY_FIELD permission mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-GET PLAYER_OWN_INVENTORY
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 SELECT public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag') INTO actual;
 IF actual IS DISTINCT FROM '[{"_inventoryId":"00000000-0000-4000-8000-000000000701","name":"A potion"}]'::jsonb THEN RAISE EXCEPTION 'R114 GET PLAYER_OWN_INVENTORY value mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-GET PLAYER_DENIED_OTHER_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000502','bag'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET PLAYER_DENIED_OTHER_CHAR unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-GET DM_OWN_CAMPAIGN_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 SELECT public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000502','bag') INTO actual;
 IF actual IS DISTINCT FROM '[{"_inventoryId":"00000000-0000-4000-8000-000000000702","name":"P2 scroll"}]'::jsonb THEN RAISE EXCEPTION 'R114 GET DM_OWN_CAMPAIGN_CHAR value mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-GET DM_A_NPC_TEMPLATE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 SELECT public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','npc_template','00000000-0000-4000-8000-000000000601','bag') INTO actual;
 IF actual IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'R114 GET DM_A_NPC_TEMPLATE value mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-GET PLAYER_DENIED_NPC_TEMPLATE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','npc_template','00000000-0000-4000-8000-000000000601','bag'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET PLAYER_DENIED_NPC_TEMPLATE unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-GET DM_A_NPC_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 SELECT public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','npc_token','00000000-0000-4000-8000-000000000405','bag') INTO actual;
 IF actual IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'R114 GET DM_A_NPC_TOKEN value mismatch';END IF;
END $check$;
COMMIT;

-- SHEET-GET PLAYER_DENIED_NPC_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','npc_token','00000000-0000-4000-8000-000000000405','bag'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET PLAYER_DENIED_NPC_TOKEN unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-GET DM_B_DENIED_CROSS
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET DM_B_DENIED_CROSS unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-GET OUTSIDER_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET OUTSIDER_DENIED unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-GET INVALID_INVENTORY_FIELD
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','hp'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET INVALID_INVENTORY_FIELD unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-GET UNKNOWN_SOURCE_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','alien','00000000-0000-4000-8000-000000000501','bag'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET UNKNOWN_SOURCE_DENIED unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-GET NULL_IDENTITY_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $check$ DECLARE actual jsonb; blocked boolean:=false; BEGIN
 BEGIN PERFORM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag'); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Sheet inventory unavailable' THEN RAISE; END IF; blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 GET NULL_IDENTITY_DENIED unauthorized read succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH PLAYER_OWN_HP_NO_INVENTORY_OVERWRITE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 SELECT public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','{"hp":12,"bag":[{"name":"MALICIOUS"}]}'::jsonb,'{}'::jsonb) INTO updated;
 IF updated->'field_values'->'hp' IS DISTINCT FROM '12'::jsonb THEN RAISE EXCEPTION 'R114 PATCH PLAYER_OWN_HP_NO_INVENTORY_OVERWRITE value not saved';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH PLAYER_CANNOT_EDIT_OTHER_PLAYER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 BEGIN PERFORM public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000502','{"hp":999}'::jsonb,'{}'::jsonb); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'No permission to update sheet' THEN RAISE;END IF;blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 PATCH PLAYER_CANNOT_EDIT_OTHER_PLAYER unauthorized write succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH DM_CAN_EDIT_OWN_CAMPAIGN_CHAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 SELECT public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000502','{"hp":18}'::jsonb,'{}'::jsonb) INTO updated;
 IF updated->'field_values'->'hp' IS DISTINCT FROM '18'::jsonb THEN RAISE EXCEPTION 'R114 PATCH DM_CAN_EDIT_OWN_CAMPAIGN_CHAR value not saved';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH DM_DENIED_CROSS_CAMPAIGN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 BEGIN PERFORM public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','{"hp":999}'::jsonb,'{}'::jsonb); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'No permission to update sheet' THEN RAISE;END IF;blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 PATCH DM_DENIED_CROSS_CAMPAIGN unauthorized write succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH DM_CAN_EDIT_NPC_TEMPLATE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 SELECT public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','npc_template','00000000-0000-4000-8000-000000000601','{"hp":6}'::jsonb,'{}'::jsonb) INTO updated;
 IF updated->'field_values'->'hp' IS DISTINCT FROM '6'::jsonb THEN RAISE EXCEPTION 'R114 PATCH DM_CAN_EDIT_NPC_TEMPLATE value not saved';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH PLAYER_DENIED_NPC_TEMPLATE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 BEGIN PERFORM public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','npc_template','00000000-0000-4000-8000-000000000601','{"hp":999}'::jsonb,'{}'::jsonb); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'No permission to update sheet' THEN RAISE;END IF;blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 PATCH PLAYER_DENIED_NPC_TEMPLATE unauthorized write succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH DM_CAN_EDIT_NPC_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 SELECT public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','npc_token','00000000-0000-4000-8000-000000000405','{"hp":9}'::jsonb,'{}'::jsonb) INTO updated;
 IF updated->'npc_values'->'hp' IS DISTINCT FROM '9'::jsonb THEN RAISE EXCEPTION 'R114 PATCH DM_CAN_EDIT_NPC_TOKEN value not saved';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH PLAYER_DENIED_NPC_TOKEN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 BEGIN PERFORM public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','npc_token','00000000-0000-4000-8000-000000000405','{"hp":999}'::jsonb,'{}'::jsonb); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'No permission to update sheet' THEN RAISE;END IF;blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 PATCH PLAYER_DENIED_NPC_TOKEN unauthorized write succeeded';END IF;
END $check$;
COMMIT;

-- SHEET-PATCH NULL_IDENTITY_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $check$ DECLARE updated jsonb;blocked boolean:=false;BEGIN
 BEGIN PERFORM public.patch_campaign_sheet_noninventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','{"hp":999}'::jsonb,'{}'::jsonb); EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'No permission to update sheet' THEN RAISE;END IF;blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'R114 PATCH NULL_IDENTITY_DENIED unauthorized write succeeded';END IF;
END $check$;
COMMIT;

-- Owner's PATCH may update hp but may NEVER overwrite inventory without item leases.
DO $integrity$ BEGIN
 IF (SELECT field_values->'bag' FROM public.characters
      WHERE id='00000000-0000-4000-8000-000000000501')
   IS DISTINCT FROM
   '[{"_inventoryId":"00000000-0000-4000-8000-000000000701","name":"A potion"}]'::jsonb
 THEN RAISE EXCEPTION 'R114 unleased sheet PATCH overwrote inventory'; END IF;
 IF (SELECT field_values->'hp' FROM public.characters
      WHERE id='00000000-0000-4000-8000-000000000501') IS DISTINCT FROM '12'::jsonb
 THEN RAISE EXCEPTION 'R114 owner HP PATCH missing';END IF;
END $integrity$;

\echo 'R114 SHEET PASS: 17 helper + 12 getter + 9 patch role/scoping scenarios; inventory overwrite denied'
