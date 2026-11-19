-- B10-R18-129 UNAPPLIED SOURCE-ONLY security candidate.
-- Based on read-only ORIGINAL pg_get_functiondef for public.is_map_fog_published(uuid).
-- NEVER apply directly to the original or empty hosted QA project.
-- This is an authorization repair to a BOOL metadata oracle, NOT a live
-- maintenance fence, not permission to deploy and not a general fog rewrite.
BEGIN;
CREATE OR REPLACE FUNCTION public.is_map_fog_published(p_map uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path=''
AS $authorized$
 SELECT auth.uid() IS NOT NULL
   AND p_map IS NOT NULL
   AND EXISTS (
      SELECT 1 FROM public.battle_maps bm
      WHERE bm.id=p_map
        AND public.can_view_campaign_map(bm.campaign_id,bm.id)
   )
   AND EXISTS (
      SELECT 1 FROM forge_visibility.map_rules r
      WHERE r.map_id=p_map AND r.fog_enforced
   );
$authorized$;
-- This CREATE OR REPLACE preserves the existing function signature/ACLs.
-- No grants added. No RLS policy, old stream, token hot path or migration edit.
COMMIT;
