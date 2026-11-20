-- B10-R18-143 isolated PG17 mutation tests. ALL actors fictitious.
-- Never run on original or hosted QA; real Supabase signed-auth untested.
\set ON_ERROR_STOP on
DO $r143_acl$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace s ON s.oid=p.pronamespace
 WHERE s.nspname='forge_v3_api';
 IF n<>20 THEN RAISE EXCEPTION 'R143 expected exactly 20 V3 API routines';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace s ON s.oid=p.pronamespace
 WHERE s.nspname='forge_v3_internal' AND p.prosecdef;
 IF n<>20 THEN RAISE EXCEPTION 'R143 expected exactly 20 private helpers';END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace s ON s.oid=p.pronamespace
 WHERE s.nspname IN ('forge_v3_api','forge_v3_internal')
 AND p.proname<>'get_authorized_scene_channel_v3'
 AND (pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
 OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'R143 new V3 mutation endpoint leaked EXECUTE';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
 IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R143 started without maintenance fence';END IF;
END $r143_acl$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',false);
DO $r143_fenced$
DECLARE ch uuid:='00000000-0000-4000-8000-000000000501';
 ht uuid:='00000000-0000-4000-8000-000000000602';
 pin uuid:='00000000-0000-4000-8000-000000000611';
 ts timestamptz;
BEGIN
 SELECT updated_at INTO ts FROM public.characters WHERE id=ch;
 IF forge_v3_api.patch_authorized_character_v3(ch,'{"hp":10}',ts) IS NOT NULL OR
 forge_v3_api.edit_authorized_handout_v3(ht,'closed','closed',true,ts) IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_v3(pin) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 fenced mutation did not deny all changes';END IF;
 IF (SELECT field_values->>'hp' FROM public.characters WHERE id=ch)<>'7'
 THEN RAISE EXCEPTION 'R143 fenced write modified character';END IF;
END $r143_fenced$;

UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only'
 WHERE singleton=true;
DO $r143_dm$
DECLARE p2char uuid:='00000000-0000-4000-8000-000000000502';
 foreignchar uuid:='00000000-0000-4000-8000-000000000503';
 secret uuid:='00000000-0000-4000-8000-000000000602';
 fresh timestamptz;previous timestamptz;receipt jsonb;
BEGIN
 SELECT updated_at INTO fresh FROM public.characters WHERE id=p2char;
 receipt:=forge_v3_api.patch_authorized_character_v3(
  p2char,'{"notes":"dm-updated"}'::jsonb,fresh);
 IF receipt->>'result' IS DISTINCT FROM 'patched'
 OR receipt->'changedKeys' <> '["notes"]'::jsonb
 OR receipt ? 'fieldValues' OR receipt ? 'portrait_path' OR
 receipt ? 'token_path' OR receipt ? 'userId'
 OR (SELECT field_values->>'notes' FROM public.characters WHERE id=p2char)
   IS DISTINCT FROM 'dm-updated'
 THEN RAISE EXCEPTION 'R143 DM private character mutation/sanitization failed';END IF;
 IF forge_v3_api.patch_authorized_character_v3(
  p2char,'{"hp":9}',fresh) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 stale character revision accepted';END IF;
 IF forge_v3_api.patch_authorized_character_v3(
  foreignchar,'{"notes":"foreign"}',(
  SELECT updated_at FROM public.characters WHERE id=foreignchar)) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 DM crossed foreign campaign character';END IF;

 SELECT updated_at INTO previous FROM public.campaign_handouts WHERE id=secret;
 receipt:=forge_v3_api.edit_authorized_handout_v3(
  secret,'DM authored','Secret changed by DM',true,previous);
 IF receipt->>'result' IS DISTINCT FROM 'edited' OR
 receipt->>'revealed' IS DISTINCT FROM 'true' OR
 receipt ? 'body' OR receipt ? 'folder_id' OR
 (SELECT revealed FROM public.campaign_handouts WHERE id=secret) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'R143 DM reveal/edit returned confidential body';END IF;
 IF forge_v3_api.edit_authorized_handout_v3(
  secret,'stale title','stale body',false,previous) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 stale DM authoring accepted';END IF;
 SELECT updated_at INTO fresh FROM public.campaign_handouts WHERE id=secret;
 receipt:=forge_v3_api.edit_authorized_handout_v3(
  secret,'DM concealed','Secret changed by DM',false,fresh);
 IF receipt->>'revealed' IS DISTINCT FROM 'false'
 OR (SELECT visible FROM public.campaign_map_pins WHERE
   id='00000000-0000-4000-8000-000000000614') IS DISTINCT FROM FALSE
 THEN RAISE EXCEPTION 'R143 original handout hide-pin trigger not preserved';END IF;
END $r143_dm$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r143_p1$
DECLARE own uuid:='00000000-0000-4000-8000-000000000501';
 other uuid:='00000000-0000-4000-8000-000000000502';
 note uuid:='00000000-0000-4000-8000-000000000602';
 collectible uuid:='00000000-0000-4000-8000-000000000611';
 hidden uuid:='00000000-0000-4000-8000-000000000612';
 hidden_dm uuid:='00000000-0000-4000-8000-000000000614';
 other_map uuid:='00000000-0000-4000-8000-000000000613';
 fresh timestamptz;receipt jsonb;
BEGIN
 SELECT updated_at INTO fresh FROM public.characters WHERE id=own;
 receipt:=forge_v3_api.patch_authorized_character_v3(
  own,'{"hp":8,"notes":"player wrote notes"}'::jsonb,fresh);
 IF receipt->>'result' IS DISTINCT FROM 'patched'
 OR receipt->'changedKeys'<>'["hp","notes"]'::jsonb
 OR receipt ? 'fieldValues' OR receipt ? 'portrait_path' OR
 receipt ? 'token_path' OR
 (SELECT field_values->>'hp' FROM public.characters WHERE id=own)<>'8'
 THEN RAISE EXCEPTION 'R143 P1 own sheet allowed fields failed';END IF;
 SELECT updated_at INTO fresh FROM public.characters WHERE id=own;
 IF forge_v3_api.patch_authorized_character_v3(
  own,'{"inventory":[]}',fresh) IS NOT NULL OR
 forge_v3_api.patch_authorized_character_v3(
  own,'{"portrait_path":"stolen"}',fresh) IS NOT NULL OR
 forge_v3_api.patch_authorized_character_v3(
  own,'{"user_id":"any"}',fresh) IS NOT NULL OR
 forge_v3_api.patch_authorized_character_v3(
  other,'{"hp":55}',(SELECT updated_at FROM public.characters WHERE id=other)
 ) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 inventory, identity or foreign edit allowed';END IF;
 IF forge_v3_api.edit_authorized_handout_v3(
  note,'player edits DM note','forbidden',true,(
  SELECT updated_at FROM public.campaign_handouts WHERE id=note)
 ) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 player gained DM authoring';END IF;
 IF forge_v3_api.collect_authorized_pin_v3(hidden) IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_v3(hidden_dm) IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_v3(other_map) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 hidden or other-map collection allowed';END IF;
 receipt:=forge_v3_api.collect_authorized_pin_v3(collectible);
 IF receipt->>'result' IS DISTINCT FROM 'collected'
 OR receipt->>'handoutId' IS DISTINCT FROM
   '00000000-0000-4000-8000-000000000603'
 OR receipt ? 'body' OR receipt ? 'title' OR
 (SELECT revealed AND collected FROM public.campaign_handouts WHERE
   id='00000000-0000-4000-8000-000000000603') IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'R143 original collect/reveal semantics failed';END IF;
END $r143_p1$;

-- P2 same map but different sheet owner, no DM or foreign campaign access.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $r143_p2$
DECLARE my_char uuid:='00000000-0000-4000-8000-000000000502';
 p1char uuid:='00000000-0000-4000-8000-000000000501';
 receipt jsonb;
BEGIN
 IF forge_v3_api.patch_authorized_character_v3(
  p1char,'{"hp":999}',(
  SELECT updated_at FROM public.characters WHERE id=p1char)) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 P2 could edit P1 private sheet';END IF;
 receipt:=forge_v3_api.patch_authorized_character_v3(
  my_char,'{"hp":9}',(
  SELECT updated_at FROM public.characters WHERE id=my_char));
 IF receipt->>'result' IS DISTINCT FROM 'patched'
 THEN RAISE EXCEPTION 'R143 P2 own sheet edit denied';END IF;
END $r143_p2$;

-- Cross-campaign DM can edit their own material, not campaign 101.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',false);
DO $r143_outsider$
DECLARE foreign_note uuid:='00000000-0000-4000-8000-000000000606';
 changed jsonb;
BEGIN
 IF forge_v3_api.patch_authorized_character_v3(
  '00000000-0000-4000-8000-000000000501','{"hp":0}',
  (SELECT updated_at FROM public.characters WHERE
  id='00000000-0000-4000-8000-000000000501')) IS NOT NULL
 OR forge_v3_api.edit_authorized_handout_v3(
  '00000000-0000-4000-8000-000000000602','foreign','foreign',true,
  (SELECT updated_at FROM public.campaign_handouts WHERE
  id='00000000-0000-4000-8000-000000000602')) IS NOT NULL
 OR forge_v3_api.collect_authorized_pin_v3(
  '00000000-0000-4000-8000-000000000611') IS NOT NULL
 THEN RAISE EXCEPTION 'R143 foreign-campaign DM escaped authorization';END IF;
 changed:=forge_v3_api.edit_authorized_handout_v3(
  foreign_note,'Foreign DM authored','Own lore',true,
  (SELECT updated_at FROM public.campaign_handouts WHERE id=foreign_note));
 IF changed->>'result' IS DISTINCT FROM 'edited'
 THEN RAISE EXCEPTION 'R143 outsider DM denied legitimate campaign edit';END IF;
END $r143_outsider$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000305',false);
DO $r143_nonmember$
BEGIN
 IF forge_v3_api.patch_authorized_character_v3(
  '00000000-0000-4000-8000-000000000501','{"hp":1}',
  (SELECT updated_at FROM public.characters WHERE
  id='00000000-0000-4000-8000-000000000501')) IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_v3(
  '00000000-0000-4000-8000-000000000611') IS NOT NULL OR
 forge_v3_api.edit_authorized_handout_v3(
  '00000000-0000-4000-8000-000000000602','no','no',false,
  (SELECT updated_at FROM public.campaign_handouts WHERE
  id='00000000-0000-4000-8000-000000000602')) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 nonmember gained mutation capability';END IF;
END $r143_nonmember$;

-- Map reassignment must immediately prevent collection on the old map,
-- without revoking ownership of a character sheet.
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
 VALUES('00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000303',
        '00000000-0000-4000-8000-000000000202')
 ON CONFLICT(campaign_id,user_id) DO UPDATE SET map_id=excluded.map_id;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r143_reassignment$
DECLARE receipt jsonb;
BEGIN
 IF forge_v3_api.collect_authorized_pin_v3(
  '00000000-0000-4000-8000-000000000611') IS NOT NULL
 THEN RAISE EXCEPTION 'R143 old-map collection allowed after assignment change';END IF;
 receipt:=forge_v3_api.collect_authorized_pin_v3(
  '00000000-0000-4000-8000-000000000613');
 IF receipt->>'result' IS DISTINCT FROM 'collected'
 THEN RAISE EXCEPTION 'R143 currently assigned map collection denied';END IF;
END $r143_reassignment$;

-- TEST-ONLY transactional role grants; rollback MUST remove both.
-- Capture opaque CAS tokens BEFORE SET ROLE; the authenticated role must
-- never query the protected public.characters source directly (R128).
BEGIN;
SELECT pg_catalog.set_config('r143.fixture.p1_updated_at',
 (SELECT updated_at::text FROM public.characters WHERE
 id='00000000-0000-4000-8000-000000000501'),true);
SELECT pg_catalog.set_config('r143.fixture.p2_updated_at',
 (SELECT updated_at::text FROM public.characters WHERE
 id='00000000-0000-4000-8000-000000000502'),true);
GRANT EXECUTE ON FUNCTION
 forge_v3_api.patch_authorized_character_v3(uuid,jsonb,timestamptz)
 TO authenticated;
GRANT EXECUTE ON FUNCTION
 forge_v3_internal.patch_authorized_character_v3(uuid,jsonb,timestamptz)
 TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $r143_temporary_grant$
DECLARE receipt jsonb;
BEGIN
 receipt:=forge_v3_api.patch_authorized_character_v3(
  '00000000-0000-4000-8000-000000000501','{"notes":"role-proved"}',
  pg_catalog.current_setting('r143.fixture.p1_updated_at')::timestamptz);
 IF receipt->>'result' IS DISTINCT FROM 'patched'
 THEN RAISE EXCEPTION 'R143 temporary authenticated role could not patch own sheet';END IF;
 IF forge_v3_api.patch_authorized_character_v3(
  '00000000-0000-4000-8000-000000000502','{"hp":100}',
  pg_catalog.current_setting('r143.fixture.p2_updated_at')::timestamptz) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 temporary authenticated role bypassed P2 ownership';END IF;
END $r143_temporary_grant$;
ROLLBACK;

-- Membership revoke must affect fresh calls, even if the user still
-- carries an old authenticated JWT. Old *already joined* sockets NOT tested.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r143_revoked$
BEGIN
 IF forge_v3_api.patch_authorized_character_v3(
  '00000000-0000-4000-8000-000000000501','{"hp":12}',
  (SELECT updated_at FROM public.characters WHERE
  id='00000000-0000-4000-8000-000000000501')) IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_v3(
  '00000000-0000-4000-8000-000000000613') IS NOT NULL OR
 forge_v3_api.edit_authorized_handout_v3(
  '00000000-0000-4000-8000-000000000601','no','no',false,
  (SELECT updated_at FROM public.campaign_handouts WHERE
  id='00000000-0000-4000-8000-000000000601')) IS NOT NULL
 THEN RAISE EXCEPTION 'R143 revoked actor still mutated private data';END IF;
END $r143_revoked$;

UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced'
 WHERE singleton=true;
DO $r143_finish$
BEGIN
 IF pg_catalog.has_function_privilege('authenticated',
  'forge_v3_api.patch_authorized_character_v3(uuid,jsonb,timestamptz)','EXECUTE')
 OR pg_catalog.has_function_privilege('authenticated',
  'forge_v3_internal.patch_authorized_character_v3(uuid,jsonb,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'R143 temporary authenticated grants escaped rollback';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
 IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R143 synthetic fixture failed to re-fence';END IF;
END $r143_finish$;
\echo 'R143 SYNTHETIC PG17 PASS: DM/P1/P2/outsider/revoked, character CAS/template, handout hide pin, collect map reassignment, browser deny and maintenance fence.'
\echo 'R143 NO_GO: no original 83 migrations or genuine signed Supabase QA; old sockets, Storage bearer revocation, free-tier latency, R127 release remain unverified.'
