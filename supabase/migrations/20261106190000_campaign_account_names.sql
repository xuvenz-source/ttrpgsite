-- Staged batch: safe public account display names for members of a shared campaign.
-- Auth signup already records a username in auth.users.raw_user_meta_data.
-- Never expose auth email, password, or arbitrary private metadata.
create or replace function public.get_campaign_account_names(p_campaign uuid)
returns table(user_id uuid, account_name text)
language sql stable security definer set search_path=''
as $$
 select cm.user_id,
  left(coalesce(
   nullif(btrim(u.raw_user_meta_data->>'username'),''),
   nullif(btrim(u.raw_user_meta_data->>'display_name'),''),
   'Player '||left(cm.user_id::text,8)
  ),80)
 from public.campaign_members cm
 join auth.users u on u.id=cm.user_id
 where cm.campaign_id=p_campaign and auth.uid() is not null
   and public.is_campaign_member(p_campaign);
$$;
revoke all on function public.get_campaign_account_names(uuid) from public,anon;
grant execute on function public.get_campaign_account_names(uuid) to authenticated;
