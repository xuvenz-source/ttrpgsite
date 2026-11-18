-- B10-R18-120: synthetic actual PostgreSQL17 authorization test.
-- Not real original invite function or signed hosted Auth.
\set ON_ERROR_STOP on

-- R120_CASE 01 NEW_PLAYER_P1_VALID_INVITE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.join_campaign('a1b2c3d4e5f60708') INTO got;
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'R120 NEW_PLAYER_P1_VALID_INVITE wrong campaign';END IF;
END $verify$;
COMMIT;

-- R120_CASE 02 NEW_PLAYER_P2_VALID_INVITE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.join_campaign('a1b2c3d4e5f60708') INTO got;
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'R120 NEW_PLAYER_P2_VALID_INVITE wrong campaign';END IF;
END $verify$;
COMMIT;

-- R120_CASE 03 DUPLICATE_DM_INVITE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.join_campaign('a1b2c3d4e5f60708') INTO got;
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'R120 DUPLICATE_DM_INVITE wrong campaign';END IF;
END $verify$;
COMMIT;

-- R120_CASE 04 DM_ROLE_PRESERVED
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000301' AND role='dm') IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 DM_ROLE_PRESERVED incorrect membership';END IF;
END $verify$;

-- R120_CASE 05 DM_REMOVES_PLAYER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302') INTO ok;
IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 case DM_REMOVES_PLAYER mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 06 REVOKED_MARKER_PERSISTS
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM forge_security.campaign_member_revocations WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302') IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 REVOKED_MARKER_PERSISTS incorrect tombstone';END IF;
END $verify$;

-- R120_CASE 07 REVOKED_OLD_INVITE_DENIED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.join_campaign('a1b2c3d4e5f60708'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 REVOKED_OLD_INVITE_DENIED unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 08 REVOKED_CANNOT_VOLUNTARILY_CLEAR
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.leave_campaign('00000000-0000-4000-8000-000000000101') INTO ok;
IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'R120 case REVOKED_CANNOT_VOLUNTARILY_CLEAR mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 09 REVOKED_MARKER_SURVIVES_SELF_LEAVE
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM forge_security.campaign_member_revocations WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302') IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 REVOKED_MARKER_SURVIVES_SELF_LEAVE incorrect tombstone';END IF;
END $verify$;

-- R120_CASE 10 PLAYER_P2_VOLUNTARILY_LEAVES
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.leave_campaign('00000000-0000-4000-8000-000000000101') INTO ok;
IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 case PLAYER_P2_VOLUNTARILY_LEAVES mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 11 VOLUNTARY_LEAVE_CLEARS_MARKER
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM forge_security.campaign_member_revocations WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000303') IS DISTINCT FROM false THEN RAISE EXCEPTION 'R120 VOLUNTARY_LEAVE_CLEARS_MARKER incorrect tombstone';END IF;
END $verify$;

-- R120_CASE 12 VOLUNTARY_LEAVER_REJOINS
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.join_campaign('a1b2c3d4e5f60708') INTO got;
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'R120 VOLUNTARY_LEAVER_REJOINS wrong campaign';END IF;
END $verify$;
COMMIT;

-- R120_CASE 13 FOREIGN_DM_CANNOT_REMOVE_A_PLAYER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 FOREIGN_DM_CANNOT_REMOVE_A_PLAYER unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 14 PLAYER_CANNOT_REMOVE_MEMBER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 PLAYER_CANNOT_REMOVE_MEMBER unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 15 DM_REINSTATES_REVOKED_PLAYER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.dm_reinstate_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302') INTO ok;
IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 case DM_REINSTATES_REVOKED_PLAYER mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 16 DM_REINSTATE_CLEARS_MARKER
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM forge_security.campaign_member_revocations WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302') IS DISTINCT FROM false THEN RAISE EXCEPTION 'R120 DM_REINSTATE_CLEARS_MARKER incorrect tombstone';END IF;
END $verify$;

-- R120_CASE 17 REINSTATED_PLAYER_IDEMPOTENT_JOIN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.join_campaign('a1b2c3d4e5f60708') INTO got;
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'R120 REINSTATED_PLAYER_IDEMPOTENT_JOIN wrong campaign';END IF;
END $verify$;
COMMIT;

-- R120_CASE 18 REINSTATED_ROLE_IS_PLAYER
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302' AND role='player') IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 REINSTATED_ROLE_IS_PLAYER incorrect membership';END IF;
END $verify$;

-- R120_CASE 19 DM_CANNOT_CREATE_ARBITRARY_MEMBER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.dm_reinstate_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000306') INTO ok;
IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'R120 case DM_CANNOT_CREATE_ARBITRARY_MEMBER mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 20 PLAYER_CANNOT_REINSTATE_OTHER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.dm_reinstate_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 PLAYER_CANNOT_REINSTATE_OTHER unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 21 NEVER_MEMBER_P3_JOINS_VALID_CODE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000306',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.join_campaign('a1b2c3d4e5f60708') INTO got;
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'R120 NEVER_MEMBER_P3_JOINS_VALID_CODE wrong campaign';END IF;
END $verify$;
COMMIT;

-- R120_CASE 22 INVALID_INVITE_REJECTED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000307',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.join_campaign('f0e0d0c0b0a00000'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 INVALID_INVITE_REJECTED unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 23 DM_CANNOT_REMOVE_FOREIGN_CAMPAIGN_DM
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000304') INTO ok;
IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'R120 case DM_CANNOT_REMOVE_FOREIGN_CAMPAIGN_DM mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 24 DM_REMOVES_P1_AGAIN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302') INTO ok;
IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 case DM_REMOVES_P1_AGAIN mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 25 ROTATE_A_INVITE
DO $verify$ BEGIN
UPDATE public.campaigns SET invite_code='c1d2e3f4a5b60708' WHERE id='00000000-0000-4000-8000-000000000101';
END $verify$;

