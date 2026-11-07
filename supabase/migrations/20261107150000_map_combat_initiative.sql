-- STAGING ONLY: do not apply to the production Supabase project until
-- interactive DM/player QA and RLS review are complete.
-- Depends on map/assignment RLS and the previously deployed battle_maps keys.
-- One authoritative encounter per map, readable only by users currently
-- authorized to view that map. Private entries are never replicated.
create table if not exists public.map_combats (
 map_id uuid primary key,
 campaign_id uuid not null,
 active boolean not null default false,
 encounter_id uuid not null default gen_random_uuid(),
 round integer not null default 0 check(round between 0 and 1000000),
 current_entry_id uuid,
 initiative_field text not null default '',
 initiative_mode text not null default 'modifier'
  check(initiative_mode in ('modifier','value')),
 participants jsonb not null default '[]'::jsonb
  check(jsonb_typeof(participants)='array'),
 revision bigint not null default 0,
 updated_at timestamptz not null default now(),
 foreign key(campaign_id,map_id)
  references public.battle_maps(campaign_id,id) on delete cascade
);
create index if not exists map_combats_campaign_idx
 on public.map_combats(campaign_id);
alter table public.map_combats enable row level security;
revoke all on public.map_combats from public,anon,authenticated;
grant select on public.map_combats to authenticated;
create policy "members see current map turn tracker" on public.map_combats
 for select to authenticated
 using (public.can_view_campaign_map(campaign_id,map_id));

-- These private records are never exposed in the realtime publication.
-- Even for hidden NPCs, the shared row contains no secret token IDs/names.
create table if not exists public.map_combat_entries (
 entry_id uuid primary key default gen_random_uuid(),
 map_id uuid not null references public.map_combats(map_id) on delete cascade,
 token_id uuid not null references public.map_tokens(id) on delete cascade,
 sort_index integer not null default 0,
 score integer check(score between -999 and 1999),
 natural integer check(natural between 1 and 20),
 modifier integer check(modifier between -500 and 500),
 unique(map_id,token_id)
);
create index if not exists map_combat_entries_order_idx
 on public.map_combat_entries(map_id,sort_index,entry_id);
alter table public.map_combat_entries enable row level security;
revoke all on public.map_combat_entries from public,anon,authenticated;
grant select on public.map_combat_entries to authenticated;
create policy "only dm sees private combat token IDs" on public.map_combat_entries
 for select to authenticated
 using (exists(select 1 from public.map_combats c where c.map_id=map_combat_entries.map_id
  and public.is_campaign_dm(c.campaign_id)));

-- Public data is derived on the server. Use an opaque entry UUID rather than
-- private token IDs for hidden creatures; hide their names/roles.
create or replace function public.combat_publish(p_map uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_entries jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.entry_id,
  'token_id',case when coalesce(t.visible,false) then t.id else null end,
  'name',case when coalesce(t.visible,false)
   then left(coalesce(nullif(t.name,''),'Combatant'),80)
   else 'Unknown combatant' end,
  'kind',case when not coalesce(t.visible,false) then 'unknown'
    when t.character_id is null then 'npc' else 'character' end,
  'score',e.score
 ) order by e.sort_index,e.entry_id),'[]'::jsonb) into v_entries
 from public.map_combat_entries e
 join public.map_tokens t on t.id=e.token_id
 where e.map_id=p_map;
 update public.map_combats
 set participants=v_entries,revision=revision+1,updated_at=now()
 where map_id=p_map;
end $$;
revoke all on function public.combat_publish(uuid) from public,anon,authenticated;

