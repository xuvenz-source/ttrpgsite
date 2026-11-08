-- Restore DM token loading without granting access to private npc_values.
-- The client reads only column-granted public map-token fields; this is the
-- only new map-wide NPC read and is restricted to the campaign DM.
CREATE OR REPLACE FUNCTION public.get_dm_map_npc_values(p_map uuid)
RETURNS TABLE(token_id uuid, npc_values jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT t.id,coalesce(t.npc_values,'{}'::jsonb)
 FROM public.map_tokens t
 JOIN public.battle_maps m ON m.id=t.map_id AND m.campaign_id=t.campaign_id
 WHERE t.map_id=p_map
   AND t.character_id IS NULL
   AND public.is_campaign_dm(m.campaign_id)
 ORDER BY t.id;
$function$;

REVOKE ALL ON FUNCTION public.get_dm_map_npc_values(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_dm_map_npc_values(uuid)
 TO authenticated,service_role;

-- Deliberately no GRANT SELECT ON TABLE public.map_tokens:
-- players may select only granted safe columns, subject to observed-token RLS.
