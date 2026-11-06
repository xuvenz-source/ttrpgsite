-- Tabletop Forge: visual token conditions, buffs and resistances.
-- This migration is intentionally staged on the feature branch. Apply it before
-- deploying the matching frontend release.
create or replace function public.valid_token_status_catalog(p_catalog jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 v jsonb;
 v_ids text[]:=array[]::text[];
 v_id text;
begin
 if p_catalog is null or jsonb_typeof(p_catalog)<>'array' then return false; end if;
 if jsonb_array_length(p_catalog)>24 then return false; end if;
 for v in select value from jsonb_array_elements(p_catalog) loop
  if jsonb_typeof(v)<>'object' then return false; end if;
  v_id:=v->>'id';
  if v_id is null or v_id !~ '^custom_[0-9a-f]{12}$'
   or v_id=any(v_ids) or
   length(btrim(coalesce(v->>'name','')))<1 or
   length(v->>'name')>36 or
   coalesce(v->>'category','') not in ('buffs','debuffs') or
   coalesce(v->>'icon','') not in (
    'eye-off','heart','ear-off','hourglass','ghost','chain','zap','moon',
    'stone','flask','footprints','lock','sparkles','shield','shield-check',
    'music','flame','snowflake','droplets','wind','skull','swords','target',
    'swirl','paw','hand','star','feather','circle-slash','cloud','clock'
   ) or coalesce(v->>'color','') !~ '^#[0-9a-fA-F]{6}$'
   or jsonb_typeof(v->'stackable')<>'boolean'
   or jsonb_typeof(v->'archived')<>'boolean'
   or (v - 'id' - 'name' - 'category' - 'icon' - 'color' - 'stackable' - 'archived')<>'{}'::jsonb
  then return false; end if;
  v_ids:=array_append(v_ids,v_id);
 end loop;
 return true;
end $$;

create or replace function public.valid_token_statuses(p_effects jsonb,p_catalog jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 v jsonb;
 v_id text;
 v_level numeric;
 v_max int;
 v_ids text[]:=array[]::text[];
 v_builtin text[]:=array[
  'blinded','charmed','deafened','exhaustion','frightened','grappled',
  'incapacitated','invisible','paralyzed','petrified','poisoned','prone',
  'restrained','stunned','unconscious','bardic_inspiration','bless',
  'guidance','haste','heroism','rage','shield_of_faith','sanctuary','aid',
  'inspiration','concentration','flying','bane','hex','slow','hunters_mark',
  'resist_acid','resist_bludgeoning','resist_cold','resist_fire','resist_force',
  'resist_lightning','resist_necrotic','resist_piercing','resist_poison',
  'resist_psychic','resist_radiant','resist_slashing','resist_thunder'
 ];
 v_custom jsonb;
begin
 if not public.valid_token_status_catalog(p_catalog) then return false; end if;
 if p_effects is null or jsonb_typeof(p_effects)<>'array' then return false; end if;
 if jsonb_array_length(p_effects)>18 then return false; end if;
 for v in select value from jsonb_array_elements(p_effects) loop
  if jsonb_typeof(v)<>'object' or
   (v-'id'-'level')<>'{}'::jsonb then return false; end if;
  v_id:=v->>'id';
  if v_id is null or v_id !~ '^[a-z][a-z0-9_]{1,39}$'
   or v_id=any(v_ids) or jsonb_typeof(v->'level')<>'number'
  then return false; end if;
  begin
   v_level:=(v->>'level')::numeric;
  exception when others then return false;
  end;
  if v_level<>trunc(v_level) or v_level<1 or v_level>9 then return false; end if;
  v_custom:=null;
  if v_id<>all(v_builtin) then
   select item into v_custom from jsonb_array_elements(p_catalog) item
    where item->>'id'=v_id limit 1;
   if v_custom is null then return false; end if;
  end if;
  v_max:=case
   when v_id='exhaustion' then 6
   when v_id='bardic_inspiration' then 9
   when v_custom is not null and v_custom->>'stackable'='true' then 9
   else 1
  end;
  if v_level>v_max then return false; end if;
  v_ids:=array_append(v_ids,v_id);
 end loop;
 return true;
end $$;

alter table public.campaigns
 add column if not exists token_status_catalog jsonb not null default '[]'::jsonb;
alter table public.map_tokens
 add column if not exists status_effects jsonb not null default '[]'::jsonb;

alter table public.campaigns
 add constraint campaigns_valid_status_catalog
 check (public.valid_token_status_catalog(token_status_catalog));
alter table public.map_tokens
 add constraint map_tokens_statuses_array
 check (jsonb_typeof(status_effects)='array' and jsonb_array_length(status_effects)<=18);

create or replace function public.validate_token_status_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_catalog jsonb;
begin
 if tg_op='INSERT' or new.status_effects is distinct from old.status_effects then
  select c.token_status_catalog into v_catalog from public.campaigns c
   where c.id=new.campaign_id;
  if not public.valid_token_statuses(new.status_effects,v_catalog) then
   raise exception 'Invalid token status effects';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.validate_token_status_write() from public,anon,authenticated;
create trigger tokens_validate_statuses
before insert or update of status_effects on public.map_tokens
for each row execute function public.validate_token_status_write();

-- Respect existing position and numeric quick-adjust protections. A controlled
-- player may change ONLY the status array, not ownership, visibility or stats.
create or replace function public.protect_token_fields()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_config jsonb;
 v_template jsonb;
 v_field text;
 v_count int:=0;
 v_type text;
 v_before jsonb;
 v_after jsonb;
 v_canonical jsonb;
 v_changed jsonb;
 v_part text;
 v_catalog jsonb;
begin
 if public.is_campaign_dm(old.campaign_id) then return new; end if;

 -- Existing token position updates.
 if (to_jsonb(new)-'x'-'y'-'updated_at')
    is not distinct from (to_jsonb(old)-'x'-'y'-'updated_at')
 then return new; end if;

 -- Status-only updates for the owner, on the published campaign map.
 if old.status_effects is distinct from new.status_effects
   and (to_jsonb(new)-'status_effects'-'updated_at')
     is not distinct from (to_jsonb(old)-'status_effects'-'updated_at')
   and old.owner_id=auth.uid() and old.visible
   and public.is_campaign_member(old.campaign_id)
   and old.map_id=(select c.active_map_id from public.campaigns c
    where c.id=old.campaign_id)
 then
  select token_status_catalog into v_catalog from public.campaigns
   where id=old.campaign_id;
  if not public.valid_token_statuses(new.status_effects,v_catalog)
  then raise exception 'Invalid status effects'; end if;
  return new;
 end if;

 -- Existing DM-approved numeric changes on controlled NPCs.
 if old.npc_values is distinct from new.npc_values
   and (to_jsonb(new)-'updated_at'-'npc_values')
     is not distinct from (to_jsonb(old)-'updated_at'-'npc_values')
   and old.character_id is null and old.owner_id=auth.uid()
   and old.visible and public.is_campaign_member(old.campaign_id)
   and old.map_id=(select c.active_map_id from public.campaigns c
    where c.id=old.campaign_id)
 then
  select c.token_quick_fields,c.sheet_template
   into v_config,v_template from public.campaigns c where c.id=old.campaign_id;
  for v_field in
   select k.field from (
     select jsonb_object_keys(coalesce(old.npc_values,'{}'::jsonb)) as field
     union
     select jsonb_object_keys(coalesce(new.npc_values,'{}'::jsonb)) as field
   ) k
   where old.npc_values->k.field is distinct from new.npc_values->k.field
  loop
   v_count:=v_count+1;
   if v_count>8 or not coalesce(v_config,'[]'::jsonb) ? v_field
   then raise exception 'Only DM-approved quick attributes can be modified'; end if;
   select f->>'type' into v_type
    from jsonb_array_elements(coalesce(v_template->'tabs','[]'::jsonb)) tab,
         lateral jsonb_array_elements(coalesce(tab->'fields','[]'::jsonb)) f
    where f->>'id'=v_field and f->>'type' in ('number','resource')
    limit 1;
   v_before:=old.npc_values->v_field;
   v_after:=new.npc_values->v_field;
   if v_type='number' then
    if jsonb_typeof(v_after)<>'number' or
      (v_after #>> '{}')::numeric not between -1000000 and 1000000
    then raise exception 'Invalid numeric quick edit'; end if;
   elsif v_type='resource' then
    if jsonb_typeof(v_after)<>'object' or
       v_after-'current'-'max'<>'{}'::jsonb or
       not (v_after ? 'current' and v_after ? 'max')
    then raise exception 'Invalid resource quick edit'; end if;
    if jsonb_typeof(v_before)<>'object' then
     v_canonical:=jsonb_build_object('current',v_before,'max',null);
    else v_canonical:=v_before; end if;
    for v_part in select unnest(array['current','max']::text[]) loop
     v_changed:=v_after->v_part;
     if v_canonical->v_part is distinct from v_changed then
      if jsonb_typeof(v_changed)<>'number' or
        (v_changed #>> '{}')::numeric not between -1000000 and 1000000
      then raise exception 'Invalid resource quick edit'; end if;
     end if;
    end loop;
   else raise exception 'Only Number and Resource quick fields may be edited';
   end if;
  end loop;
  if v_count>0 then return new; end if;
 end if;
 raise exception 'Players may only change positions, statuses or DM-approved quick attributes';
end $$;
revoke all on function public.protect_token_fields() from public,anon,authenticated;

create or replace function public.set_token_statuses(p_token uuid,p_statuses jsonb)
returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare
 v_token record;
 v_catalog jsonb;
 v_active_map uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to edit token statuses'; end if;
 select t.id,t.campaign_id,t.map_id,t.owner_id,t.visible into v_token
  from public.map_tokens t where t.id=p_token;
 if not found then raise exception 'Token not found or not visible'; end if;
 select c.token_status_catalog,c.active_map_id into v_catalog,v_active_map
  from public.campaigns c where c.id=v_token.campaign_id;
 if not (
   public.is_campaign_dm(v_token.campaign_id) or
   (public.is_campaign_member(v_token.campaign_id)
    and v_token.owner_id=auth.uid()
    and v_token.visible
    and v_token.map_id=v_active_map)
 ) then raise exception 'You cannot edit this token'; end if;
 if not public.valid_token_statuses(p_statuses,v_catalog)
 then raise exception 'Invalid status effects'; end if;
 update public.map_tokens set status_effects=p_statuses
  where id=p_token and campaign_id=v_token.campaign_id;
 if not found then raise exception 'Status update was not permitted'; end if;
 return p_statuses;
end $$;
revoke all on function public.set_token_statuses(uuid,jsonb) from public,anon;
grant execute on function public.set_token_statuses(uuid,jsonb) to authenticated;

grant select(status_effects),update(status_effects) on public.map_tokens to authenticated;
-- Existing campaign RLS continues to restrict catalog writes to the campaign DM.
