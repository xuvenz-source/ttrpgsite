-- B10-R18-145 synthetic PG17 verification only.
-- Chain R143 disposable setup, then unapplied R145 schema candidate.
-- This is not original 83-migration Supabase or real signed auth.
\set ON_ERROR_STOP on
DO $r145_initial$
DECLARE a integer;i integer;
BEGIN
 SELECT count(*) INTO a FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api';
 SELECT count(*) INTO i FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal';
 IF a<>25 OR i<>26 THEN RAISE EXCEPTION 'R145 wrong new V3 API/helper count';END IF;
 IF pg_catalog.has_function_privilege('authenticated',
  'forge_v3_api.patch_authorized_character_revision_v3(uuid,jsonb,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R145 browser-revoked character revision route leaked';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
 pg_catalog.has_table_privilege('authenticated','public.map_tokens','SELECT')
 THEN RAISE EXCEPTION 'R145 opened legacy public surface';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
 IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R145 maintenance gate should start fenced';END IF;
END $r145_initial$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',false);
DO $r145_fenced$
BEGIN
 IF forge_v3_api.get_authorized_character_sheet_revision_v3(
 '00000000-0000-4000-8000-000000000501') IS NOT NULL OR
 forge_v3_api.get_authorized_handout_revision_v3(
 '00000000-0000-4000-8000-000000000602') IS NOT NULL OR
 forge_v3_api.patch_authorized_character_revision_v3(
 '00000000-0000-4000-8000-000000000501','{"hp":42}',0) IS NOT NULL OR
 forge_v3_api.edit_authorized_handout_revision_v3(
 '00000000-0000-4000-8000-000000000602',
 'fenced','fenced',true,0) IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_once_v3(
 '00000000-0000-4000-8000-000000000611') IS NOT NULL
 THEN RAISE EXCEPTION 'R145 fenced read/write route leaked';END IF;
END $r145_fenced$;

-- Synthetic DB only. Original hosted gate remains untouched.
UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only'
 WHERE singleton=true;
-- Original R143 synthetic verification deliberately revoked P1.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
VALUES('00000000-0000-4000-8000-000000000101',
'00000000-0000-4000-8000-000000000303','player')
ON CONFLICT DO NOTHING;
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
VALUES('00000000-0000-4000-8000-000000000101',
'00000000-0000-4000-8000-000000000303',
'00000000-0000-4000-8000-000000000201')
ON CONFLICT(campaign_id,user_id) DO UPDATE SET map_id=excluded.map_id;

DO $r145_dm_revision$
DECLARE p2char uuid:='00000000-0000-4000-8000-000000000502';
 dmnote uuid:='00000000-0000-4000-8000-000000000602';
 char_before jsonb;character_updated jsonb;char_after jsonb;
 note_before jsonb;note_updated jsonb;
BEGIN
 char_before:=forge_v3_api.get_authorized_character_sheet_revision_v3(p2char);
 IF char_before->>'scope' IS DISTINCT FROM 'private-sheet' OR
 char_before->>'mutationRevision' IS DISTINCT FROM '0'
 THEN RAISE EXCEPTION 'R145 initial DM versioned character read failed';END IF;
 character_updated:=forge_v3_api.patch_authorized_character_revision_v3(
 p2char,'{"notes":"dm changed"}',0);
 IF character_updated->>'result' IS DISTINCT FROM 'patched' OR
 character_updated->>'mutationRevision' IS DISTINCT FROM '1' OR
 character_updated ? 'fieldValues'
 THEN RAISE EXCEPTION 'R145 atomic DM character revision failed';END IF;
 -- Direct original/legacy writer increments same trigger, not V3-only.
 UPDATE public.characters SET name='External privileged writer'
 WHERE id=p2char;
 char_after:=forge_v3_api.get_authorized_character_sheet_revision_v3(p2char);
 IF char_after->>'mutationRevision' IS DISTINCT FROM '2'
 THEN RAISE EXCEPTION 'R145 legacy writer failed to bump all-writer revision';END IF;
 IF forge_v3_api.patch_authorized_character_revision_v3(
 p2char,'{"notes":"stale"}',1) IS NOT NULL
 THEN RAISE EXCEPTION 'R145 stale revision accepted after legacy character edit';END IF;
 IF forge_v3_api.patch_authorized_character_revision_v3(
 p2char,'{"notes":"fresh"}',2)->>'mutationRevision' IS DISTINCT FROM '3'
 THEN RAISE EXCEPTION 'R145 fresh revision after legacy writer denied';END IF;

 note_before:=forge_v3_api.get_authorized_handout_revision_v3(dmnote);
 IF note_before->>'scope' IS DISTINCT FROM 'dm' OR
 note_before->>'mutationRevision' IS DISTINCT FROM '0'
 THEN RAISE EXCEPTION 'R145 initial DM versioned handout read failed';END IF;
 note_updated:=forge_v3_api.edit_authorized_handout_revision_v3(
 dmnote,'New DM title','DM new body',true,0);
 IF note_updated->>'result' IS DISTINCT FROM 'edited' OR
 note_updated->>'mutationRevision' IS DISTINCT FROM '1' OR
 note_updated ? 'body'
 THEN RAISE EXCEPTION 'R145 DM handout revision/receipt failed';END IF;
 -- Existing DM editor or original collector also triggers counter.
 UPDATE public.campaign_handouts SET title='Other legacy update'
 WHERE id=dmnote;
 IF (SELECT forge_mutation_revision FROM public.campaign_handouts WHERE id=dmnote)
 IS DISTINCT FROM 2
 THEN RAISE EXCEPTION 'R145 legacy handout update not tracked';END IF;
 IF forge_v3_api.edit_authorized_handout_revision_v3(
 dmnote,'stale','stale',false,1) IS NOT NULL
 THEN RAISE EXCEPTION 'R145 stale DM handout revision accepted';END IF;
END $r145_dm_revision$;

-- In *one same transaction*, each UPDATE must get distinct revision
-- even though original now() updated_at stays unchanged.
BEGIN;
DO $r145_same_transaction$
DECLARE cid uuid:='00000000-0000-4000-8000-000000000501';
 before_rev bigint;a jsonb;b jsonb;stale jsonb;
BEGIN
 SELECT forge_mutation_revision INTO before_rev FROM public.characters
 WHERE id=cid;
 a:=forge_v3_api.patch_authorized_character_revision_v3(
 cid,'{"hp":48}',before_rev);
 b:=forge_v3_api.patch_authorized_character_revision_v3(
 cid,'{"hp":49}',before_rev+1);
 stale:=forge_v3_api.patch_authorized_character_revision_v3(
 cid,'{"hp":50}',before_rev+1);
 IF a->>'mutationRevision' IS DISTINCT FROM (before_rev+1)::text OR
 b->>'mutationRevision' IS DISTINCT FROM (before_rev+2)::text OR
 stale IS NOT NULL OR
 (SELECT field_values->>'hp' FROM public.characters WHERE id=cid)<>'49'
 THEN RAISE EXCEPTION 'R145 same-transaction revision CAS failed to stop stale write';END IF;
 RAISE NOTICE 'R145 same-transaction stale CAS rejected even when now() constant';
END $r145_same_transaction$;
COMMIT;

-- Count only the synthetic collection sequence, not prior fixture edits.
CREATE TABLE r140_fiction.r145_handout_events(
 handout_id uuid PRIMARY KEY,updates integer NOT NULL DEFAULT 0
);
CREATE FUNCTION r140_fiction.r145_count_updates() RETURNS trigger
 LANGUAGE plpgsql VOLATILE SET search_path=''
AS $fixture$
BEGIN
 INSERT INTO r140_fiction.r145_handout_events(handout_id,updates)
 VALUES(NEW.id,1) ON CONFLICT(handout_id) DO UPDATE
 SET updates=r145_handout_events.updates+1;
 RETURN NEW;
END $fixture$;
CREATE TRIGGER r145_count_handout_events
AFTER UPDATE ON public.campaign_handouts FOR EACH ROW
EXECUTE FUNCTION r140_fiction.r145_count_updates();

-- Reset previous test collection to uncollected; reset counter afterward.
UPDATE public.campaign_handouts SET collected=false,revealed=false
WHERE id='00000000-0000-4000-8000-000000000603';
UPDATE public.campaign_map_pins SET visible=true
WHERE id='00000000-0000-4000-8000-000000000611';
TRUNCATE r140_fiction.r145_handout_events;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r145_collect_once$
DECLARE pin uuid:='00000000-0000-4000-8000-000000000611';
 note uuid:='00000000-0000-4000-8000-000000000603';
 first_result jsonb;second_result jsonb;total integer;
BEGIN
 first_result:=forge_v3_api.collect_authorized_pin_once_v3(pin);
 second_result:=forge_v3_api.collect_authorized_pin_once_v3(pin);
 SELECT updates INTO total FROM r140_fiction.r145_handout_events
 WHERE handout_id=note;
 IF first_result->>'result' IS DISTINCT FROM 'collected' OR
    second_result->>'result' IS DISTINCT FROM 'already-collected' OR
    first_result->>'mutationRevision' IS DISTINCT FROM
      second_result->>'mutationRevision' OR total IS DISTINCT FROM 1
 THEN RAISE EXCEPTION 'R145 repeat collect changed state more than once';END IF;
 RAISE NOTICE 'R145 duplicate collection is a read-only no-op for V3; only one handout update';
END $r145_collect_once$;

-- Recheck actor/map/visibility even on an already-collected pin.
UPDATE public.campaign_map_pins SET visible=false
WHERE id='00000000-0000-4000-8000-000000000611';
DO $r145_hidden$
BEGIN
 IF forge_v3_api.collect_authorized_pin_once_v3(
  '00000000-0000-4000-8000-000000000611') IS NOT NULL
 THEN RAISE EXCEPTION 'R145 hidden collected pin disclosed post-revoke metadata';END IF;
END $r145_hidden$;
UPDATE public.campaign_map_pins SET visible=true
WHERE id='00000000-0000-4000-8000-000000000611';

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',false);
DO $r145_p2$
DECLARE result jsonb;
BEGIN
 IF forge_v3_api.get_authorized_character_sheet_revision_v3(
 '00000000-0000-4000-8000-000000000501') IS NOT NULL OR
 forge_v3_api.patch_authorized_character_revision_v3(
 '00000000-0000-4000-8000-000000000501','{"hp":100}',0) IS NOT NULL
 THEN RAISE EXCEPTION 'R145 P2 received P1 sheet or edit';END IF;
 result:=forge_v3_api.get_authorized_character_sheet_revision_v3(
 '00000000-0000-4000-8000-000000000502');
 IF result->>'scope' IS DISTINCT FROM 'private-sheet'
 THEN RAISE EXCEPTION 'R145 P2 own versioned sheet access denied';END IF;
END $r145_p2$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',false);
DO $r145_outsider$
BEGIN
 IF forge_v3_api.get_authorized_handout_revision_v3(
 '00000000-0000-4000-8000-000000000602') IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_once_v3(
 '00000000-0000-4000-8000-000000000611') IS NOT NULL
 THEN RAISE EXCEPTION 'R145 outsider crossed campaign';END IF;
END $r145_outsider$;

-- No direct access via authenticated/anon roles. A temporary role grant
-- for one route is transactional and rolled back just like R143.
BEGIN;
GRANT EXECUTE ON FUNCTION
 forge_v3_api.patch_authorized_character_revision_v3(uuid,jsonb,bigint)
 TO authenticated;
GRANT EXECUTE ON FUNCTION
 forge_v3_internal.patch_authorized_character_revision_v3(uuid,jsonb,bigint)
 TO authenticated;
SELECT pg_catalog.set_config('r145.fixture.p1_revision',
 (SELECT forge_mutation_revision::text FROM public.characters
  WHERE id='00000000-0000-4000-8000-000000000501'),true);
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $r145_transient$
DECLARE result jsonb;
BEGIN
 result:=forge_v3_api.patch_authorized_character_revision_v3(
  '00000000-0000-4000-8000-000000000501','{"hp":52}',
  pg_catalog.current_setting('r145.fixture.p1_revision')::bigint);
 IF result->>'result' IS DISTINCT FROM 'patched'
 THEN RAISE EXCEPTION 'R145 temporary authenticated owner patch failed';END IF;
END $r145_transient$;
ROLLBACK;

-- Authorization must be fresh on each request. No claim of old socket
-- ejection, Storage bearer revocation or already-delivered frames.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r145_revoked$
BEGIN
 IF forge_v3_api.get_authorized_character_sheet_revision_v3(
 '00000000-0000-4000-8000-000000000501') IS NOT NULL OR
 forge_v3_api.patch_authorized_character_revision_v3(
 '00000000-0000-4000-8000-000000000501','{"hp":1}',0) IS NOT NULL OR
 forge_v3_api.collect_authorized_pin_once_v3(
 '00000000-0000-4000-8000-000000000611') IS NOT NULL
 THEN RAISE EXCEPTION 'R145 revoked actor retained data access';END IF;
END $r145_revoked$;

UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced'
 WHERE singleton=true;
DO $r145_final$
BEGIN
 IF pg_catalog.has_function_privilege('authenticated',
 'forge_v3_api.patch_authorized_character_revision_v3(uuid,jsonb,bigint)','EXECUTE')
 OR pg_catalog.has_function_privilege('authenticated',
 'forge_v3_internal.patch_authorized_character_revision_v3(uuid,jsonb,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R145 temporary browser role grants not rolled back';END IF;
 IF (SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton)
 IS DISTINCT FROM 'fenced'
 THEN RAISE EXCEPTION 'R145 disposable fixture did not re-fence';END IF;
END $r145_final$;
\echo 'R145 SYNTHETIC PG17 PASS: all-writer revision trigger, same-transaction CAS, V3 repeated-collect no-op, DM/P1/P2/outsider/revoked and default browser deny.'
\echo 'R145 NO_GO: original 83 migrations, actual signed users, realistic trigger graph/deadlock, Storage/Realtime and free-tier DDL/performance remain UNVERIFIED.'
