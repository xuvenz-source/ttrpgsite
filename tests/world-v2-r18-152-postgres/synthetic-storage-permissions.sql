-- B10-R18-152: fictional PG17-only storage authorization model, NOT real storage.objects!
-- Does not recreate the private SQL of the original 83 migrations.
-- The model explicitly binds canonical campaign_id to the requested object.
-- The unsafe OR negative control is staged in the runner, not this fixture.
BEGIN;
CREATE SCHEMA forge_test;
REVOKE ALL ON SCHEMA forge_test FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA forge_test TO authenticated;

CREATE FUNCTION public.synthetic_is_campaign_member(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.campaign_members AS m
  WHERE m.campaign_id=p_campaign AND m.user_id=auth.uid()
 )
$fn$;
CREATE FUNCTION public.synthetic_is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.campaign_members AS m
  WHERE m.campaign_id=p_campaign AND m.user_id=auth.uid() AND m.role='dm'
 )
$fn$;
REVOKE ALL ON FUNCTION public.synthetic_is_campaign_member(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.synthetic_is_campaign_dm(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_is_campaign_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_is_campaign_dm(uuid) TO authenticated;

CREATE TABLE forge_test.file_objects (
 object_id text PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
 object_path text NOT NULL,
 access_class text NOT NULL CHECK (access_class IN ('shared','dm')),
 body_marker text NOT NULL DEFAULT 'fictional-only'
);
ALTER TABLE forge_test.file_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_test.file_objects FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON forge_test.file_objects TO authenticated;

-- Synthetic policies intentionally do not assert parity with historical
-- private R111 SQL. Every clause is bound to the SAME object's campaign_id.
CREATE POLICY r152_read_campaign_file ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (
   (access_class='shared' AND public.synthetic_is_campaign_member(campaign_id))
   OR (access_class='dm' AND public.synthetic_is_campaign_dm(campaign_id))
 );
CREATE POLICY r152_insert_campaign_file ON forge_test.file_objects
 FOR INSERT TO authenticated
 WITH CHECK (public.synthetic_is_campaign_dm(campaign_id));
CREATE POLICY r152_delete_campaign_file ON forge_test.file_objects
 FOR DELETE TO authenticated
 USING (public.synthetic_is_campaign_dm(campaign_id));

INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class) VALUES
 ('a-shared','00000000-0000-4000-8000-000000000101','a/shared-map.png','shared'),
 ('a-dm','00000000-0000-4000-8000-000000000101','a/private-dm.png','dm'),
 ('b-shared','00000000-0000-4000-8000-000000000102','b/shared-map.png','shared'),
 ('b-dm','00000000-0000-4000-8000-000000000102','b/private-dm.png','dm');

-- A model of bearer tokens only. The actual Supabase CDN signing logic is
-- NOT represented. Intentionally shows that no automatic membership check
-- happens in a previously issued bearer URL verification path.
CREATE TABLE forge_test.fictional_signed_bearers (
 token text PRIMARY KEY,
 object_id text NOT NULL REFERENCES forge_test.file_objects(object_id),
 expires_at timestamptz NOT NULL
);
INSERT INTO forge_test.fictional_signed_bearers(token,object_id,expires_at)
 VALUES ('R152-TEST-TOKEN-NOT-REAL','a-shared',now()+interval '1 hour');
CREATE FUNCTION public.synthetic_preissued_bearer_valid(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS (
  SELECT 1 FROM forge_test.fictional_signed_bearers AS l
  WHERE l.token=p_token AND l.expires_at>now()
 )
$fn$;
REVOKE ALL ON FUNCTION public.synthetic_preissued_bearer_valid(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_preissued_bearer_valid(text) TO anon,authenticated;
COMMIT;
