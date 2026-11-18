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

-- An administrator's UPDATE of a membership's key must not bypass the INSERT
-- revocation guard. This is scratch-only and needs lock-order review before
-- any production migration. Direct role UPDATE by service_role is still a
-- privileged administration workflow requiring independent authorization.
CREATE TRIGGER v2_campaign_member_update_identity_revocation_gate
BEFORE UPDATE OF campaign_id,user_id ON public.campaign_members
FOR EACH ROW EXECUTE FUNCTION forge_security.reject_revoked_member_insertion();

COMMIT;

-- IMPORTANT REVIEW HOLD: actual hosted service_role currently has TRUNCATE
-- privilege on campaign_members. TRUNCATE bypasses row DELETE triggers.
-- No REVOKE is staged yet: determine all admin and backup workflows first.
-- An approved migration must explicitly address TRUNCATE and ownership
-- bypass, as well as all privileged membership update/delete entrypoints.
