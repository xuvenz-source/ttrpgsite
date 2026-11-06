-- Staged macro designer. Apply after 20261106_spellcasting.sql, before the frontend release.
-- Users own their campaign macros; execution always reads saved definitions and server-side source data.
create or replace function public.valid_tabletop_macro_rows(p_rows jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 v_row jsonb;v_cell jsonb;v_rows int:=0;v_rolls int:=0;v_id text;
 v_ids text[]:=array[]::text[];
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1
    or jsonb_array_length(p_rows)>12 then return false; end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  v_rows:=v_rows+1;
  if jsonb_typeof(v_row)<>'object' or
     (v_row-'id'-'label'-'cells')<>'{}'::jsonb or
     coalesce(v_row->>'id','') !~ '^[a-zA-Z0-9_-]{1,50}$' or
     v_row->>'id'=any(v_ids) or
     length(btrim(coalesce(v_row->>'label','')))<1 or
     length(v_row->>'label')>36 or
     jsonb_typeof(v_row->'cells')<>'array' or
     jsonb_array_length(v_row->'cells')<1 or
     jsonb_array_length(v_row->'cells')>3 then return false; end if;
  v_ids:=array_append(v_ids,v_row->>'id');
  for v_cell in select value from jsonb_array_elements(v_row->'cells') loop
   if jsonb_typeof(v_cell)<>'object' or
      length(coalesce(v_cell->>'label',''))>24 then return false; end if;
   if v_cell->>'kind'='roll' then
    v_rolls:=v_rolls+1;
    if (v_cell-'id'-'kind'-'label'-'formula')<>'{}'::jsonb
       or coalesce(v_cell->>'id','') !~ '^[a-zA-Z0-9_-]{1,50}$'
       or length(btrim(coalesce(v_cell->>'formula','')))<1
       or length(v_cell->>'formula')>120 then return false;end if;
   elsif v_cell->>'kind'='text' then
    if (v_cell-'id'-'kind'-'label'-'text')<>'{}'::jsonb or
       coalesce(v_cell->>'id','') !~ '^[a-zA-Z0-9_-]{1,50}$'
       or length(coalesce(v_cell->>'text',''))>90 then return false;end if;
   else return false;end if;
  end loop;
 end loop;
 return v_rolls>0 and v_rolls<=18;
end $$;

create table if not exists public.tabletop_macros (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 subtitle text not null default '' check(length(subtitle)<=100),
 source_type text not null default 'none'
   check(source_type in ('none','character','npc_token','npc_template')),
 source_id uuid,
 rows jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint tabletop_macro_source check((source_type='none')=(source_id is null)),
 constraint tabletop_macro_rows_valid check(public.valid_tabletop_macro_rows(rows))
);
create index if not exists tabletop_macros_owner_campaign_idx
 on public.tabletop_macros(user_id,campaign_id,updated_at desc);
alter table public.tabletop_macros enable row level security;
drop policy if exists "owner reads campaign macros" on public.tabletop_macros;
create policy "owner reads campaign macros" on public.tabletop_macros for select to authenticated
 using (user_id=auth.uid() and public.is_campaign_member(campaign_id));
drop policy if exists "owner creates campaign macros" on public.tabletop_macros;
create policy "owner creates campaign macros" on public.tabletop_macros for insert to authenticated
 with check (user_id=auth.uid() and public.is_campaign_member(campaign_id));
drop policy if exists "owner edits campaign macros" on public.tabletop_macros;
create policy "owner edits campaign macros" on public.tabletop_macros for update to authenticated
 using (user_id=auth.uid() and public.is_campaign_member(campaign_id))
 with check (user_id=auth.uid() and public.is_campaign_member(campaign_id));
drop policy if exists "owner removes campaign macros" on public.tabletop_macros;
create policy "owner removes campaign macros" on public.tabletop_macros for delete to authenticated
 using (user_id=auth.uid() and public.is_campaign_member(campaign_id));
revoke all on public.tabletop_macros from anon;
grant select,insert,update,delete on public.tabletop_macros to authenticated;
-- Ensure a new kind of chat item is allowed, preserving existing text/roll/spell kinds.
alter table public.chat_messages drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
 check(kind in ('text','roll','spell','macro'));

create or replace function public.run_tabletop_macro(p_macro_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
 v_macro public.tabletop_macros%rowtype;
 v_sheet jsonb:='{}'::jsonb;v_rows jsonb:='[]'::jsonb;
 v_row jsonb;v_cell jsonb;v_cells jsonb;v_result jsonb;v_rolls int:=0;
 v_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to run a macro';end if;
 select * into v_macro from public.tabletop_macros where id=p_macro_id;
 if not found or v_macro.user_id is distinct from auth.uid() or
    not public.is_campaign_member(v_macro.campaign_id)
 then raise exception 'Macro not found';end if;
 if not public.valid_tabletop_macro_rows(v_macro.rows)
 then raise exception 'Macro definition is invalid';end if;
 if v_macro.source_type='character' then
  select ch.field_values into v_sheet from public.characters ch
   where ch.id=v_macro.source_id and ch.campaign_id=v_macro.campaign_id
    and (ch.user_id=auth.uid() or public.is_campaign_dm(v_macro.campaign_id));
  if not found then raise exception 'You cannot use this character';end if;
 elsif v_macro.source_type='npc_token' then
  if not public.is_campaign_dm(v_macro.campaign_id) then raise exception 'DM permission required';end if;
  select t.npc_values into v_sheet from public.map_tokens t
   where t.id=v_macro.source_id and t.campaign_id=v_macro.campaign_id
    and t.character_id is null;
  if not found then raise exception 'NPC token not found';end if;
 elsif v_macro.source_type='npc_template' then
  if not public.is_campaign_dm(v_macro.campaign_id) then raise exception 'DM permission required';end if;
  select n.field_values into v_sheet from public.npc_templates n
   where n.id=v_macro.source_id and n.campaign_id=v_macro.campaign_id;
  if not found then raise exception 'NPC template not found';end if;
 end if;
 if jsonb_typeof(v_sheet)<>'object' then v_sheet:='{}'::jsonb;end if;
 for v_row in select value from jsonb_array_elements(v_macro.rows) loop
  v_cells:='[]'::jsonb;
  for v_cell in select value from jsonb_array_elements(v_row->'cells') loop
   if v_cell->>'kind'='roll' then
    v_rolls:=v_rolls+1;
    if v_rolls>18 then raise exception 'Too many rolls in one macro';end if;
    v_result:=public.roll_spell_expression(v_cell->>'formula','{}'::jsonb,v_sheet);
    v_cells:=v_cells||jsonb_build_array(jsonb_build_object(
      'kind','roll','label',v_cell->>'label','roll',v_result));
   else
    v_cells:=v_cells||jsonb_build_array(jsonb_build_object(
      'kind','text','label',v_cell->>'label','text',v_cell->>'text'));
   end if;
  end loop;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
    'label',v_row->>'label','cells',v_cells));
 end loop;
 insert into public.chat_messages(campaign_id,user_id,body,kind,result)
 values(v_macro.campaign_id,auth.uid(),v_macro.name,'macro',
  jsonb_build_object('version',1,'title',v_macro.name,
   'subtitle',v_macro.subtitle,'rows',v_rows))
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.run_tabletop_macro(uuid) from public,anon;
grant execute on function public.run_tabletop_macro(uuid) to authenticated;
