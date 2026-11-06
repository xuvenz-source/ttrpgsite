-- STAGED ONLY. The shared NPC trigger must never dereference a column that
-- does not exist in the table firing it. npc_templates uses folder_id,
-- whereas npc_folders uses parent_id.
create or replace function public.validate_npc_structure()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.campaign_id is distinct from old.campaign_id then
  raise exception 'NPC cannot change campaigns';
 end if;
 if tg_table_name='npc_templates' then
  if new.folder_id is not null and not exists(
   select 1 from public.npc_folders f
    where f.id=new.folder_id and f.campaign_id=new.campaign_id
  ) then
   raise exception 'NPC folder must belong to campaign';
  end if;
 elsif tg_table_name='npc_folders' then
  if new.parent_id is not null and (
    new.parent_id=new.id or not exists(
     select 1 from public.npc_folders f
      where f.id=new.parent_id and f.campaign_id=new.campaign_id
    )
  ) then
   raise exception 'Invalid NPC parent folder';
  end if;
 end if;
 return new;
end $$;
-- Trigger function not a public RPC.
revoke all on function public.validate_npc_structure() from public,anon,authenticated;
