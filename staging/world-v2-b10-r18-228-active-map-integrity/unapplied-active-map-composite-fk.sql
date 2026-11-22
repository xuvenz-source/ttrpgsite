-- B10-R18-228. UNAPPLIED, SCRATCH-ONLY CANDIDATE. NO HOSTED SQL AUTHORIZATION.
-- Independently authored from reviewed relation shape, not private migration SQL.
-- The existing single-column campaigns.active_map_id foreign key checks only
-- that a map exists, not that it belongs to the campaign pointing at it.
-- This adds a new, composite tenant-boundary invariant for FUTURE writes.
--
-- REQUIRE SEPARATE OWNER APPROVAL BEFORE ANY HOSTED INSTALL (even QA):
-- 83-file historical semantic review, exact $0 isolated QA target,
-- private aggregate/data review, database-specific dependency/lock assessment,
-- backup/rollback, and signed actor-matrix verification. Never run on original.
-- The separate R226 token/map/character candidate remains unapplied.
BEGIN;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_active_map_campaign_r228_fk
  FOREIGN KEY (id, active_map_id)
  REFERENCES public.battle_maps(campaign_id, id)
  ON DELETE SET NULL (active_map_id)
  NOT VALID;

-- The nullable active_map_id must become NULL on map deletion, not id.
-- NOT VALID deliberately does not claim validation of historical data.
DO $r228_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS c
    WHERE c.conrelid = 'public.campaigns'::regclass
      AND c.confrelid = 'public.battle_maps'::regclass
      AND c.conname = 'campaigns_active_map_campaign_r228_fk'
      AND c.contype = 'f'
      AND c.confdeltype = 'n'
      AND NOT c.convalidated
      AND array_length(c.confdelsetcols, 1) = 1
  ) THEN
    RAISE EXCEPTION 'R228_COMPOSITE_ACTIVE_MAP_GUARD_NOT_INSTALLED'
      USING ERRCODE = '23514';
  END IF;
END
$r228_guard$;

COMMIT;

-- No VALIDATE CONSTRAINT here. No original or QA migration or data change.
