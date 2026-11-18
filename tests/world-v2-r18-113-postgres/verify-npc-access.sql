-- R18-113: eight synthetic signed-claim authorization scenarios for exact Git/live NPC reader.
\set ON_ERROR_STOP on
DO $acl$ BEGIN
 IF has_function_privilege('anon','public.get_dm_map_npc_values(uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.get_dm_map_npc_values(uuid)','EXECUTE')
  OR has_table_privilege('authenticated','public.map_tokens','SELECT')
 THEN RAISE EXCEPTION 'R113 unexpected RPC or private table role grants'; END IF;
END $acl$;

-- R113 DM_A_ALLOWED_OWN_NPCS
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000401'::uuid,'00000000-0000-4000-8000-000000000406'::uuid] THEN
  RAISE EXCEPTION 'R113 DM_A_ALLOWED_OWN_NPCS wrong NPC row access'; END IF;
 IF values_found IS DISTINCT FROM '[{"private":"A-one"},{"private":"A-two"}]'::jsonb THEN RAISE EXCEPTION 'R113 DM_A_ALLOWED_OWN_NPCS unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- R113 PLAYER_A_DENIED_OWN_NPCS
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN
  RAISE EXCEPTION 'R113 PLAYER_A_DENIED_OWN_NPCS wrong NPC row access'; END IF;
 IF values_found IS NOT NULL THEN RAISE EXCEPTION 'R113 PLAYER_A_DENIED_OWN_NPCS unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- R113 DM_B_DENIED_CROSS_CAMPAIGN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN
  RAISE EXCEPTION 'R113 DM_B_DENIED_CROSS_CAMPAIGN wrong NPC row access'; END IF;
 IF values_found IS NOT NULL THEN RAISE EXCEPTION 'R113 DM_B_DENIED_CROSS_CAMPAIGN unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- R113 DM_B_ALLOWED_OWN_CAMPAIGN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000204');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000405'::uuid] THEN
  RAISE EXCEPTION 'R113 DM_B_ALLOWED_OWN_CAMPAIGN wrong NPC row access'; END IF;
 IF values_found IS DISTINCT FROM '[{"private":"B-one"}]'::jsonb THEN RAISE EXCEPTION 'R113 DM_B_ALLOWED_OWN_CAMPAIGN unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- R113 DM_A_DENIED_CROSS_CAMPAIGN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000204');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN
  RAISE EXCEPTION 'R113 DM_A_DENIED_CROSS_CAMPAIGN wrong NPC row access'; END IF;
 IF values_found IS NOT NULL THEN RAISE EXCEPTION 'R113 DM_A_DENIED_CROSS_CAMPAIGN unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- R113 OUTSIDER_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN
  RAISE EXCEPTION 'R113 OUTSIDER_DENIED wrong NPC row access'; END IF;
 IF values_found IS NOT NULL THEN RAISE EXCEPTION 'R113 OUTSIDER_DENIED unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- R113 DM_A_UNKNOWN_MAP
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000299');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN
  RAISE EXCEPTION 'R113 DM_A_UNKNOWN_MAP wrong NPC row access'; END IF;
 IF values_found IS NOT NULL THEN RAISE EXCEPTION 'R113 DM_A_UNKNOWN_MAP unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- R113 NULL_IDENTITY_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN
  RAISE EXCEPTION 'R113 NULL_IDENTITY_DENIED wrong NPC row access'; END IF;
 IF values_found IS NOT NULL THEN RAISE EXCEPTION 'R113 NULL_IDENTITY_DENIED unexpected private payload'; END IF;
END $assert$;
COMMIT;

-- Pre-revocation DM: deliberate fixture-only membership grant.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
VALUES ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000306','dm');
-- R113 DM_BEFORE_REVOCATION
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000306',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000401'::uuid,'00000000-0000-4000-8000-000000000406'::uuid] THEN
  RAISE EXCEPTION 'R113 DM_BEFORE_REVOCATION wrong NPC row access'; END IF;
 IF values_found IS DISTINCT FROM '[{"private":"A-one"},{"private":"A-two"}]'::jsonb THEN RAISE EXCEPTION 'R113 DM_BEFORE_REVOCATION unexpected private payload'; END IF;
END $assert$;
COMMIT;
-- Revoke fixture membership and verify authorization is evaluated fresh.
DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000306';
-- R113 DM_AFTER_REVOCATION_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000306',true);
DO $assert$ DECLARE ids uuid[]; values_found jsonb; BEGIN
 SELECT pg_catalog.array_agg(token_id ORDER BY token_id), pg_catalog.jsonb_agg(npc_values ORDER BY token_id)
 INTO ids,values_found FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');
 IF COALESCE(ids,ARRAY[]::uuid[]) IS DISTINCT FROM ARRAY[]::uuid[] THEN
  RAISE EXCEPTION 'R113 DM_AFTER_REVOCATION_DENIED wrong NPC row access'; END IF;
 IF values_found IS NOT NULL THEN RAISE EXCEPTION 'R113 DM_AFTER_REVOCATION_DENIED unexpected private payload'; END IF;
END $assert$;
COMMIT;
\echo 'R113 10/10 synthetic-claim NPC authorization scenarios PASS (not real signed hosted Supabase)' 