create or replace function public.begin_map_combat(
 p_map uuid,p_tokens uuid[],p_field text,p_mode text default 'modifier'
) returns void language plpgsql volatile security definer set search_path='' as $$
declare
 v_campaign uuid;v_template jsonb;v_count integer;
 v_token record;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select m.campaign_id,c.sheet_template into v_campaign,v_template
 from public.battle_maps m join public.campaigns c on c.id=m.campaign_id
 where m.id=p_map;
 if v_campaign is null or not public.is_campaign_dm(v_campaign)
 then raise exception 'DM permission required';end if;
 if p_mode not in ('value','modifier') or coalesce(length(p_field),0) not between 1 and 100
 then raise exception 'Select a numeric initiative field and calculation';end if;
 if not exists(
  select 1 from jsonb_array_elements(
   case when jsonb_typeof(v_template->'tabs')='array' then v_template->'tabs'
        else '[]'::jsonb end) tab
  cross join lateral jsonb_array_elements(
   case when jsonb_typeof(tab->'fields')='array' then tab->'fields'
        else '[]'::jsonb end) f
  where f->>'id'=p_field and f->>'type' in ('number','attribute','resource')
 ) then raise exception 'Initiative field is not a numeric sheet attribute';end if;
 v_count:=coalesce(array_length(p_tokens,1),0);
 if v_count<1 or v_count>60 or
  (select count(distinct id) from unnest(p_tokens) id)<>v_count or
  (select count(*) from public.map_tokens t
   where t.id=any(p_tokens) and t.map_id=p_map and t.campaign_id=v_campaign)<>v_count
 then raise exception 'Choose between 1 and 60 unique tokens from this map';end if;
 -- Serialize simultaneous Begin Combat requests for the same map.
 perform pg_advisory_xact_lock(hashtextextended(p_map::text,17941));
 if exists(select 1 from public.map_combats where map_id=p_map and active)
 then raise exception 'End the current encounter before starting another';end if;
 insert into public.map_combats(map_id,campaign_id,active,round,initiative_field,
  initiative_mode,current_entry_id,participants)
 values(p_map,v_campaign,true,1,p_field,p_mode,null,'[]'::jsonb)
 on conflict(map_id) do update set active=true,encounter_id=gen_random_uuid(),round=1,
  initiative_field=excluded.initiative_field,initiative_mode=excluded.initiative_mode,
  current_entry_id=null,participants='[]'::jsonb,revision=public.map_combats.revision+1,
  updated_at=now();
 delete from public.map_combat_entries where map_id=p_map;
 insert into public.map_combat_entries(map_id,token_id,sort_index)
 select p_map,id,ord::integer-1
 from unnest(p_tokens) with ordinality as x(id,ord);
 perform public.combat_publish(p_map);
end $$;
revoke all on function public.begin_map_combat(uuid,uuid[],text,text) from public,anon;
grant execute on function public.begin_map_combat(uuid,uuid[],text,text) to authenticated;

create or replace function public.add_map_combat_tokens(p_map uuid,p_tokens uuid[])
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_combat public.map_combats%rowtype;v_count int;v_position int;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into v_combat from public.map_combats where map_id=p_map for update;
 if not found or not v_combat.active or not public.is_campaign_dm(v_combat.campaign_id)
 then raise exception 'Active DM encounter required';end if;
 v_count:=coalesce(array_length(p_tokens,1),0);
 if v_count<1 or v_count>60 or
  (select count(distinct id) from unnest(p_tokens) id)<>v_count or
  (select count(*) from public.map_tokens t
   where t.id=any(p_tokens) and t.campaign_id=v_combat.campaign_id
    and t.map_id=p_map)<>v_count or
  (select count(*) from public.map_combat_entries e where e.map_id=p_map)+v_count>60
 then raise exception 'Choose unique tokens on this map (maximum 60)';end if;
 select coalesce(max(sort_index)+1,0) into v_position
 from public.map_combat_entries where map_id=p_map;
 insert into public.map_combat_entries(map_id,token_id,sort_index)
 select p_map,id,v_position+ord::integer-1
 from unnest(p_tokens) with ordinality as x(id,ord)
 on conflict(map_id,token_id) do nothing;
 perform public.combat_publish(p_map);
