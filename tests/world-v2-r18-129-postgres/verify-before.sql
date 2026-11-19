-- Before candidate: outsider with signed account sees another campaign's
-- fog-published bit; even after their campaign membership is revoked.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',true);
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R129 old cross-campaign fog bit gap not reproduced';END IF;
END $verify$;
COMMIT;

-- Synthetic admin-only deletion: removes P1 from campaign A.
DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
  AND user_id='00000000-0000-4000-8000-000000000302';

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R129 old removed-member fog bit gap not reproduced';END IF;
END $verify$;
COMMIT;
