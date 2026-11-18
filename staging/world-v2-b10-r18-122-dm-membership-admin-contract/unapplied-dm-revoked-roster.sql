-- B10-R18-122 UNAPPLIED SCRATCH-ONLY candidate, NOT a versioned migration.
-- Requires R18-120/121 corrected unapplied prototype and synthetic PG17 schema.
-- Never run against original or QA Supabase without separate audited approval.
--
-- A DM needs a server-authorized list of revoked player IDs because removed
-- players are absent from public.campaign_members. Never expose ledger SELECT.
-- No email, account metadata, invite, campaign name or third-party details.
BEGIN;

CREATE FUNCTION public.dm_list_removed_campaign_players(p_campaign uuid)
RETURNS TABLE(user_id uuid,removed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL OR p_campaign IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.campaign_members AS m
    WHERE m.campaign_id=p_campaign AND m.user_id=actor AND m.role='dm'
  ) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT r.user_id,r.removed_at
    FROM forge_security.campaign_member_revocations AS r
    WHERE r.campaign_id=p_campaign
    ORDER BY r.removed_at DESC,r.user_id
    LIMIT 100;
END
$body$;
REVOKE ALL ON FUNCTION public.dm_list_removed_campaign_players(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dm_list_removed_campaign_players(uuid)
  TO authenticated;

-- Raw membership identity reassignment is a removal of OLD's access
-- without a row DELETE. If allowed, it bypasses the OLD account's tombstone
-- even when NEW is not revoked. Fail closed on *all* key changes; privileged
-- migration of player identity needs a separately audited transaction.
-- Role-only UPDATE remains an independent privileged service-role risk.
CREATE FUNCTION forge_security.reject_campaign_member_identity_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $identity$
BEGIN
 IF OLD.campaign_id IS DISTINCT FROM NEW.campaign_id OR
    OLD.user_id IS DISTINCT FROM NEW.user_id THEN
   RAISE EXCEPTION 'Membership identity immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END
$identity$;
REVOKE ALL ON FUNCTION forge_security.reject_campaign_member_identity_update()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER v2_campaign_member_update_identity_revocation_gate
BEFORE UPDATE OF campaign_id,user_id ON public.campaign_members
FOR EACH ROW EXECUTE FUNCTION forge_security.reject_campaign_member_identity_update();

COMMIT;

-- IMPORTANT REVIEW HOLD: actual hosted service_role currently has TRUNCATE
-- privilege on campaign_members. TRUNCATE bypasses row DELETE triggers.
-- No REVOKE is staged yet: determine all admin and backup workflows first.
-- An approved migration must explicitly address TRUNCATE and ownership
-- bypass, as well as all privileged membership update/delete entrypoints.
