-- R18-158 fictional PG17 Storage write access only, not original SQL.
BEGIN;
DROP POLICY r152_insert_campaign_file ON forge_test.file_objects;
DROP POLICY r152_delete_campaign_file ON forge_test.file_objects;

-- The R152 synthetic base lacked UPDATE grant. Grant only on this disposable
-- table so the absence of UPDATE RLS can be separately verified.
GRANT UPDATE ON forge_test.file_objects TO authenticated;

-- Fictional map file writes: current DM of the same campaign, canonical path.
CREATE POLICY r158_map_insert ON forge_test.file_objects
 FOR INSERT TO authenticated
 WITH CHECK (
  bucket_id='MAPS'
  AND split_part(object_path,'/',1)=campaign_id::text
  AND public.synthetic_is_campaign_dm(campaign_id)
 );
CREATE POLICY r158_map_delete ON forge_test.file_objects
 FOR DELETE TO authenticated
 USING (
  bucket_id='MAPS'
  AND split_part(object_path,'/',1)=campaign_id::text
  AND public.synthetic_is_campaign_dm(campaign_id)
 );

-- Fictional personal account files: strictly own folder and owner identity.
CREATE POLICY r158_personal_insert ON forge_test.file_objects
 FOR INSERT TO authenticated
 WITH CHECK (
  bucket_id='USER'
  AND split_part(object_path,'/',1)=auth.uid()::text
  AND owner_id=auth.uid()
 );
CREATE POLICY r158_personal_delete ON forge_test.file_objects
 FOR DELETE TO authenticated
 USING (
  bucket_id='USER'
  AND split_part(object_path,'/',1)=auth.uid()::text
  AND owner_id=auth.uid()
 );

-- Fictional campaign assets: authenticated member writing own portrait
-- namespace, or campaign DM writing the DM namespace. No DELETE policy.
CREATE POLICY r158_token_insert ON forge_test.file_objects
 FOR INSERT TO authenticated
 WITH CHECK (
  bucket_id='TOKENS'
  AND split_part(object_path,'/',1)=campaign_id::text
  AND public.synthetic_is_campaign_member(campaign_id)
  AND (
   (split_part(object_path,'/',2)='player'
     AND split_part(object_path,'/',3)=auth.uid()::text)
   OR
   (split_part(object_path,'/',2)='dm'
     AND public.synthetic_is_campaign_dm(campaign_id))
  )
 );
-- There is deliberately NO UPDATE policy and NO campaign-token DELETE policy.
COMMIT;
