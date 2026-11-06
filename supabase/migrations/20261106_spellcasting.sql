-- Staged with feature/compact-tabletop-ui. Apply before deploying the matching frontend.
-- Spell casts create one structured message using current saved spell values and server dice.
alter table public.chat_messages drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
 check (kind in ('text','roll','spell'));

create or replace function public.roll_spell_expression(
 p_expression text,p_row jsonb,p_sheet jsonb
) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare
 v_expr text:=lower(regexp_replace(coalesce(p_expression,''),'[[:space:]]+','','g'));
 v_ref text[];v_matches text[];v_key text;v_val text;
 v_sign integer;v_term text;v_num integer;v_sides integer;
 v_total integer:=0;v_modifier integer:=0;v_count integer:=0;v_groups integer:=0;
 v_roll integer;v_values jsonb;v_rolls jsonb:='[]'::jsonb;
begin
 if length(v_expr)>120 or length(v_expr)<1 then raise exception 'Dice expression must be 1–120 characters'; end if;
 for v_ref in select regexp_matches(v_expr,'@\{([a-z0-9_.-]+)\}','g') loop
  v_key:=v_ref[1];
  if left(v_key,4)='row.' then
   v_val:=p_row->>substr(v_key,5);
  elsif p_row ? v_key then v_val:=p_row->>v_key;
  else
   v_val:=case
    when jsonb_typeof(p_sheet->v_key)='object' then p_sheet->v_key->>'current'
    else p_sheet->>v_key end;
  end if;
  if v_val is null or v_val !~ '^[+-]?[0-9]{1,4}$' then
   raise exception 'Missing or invalid numeric field reference: %',v_key;
  end if;
  v_expr:=replace(v_expr,'@{'||v_key||'}',v_val);
 end loop;
 v_expr:=replace(replace(v_expr,'+-','-'),'--','+');
 if v_expr !~ '^[+-]?([0-9]{1,2}d[0-9]{1,4}|[0-9]{1,5})([+-]([0-9]{1,2}d[0-9]{1,4}|[0-9]{1,5}))*$' then
  raise exception 'Use a valid dice expression, e.g. 2d6+1d4+3';
 end if;
 for v_matches in select regexp_matches(v_expr,'([+-]?)([0-9]{1,2}d[0-9]{1,4}|[0-9]{1,5})','g') loop
  v_groups:=v_groups+1;
  if v_groups>12 then raise exception 'Too many dice groups'; end if;
  v_sign:=case when v_matches[1]='-' then -1 else 1 end;
  v_term:=v_matches[2];
  if position('d' in v_term)>0 then
   v_num:=split_part(v_term,'d',1)::integer;
   v_sides:=split_part(v_term,'d',2)::integer;
   if v_num<1 or v_sides<2 or v_sides>1000 or v_count+v_num>50 then
    raise exception 'Dice count must be at most 50, with 2–1000 sides';
   end if;
   v_count:=v_count+v_num;v_values:='[]'::jsonb;
   for i in 1..v_num loop
    v_roll:=floor(random()*v_sides)::integer+1;
    v_total:=v_total+v_sign*v_roll;
    v_values:=v_values||to_jsonb(v_roll);
   end loop;
   v_rolls:=v_rolls||jsonb_build_array(jsonb_build_object(
    'count',v_num,'sides',v_sides,'sign',v_sign,'dice',v_values));
  else
   v_num:=v_term::integer;
   v_modifier:=v_modifier+v_sign*v_num;
   if abs(v_modifier)>10000 then raise exception 'Dice modifier is too large'; end if;
   v_total:=v_total+v_sign*v_num;
  end if;
 end loop;
 return jsonb_build_object('expression',v_expr,'total',v_total,
  'modifier',v_modifier,'rolls',v_rolls);
end $$;
revoke all on function public.roll_spell_expression(text,jsonb,jsonb)
 from public,anon,authenticated;

