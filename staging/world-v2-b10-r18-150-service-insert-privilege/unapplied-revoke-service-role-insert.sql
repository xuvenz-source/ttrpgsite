-- R18-150 DISPOSABLE PG17 SECURITY EXPERIMENT. NOT AN APPLIED MIGRATION.
-- Requires synthetic R120/R122/R148 and original-like service_role table grants.
-- DB privileges (unlike RLS) restrict direct service_role table INSERT;
-- existing trusted postgres-owned SECURITY DEFINER join/create can still insert.
BEGIN;
REVOKE INSERT ON TABLE public.campaign_members FROM service_role;
COMMIT;
-- WARNING: privileged maintenance integration paths remain unknown. Never
-- deploy without 83-private-migration and admin writer audit, signed QA,
-- R127 human release approval. Owners can alter grants; service_role remains
-- a trusted server key that must NEVER be sent to the browser.
