-- B10-R18-195 — SCRATCH-ONLY, UNAPPLIED member TRUNCATE denial candidate.
-- NOT A MIGRATION; never run against hosted original, QA or production.
-- Requires the R120/121 audited synthetic revocation prototype and service_role.
-- Privileged original project: service_role still effectively TRUNCATE-capable.
-- PostgreSQL TRUNCATE does not invoke ON DELETE row triggers or obey RLS.
-- This intentionally fails closed; any future authorized mass removal requires
-- a separately reviewed per-row DELETE/revocation transaction.
BEGIN;

-- Least privilege: keep normal service operations, remove only TRUNCATE.
REVOKE TRUNCATE ON TABLE public.campaign_members FROM service_role;

-- Defense in depth if the table owner or a later admin inadvertently grants
-- TRUNCATE again. An explicit PostgreSQL superuser can disable triggers;
-- this guard is NOT a guarantee against deliberate database-administrator acts.
CREATE FUNCTION forge_security.reject_campaign_members_truncate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $r195_reject_truncate$
BEGIN
  RAISE EXCEPTION 'Campaign membership bulk truncate is prohibited'
    USING ERRCODE='42501';
  RETURN NULL;
END
$r195_reject_truncate$;

REVOKE ALL ON FUNCTION forge_security.reject_campaign_members_truncate()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER v2_campaign_members_no_truncate
BEFORE TRUNCATE ON public.campaign_members
FOR EACH STATEMENT
EXECUTE FUNCTION forge_security.reject_campaign_members_truncate();

COMMIT;
