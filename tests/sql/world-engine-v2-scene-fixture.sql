-- Phase 6 disposable fixture additions. Run AFTER Phase 4+5 contract fixtures
-- and BEFORE the proposed Phase 6 static-scene migration.
ALTER TABLE public.map_environments
 ADD COLUMN IF NOT EXISTS prepared jsonb NOT NULL
 DEFAULT '{"version":1,"objects":[]}'::jsonb;

ALTER TABLE forge_visibility.map_rules
 ADD COLUMN IF NOT EXISTS fog_enforced boolean NOT NULL DEFAULT false;
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN IF NOT EXISTS published_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE forge_visibility.map_rules
 ADD COLUMN IF NOT EXISTS campaign_id uuid;

UPDATE forge_visibility.map_rules SET
 campaign_id='20000000-0000-4000-8000-000000000001'
 WHERE map_id='10000000-0000-4000-8000-000000000001';
ALTER TABLE forge_visibility.map_rules
 ALTER COLUMN campaign_id SET NOT NULL;
