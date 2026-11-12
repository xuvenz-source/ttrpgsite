-- B10-R18-20 PRE-RELEASE CAMPAIGN AFFINITY CANDIDATE. NOT A MIGRATION.
-- DO NOT APPLY TO LIVE. This is an isolated PG17 staging candidate only.
-- R18-19 direct tool map-movement guard and R18-17 0.10 wall geometry
-- are separate NONAPPLIED candidates and must stay independently gated.
--
-- Live source-read confirms:
-- * validate_campaign_tool_write already blocks tool campaign_id changes.
-- * validate_token_map already verifies token/map campaign agreement.
-- * battle_maps has no BEFORE UPDATE of campaign_id guard.
-- * a DM in two campaigns could otherwise reparent a map or a token+map
--   coherently; reject identity reassignment, not legitimate map movement.
--
-- No new Data API function, RLS policy, table, constraint, index, or grant.
CREATE OR REPLACE FUNCTION forge_visibility.guard_campaign_affinity_r18_20()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r18_20$
BEGIN
 IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
  -- Match the existing maintenance path used by collision guards: service
  -- work has NO user identity and a verified service_role claim.
  IF auth.uid() IS NULL AND
    current_setting('request.jwt.claim.role',true)='service_role'
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Campaign identity cannot change via direct UPDATE';
 END IF;
 RETURN NEW;
END $r18_20$;

REVOKE ALL ON FUNCTION forge_visibility.guard_campaign_affinity_r18_20()
 FROM PUBLIC,anon,authenticated;

CREATE TRIGGER forge_map_campaign_affinity_r18_20
 BEFORE UPDATE OF campaign_id ON public.battle_maps
 FOR EACH ROW
 EXECUTE FUNCTION forge_visibility.guard_campaign_affinity_r18_20();

CREATE TRIGGER forge_token_campaign_affinity_r18_20
 BEFORE UPDATE OF campaign_id ON public.map_tokens
 FOR EACH ROW
 EXECUTE FUNCTION forge_visibility.guard_campaign_affinity_r18_20();

-- No trigger added to campaign_tool_issues: its source-real existing
-- validate_campaign_tool_write rejects changed campaign_id on ALL UPDATEs.
