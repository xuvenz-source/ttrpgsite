-- R18-156 purely fictional PG17 map visibility contract.
-- NOT original can_view_campaign_map, NOT a versioned migration, NOT real Supabase.
BEGIN;

-- R120 scratch campaigns lacks active_map_id; extend only the disposable fixture.
ALTER TABLE public.campaigns ADD COLUMN active_map_id uuid;

CREATE TABLE forge_test.visible_maps (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 storage_path text NOT NULL UNIQUE
);
CREATE TABLE forge_test.player_map_overrides (
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 user_id uuid NOT NULL,
 map_id uuid NOT NULL REFERENCES forge_test.visible_maps(id),
 PRIMARY KEY (campaign_id,user_id)
);
ALTER TABLE forge_test.visible_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_test.player_map_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_test.visible_maps,forge_test.player_map_overrides FROM PUBLIC,anon,authenticated;
GRANT SELECT ON forge_test.visible_maps TO authenticated;

-- Deliberately modeled after a limited, metadata-observed access contract,
-- NOT copied from confidential historical migration SQL.
CREATE FUNCTION public.synthetic_can_view_campaign_map(p_campaign uuid,p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $body$
 SELECT p_map IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_members member
  JOIN public.campaigns c ON c.id=member.campaign_id
  LEFT JOIN forge_test.player_map_overrides o
    ON o.campaign_id=member.campaign_id AND o.user_id=member.user_id
  WHERE member.campaign_id=p_campaign AND member.user_id=auth.uid()
    AND (member.role='dm' OR p_map=coalesce(o.map_id,c.active_map_id))
 )
$body$;
REVOKE ALL ON FUNCTION public.synthetic_can_view_campaign_map(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_can_view_campaign_map(uuid,uuid) TO authenticated;

CREATE POLICY r156_map_viewer ON forge_test.visible_maps
 FOR SELECT TO authenticated
 USING (public.synthetic_can_view_campaign_map(campaign_id,id));

-- File-level authorization composes map visibility, canonical campaign
-- association and exact storage_path equality. It is invoker-side EXISTS.
DROP POLICY r152_read_campaign_file ON forge_test.file_objects;
CREATE POLICY r156_storage_map_view ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (EXISTS(
  SELECT 1 FROM forge_test.visible_maps AS vm
   WHERE vm.storage_path=forge_test.file_objects.object_path
     AND vm.campaign_id=forge_test.file_objects.campaign_id
     AND public.synthetic_can_view_campaign_map(vm.campaign_id,vm.id)
 ));

INSERT INTO forge_test.visible_maps(id,campaign_id,storage_path) VALUES
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000101','a/shared-map.png'),
 ('00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000101','a/other-map.png'),
 ('00000000-0000-4000-8000-000000000403','00000000-0000-4000-8000-000000000102','b/shared-map.png');

UPDATE public.campaigns SET active_map_id='00000000-0000-4000-8000-000000000401'
 WHERE id='00000000-0000-4000-8000-000000000101';
UPDATE public.campaigns SET active_map_id='00000000-0000-4000-8000-000000000403'
 WHERE id='00000000-0000-4000-8000-000000000102';
INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class)
 VALUES('a-other-map','00000000-0000-4000-8000-000000000101','a/other-map.png','shared');
COMMIT;
