-- B10-R18-173 disposable PostgreSQL17 experiment only. NOT a migration.
-- Depends on R120 tombstone prototype and synthetic auth.users FK fixture.
-- Never apply this candidate to original or QA Supabase.
BEGIN;
ALTER TABLE forge_security.campaign_member_revocations
  ADD CONSTRAINT r173_deleted_auth_user_cleanup_fk
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION forge_security.stamp_campaign_member_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r173$
BEGIN
  -- Skip cascade under deleted parent campaign.
  PERFORM 1 FROM public.campaigns AS c
    WHERE c.id=OLD.campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  -- During auth.users ON DELETE CASCADE, the identity is already absent.
  -- Only a real existing Auth identity may receive an active revocation.
  -- The new FK separately removes pre-existing tombstones on Auth deletion.
  IF NOT EXISTS(SELECT 1 FROM auth.users AS u WHERE u.id=OLD.user_id) THEN
    RETURN OLD;
  END IF;

  INSERT INTO forge_security.campaign_member_revocations(campaign_id,user_id,removed_at)
    VALUES(OLD.campaign_id,OLD.user_id,pg_catalog.now())
    ON CONFLICT(campaign_id,user_id)
      DO UPDATE SET removed_at=EXCLUDED.removed_at;
  RETURN OLD;
END
$r173$;
REVOKE ALL ON FUNCTION forge_security.stamp_campaign_member_deletion()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
