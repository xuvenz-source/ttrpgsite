-- STAGED ONLY: atomically move the entire party, including players with
-- private map overrides. DMs may still assign individuals separately afterwards.
create or replace function public.move_entire_party_to_map(p_campaign uuid,p_map uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_campaign_dm(p_campaign) then
  raise exception 'Only the campaign DM can move the party';
 end if;
 if p_map is null or not exists (
  select 1 from public.battle_maps m
   where m.id=p_map and m.campaign_id=p_campaign
 ) then
  raise exception 'Choose a map in this campaign';
 end if;
 update public.campaigns c set active_map_id=p_map
  where c.id=p_campaign;
 if not found then raise exception 'Campaign not found';end if;
 -- Overrides are part of the DM's explicit move-all operation, not ordinary
 -- publication of the shared party default.
 delete from public.campaign_player_maps a where a.campaign_id=p_campaign;
end $$;
revoke all on function public.move_entire_party_to_map(uuid,uuid) from public,anon;
grant execute on function public.move_entire_party_to_map(uuid,uuid) to authenticated;
