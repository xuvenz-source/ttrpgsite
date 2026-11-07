-- STAGING CANDIDATE ONLY. DO NOT EXECUTE AGAINST PRODUCTION.
-- Convert to an official Supabase migration with the CLI before releasing.
-- Release ordering: apply and verify this SQL before deploying the frontend.
-- Pure inheritance: token values are independent snapshots, but fields still
-- matching the previous bestiary default follow later template changes.

create or replace function public.inherit_npc_template_values(
 p_token jsonb,p_previous jsonb,p_updated jsonb
) returns jsonb language plpgsql immutable set search_path='' as $inherit$
declare
 v_result jsonb:=case when jsonb_typeof(p_token)='object' then p_token else '{}'::jsonb end;
 v_before jsonb:=case when jsonb_typeof(p_previous)='object' then p_previous else '{}'::jsonb end;
 v_after jsonb:=case when jsonb_typeof(p_updated)='object' then p_updated else '{}'::jsonb end;
 v_key text; v_prev jsonb; v_next jsonb; v_current jsonb;
 v_part text;
begin
 for v_key in
  select key from (
   select jsonb_object_keys(v_before) as key
   union select jsonb_object_keys(v_after) as key
  ) keys
 loop
  -- Token names are an instance-specific identity.
  if v_key='character_name' then continue; end if;
  v_prev:=v_before->v_key;
  v_next:=v_after->v_key;
  v_current:=v_result->v_key;
  if not(v_result ? v_key) or v_current is not distinct from v_prev then
   if v_after ? v_key then
    v_result:=jsonb_set(v_result,array[v_key],v_next,true);
   else
    v_result:=v_result-v_key;
   end if;
  elsif jsonb_typeof(v_prev)='object' and jsonb_typeof(v_next)='object'
   and jsonb_typeof(v_current)='object'
   and (v_prev ? 'current' or v_prev ? 'max' or
        v_next ? 'current' or v_next ? 'max') then
   -- Preserve changed current HP while updating a still-inherited maximum.
   for v_part in select unnest(array['current','max']::text[]) loop
    if not(v_current ? v_part)
     or v_current->v_part is not distinct from v_prev->v_part then
     if v_next ? v_part then
      v_current:=jsonb_set(v_current,array[v_part],v_next->v_part,true);
     else
      v_current:=v_current-v_part;
     end if;
    end if;
   end loop;
   v_result:=jsonb_set(v_result,array[v_key],v_current,true);
  end if;
 end loop;
 return v_result;
end $inherit$;

revoke all on function public.inherit_npc_template_values(jsonb,jsonb,jsonb)
 from public,anon,authenticated;

create index if not exists map_tokens_npc_template_inherit_idx
 on public.map_tokens(npc_template_id)
 where npc_template_id is not null;

create or replace function public.propagate_npc_template_defaults()
returns trigger language plpgsql security definer set search_path='' as $sync$
begin
 if old.campaign_id is distinct from new.campaign_id then
  raise exception 'Bestiary template cannot change campaigns';
 end if;
 -- Trigger is reached only after a permitted template UPDATE. Keep the
 -- authorization check defense-in-depth for authenticated callers.
 if auth.uid() is not null and not public.is_campaign_dm(new.campaign_id) then
  raise exception 'Only the campaign DM may update bestiary defaults';
 end if;
 if new.field_values is not distinct from old.field_values then return null; end if;
 update public.map_tokens t
 set npc_values=public.inherit_npc_template_values(
  t.npc_values,old.field_values,new.field_values)
 where t.npc_template_id=new.id and t.campaign_id=new.campaign_id
  and t.character_id is null
  and t.npc_values is distinct from public.inherit_npc_template_values(
   t.npc_values,old.field_values,new.field_values);
 return null;
end $sync$;

revoke all on function public.propagate_npc_template_defaults()
 from public,anon,authenticated;
drop trigger if exists npc_template_defaults_to_placed_tokens on public.npc_templates;
create trigger npc_template_defaults_to_placed_tokens
after update of field_values on public.npc_templates
for each row execute function public.propagate_npc_template_defaults();

-- Existing token status representation is reused. A new boolean column is
-- unnecessary: {id:"dead",level:1} is validated like other built-in statuses.
create or replace function public.valid_token_statuses(p_effects jsonb,p_catalog jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 v jsonb;
 v_id text;
 v_level numeric;
 v_max int;
 v_ids text[]:=array[]::text[];
 v_builtin text[]:=array[
  'blinded','charmed','deafened','dead','exhaustion','frightened','grappled',
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


