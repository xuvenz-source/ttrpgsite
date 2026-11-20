-- B10-R18-145: SOURCE-ONLY UNAPPLIED CANDIDATE.
-- NEVER EXECUTE ON HOSTED SUPABASE; only isolated disposable PostgreSQL 17.
-- Parent R144 PR #252 at c4c26fb8d736e021862a754008c0361ba67fd2eb.
-- The two original tables receive row-wide revision triggers so ALL writers
-- (legacy, V3, privileged server and trigger-driven) increment consistently.
-- Five NEW private helper + five exposed INVOKER methods, one private trigger
-- helper. All new methods explicit EXECUTE-REVOKED. NO browser grants.
BEGIN;
DO $r145_preflight$
DECLARE a integer;i integer;
BEGIN
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
    pg_catalog.has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R145 requires the R128 public freeze';END IF;
 IF pg_catalog.to_regprocedure('forge_scene_drain.scene_v3_publish_allowed()') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_internal.patch_authorized_character_v3(uuid,jsonb,timestamptz)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_internal.edit_authorized_handout_v3(uuid,text,text,boolean,timestamptz)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_internal.collect_authorized_pin_v3(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_internal.get_authorized_character_sheet_v3(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_internal.get_authorized_handout_v3(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.is_campaign_member(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.can_view_campaign_map(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'R145 requires complete R142/R143 signed private ancestors';END IF;
 SELECT count(*) INTO a FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api';
 SELECT count(*) INTO i FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal';
 IF a<>20 OR i<>20 THEN RAISE EXCEPTION 'R145 expected exact 20+20 V3 ancestry';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('forge_v3_api','forge_v3_internal')
  AND p.proname<>'get_authorized_scene_channel_v3'
  AND (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
       pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'R145 inherited gameplay privileges drifted';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
 WHERE a.attrelid IN ('public.characters'::regclass,'public.campaign_handouts'::regclass)
 AND a.attname='forge_mutation_revision' AND a.attnum>0 AND NOT a.attisdropped)
 THEN RAISE EXCEPTION 'R145 revision column already installed; manual reconcile required';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
 WHERE t.tgrelid IN ('public.characters'::regclass,'public.campaign_handouts'::regclass)
 AND t.tgname LIKE 'forge_mutation_revision_%')
 THEN RAISE EXCEPTION 'R145 revision trigger name conflict';END IF;
END $r145_preflight$;

-- Constant DEFAULT adds no user-visible privilege; applied only after R128
-- denies direct public reads/updates in a future approved migration.
-- ACCESS EXCLUSIVE DDL lock, table size, and trigger cost are NOT tested
-- on the real 83-migration database; require timed free-tier preflight.
ALTER TABLE public.characters
 ADD COLUMN forge_mutation_revision bigint NOT NULL DEFAULT 0
 CHECK(forge_mutation_revision>=0);
ALTER TABLE public.campaign_handouts
 ADD COLUMN forge_mutation_revision bigint NOT NULL DEFAULT 0
 CHECK(forge_mutation_revision>=0);

CREATE FUNCTION forge_v3_internal.bump_mutation_revision_v3()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r145_counter$
BEGIN
 IF OLD.forge_mutation_revision IS NULL OR
    OLD.forge_mutation_revision>=9223372036854775806
 THEN RAISE EXCEPTION 'R145 revision exhausted / malformed';END IF;
 NEW.forge_mutation_revision:=OLD.forge_mutation_revision+1;
 RETURN NEW;
END $r145_counter$;
REVOKE ALL ON FUNCTION forge_v3_internal.bump_mutation_revision_v3()
 FROM PUBLIC,anon,authenticated;
-- BEFORE UPDATE without column list covers legacy, V3, inventory, art sync,
-- and every privileged writer. It does not depend on browser signaling.
CREATE TRIGGER forge_mutation_revision_characters_v3
 BEFORE UPDATE ON public.characters
 FOR EACH ROW EXECUTE FUNCTION forge_v3_internal.bump_mutation_revision_v3();
CREATE TRIGGER forge_mutation_revision_handouts_v3
 BEFORE UPDATE ON public.campaign_handouts
 FOR EACH ROW EXECUTE FUNCTION forge_v3_internal.bump_mutation_revision_v3();

-- Lock before delegate so the authorized read and exact revision token
-- correspond to the same committed row snapshot through this transaction.
CREATE FUNCTION forge_v3_internal.get_authorized_character_sheet_revision_v3(
 p_character uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r145_read_character$
DECLARE actor uuid:=auth.uid();revision bigint;payload jsonb;
BEGIN
 IF actor IS NULL OR p_character IS NULL OR
 NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT c.forge_mutation_revision INTO revision
 FROM public.characters c WHERE c.id=p_character FOR SHARE;
 IF NOT FOUND OR revision IS NULL THEN RETURN NULL;END IF;
 payload:=forge_v3_internal.get_authorized_character_sheet_v3(p_character);
 IF pg_catalog.jsonb_typeof(payload)<>'object' OR
 payload->>'id' IS DISTINCT FROM p_character::text OR
 payload->>'scope' IS DISTINCT FROM 'private-sheet'
 THEN RETURN NULL;END IF;
 RETURN payload||pg_catalog.jsonb_build_object('mutationRevision',revision);
END $r145_read_character$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.get_authorized_character_sheet_revision_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_internal.get_authorized_handout_revision_v3(
 p_handout uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r145_read_handout$
DECLARE actor uuid:=auth.uid();revision bigint;payload jsonb;
BEGIN
 IF actor IS NULL OR p_handout IS NULL OR
 NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT h.forge_mutation_revision INTO revision
 FROM public.campaign_handouts h WHERE h.id=p_handout FOR SHARE;
 IF NOT FOUND OR revision IS NULL THEN RETURN NULL;END IF;
 payload:=forge_v3_internal.get_authorized_handout_v3(p_handout);
 IF pg_catalog.jsonb_typeof(payload)<>'object' OR
 payload->>'id' IS DISTINCT FROM p_handout::text
 THEN RETURN NULL;END IF;
 RETURN payload||pg_catalog.jsonb_build_object('mutationRevision',revision);
END $r145_read_handout$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.get_authorized_handout_revision_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- The old R143 updated_at gate still runs *inside* each delegated call,
-- but callers now supply and compare strictly increasing BIGINT revision.
CREATE FUNCTION forge_v3_internal.patch_authorized_character_revision_v3(
 p_character uuid,p_values jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r145_patch$
DECLARE actor uuid:=auth.uid();before_record record;after_revision bigint;
 receipt jsonb;
BEGIN
 IF actor IS NULL OR p_character IS NULL OR p_values IS NULL OR
 p_expected_revision IS NULL OR p_expected_revision<0 OR
 NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT c.id,c.updated_at,c.forge_mutation_revision
 INTO before_record FROM public.characters c
 WHERE c.id=p_character FOR UPDATE;
 IF NOT FOUND OR before_record.forge_mutation_revision
 IS DISTINCT FROM p_expected_revision THEN RETURN NULL;END IF;
 -- R143 owns template-key/owner/DM checks; never return its source row.
 receipt:=forge_v3_internal.patch_authorized_character_v3(
 p_character,p_values,before_record.updated_at);
 IF pg_catalog.jsonb_typeof(receipt)<>'object' OR
 receipt->>'result' IS DISTINCT FROM 'patched' OR
 receipt->>'id' IS DISTINCT FROM p_character::text
 THEN RETURN NULL;END IF;
 SELECT c.forge_mutation_revision INTO after_revision
 FROM public.characters c WHERE c.id=p_character;
 IF after_revision IS DISTINCT FROM p_expected_revision+1
 THEN RAISE EXCEPTION 'R145 character revision counter diverged; rollback';END IF;
 RETURN receipt||pg_catalog.jsonb_build_object(
 'mutationRevision',after_revision);
END $r145_patch$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.patch_authorized_character_revision_v3(uuid,jsonb,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_internal.edit_authorized_handout_revision_v3(
 p_handout uuid,p_title text,p_body text,p_revealed boolean,
 p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r145_edit$
DECLARE actor uuid:=auth.uid();before_record record;after_revision bigint;
 receipt jsonb;
BEGIN
 IF actor IS NULL OR p_handout IS NULL OR p_expected_revision IS NULL OR
 p_expected_revision<0 OR NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT h.id,h.updated_at,h.forge_mutation_revision
 INTO before_record FROM public.campaign_handouts h
 WHERE h.id=p_handout FOR UPDATE;
 IF NOT FOUND OR before_record.forge_mutation_revision
 IS DISTINCT FROM p_expected_revision THEN RETURN NULL;END IF;
 receipt:=forge_v3_internal.edit_authorized_handout_v3(
 p_handout,p_title,p_body,p_revealed,before_record.updated_at);
 IF pg_catalog.jsonb_typeof(receipt)<>'object' OR
 receipt->>'result' IS DISTINCT FROM 'edited' OR
 receipt->>'id' IS DISTINCT FROM p_handout::text
 THEN RETURN NULL;END IF;
 SELECT h.forge_mutation_revision INTO after_revision
 FROM public.campaign_handouts h WHERE h.id=p_handout;
 IF after_revision IS DISTINCT FROM p_expected_revision+1
 THEN RAISE EXCEPTION 'R145 handout revision counter diverged; rollback';END IF;
 RETURN receipt||pg_catalog.jsonb_build_object(
  'mutationRevision',after_revision);
END $r145_edit$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.edit_authorized_handout_revision_v3(uuid,text,text,boolean,bigint)
 FROM PUBLIC,anon,authenticated;

-- Strict lock order: HANDOUT first, then PIN. DM concealment edits the
-- handout then hides pins. Pin-first collector versus handout-first DM
-- could deadlock. Read pin without lock, authorize, acquire handout lock,
-- then acquire pin and REVALIDATE to block TOCTOU changes.
CREATE FUNCTION forge_v3_internal.collect_authorized_pin_once_v3(p_pin uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r145_collect$
DECLARE actor uuid:=auth.uid();initial record;locked_pin record;
 note_row record;receipt jsonb;after_revision bigint;
BEGIN
 IF actor IS NULL OR p_pin IS NULL OR
 NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT p.id,p.handout_id,p.campaign_id,p.map_id INTO initial
 FROM public.campaign_map_pins p WHERE p.id=p_pin;
 IF NOT FOUND OR initial.handout_id IS NULL OR
 NOT public.is_campaign_member(initial.campaign_id) OR
 NOT public.can_view_campaign_map(initial.campaign_id,initial.map_id)
 THEN RETURN NULL;END IF;
 SELECT h.id,h.campaign_id,h.revealed,h.collected,h.forge_mutation_revision
 INTO note_row FROM public.campaign_handouts h
 WHERE h.id=initial.handout_id AND h.campaign_id=initial.campaign_id
 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT p.id,p.handout_id,p.campaign_id,p.map_id,p.visible,p.collectable
 INTO locked_pin FROM public.campaign_map_pins p
 WHERE p.id=p_pin FOR UPDATE;
 IF NOT FOUND OR locked_pin.handout_id IS DISTINCT FROM note_row.id OR
 locked_pin.campaign_id IS DISTINCT FROM note_row.campaign_id OR
 locked_pin.visible IS DISTINCT FROM TRUE OR
 locked_pin.collectable IS DISTINCT FROM TRUE OR
 NOT public.is_campaign_member(locked_pin.campaign_id) OR
 NOT public.can_view_campaign_map(locked_pin.campaign_id,locked_pin.map_id)
 THEN RETURN NULL;END IF;
 IF note_row.revealed IS TRUE AND note_row.collected IS TRUE
 THEN
  -- A V3 duplicate must not run legacy collection or increment revision.
  RETURN pg_catalog.jsonb_build_object(
   'version',3,'result','already-collected',
   'handoutId',note_row.id,
   'mutationRevision',note_row.forge_mutation_revision);
 END IF;
 receipt:=forge_v3_internal.collect_authorized_pin_v3(p_pin);
 IF pg_catalog.jsonb_typeof(receipt)<>'object' OR
 receipt->>'result' IS DISTINCT FROM 'collected' OR
 receipt->>'handoutId' IS DISTINCT FROM note_row.id::text
 THEN RETURN NULL;END IF;
 SELECT h.forge_mutation_revision INTO after_revision
 FROM public.campaign_handouts h WHERE h.id=note_row.id;
 IF after_revision IS DISTINCT FROM note_row.forge_mutation_revision+1
 THEN RAISE EXCEPTION 'R145 collection revision counter diverged; rollback';END IF;
 RETURN receipt||pg_catalog.jsonb_build_object(
  'mutationRevision',after_revision);
END $r145_collect$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.collect_authorized_pin_once_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Five ungranted SECURITY INVOKER data API wrappers. No caller-supplied
-- name can dispatch to arbitrary definer or table.
CREATE FUNCTION forge_v3_api.get_authorized_character_sheet_revision_v3(
 p_character uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r145_api$
 SELECT forge_v3_internal.get_authorized_character_sheet_revision_v3(p_character)
$r145_api$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_character_sheet_revision_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_handout_revision_v3(p_handout uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r145_api$
 SELECT forge_v3_internal.get_authorized_handout_revision_v3(p_handout)
$r145_api$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_handout_revision_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.patch_authorized_character_revision_v3(
 p_character uuid,p_values jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r145_api$
 SELECT forge_v3_internal.patch_authorized_character_revision_v3(
  p_character,p_values,p_expected_revision)
$r145_api$;
REVOKE ALL ON FUNCTION
 forge_v3_api.patch_authorized_character_revision_v3(uuid,jsonb,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.edit_authorized_handout_revision_v3(
 p_handout uuid,p_title text,p_body text,p_revealed boolean,
 p_expected_revision bigint)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r145_api$
 SELECT forge_v3_internal.edit_authorized_handout_revision_v3(
  p_handout,p_title,p_body,p_revealed,p_expected_revision)
$r145_api$;
REVOKE ALL ON FUNCTION
 forge_v3_api.edit_authorized_handout_revision_v3(uuid,text,text,boolean,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.collect_authorized_pin_once_v3(p_pin uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r145_api$
 SELECT forge_v3_internal.collect_authorized_pin_once_v3(p_pin)
$r145_api$;
REVOKE ALL ON FUNCTION forge_v3_api.collect_authorized_pin_once_v3(uuid)
 FROM PUBLIC,anon,authenticated;

DO $r145_postflight$
DECLARE a integer;i integer;
BEGIN
 SELECT count(*) INTO a FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api';
 SELECT count(*) INTO i FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal';
 IF a<>25 OR i<>26
 THEN RAISE EXCEPTION 'R145 expects 25 API invokers and 26 private helpers';END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api' AND (
 p.prosecdef OR (p.proname<>'get_authorized_scene_channel_v3' AND (
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R145 exposed definer or browser EXECUTE privilege';END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal' AND (
 NOT p.prosecdef OR (p.proname<>'get_authorized_scene_channel_v3' AND (
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
 pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R145 leaked private helper';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
 pg_catalog.has_table_privilege('authenticated','public.map_tokens','SELECT')
 THEN RAISE EXCEPTION 'R145 reopened original public Data API or raw tokens';END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_trigger t
 WHERE t.tgname LIKE 'forge_mutation_revision_%'
 AND NOT t.tgisinternal
 AND t.tgrelid IN('public.characters'::regclass,'public.campaign_handouts'::regclass))<>2
 THEN RAISE EXCEPTION 'R145 all-writer counters not installed twice';END IF;
END $r145_postflight$;
COMMIT;
-- NO_GO: DDL lock/resource performance, true original trigger/sender
-- effects, genuine signed users, old sockets, Storage and R127 unverified.
