-- B10-R18-142 disposable PostgreSQL 17 only, fictional auth.jwt sessions.
-- Verifies server actor checks through private functions as trusted creator.
-- This does NOT prove real signed Supabase RLS/Realtime/Storage.
\set ON_ERROR_STOP on
DO $r142_closed$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api';
 IF n<>17 THEN RAISE EXCEPTION 'R142 V3 API count incorrect';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal' AND p.prosecdef;
 IF n<>17 THEN RAISE EXCEPTION 'R142 private definer count incorrect';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
  pg_catalog.has_table_privilege('authenticated','public.map_tokens','SELECT')
 THEN RAISE EXCEPTION 'R142 legacy public raw source reexposed';END IF;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname IN ('forge_v3_api','forge_v3_internal')
   AND p.proname<>'get_authorized_scene_channel_v3'
   AND (pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'R142 new browser function EXECUTE leaked';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
 IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R142 inherited gate must begin fenced';END IF;
END $r142_closed$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',false);
DO $r142_fenced$
DECLARE ch uuid:='00000000-0000-4000-8000-000000000501';
 h uuid:='00000000-0000-4000-8000-000000000601';
 t uuid:='00000000-0000-4000-8000-000000000701';
 m uuid:='00000000-0000-4000-8000-000000000201';
BEGIN
 IF forge_v3_api.get_authorized_character_sheet_v3(ch) IS NOT NULL OR
 forge_v3_api.get_authorized_handout_v3(h) IS NOT NULL OR
 forge_v3_api.get_authorized_tool_issue_v3(t) IS NOT NULL OR
 forge_v3_api.get_authorized_map_metadata_v3(m) IS NOT NULL
 THEN RAISE EXCEPTION 'R142 fenced gate returned private content';END IF;
END $r142_fenced$;

-- Only local synthetic fixture gate is changed; hosted QA/original untouched.
UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only'
 WHERE singleton=true;
DO $r142_dm$
DECLARE ch uuid:='00000000-0000-4000-8000-000000000501';
 h uuid:='00000000-0000-4000-8000-000000000602';
 t uuid:='00000000-0000-4000-8000-000000000703';
 m uuid:='00000000-0000-4000-8000-000000000201';
 frame jsonb;
BEGIN
 frame:=forge_v3_api.get_authorized_character_sheet_v3(ch);
 IF frame->>'scope' IS DISTINCT FROM 'private-sheet' OR
 frame->'fieldValues'->>'hidden' IS DISTINCT FROM 'P1-private' OR
 frame ? 'portrait_path' OR frame ? 'token_path'
 THEN RAISE EXCEPTION 'R142 DM private character projection invalid';END IF;
 frame:=forge_v3_api.get_authorized_handout_v3(h);
 IF frame->>'scope' IS DISTINCT FROM 'dm' OR
 frame->>'body' IS DISTINCT FROM 'Private DM note'
 THEN RAISE EXCEPTION 'R142 DM unrevealed handout denied';END IF;
 frame:=forge_v3_api.get_authorized_tool_issue_v3(t);
 IF frame->>'scope' IS DISTINCT FROM 'dm' OR
 frame->'config'->>'dmHint' IS DISTINCT FROM 'P2-private'
 THEN RAISE EXCEPTION 'R142 DM private issued tool unavailable';END IF;
 frame:=forge_v3_api.get_authorized_map_metadata_v3(m);
 IF frame->>'scope' IS DISTINCT FROM 'map-metadata' OR
 frame->>'gridSize' IS DISTINCT FROM '100' OR
 frame ? 'storage_path' OR frame ? 'storagePath' OR
 frame ? 'environment' OR frame ? 'source_width'
 THEN RAISE EXCEPTION 'R142 DM map metadata disclosed private asset';END IF;
 IF forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000503') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 foreign-campaign DM read a private sheet';END IF;
END $r142_dm$;

-- Player 1: own sheet, public/visible-pin notes, owner tool and active map.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r142_p1$
DECLARE ch uuid:='00000000-0000-4000-8000-000000000501';
 h uuid:='00000000-0000-4000-8000-000000000601';
 visible_pin uuid:='00000000-0000-4000-8000-000000000603';
 secret uuid:='00000000-0000-4000-8000-000000000602';
 hidden_pin uuid:='00000000-0000-4000-8000-000000000604';
 other_pin uuid:='00000000-0000-4000-8000-000000000605';
 t uuid:='00000000-0000-4000-8000-000000000701';
 other_t uuid:='00000000-0000-4000-8000-000000000703';
 other_map_t uuid:='00000000-0000-4000-8000-000000000705';
 m uuid:='00000000-0000-4000-8000-000000000201';
 frame jsonb;
BEGIN
 frame:=forge_v3_api.get_authorized_character_sheet_v3(ch);
 IF frame->>'userId' IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000303'
 OR frame->'fieldValues'->>'hidden' IS DISTINCT FROM 'P1-private'
 OR frame ? 'portrait_path' OR frame ? 'token_path'
 THEN RAISE EXCEPTION 'R142 P1 own sheet projection invalid';END IF;
 IF forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000502') IS NOT NULL OR
 forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000503') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 P1 saw another players private sheet';END IF;
 frame:=forge_v3_api.get_authorized_handout_v3(h);
 IF frame->>'scope' IS DISTINCT FROM 'revealed' OR
 frame->>'body' IS DISTINCT FROM 'Public lore'
 THEN RAISE EXCEPTION 'R142 P1 revealed handout unavailable';END IF;
 frame:=forge_v3_api.get_authorized_handout_v3(visible_pin);
 IF frame->>'scope' IS DISTINCT FROM 'visible-pin' OR
 frame->>'body' IS DISTINCT FROM 'Pin lore'
 THEN RAISE EXCEPTION 'R142 P1 visible-pin handout denied';END IF;
 IF forge_v3_api.get_authorized_handout_v3(secret) IS NOT NULL OR
 forge_v3_api.get_authorized_handout_v3(hidden_pin) IS NOT NULL OR
 forge_v3_api.get_authorized_handout_v3(other_pin) IS NOT NULL OR
 forge_v3_api.get_authorized_handout_v3(
  '00000000-0000-4000-8000-000000000606') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 P1 unrevealed or cross-map note leaked';END IF;
 frame:=forge_v3_api.get_authorized_tool_issue_v3(t);
 IF frame->>'scope' IS DISTINCT FROM 'owner' OR
 frame->'config'->>'dmHint' IS DISTINCT FROM 'owner-secret' OR
 frame->'state'->>'hiddenState' IS DISTINCT FROM 'owner'
 THEN RAISE EXCEPTION 'R142 P1 own private issued tool denied';END IF;
 IF forge_v3_api.get_authorized_tool_issue_v3(other_t) IS NOT NULL OR
 forge_v3_api.get_authorized_tool_issue_v3(other_map_t) IS NOT NULL
 THEN RAISE EXCEPTION 'R142 P1 foreign tool or map leaked';END IF;
 frame:=forge_v3_api.get_authorized_map_metadata_v3(m);
 IF frame->>'id' IS DISTINCT FROM m::text OR
 frame ? 'storage_path' OR frame ? 'storagePath' OR
 frame ? 'environment' OR frame ? 'source_width'
 THEN RAISE EXCEPTION 'R142 P1 unauthorized map field leak';END IF;
 IF forge_v3_api.get_authorized_map_metadata_v3(
  '00000000-0000-4000-8000-000000000202') IS NOT NULL OR
 forge_v3_api.get_authorized_map_metadata_v3(
  '00000000-0000-4000-8000-000000000203') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 P1 other map metadata leaked';END IF;
END $r142_p1$;

-- P2: party-shared tool descriptor only, no owner/DM config or state.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $r142_p2$
DECLARE shared uuid:='00000000-0000-4000-8000-000000000702';
 own uuid:='00000000-0000-4000-8000-000000000703';
 private_p1 uuid:='00000000-0000-4000-8000-000000000701';
 frame jsonb;
BEGIN
 frame:=forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000502');
 IF frame->'fieldValues'->>'hidden' IS DISTINCT FROM 'P2-private'
 THEN RAISE EXCEPTION 'R142 P2 own sheet denied';END IF;
 IF forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000501') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 P2 read P1 private sheet';END IF;
 frame:=forge_v3_api.get_authorized_tool_issue_v3(shared);
 IF frame->>'scope' IS DISTINCT FROM 'shared' OR
 frame->>'name' IS DISTINCT FROM 'Party Shared Tool' OR
 frame ? 'config' OR frame ? 'state' OR
 frame ? 'owner_id' OR frame ? 'map_id' OR
 frame ? 'x' OR frame ? 'y'
 THEN RAISE EXCEPTION 'R142 shared tool disclosed DM/owner private data';END IF;
 frame:=forge_v3_api.get_authorized_tool_issue_v3(own);
 IF frame->>'scope' IS DISTINCT FROM 'owner' OR
 frame->'config'->>'dmHint' IS DISTINCT FROM 'P2-private'
 THEN RAISE EXCEPTION 'R142 P2 own private tool denied';END IF;
 IF forge_v3_api.get_authorized_tool_issue_v3(private_p1) IS NOT NULL OR
 forge_v3_api.get_authorized_tool_issue_v3(
  '00000000-0000-4000-8000-000000000705') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 P2 foreign or cross-map tool leaked';END IF;
END $r142_p2$;

-- Outsider is a DM of campaign 102: scope must NOT extend into 101.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',false);
DO $r142_foreign$
DECLARE frame jsonb;
BEGIN
 frame:=forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000503');
 IF frame->'fieldValues'->>'hidden' IS DISTINCT FROM 'outside'
 THEN RAISE EXCEPTION 'R142 outsider own-campaign private read denied';END IF;
 IF forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000501') IS NOT NULL OR
 forge_v3_api.get_authorized_handout_v3(
  '00000000-0000-4000-8000-000000000601') IS NOT NULL OR
 forge_v3_api.get_authorized_tool_issue_v3(
  '00000000-0000-4000-8000-000000000701') IS NOT NULL OR
 forge_v3_api.get_authorized_map_metadata_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 cross-campaign outsider saw protected content';END IF;
 frame:=forge_v3_api.get_authorized_map_metadata_v3(
  '00000000-0000-4000-8000-000000000203');
 IF frame->>'gridSize' IS DISTINCT FROM '100'
 THEN RAISE EXCEPTION 'R142 outsider legitimate own map failed';END IF;
END $r142_foreign$;

-- Non-member with arbitrary UUID is never a synthetic authorized player.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000305',false);
DO $r142_nonmember$
BEGIN
 IF forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000501') IS NOT NULL OR
 forge_v3_api.get_authorized_handout_v3(
  '00000000-0000-4000-8000-000000000601') IS NOT NULL OR
 forge_v3_api.get_authorized_tool_issue_v3(
  '00000000-0000-4000-8000-000000000702') IS NOT NULL OR
 forge_v3_api.get_authorized_map_metadata_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 fake nonmember gained private access';END IF;
END $r142_nonmember$;

-- Test database privileges for actual authenticated role under temporary
-- transactional grants. These privileges DO NOT survive ROLLBACK.
BEGIN;
GRANT EXECUTE ON FUNCTION
 forge_v3_api.get_authorized_character_sheet_v3(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION
 forge_v3_internal.get_authorized_character_sheet_v3(uuid) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $r142_transient_role$
DECLARE frame jsonb;
BEGIN
 frame:=forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000501');
 IF frame->'fieldValues'->>'hidden' IS DISTINCT FROM 'P1-private'
 THEN RAISE EXCEPTION 'R142 transient signed role cannot access own authorized sheet';END IF;
 IF forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000502') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 transient signed role accessed other sheet';END IF;
END $r142_transient_role$;
ROLLBACK;

-- Revoked membership must sever *fresh* server API rights immediately.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r142_revoked$
BEGIN
 IF forge_v3_api.get_authorized_character_sheet_v3(
  '00000000-0000-4000-8000-000000000501') IS NOT NULL OR
 forge_v3_api.get_authorized_handout_v3(
  '00000000-0000-4000-8000-000000000601') IS NOT NULL OR
 forge_v3_api.get_authorized_tool_issue_v3(
  '00000000-0000-4000-8000-000000000701') IS NOT NULL OR
 forge_v3_api.get_authorized_map_metadata_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R142 revoked player retained current server projection';END IF;
END $r142_revoked$;
UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced'
 WHERE singleton=true;
DO $r142_finish$
BEGIN
 IF pg_catalog.has_function_privilege('authenticated',
 'forge_v3_api.get_authorized_character_sheet_v3(uuid)','EXECUTE') OR
 pg_catalog.has_function_privilege('authenticated',
 'forge_v3_internal.get_authorized_character_sheet_v3(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R142 transient authenticated grant not rolled back';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
 IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R142 synthetic database not refenced';END IF;
END $r142_finish$;
\echo 'R142 PG17 SYNTHETIC PASS: 4 candidate API functions uncallable to browser; DM/P1/P2/outsider, private fields, party-shared sanitization, exposed pins, map assignment and revocation defended.'
\echo 'R142 NO_GO: fictional roles/fixtures only; no original 83 migrations, real Supabase JWT/RLS/old socket/Storage or free-tier performance.'
