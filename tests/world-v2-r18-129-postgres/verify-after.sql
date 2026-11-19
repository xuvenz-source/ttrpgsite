-- R129 guard installed only in local disposable PG17.
\set ON_ERROR_STOP on
-- Revoked actor must be denied the map's fog-published bit.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R129 revoked P1 still sees fog metadata';END IF;
END $verify$;
COMMIT;

-- Other-campaign DM cannot probe campaign A, but may probe own campaign.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',true);
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R129 outsider DM still sees foreign fog bit';END IF;
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000203') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R129 rightful other-campaign DM denied';END IF;
END $verify$;
COMMIT;

-- Active campaign P2 should retain authorized active map, but not off-map.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R129 authorized P2 denied active-map fog bit';END IF;
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R129 P2 off-map fog bit not denied';END IF;
 IF public.is_map_fog_published(NULL) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R129 NULL map not denied';END IF;
END $verify$;
COMMIT;

-- Same campaign DM may see map without fog; returns real boolean false.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',true);
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R129 active DM fog visibility regressed';END IF;
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R129 DM false fog flag regressed';END IF;
END $verify$;
COMMIT;

-- NULL authenticated actor never sees presence of fog.
BEGIN;
SET LOCAL ROLE authenticated;
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'R129 NULL auth actor sees fog bit';END IF;
END $verify$;
COMMIT;

-- Explicit reinstatement restores P1's normal map permission.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
VALUES('00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000302','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $verify$
BEGIN
 IF public.is_map_fog_published(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R129 reinstated P1 not restored';END IF;
END $verify$;
COMMIT;
\echo 'R129 PG17 PASS: original fog oracle reproduced and guarded for revoked, outsider, off-map, null and restored actors.'
