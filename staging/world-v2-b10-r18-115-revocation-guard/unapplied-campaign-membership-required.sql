-- B10-R18-115 SOURCE-ONLY SECURITY CANDIDATE. DO NOT APPLY TO ORIGINAL OR QA.
-- Existing live helper: public.can_edit_campaign_sheet(uuid,text,uuid).
-- Original pg_proc MD5 5a8fed2bdc8427c884f89440c0eebe03 / 790 bytes.
-- Single semantic change: require current actor membership in requested campaign
-- even if the character ownership field still refers to a removed player.
-- This is a scratch PostgreSQL17 demonstration, not a reviewed migration.
-- Do not restore the prior source as rollback; it permits revoked-owner access.
BEGIN;
create or replace function public.can_edit_campaign_sheet(
 p_campaign uuid,p_source text,p_source_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $acl$
declare actor uuid;
begin
 actor:=auth.uid();
 if actor is null or p_campaign is null or p_source_id is null
  or not exists(
   select 1 from public.campaign_members m
   where m.campaign_id=p_campaign and m.user_id=actor)
 then return false;end if;
 if p_source='character' then
  return exists(select 1 from public.characters c
   where c.id=p_source_id and c.campaign_id=p_campaign
    and (c.user_id=actor or public.is_campaign_dm(p_campaign)));
 elsif p_source='npc_template' then
  return public.is_campaign_dm(p_campaign) and exists(
   select 1 from public.npc_templates n where n.id=p_source_id
    and n.campaign_id=p_campaign);
 elsif p_source='npc_token' then
  return public.is_campaign_dm(p_campaign) and exists(
   select 1 from public.map_tokens t where t.id=p_source_id
    and t.campaign_id=p_campaign and t.character_id is null
    and t.owner_id is null);
 end if;
 return false;
end $acl$;
REVOKE ALL ON FUNCTION public.can_edit_campaign_sheet(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
