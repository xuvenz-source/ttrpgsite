-- R116: test original source-exact tool claim and DM NPC reader.
-- Synthetic membership helpers only. NO signed Supabase Auth.
\set ON_ERROR_STOP on

-- R116_CASE 01 P1_OWN_PRIVATE_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'R116 P1_OWN_PRIVATE_TOOL: unexpected holder';END IF;
END $assert$;
COMMIT;

-- R116_CASE 02 P2_SHARED_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000303'::uuid THEN RAISE EXCEPTION 'R116 P2_SHARED_TOOL: unexpected holder';END IF;
END $assert$;
COMMIT;

-- R116_CASE 03 P2_DENIED_PRIVATE_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 P2_DENIED_PRIVATE_TOOL: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 04 P1_CANNOT_STEAL_SHARED_LOCK
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'This item is being edited by another player' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 P1_CANNOT_STEAL_SHARED_LOCK: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 05 DM_MUST_OPT_IN_TAKEOVER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'This item is being edited by another player' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 DM_MUST_OPT_IN_TAKEOVER: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 06 DM_EXPLICIT_TAKEOVER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',true);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000301'::uuid THEN RAISE EXCEPTION 'R116 DM_EXPLICIT_TAKEOVER: unexpected holder';END IF;
END $assert$;
COMMIT;

-- R116_CASE 07 PREVIOUS_OWNER_CANNOT_STEAL_AFTER_TAKEOVER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'This item is being edited by another player' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 PREVIOUS_OWNER_CANNOT_STEAL_AFTER_TAKEOVER: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 08 OUTSIDER_DENIED_SHARED_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 OUTSIDER_DENIED_SHARED_TOOL: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 09 CROSS_CAMPAIGN_DM_DENIED_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 CROSS_CAMPAIGN_DM_DENIED_TOOL: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 10 NULL_ACTOR_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Sign in required' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 NULL_ACTOR_DENIED: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 11 UNKNOWN_TOOL_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000899','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory not found' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 UNKNOWN_TOOL_DENIED: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 12 NULL_ITEM_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801',NULL,false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Item identity required' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 NULL_ITEM_DENIED: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 13 DM_B_CLAIM_OWN_CAMPAIGN_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000803','00000000-0000-4000-8000-000000000703',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000304'::uuid THEN RAISE EXCEPTION 'R116 DM_B_CLAIM_OWN_CAMPAIGN_TOOL: unexpected holder';END IF;
END $assert$;
COMMIT;

-- R116_CASE 14 DM_A_ONLY_OWN_NPC
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000405'::uuid] THEN RAISE EXCEPTION 'R116 DM_A_ONLY_OWN_NPC: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

-- R116_CASE 15 PLAYER_CANNOT_READ_PRIVATE_NPC
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN RAISE EXCEPTION 'R116 PLAYER_CANNOT_READ_PRIVATE_NPC: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

-- R116_CASE 16 DM_B_DENIED_FOREIGN_NPC
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN RAISE EXCEPTION 'R116 DM_B_DENIED_FOREIGN_NPC: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

-- R116_CASE 17 DM_B_OWN_CAMPAIGN_NPC
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000204');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000404'::uuid] THEN RAISE EXCEPTION 'R116 DM_B_OWN_CAMPAIGN_NPC: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

-- R116_CASE 18 DM_A_DENIED_OTHER_CAMPAIGN_NPC
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000204');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN RAISE EXCEPTION 'R116 DM_A_DENIED_OTHER_CAMPAIGN_NPC: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000301';

-- R116_CASE 19 REMOVED_DM_NPC_READ_REVOKED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN RAISE EXCEPTION 'R116 REMOVED_DM_NPC_READ_REVOKED: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

-- R116_CASE 20 REMOVED_DM_CANNOT_REFRESH_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',true); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 REMOVED_DM_CANNOT_REFRESH_TOOL: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm');

-- R116_CASE 21 RESTORED_DM_NPC_READ
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000405'::uuid] THEN RAISE EXCEPTION 'R116 RESTORED_DM_NPC_READ: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

-- R116_CASE 22 RESTORED_DM_TOOL_REFRESH
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',true);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000301'::uuid THEN RAISE EXCEPTION 'R116 RESTORED_DM_TOOL_REFRESH: unexpected holder';END IF;
END $assert$;
COMMIT;

DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302';

-- R116_CASE 23 REVOKED_OWNER_DENIED_OWN_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 REVOKED_OWNER_DENIED_OWN_TOOL: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 24 REVOKED_MEMBER_DENIED_SHARED_TOOL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 REVOKED_MEMBER_DENIED_SHARED_TOOL: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

-- R116_CASE 25 REVOKED_PLAYER_CANNOT_READ_NPC
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT pg_catalog.array_agg(token_id ORDER BY token_id) INTO got_ids FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
IF COALESCE(got_ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN RAISE EXCEPTION 'R116 REVOKED_PLAYER_CANNOT_READ_NPC: NPC cross-campaign/role access';END IF;
END $assert$;
COMMIT;

INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player');
UPDATE public.campaign_tool_item_leases SET expires_at=now()-interval '1 second' WHERE issue_id='00000000-0000-4000-8000-000000000802' AND item_id='00000000-0000-4000-8000-000000000702';

-- R116_CASE 26 REJOINED_PLAYER_SHARED_TOOL_CLAIM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000302'::uuid THEN RAISE EXCEPTION 'R116 REJOINED_PLAYER_SHARED_TOOL_CLAIM: unexpected holder';END IF;
END $assert$;
COMMIT;

DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000303';

-- R116_CASE 27 REVOKED_SHARED_TOOL_OWNER_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
BEGIN PERFORM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000704',false); EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IS DISTINCT FROM 'Inventory unavailable' THEN RAISE;END IF;blocked:=true;
END;
IF NOT blocked THEN RAISE EXCEPTION 'R116 REVOKED_SHARED_TOOL_OWNER_DENIED: forbidden claim succeeded';END IF;
END $assert$;
COMMIT;

INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303','player');

-- R116_CASE 28 RESTORED_SHARED_TOOL_OWNER_CAN_CREATE_ITEM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $assert$ DECLARE got uuid; got_ids uuid[]; blocked boolean:=false; BEGIN
SELECT holder_id INTO got FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000704',false);
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000303'::uuid THEN RAISE EXCEPTION 'R116 RESTORED_SHARED_TOOL_OWNER_CAN_CREATE_ITEM: unexpected holder';END IF;
END $assert$;
COMMIT;

DO $state$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.campaign_tool_item_leases;
 IF n<>4 THEN RAISE EXCEPTION 'R116 unexpected tool lease state count: %',n;END IF;
 IF EXISTS(SELECT 1 FROM public.map_tokens WHERE id='00000000-0000-4000-8000-000000000406' AND character_id IS NOT NULL)
 THEN RAISE EXCEPTION 'R116 deliberate mismatch fixture corrupted'; END IF;
END $state$;

\echo 'R116 SOURCE-EXACT TOOL/NPC: 28/28 synthetic membership, scope, takeover and revocation checks PASS'