create or replace function public.cast_collection_spell(
 p_campaign_id uuid,p_source_id uuid,p_collection_id text,p_entry_id text,
 p_source_type text default 'character',p_mode text default 'cast'
) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare
 v_sheet jsonb;v_collection jsonb;v_rows jsonb;v_entry jsonb;v_values jsonb;
 v_choices jsonb;v_sections jsonb:='{}'::jsonb;v_meta jsonb;v_name text;
 v_attack_formula text;v_damage text;v_healing text;v_bonus text;
 v_save_stat text;v_dc text;v_roll jsonb;v_id uuid;
begin
 if auth.uid() is null or not public.is_campaign_member(p_campaign_id)
 then raise exception 'Campaign membership required'; end if;
 if p_source_id is null or p_collection_id is null or length(p_collection_id)>100
   or p_entry_id is null or length(p_entry_id)>100
   or p_mode not in ('cast','attack','damage','healing')
 then raise exception 'Invalid spell selection'; end if;
 if p_source_type='character' then
  select ch.field_values into v_sheet from public.characters ch
   where ch.id=p_source_id and ch.campaign_id=p_campaign_id and
   (ch.user_id=auth.uid() or public.is_campaign_dm(p_campaign_id));
 elsif p_source_type='npc_token' and public.is_campaign_dm(p_campaign_id) then
  select t.npc_values into v_sheet from public.map_tokens t
   where t.id=p_source_id and t.campaign_id=p_campaign_id and t.character_id is null;
 elsif p_source_type='npc_template' and public.is_campaign_dm(p_campaign_id) then
  select n.field_values into v_sheet from public.npc_templates n
   where n.id=p_source_id and n.campaign_id=p_campaign_id;
 else
  raise exception 'Cannot cast spells for this character or NPC';
 end if;
 if not found or v_sheet is null or jsonb_typeof(v_sheet)<>'object' then
  raise exception 'Spell caster was not found or access was denied';
 end if;
 select fld into v_collection
 from public.campaigns c,
 lateral jsonb_array_elements(coalesce(c.sheet_template->'tabs','[]'::jsonb)) tab,
 lateral jsonb_array_elements(coalesce(tab->'fields','[]'::jsonb)) fld
 where c.id=p_campaign_id and fld->>'id'=p_collection_id
  and fld->>'type'='collection'
  and exists(select 1 from jsonb_array_elements(coalesce(fld->'fields','[]'::jsonb)) child
   where child->>'id'='cast_spell')
 limit 1;
 if v_collection is null then raise exception 'Spellbook is no longer available'; end if;
 v_rows:=v_sheet->p_collection_id;
 if jsonb_typeof(v_rows)<>'array' then raise exception 'No spells saved in this spellbook'; end if;
 select entry into v_entry from jsonb_array_elements(v_rows) entry
  where entry->>'id'=p_entry_id limit 1;
 if v_entry is null or jsonb_typeof(v_entry->'values')<>'object'
 then raise exception 'Spell entry no longer exists'; end if;
 v_values:=v_entry->'values';
 v_name:=left(coalesce(nullif(btrim(v_values->>'spell_name'),''),'Unnamed spell'),100);
 v_choices:=coalesce(v_values->'roll_display','{}'::jsonb);
 if jsonb_typeof(v_choices)<>'object' then v_choices:='{}'::jsonb; end if;
 v_meta:=jsonb_build_object('name',v_name,'level',left(coalesce(v_entry->>'group',''),40),
  'school',left(coalesce(v_values->>'school',''),80),
  'castingTime',left(coalesce(v_values->>'casting_time',''),80),
  'range',left(coalesce(v_values->>'range',''),80),
  'duration',left(coalesce(v_values->>'duration',''),80),
  'components',left(coalesce(v_values->>'components',''),80),
  'target',left(coalesce(v_values->>'target',''),150),
  'concentration',coalesce(v_values->>'concentration','false')='true',
  'ritual',coalesce(v_values->>'ritual','false')='true');
 if p_mode='cast' and coalesce(v_choices->>'description','false')='true' then
  if nullif(btrim(coalesce(v_values->>'description','')),'') is not null
  then v_sections:=v_sections||jsonb_build_object(
   'description',left(v_values->>'description',2000));end if;
  if nullif(btrim(coalesce(v_values->>'higher_levels','')),'') is not null
  then v_sections:=v_sections||jsonb_build_object(
   'higherLevels',left(v_values->>'higher_levels',1200));end if;
 end if;
 if p_mode in ('cast','attack') and (p_mode='attack' or coalesce(v_choices->>'attack','true')='true') then
  -- Spell overrides take precedence; otherwise use the active casting path.
  v_bonus:=coalesce(nullif(btrim(coalesce(v_values->>'attack_bonus','')),''),
    nullif(btrim(coalesce(v_sheet->>'spell_attack_bonus','')),''));
  if v_bonus is not null and v_bonus ~ '^[+-]?[0-9]{1,4}$' then
   v_values:=v_values||jsonb_build_object('attack_bonus',v_bonus);
   select coalesce(child->>'formula','') into v_attack_formula
    from jsonb_array_elements(coalesce(v_collection->'fields','[]'::jsonb)) child
    where child->>'id'='spell_attack' limit 1;
   v_attack_formula:=coalesce(nullif(v_values->>'attack_formula',''),
     nullif(v_attack_formula,''),'1d20+@{attack_bonus}');
   v_sections:=v_sections||jsonb_build_object('attack',
    public.roll_spell_expression(v_attack_formula,v_values,v_sheet));
  elsif p_mode='attack' then
   raise exception 'Set an attack bonus before rolling a spell attack';
  end if;
 end if;
 if p_mode='cast' and coalesce(v_choices->>'save','false')='true' then
  v_save_stat:=upper(left(coalesce(v_values->>'saving_stat',''),3));
  v_dc:=coalesce(nullif(btrim(coalesce(v_values->>'save_dc','')),''),
    v_sheet->>'spell_save_dc');
  if v_save_stat in ('STR','DEX','CON','INT','WIS','CHA')
    and v_dc ~ '^[0-9]{1,2}$' and v_dc::integer between 1 and 99 then
   v_sections:=v_sections||jsonb_build_object('save',jsonb_build_object(
    'stat',v_save_stat,'dc',v_dc::integer,
    'success',left(coalesce(v_values->>'successful_save',''),300)));
  end if;
 end if;
 if p_mode in ('cast','damage') and (p_mode='damage' or coalesce(v_choices->>'damage','true')='true') then
  v_damage:=nullif(btrim(coalesce(v_values->>'damage_dice','')),'');
  if v_damage is not null then
   v_sections:=v_sections||jsonb_build_object('damage',
    public.roll_spell_expression(v_damage,v_values,v_sheet));
  elsif p_mode='damage' then raise exception 'Enter damage dice for this spell';end if;
 end if;
 if p_mode in ('cast','healing') and (p_mode='healing' or coalesce(v_choices->>'healing','true')='true') then
  v_healing:=nullif(btrim(coalesce(v_values->>'healing_amount','')),'');
  if v_healing is not null then
   v_sections:=v_sections||jsonb_build_object('healing',
    public.roll_spell_expression(v_healing,v_values,v_sheet));
  elsif p_mode='healing' then raise exception 'Enter healing dice for this spell';end if;
 end if;
 if p_mode='cast' and coalesce(v_choices->>'effects','false')='true' then
  if nullif(btrim(coalesce(v_values->>'effects','')),'') is not null then
   v_sections:=v_sections||jsonb_build_object('effects',left(v_values->>'effects',2000));
  end if;
 end if;
 insert into public.chat_messages(campaign_id,user_id,body,kind,result)
 values(p_campaign_id,auth.uid(),v_name,'spell',jsonb_build_object(
  'version',1,'sourceType',p_source_type,'mode',p_mode,'meta',v_meta,'sections',v_sections))
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.cast_collection_spell(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.cast_collection_spell(uuid,uuid,text,text,text,text) to authenticated;
