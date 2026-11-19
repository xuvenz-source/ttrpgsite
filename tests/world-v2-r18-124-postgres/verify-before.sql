-- R124: demonstrate the existing helper source defect before the patch.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000401') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R124 current owner should be allowed';END IF;
END $verify$;
COMMIT;

-- Synthetic privileged ADMIN operation, not a hosted DM endpoint.
DELETE FROM public.campaign_members WHERE
 campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000302';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.synthetic_sheet_edit_guard(
  '00000000-0000-4000-8000-000000000101','character',
  '00000000-0000-4000-8000-000000000401') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R124 original revoked-owner gap not reproduced';END IF;
END $verify$;
COMMIT;
