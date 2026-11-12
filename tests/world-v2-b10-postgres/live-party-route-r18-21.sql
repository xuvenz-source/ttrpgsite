-- R18-21: Exact read-only pg_get_functiondef of LIVE party-routing RPC.
-- MD5: 2e7de20ead8eb0dd156fe4e6f2f08bb7
-- SOURCE-REAL REPLAY ONLY IN DISPOSABLE POSTGRESQL 17. NOT A MIGRATION.
-- No live mutation performed. Do not deploy this test snapshot as SQL.
CREATE OR REPLACE FUNCTION public.move_entire_party_to_map(p_campaign uuid, p_map uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;
