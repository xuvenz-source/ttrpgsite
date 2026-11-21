-- R18-179 fictional PostgreSQL17 only: joined old invite + sheet owner defect.
-- This source-shaped reproduction is NOT original private SQL nor a migration.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.characters(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 item_label text NOT NULL DEFAULT ''
);
CREATE TABLE public.npc_templates(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE
);
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
 owner_id uuid,
 character_id uuid
);
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.characters,public.npc_templates,public.map_tokens FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $dm$
 SELECT EXISTS(SELECT 1 FROM public.campaign_members m
  WHERE m.campaign_id=p_campaign AND m.user_id=auth.uid() AND m.role='dm')
$dm$;
REVOKE ALL ON FUNCTION public.is_campaign_dm(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_dm(uuid) TO authenticated;

-- INTENTIONALLY VULNERABLE synthetic version: ownership without membership.
CREATE FUNCTION public.can_edit_campaign_sheet(p_campaign uuid,p_source text,p_source_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $bad$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR p_campaign IS NULL OR p_source_id IS NULL THEN RETURN false;END IF;
 IF p_source='character' THEN
  RETURN EXISTS(SELECT 1 FROM public.characters c
   WHERE c.id=p_source_id AND c.campaign_id=p_campaign
   AND (c.user_id=actor OR public.is_campaign_dm(p_campaign)));
 END IF;
 RETURN false;
END
$bad$;
REVOKE ALL ON FUNCTION public.can_edit_campaign_sheet(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
-- Fictional privileged call site represents a claim/mutation through helper.
CREATE FUNCTION public.fixture_claim_sheet(p_campaign uuid,p_character uuid,p_label text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $mutate$
DECLARE changed integer;
BEGIN
 IF NOT public.can_edit_campaign_sheet(p_campaign,'character',p_character) THEN
  RAISE EXCEPTION 'Sheet access denied' USING ERRCODE='42501';
 END IF;
 UPDATE public.characters c SET item_label=p_label
 WHERE c.campaign_id=p_campaign AND c.id=p_character;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END
$mutate$;
REVOKE ALL ON FUNCTION public.fixture_claim_sheet(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fixture_claim_sheet(uuid,uuid,text) TO authenticated;
INSERT INTO public.characters(id,campaign_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302'),
 ('00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000303');
COMMIT;

-- Stage 1: authorized actors join, then DM removes P1.
DO $case$
DECLARE ok boolean; c uuid;
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
 SELECT public.join_campaign('a1b2c3d4e5f60708') INTO c;
 IF c IS DISTINCT FROM '00000000-0000-4000-8000-000000000101'::uuid THEN RAISE EXCEPTION 'P1 did not join';END IF;
 SELECT public.fixture_claim_sheet(c,'00000000-0000-4000-8000-000000000501','pre-removal') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'P1 legitimate edit denied';END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',false);
 PERFORM public.join_campaign('a1b2c3d4e5f60708');
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
 SELECT public.dm_remove_campaign_player(c,'00000000-0000-4000-8000-000000000302') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'DM could not revoke P1';END IF;
 IF EXISTS(SELECT 1 FROM public.campaign_members WHERE campaign_id=c AND user_id='00000000-0000-4000-8000-000000000302') THEN
  RAISE EXCEPTION 'removed P1 membership remains';
 END IF;
END $case$;
-- Stage 2: old invite is denied yet unpatched helper wrongly grants a write.
DO $case$
DECLARE blocked boolean:=false;ok boolean;
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
 BEGIN PERFORM public.join_campaign('a1b2c3d4e5f60708');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'old invitation rejoin was not blocked';END IF;
 SELECT public.fixture_claim_sheet(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000501',
  'UNSAFE_REVOKED_OWNER_WRITE') INTO ok;
 IF ok IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'synthetic revoked-owner negative control was not reproduced';
 END IF;
END $case$;

-- Apply unchanged existing R115 candidate, not a competing SQL repair.
\i staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql

-- Stage 3: removed owner's write and cross-user/foreign-DM writes now fail.
DO $case$
DECLARE blocked boolean;ok boolean;
BEGIN
 IF has_function_privilege('authenticated',
    'public.can_edit_campaign_sheet(uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'helper direct EXECUTE exposed';END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
 blocked:=false;
 BEGIN PERFORM public.fixture_claim_sheet(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000501','BAD_POST_FIX');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'removed owner still mutates sheet after R115';END IF;
 IF (SELECT item_label FROM public.characters WHERE id='00000000-0000-4000-8000-000000000501')
   IS DISTINCT FROM 'UNSAFE_REVOKED_OWNER_WRITE' THEN
  RAISE EXCEPTION 'denied write changed character';END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',false);
 blocked:=false;
 BEGIN PERFORM public.fixture_claim_sheet(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000501','BAD_P2_WRITES_P1');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'P2 edited P1 sheet';END IF;
 SELECT public.fixture_claim_sheet(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000502','P2_OWN_SHEET') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'P2 legitimate sheet failed';END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000304',false);
 blocked:=false;
 BEGIN PERFORM public.fixture_claim_sheet(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000501','BAD_FOREIGN_DM');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'foreign DM edited campaign A';END IF;
END $case$;

-- Stage 4: current DM can edit and explicitly reinstate P1; P1 regains ownership.
DO $case$
DECLARE ok boolean;c uuid:='00000000-0000-4000-8000-000000000101';
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
 SELECT public.fixture_claim_sheet(c,'00000000-0000-4000-8000-000000000501','CURRENT_DM_EDIT') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'current DM denied';END IF;
 SELECT public.dm_reinstate_campaign_player(c,'00000000-0000-4000-8000-000000000302') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'DM reinstatement denied';END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
 SELECT public.fixture_claim_sheet(c,'00000000-0000-4000-8000-000000000501','RESTORED_P1_EDIT') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'reinstated owner denied';END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',false);
 SELECT public.dm_remove_campaign_player(c,'00000000-0000-4000-8000-000000000302') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'second DM removal failed';END IF;
END $case$;

-- Stage 5: R173 cleans deleted identity tombstones; P2 remains untouched.
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000302';
DO $case$ BEGIN
 IF EXISTS(SELECT 1 FROM forge_security.campaign_member_revocations
  WHERE user_id='00000000-0000-4000-8000-000000000302') THEN
  RAISE EXCEPTION 'auth deletion retained removed ID';END IF;
 IF EXISTS(SELECT 1 FROM public.characters
  WHERE user_id='00000000-0000-4000-8000-000000000302') THEN
  RAISE EXCEPTION 'auth deletion retained deleted user character';END IF;
 IF (SELECT item_label FROM public.characters
  WHERE id='00000000-0000-4000-8000-000000000502') IS DISTINCT FROM 'P2_OWN_SHEET' THEN
  RAISE EXCEPTION 'unrelated P2 character changed';END IF;
END $case$;
\echo 'R179 synthetic PG17 combined invariant PASS.'
