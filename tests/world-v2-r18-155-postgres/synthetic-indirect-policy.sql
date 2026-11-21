-- R155 fictional Postgres17 map-mediated Storage permission model.
-- This is NOT Supabase storage.objects or original policy/migration SQL.
BEGIN;
CREATE TABLE forge_test.map_catalog (
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 object_path text NOT NULL,
 PRIMARY KEY(campaign_id,object_path)
);
ALTER TABLE forge_test.map_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_test.map_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT ON forge_test.map_catalog TO authenticated;
CREATE POLICY r155_map_catalog_member_select ON forge_test.map_catalog
 FOR SELECT TO authenticated
 USING (public.synthetic_is_campaign_member(campaign_id));
INSERT INTO forge_test.map_catalog(campaign_id,object_path) VALUES
 ('00000000-0000-4000-8000-000000000101','a/shared-map.png'),
 ('00000000-0000-4000-8000-000000000101','a/private-dm.png'),
 ('00000000-0000-4000-8000-000000000102','b/shared-map.png'),
 ('00000000-0000-4000-8000-000000000102','b/private-dm.png');

-- The outer file policy has NO direct auth.uid or campaign helper.
-- It delegates to row security on the map lookup, and binds BOTH canonical
-- campaign and object path to the same map row.
DROP POLICY r152_read_campaign_file ON forge_test.file_objects;
CREATE POLICY r155_file_select_via_map_row ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM forge_test.map_catalog AS map
  WHERE map.campaign_id=forge_test.file_objects.campaign_id
    AND map.object_path=forge_test.file_objects.object_path
 ));
COMMIT;