end $$;
revoke all on function public.add_map_combat_tokens(uuid,uuid[]) from public,anon;
grant execute on function public.add_map_combat_tokens(uuid,uuid[]) to authenticated;

create or replace function public.roll_map_combat_initiative(
 p_map uuid,p_entry uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_combat public.map_combats%rowtype;
 v_entry public.map_combat_entries%rowtype;
 v_token public.map_tokens%rowtype;
 v_template jsonb;v_values jsonb:='{}'::jsonb;v_fallback jsonb;
 v_raw text;v_score numeric:=0;v_base numeric:=10;v_step numeric:=2;
 v_has_score boolean:=false;
 v_bonus integer;v_nat integer;v_total integer;v_result jsonb;
 v_is_dm boolean;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into v_combat from public.map_combats where map_id=p_map for update;
 if not found or not v_combat.active or
  not public.can_view_campaign_map(v_combat.campaign_id,p_map)
 then raise exception 'Encounter unavailable';end if;
 v_is_dm:=public.is_campaign_dm(v_combat.campaign_id);
 select * into v_entry from public.map_combat_entries
  where map_id=p_map and entry_id=p_entry for update;
 if not found then raise exception 'Combatant not in encounter';end if;
 select * into v_token from public.map_tokens where id=v_entry.token_id;
 if not found or v_token.map_id<>p_map then raise exception 'Token unavailable';end if;
 if not v_is_dm and (not coalesce(v_token.visible,false) or
  v_token.owner_id is distinct from auth.uid())
 then raise exception 'You can only roll for your visible owned token';end if;
 if v_entry.score is not null and not v_is_dm
 then raise exception 'Your initiative has already been rolled';end if;
 select sheet_template into v_template from public.campaigns
  where id=v_combat.campaign_id;
 if v_token.character_id is not null then
  select field_values into v_values from public.characters
   where id=v_token.character_id and campaign_id=v_combat.campaign_id;
  if not found then raise exception 'Character unavailable';end if;
 else
  v_values:=coalesce(v_token.npc_values,'{}'::jsonb);
  if v_values->v_combat.initiative_field is null and v_token.npc_template_id is not null then
   select field_values into v_fallback from public.npc_templates
    where id=v_token.npc_template_id and campaign_id=v_combat.campaign_id;
   v_values:=coalesce(v_fallback,'{}'::jsonb)||v_values;
  end if;
 end if;
 if jsonb_typeof(v_values)<>'object' then v_values:='{}'::jsonb;end if;
 if jsonb_typeof(v_values->v_combat.initiative_field)='object' then
  v_raw:=v_values->v_combat.initiative_field->>'current';
 else v_raw:=v_values->>v_combat.initiative_field;end if;
 if coalesce(v_raw,'')~'^[-]?[0-9]{1,5}([.][0-9]{1,3})?$'
 then v_score:=greatest(-1000,least(1000,v_raw::numeric));v_has_score:=true;end if;
 if coalesce(v_template->'modifierRules'->>'base','')~'^[0-9]{1,3}$'
 then v_base:=least(100,(v_template->'modifierRules'->>'base')::numeric);end if;
 if coalesce(v_template->'modifierRules'->>'step','')~'^[1-9][0-9]?$'
 then v_step:=least(20,(v_template->'modifierRules'->>'step')::numeric);end if;
 v_bonus:=case when v_combat.initiative_mode='modifier'
  then case when v_has_score then floor((v_score-v_base)/v_step)::integer else 0 end
  else round(v_score)::integer end;
 v_bonus:=greatest(-500,least(500,v_bonus));
 v_nat:=floor(random()*20)::integer+1;
 v_total:=v_nat+v_bonus;
 update public.map_combat_entries
 set natural=v_nat,modifier=v_bonus,score=v_total where entry_id=p_entry;
 -- Use the existing dice-chat presentation, not a client-selected number.
 v_result:=jsonb_build_object('expression','1d20'||case when v_bonus>=0 then '+' else '' end||v_bonus::text,
  'dice',jsonb_build_array(v_nat),'modifier',v_bonus,'total',v_total);
 insert into public.chat_messages(campaign_id,user_id,map_id,body,kind,result)
 values(v_combat.campaign_id,auth.uid(),p_map,
  'Initiative · '||case when coalesce(v_token.visible,false)
   then left(coalesce(nullif(v_token.name,''),'Combatant'),60)
   else 'Unknown combatant' end,
  'roll',v_result);
 -- Before the first turn, automatically rank rolled combatants while keeping
 -- unresolved entries last; the DM can re-sort manually during combat later.
 if v_combat.current_entry_id is null then
  with ranked as (
   select entry_id,row_number() over(order by score desc nulls last,sort_index,entry_id)-1 as idx
   from public.map_combat_entries where map_id=p_map
  )
  update public.map_combat_entries e set sort_index=r.idx from ranked r
   where e.entry_id=r.entry_id;
  if not exists(select 1 from public.map_combat_entries where map_id=p_map and score is null) then
   update public.map_combats set current_entry_id=(
    select entry_id from public.map_combat_entries where map_id=p_map
     order by sort_index,entry_id limit 1) where map_id=p_map;
  end if;
 end if;
 perform public.combat_publish(p_map);
 return jsonb_build_object('natural',v_nat,'bonus',v_bonus,'total',v_total);
end $$;
revoke all on function public.roll_map_combat_initiative(uuid,uuid) from public,anon;
grant execute on function public.roll_map_combat_initiative(uuid,uuid) to authenticated;

create or replace function public.roll_map_npc_initiative(p_map uuid)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare v_campaign uuid;v_entry record;v_count integer:=0;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select campaign_id into v_campaign from public.map_combats
  where map_id=p_map and active;
 if v_campaign is null or not public.is_campaign_dm(v_campaign)
 then raise exception 'DM permission required';end if;
 for v_entry in select e.entry_id
  from public.map_combat_entries e
  join public.map_tokens t on t.id=e.token_id
  where e.map_id=p_map and t.character_id is null and e.score is null
  order by e.sort_index limit 60 loop
  perform public.roll_map_combat_initiative(p_map,v_entry.entry_id);
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;
revoke all on function public.roll_map_npc_initiative(uuid) from public,anon;
grant execute on function public.roll_map_npc_initiative(uuid) to authenticated;

create or replace function public.command_map_combat(
 p_map uuid,p_action text,p_entry uuid default null,p_score integer default null
) returns void language plpgsql volatile security definer set search_path='' as $$
declare
 v_combat public.map_combats%rowtype;v_ids uuid[];v_at integer;v_len integer;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into v_combat from public.map_combats where map_id=p_map for update;
 if not found or not v_combat.active or not public.is_campaign_dm(v_combat.campaign_id)
 then raise exception 'Active DM encounter required';end if;
 if p_action='end' then
  update public.map_combats set active=false,current_entry_id=null,round=0,
   participants='[]'::jsonb,updated_at=now(),revision=revision+1 where map_id=p_map;
  return;
 elsif p_action='score' then
  if p_score is null or p_score not between -999 and 1999 then
   raise exception 'Initiative score must be between -999 and 1999';end if;
  update public.map_combat_entries set score=p_score,natural=null,modifier=null
   where map_id=p_map and entry_id=p_entry;
  if not found then raise exception 'Combatant is not in this encounter';end if;
 elsif p_action='remove' then
  delete from public.map_combat_entries where map_id=p_map and entry_id=p_entry;
  if not found then raise exception 'Combatant is not in this encounter';end if;
  if v_combat.current_entry_id=p_entry then
   update public.map_combats set current_entry_id=null where map_id=p_map;
  end if;
 elsif p_action='sort' then
  with ranked as (
   select entry_id,row_number() over(order by score desc nulls last,sort_index,entry_id)-1 as idx
   from public.map_combat_entries where map_id=p_map
  )
  update public.map_combat_entries e set sort_index=r.idx
   from ranked r where e.entry_id=r.entry_id;
 elsif p_action in ('next','previous') then
  if exists(select 1 from public.map_combat_entries
   where map_id=p_map and score is null) then
   raise exception 'Roll or set all initiative scores before advancing';end if;
  select array_agg(entry_id order by sort_index,entry_id) into v_ids
   from public.map_combat_entries where map_id=p_map;
  v_len:=coalesce(array_length(v_ids,1),0);
  if v_len=0 then raise exception 'Add combatants first';end if;
  v_at:=array_position(v_ids,v_combat.current_entry_id);
  if v_at is null then v_at:=1;
  elsif p_action='next' then
   if v_at=v_len then
    v_at:=1;
    update public.map_combats set round=least(1000000,round+1) where map_id=p_map;
   else v_at:=v_at+1;end if;
  elsif v_at=1 and v_combat.round>1 then
   v_at:=v_len;
   update public.map_combats set round=round-1 where map_id=p_map;
  elsif v_at>1 then v_at:=v_at-1;end if;
  update public.map_combats set current_entry_id=v_ids[v_at] where map_id=p_map;
 else raise exception 'Unsupported combat command';end if;
 -- A corrected score doesn't unexpectedly reshuffle active play; clicking
 -- sort explicitly restores high-to-low order.
 if p_action in ('score','remove','sort') and
   (select current_entry_id from public.map_combats where map_id=p_map) is null
   and not exists(select 1 from public.map_combat_entries
    where map_id=p_map and score is null) then
  update public.map_combats set current_entry_id=(
   select entry_id from public.map_combat_entries
   where map_id=p_map order by sort_index,entry_id limit 1)
   where map_id=p_map;
 end if;
 perform public.combat_publish(p_map);
end $$;
revoke all on function public.command_map_combat(uuid,text,uuid,integer) from public,anon;
grant execute on function public.command_map_combat(uuid,text,uuid,integer) to authenticated;

-- Keep the public roster privacy-safe when a token is hidden, renamed
-- or moved away from the encounter map. Republish in the SAME transaction.
create or replace function public.combat_sync_token_change()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 if new.map_id is distinct from old.map_id then
  delete from public.map_combat_entries e
   where e.token_id=new.id and e.map_id<>new.map_id;
  if exists(select 1 from public.map_combats c
   where c.map_id=old.map_id and c.active) then
   perform public.combat_publish(old.map_id);
  end if;
 elsif new.visible is distinct from old.visible or
  new.name is distinct from old.name then
  if exists(select 1 from public.map_combat_entries e
   where e.token_id=new.id) then
   perform public.combat_publish(new.map_id);
  end if;
 end if;
 return new;
end $$;
revoke all on function public.combat_sync_token_change() from public,anon,authenticated;
create trigger combat_sync_token_change
after update of visible,name,map_id on public.map_tokens
for each row execute function public.combat_sync_token_change();

-- On token deletion, FK cascade removes the private entry. Immediately
-- refresh the public roster, including clearing a deleted current combatant.
create or replace function public.combat_sync_deleted_entry()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from public.map_combats c
  where c.map_id=old.map_id and c.active) then
  update public.map_combats c set current_entry_id=null
   where c.map_id=old.map_id and c.current_entry_id=old.entry_id;
  perform public.combat_publish(old.map_id);
 end if;
 return old;
end $$;
revoke all on function public.combat_sync_deleted_entry() from public,anon,authenticated;
create trigger combat_sync_deleted_entry
after delete on public.map_combat_entries
for each row execute function public.combat_sync_deleted_entry();

-- Subscribers see only sanitized public rows after Postgres RLS filtering.
alter publication supabase_realtime add table public.map_combats;
-- Deliberately NEVER publish public.map_combat_entries.
