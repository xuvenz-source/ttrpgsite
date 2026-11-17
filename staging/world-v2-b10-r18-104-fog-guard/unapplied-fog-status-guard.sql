-- B10-R18-104 — SOURCE-ONLY PRIVACY GUARD CANDIDATE, NOT A MIGRATION.
-- DO NOT APPLY to original/QA. Independent operator approval and signed QA
-- authorization tests are required. Historical SQL is not privately recovered.
--
-- Preserves public.is_map_fog_published(uuid) signature, STABLE, SECURITY DEFINER,
-- empty search_path and authenticated-only EXECUTE for the map_combats RLS policy.
--
-- Historical behavior: any authenticated user knowing a map UUID could query
-- forge_visibility.map_rules.fog_enforced across campaign boundaries.
-- Proposed behavior: only the assigned-map player or campaign DM may observe
-- fog-enabled status. Unknown, unrelated, revoked and fog-off maps return false.
-- No table, campaign membership, scene or fog rules are modified.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_map_fog_published(p_map uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $r104_authorized_fog_status$
  SELECT EXISTS (
    SELECT 1
    FROM public.battle_maps m
    JOIN forge_visibility.map_rules r
      ON r.map_id=m.id AND r.campaign_id=m.campaign_id
    WHERE m.id=p_map
      AND r.fog_enforced
      AND public.can_view_campaign_map(m.campaign_id,m.id)
  );
$r104_authorized_fog_status$;

REVOKE ALL ON FUNCTION public.is_map_fog_published(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_map_fog_published(uuid)
  TO authenticated;

COMMIT;
