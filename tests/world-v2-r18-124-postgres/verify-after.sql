-- R124: existing R18-115 candidate has been installed in disposable PG17.
\set ON_ERROR_STOP on
-- Removed character owner: deny despite unchanged owner_id and JWT.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000401')
 THEN RAISE EXCEPTION 'R124 revoked sheet owner was authorized';END IF;
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','npc_template',
  '00000000-0000-4000-8000-000000000501')
 THEN RAISE EXCEPTION 'R124 removed user edited NPC';END IF;
END $verify$;
COMMIT;

-- Active DM: character, NPC template, unowned NPC token all authorized.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',true);
DO $verify$
BEGIN
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000401') IS DISTINCT FROM true
 OR public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','npc_template',
  '00000000-0000-4000-8000-000000000501') IS DISTINCT FROM true
 OR public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','npc_token',
  '00000000-0000-4000-8000-000000000601') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R124 valid DM rights regressed';END IF;
END $verify$;
COMMIT;

-- Other campaign DM cannot read first campaign's private sheets.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',true);
DO $verify$
BEGIN
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000401')
 OR public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','npc_token',
  '00000000-0000-4000-8000-000000000601')
 THEN RAISE EXCEPTION 'R124 outsider DM crossed campaign';END IF;
END $verify$;
COMMIT;

-- NULL actor is denied, even as role authenticated.
BEGIN;
SET LOCAL ROLE authenticated;
DO $verify$
BEGIN
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000401')
 THEN RAISE EXCEPTION 'R124 null identity authorized';END IF;
END $verify$;
COMMIT;

-- Reinstatement is explicit ADMIN-only fixture setup; restores character,
-- not NPC (DM-only) access.
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000401') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R124 reinstated character owner blocked';END IF;
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','npc_template',
  '00000000-0000-4000-8000-000000000501')
 THEN RAISE EXCEPTION 'R124 non-DM player got NPC rights';END IF;
END $verify$;
COMMIT;
\echo 'R124 PASS: revoked, DM, outsider, null, and explicit reinstatement SQL scenarios.'
