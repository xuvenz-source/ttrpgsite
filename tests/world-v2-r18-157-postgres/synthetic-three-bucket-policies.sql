-- R18-157 fictional PG17 only. No original/storage.objects SQL.
-- Uses fake buckets to model independent PERMISSIVE SELECT policies.
BEGIN;
ALTER TABLE forge_test.file_objects
 ADD COLUMN bucket_id text NOT NULL DEFAULT 'MAPS',
 ADD COLUMN owner_id uuid,
 ADD CONSTRAINT r157_fake_bucket_check CHECK (bucket_id IN ('MAPS','TOKENS','USER'));

CREATE TABLE forge_test.synthetic_tokens (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 map_id uuid NOT NULL REFERENCES forge_test.visible_maps(id),
 image_path text NOT NULL UNIQUE,
 owner_id uuid NOT NULL,
 visible boolean NOT NULL
);
CREATE TABLE forge_test.synthetic_token_sight (
 token_id uuid NOT NULL REFERENCES forge_test.synthetic_tokens(id),
 user_id uuid NOT NULL,
 can_see boolean NOT NULL,
 PRIMARY KEY (token_id,user_id)
);
ALTER TABLE forge_test.synthetic_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_test.synthetic_token_sight ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_test.synthetic_tokens,forge_test.synthetic_token_sight
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON forge_test.synthetic_tokens TO authenticated;

CREATE FUNCTION public.synthetic_can_observe_map_token(p_token uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
 t record;
 actor uuid := auth.uid();
BEGIN
 IF actor IS NULL THEN RETURN false; END IF;
 SELECT * INTO t FROM forge_test.synthetic_tokens WHERE id=p_token;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM forge_test.visible_maps vm
   WHERE vm.id=t.map_id AND vm.campaign_id=t.campaign_id
 ) THEN RETURN false; END IF;
 IF NOT public.synthetic_can_view_campaign_map(t.campaign_id,t.map_id)
 THEN RETURN false; END IF;
 IF public.synthetic_is_campaign_dm(t.campaign_id) THEN RETURN true; END IF;
 IF NOT t.visible THEN RETURN false; END IF;
 IF t.owner_id=actor THEN RETURN true; END IF;
 RETURN EXISTS(
  SELECT 1 FROM forge_test.synthetic_token_sight s
   WHERE s.token_id=t.id AND s.user_id=actor AND s.can_see
 );
END
$body$;
REVOKE ALL ON FUNCTION public.synthetic_can_observe_map_token(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_can_observe_map_token(uuid) TO authenticated;
CREATE POLICY r157_token_observer_view ON forge_test.synthetic_tokens
 FOR SELECT TO authenticated
 USING (public.synthetic_can_observe_map_token(id));

-- Three independent, PERMISSIVE SELECT policies with distinct bucket
-- predicates that cannot authorize objects belonging to the other buckets.
DROP POLICY r156_storage_map_view ON forge_test.file_objects;
CREATE POLICY r157_maps_select ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (
  bucket_id='MAPS' AND EXISTS (
   SELECT 1 FROM forge_test.visible_maps vm
   WHERE vm.storage_path=forge_test.file_objects.object_path
     AND vm.campaign_id=forge_test.file_objects.campaign_id
     AND public.synthetic_can_view_campaign_map(vm.campaign_id,vm.id)
  )
 );
CREATE POLICY r157_tokens_select ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (
  bucket_id='TOKENS' AND EXISTS (
   SELECT 1 FROM public.campaigns c
   WHERE c.id=forge_test.file_objects.campaign_id
     AND c.id::text=split_part(forge_test.file_objects.object_path,'/',1)
     AND public.synthetic_is_campaign_member(c.id)
     AND (
      public.synthetic_is_campaign_dm(c.id)
      OR forge_test.file_objects.owner_id=auth.uid()
      OR EXISTS (
       SELECT 1 FROM forge_test.synthetic_tokens t
       WHERE t.campaign_id=c.id
         AND t.image_path=forge_test.file_objects.object_path
         AND public.synthetic_can_observe_map_token(t.id)
      )
     )
  )
 );
CREATE POLICY r157_personal_select ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (
  bucket_id='USER'
  AND split_part(object_path,'/',1)=auth.uid()::text
  AND owner_id=auth.uid()
 );

INSERT INTO forge_test.synthetic_tokens
 (id,campaign_id,map_id,image_path,owner_id,visible) VALUES
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000101/hidden.png','00000000-0000-4000-8000-000000000301',false),
 ('00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000101/visible.png','00000000-0000-4000-8000-000000000301',true),
 ('00000000-0000-4000-8000-000000000503','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000403','00000000-0000-4000-8000-000000000102/visible.png','00000000-0000-4000-8000-000000000304',true);

INSERT INTO forge_test.synthetic_token_sight(token_id,user_id,can_see) VALUES
 ('00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000302',true),
 ('00000000-0000-4000-8000-000000000503','00000000-0000-4000-8000-000000000306',true);

INSERT INTO forge_test.file_objects
 (object_id,campaign_id,object_path,access_class,bucket_id,owner_id) VALUES
 ('a-owned-portrait','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101/portrait.png','shared','TOKENS','00000000-0000-4000-8000-000000000302'),
 ('a-hidden-token','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101/hidden.png','shared','TOKENS','00000000-0000-4000-8000-000000000301'),
 ('a-visible-token','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101/visible.png','shared','TOKENS','00000000-0000-4000-8000-000000000301'),
 ('b-visible-token','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102/visible.png','shared','TOKENS','00000000-0000-4000-8000-000000000304'),
 ('a-personal-avatar','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302/avatar.png','shared','USER','00000000-0000-4000-8000-000000000302'),
 ('b-personal-avatar','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000306/avatar.png','shared','USER','00000000-0000-4000-8000-000000000306');
COMMIT;
