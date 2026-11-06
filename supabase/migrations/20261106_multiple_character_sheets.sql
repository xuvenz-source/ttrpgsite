-- STAGED ONLY. Apply after other November 6 migrations, before releasing frontend.
alter table public.characters drop constraint if exists characters_campaign_id_user_id_key;
create policy "members create their own character sheets" on public.characters
for insert to authenticated
with check (user_id=(select auth.uid()) AND public.is_campaign_member(campaign_id));

-- Joining creates an initial sheet only when the member has no existing sheets.
create or replace function public.join_campaign(p_invite_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 if p_invite_code !~ '^[0-9a-f]{16}$' then raise exception 'Invalid invite code';end if;
 select id into c from public.campaigns where invite_code=lower(trim(p_invite_code));
 if c is null then raise exception 'Invite link not found';end if;
 insert into public.campaign_members(campaign_id,user_id,role)
 values(c,auth.uid(),'player') on conflict do nothing;
 perform 1 from public.campaign_members
 where campaign_id=c and user_id=auth.uid() for update;
 if not exists(select 1 from public.characters where campaign_id=c and user_id=auth.uid()) then
  insert into public.characters(campaign_id,user_id) values(c,auth.uid());
 end if;
 return c;
end $$;
revoke all on function public.join_campaign(text) from public,anon;
grant execute on function public.join_campaign(text) to authenticated;
