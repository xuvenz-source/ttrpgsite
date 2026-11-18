-- R116 scratch-only setup, after successful R115 fixture. No Supabase access.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'world_v2_r18_114' OR current_user<>'postgres' OR inet_server_addr() IS NULL
 THEN RAISE EXCEPTION 'R116 refuses non-disposable source';END IF;
END $guard$;

-- Synthetic stand-in. NOT live source equality or cryptographically signed Auth.
CREATE FUNCTION public.is_campaign_member(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $synthetic_member$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.campaign_members m
  WHERE m.campaign_id=p_campaign AND m.user_id=auth.uid())
$synthetic_member$;
REVOKE ALL ON FUNCTION public.is_campaign_member(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_member(uuid) TO authenticated;

CREATE TABLE public.campaign_tool_item_leases(
 issue_id uuid NOT NULL REFERENCES public.campaign_tool_issues(id) ON DELETE CASCADE,
 item_id uuid NOT NULL,
 holder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(issue_id,item_id)
);
ALTER TABLE public.campaign_tool_item_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_tool_item_leases FROM PUBLIC,anon,authenticated;

-- Transform the existing R114 synthetic 'tool' rows into inventory
-- claims. This does not edit any hosted campaign.
UPDATE public.campaign_tool_issues SET
 kind='inventory',party_shared=false,
 state='{"items":[{"_inventoryId":"00000000-0000-4000-8000-000000000701","name":"P1 tool item"}]}'::jsonb
 WHERE id='00000000-0000-4000-8000-000000000801';
UPDATE public.campaign_tool_issues SET
 kind='inventory',party_shared=true,
 state='{"items":[{"_inventoryId":"00000000-0000-4000-8000-000000000702","name":"shared tool"}]}'::jsonb
 WHERE id='00000000-0000-4000-8000-000000000802';
INSERT INTO public.campaign_tool_issues(id,campaign_id,map_id,owner_id,party_shared,x,y,kind,config,state)
VALUES ('00000000-0000-4000-8000-000000000803',
 '00000000-0000-4000-8000-000000000102',
 '00000000-0000-4000-8000-000000000204',
 '00000000-0000-4000-8000-000000000304',
 false,1,1,'inventory','{}'::jsonb,
 '{"items":[{"_inventoryId":"00000000-0000-4000-8000-000000000703","name":"B item"}]}'::jsonb);

-- Make ordinary character-owned tokens clearly distinct from NPCs.
UPDATE public.map_tokens SET character_id='00000000-0000-4000-8000-000000000501'
 WHERE id IN ('00000000-0000-4000-8000-000000000401',
              '00000000-0000-4000-8000-000000000403');
UPDATE public.map_tokens SET character_id='00000000-0000-4000-8000-000000000502'
 WHERE id='00000000-0000-4000-8000-000000000402';

-- Deliberate mismatched campaign ID on a map; NPC reader must join
-- both map and campaign before exposing any values.
INSERT INTO public.map_tokens(id,map_id,campaign_id,owner_id,visible,character_id,x,y,npc_values,name)
VALUES ('00000000-0000-4000-8000-000000000406',
 '00000000-0000-4000-8000-000000000201',
 '00000000-0000-4000-8000-000000000102',
 NULL,true,NULL,9,9,'{"private":"CROSS_CAMPAIGN_SENTINEL"}'::jsonb,'mismatched fixture NPC');

DO $acl$ BEGIN
 IF has_table_privilege('authenticated','public.campaign_tool_item_leases','UPDATE')
 OR has_table_privilege('anon','public.map_tokens','SELECT') THEN
  RAISE EXCEPTION 'R116 fixture private role grants too wide';END IF;
END $acl$;
