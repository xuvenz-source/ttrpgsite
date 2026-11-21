-- B10-R18-148: exclusively disposable PG17; NOT a migration or hosted patch.
-- Requires synthetic R120/R121 tombstone and R122 identity-key guard candidates.
BEGIN;
-- Row DELETE triggers never fire on TRUNCATE. Statement rejection adds defense
-- in depth but a database table OWNER can ALTER/DISABLE a trigger.
CREATE FUNCTION forge_security.reject_campaign_members_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $reject$
BEGIN
  RAISE EXCEPTION 'R148 membership TRUNCATE forbidden' USING ERRCODE='42501';
END
$reject$;
REVOKE ALL ON FUNCTION forge_security.reject_campaign_members_truncate()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER r148_campaign_members_no_truncate
 BEFORE TRUNCATE ON public.campaign_members
 FOR EACH STATEMENT EXECUTE FUNCTION forge_security.reject_campaign_members_truncate();

-- Primary least-privilege boundary: review grant inheritance and all legitimate
-- administrator jobs before ever considering a forward-only migration.
REVOKE TRUNCATE ON public.campaign_members FROM PUBLIC,anon,authenticated,service_role;

-- R122 prevents changing campaign/user keys; role-only UPDATE remains distinct.
-- Block all actual role changes pending separate authorized DM transfer contract.
CREATE FUNCTION forge_security.reject_campaign_member_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $reject$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'R148 direct membership role change forbidden'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$reject$;
REVOKE ALL ON FUNCTION forge_security.reject_campaign_member_role_change()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER r148_campaign_member_role_immutable
 BEFORE UPDATE OF role ON public.campaign_members
 FOR EACH ROW EXECUTE FUNCTION forge_security.reject_campaign_member_role_change();
COMMIT;
-- REMAINING GAP: privileged INSERT of never-revoked account directly as DM
-- still succeeds on the R120 model and must be separately addressed.