-- R120_CASE 26 REMOVED_P1_DENIED_EVEN_NEW_CODE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.join_campaign('c1d2e3f4a5b60708'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 REMOVED_P1_DENIED_EVEN_NEW_CODE unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 27 NEVER_MEMBER_P4_USES_ROTATED_CODE
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000307',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.join_campaign('c1d2e3f4a5b60708') INTO got;
IF got IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'R120 NEVER_MEMBER_P4_USES_ROTATED_CODE wrong campaign';END IF;
END $verify$;
COMMIT;

-- R120_CASE 28 REVOKED_OLD_CODE_REJECTED
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.join_campaign('a1b2c3d4e5f60708'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 REVOKED_OLD_CODE_REJECTED unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 29 DM_CAN_REINSTATE_P1_AGAIN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.dm_reinstate_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302') INTO ok;
IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 case DM_CAN_REINSTATE_P1_AGAIN mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 30 REINSTATED_P1_PLAYER_ONLY
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302' AND role='player') IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 REINSTATED_P1_PLAYER_ONLY incorrect membership';END IF;
END $verify$;

-- R120_CASE 31 DIRECT_ADMIN_DELETE_P2_STAMPS_MARKER
DO $verify$ BEGIN
DELETE FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000303';
END $verify$;

-- R120_CASE 32 ADMIN_DIRECT_DELETE_TOMBSTONE
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM forge_security.campaign_member_revocations WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000303') IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 ADMIN_DIRECT_DELETE_TOMBSTONE incorrect tombstone';END IF;
END $verify$;

-- R120_CASE 33 ADMIN_REMOVED_P2_CANNOT_REJOIN
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
BEGIN PERFORM public.join_campaign('c1d2e3f4a5b60708'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
IF NOT blocked THEN RAISE EXCEPTION 'R120 ADMIN_REMOVED_P2_CANNOT_REJOIN unexpectedly permitted'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 34 DM_REINSTATES_ADMIN_REMOVED_PLAYER
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
DO $verify$ DECLARE got uuid; ok boolean; blocked boolean:=false;BEGIN
SELECT public.dm_reinstate_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303') INTO ok;
IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 case DM_REINSTATES_ADMIN_REMOVED_PLAYER mismatch'; END IF;
END $verify$;
COMMIT;

-- R120_CASE 35 RESTORED_P2_PLAYER
DO $verify$ BEGIN
IF EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000303' AND role='player') IS DISTINCT FROM true THEN RAISE EXCEPTION 'R120 RESTORED_P2_PLAYER incorrect membership';END IF;
END $verify$;

\echo 'R120 PG17 CONTRACT PASS: 35/35 real SQL synthetic membership and revocation scenarios.'
