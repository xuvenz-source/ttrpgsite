-- STAGED ONLY: apply before releasing the matching weapon-roll frontend.
-- One authenticated, server-rolled weapon attack card; no client-provided dice results.

create or replace function public.equipment_numeric(p_value jsonb)
returns numeric language sql immutable security invoker set search_path='' as $$
 select case
  when coalesce(
   case when jsonb_typeof(p_value)='object' then p_value->>'current'
    else trim(both '"' from p_value::text) end,''
  ) ~ '^[+-]?[0-9]{1,5}(\.[0-9]{1,3})?$'
  then greatest(-100000::numeric,least(100000::numeric,
   (case when jsonb_typeof(p_value)='object' then p_value->>'current'
    else trim(both '"' from p_value::text) end)::numeric))
  else 0::numeric
 end
$$;
revoke all on function public.equipment_numeric(jsonb) from public,anon,authenticated;

create or replace function public.roll_equipment_weapon(
 p_campaign_id uuid,p_source_type text,p_source_id uuid,
 p_field_id text,p_weapon_id text
) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare
 v_sheet jsonb;v_config jsonb;v_weapon jsonb;v_rows jsonb;
 v_source_name text;v_name text;v_stat_key text;v_stat_mode text;
 v_base numeric;v_step numeric;v_stat numeric;v_prof numeric;
 v_magic numeric;v_hit_bonus numeric;v_damage_bonus numeric;
 v_attack_bonus int;v_damage_mod int;v_crit_threshold int;
 v_attack_formula text;v_damage_formula text;v_crit_formula text;
 v_attack_a jsonb;v_attack_b jsonb;v_damage jsonb;v_crit jsonb;
 v_nat_a int;v_nat_b int;v_is_crit boolean;
 v_rows_out jsonb:='[]'::jsonb;v_attack_cells jsonb;v_damage_cells jsonb;
 v_type text;v_kind text;v_id uuid;
begin
 if auth.uid() is null or not public.is_campaign_member(p_campaign_id)
 then raise exception 'Campaign membership required';end if;
 if p_source_id is null or p_field_id is null or p_weapon_id is null
  or p_field_id !~ '^[a-zA-Z0-9_-]{1,100}$'
  or p_weapon_id !~ '^[a-zA-Z0-9_-]{1,100}$'
 then raise exception 'Invalid weapon selection';end if;
 if p_source_type='character' then
  select ch.name,ch.field_values into v_source_name,v_sheet
   from public.characters ch where ch.id=p_source_id
    and ch.campaign_id=p_campaign_id
    and (ch.user_id=auth.uid() or public.is_campaign_dm(p_campaign_id));
 elsif p_source_type='npc_token' and public.is_campaign_dm(p_campaign_id) then
  select t.name,t.npc_values into v_source_name,v_sheet
   from public.map_tokens t where t.id=p_source_id
    and t.campaign_id=p_campaign_id and t.character_id is null;
 elsif p_source_type='npc_template' and public.is_campaign_dm(p_campaign_id) then
  select n.name,n.field_values into v_source_name,v_sheet
   from public.npc_templates n where n.id=p_source_id
    and n.campaign_id=p_campaign_id;
 else
  raise exception 'You cannot roll for this weapon owner';end if;
 if not found or jsonb_typeof(v_sheet)<>'object'
 then raise exception 'Weapon owner not found or access denied';end if;
 select fld into v_config
  from public.campaigns c
  cross join lateral jsonb_array_elements(coalesce(c.sheet_template->'tabs','[]'::jsonb)) tab
  cross join lateral jsonb_array_elements(coalesce(tab->'fields','[]'::jsonb)) fld
  where c.id=p_campaign_id and fld->>'type'='equipment'
   and fld->>'id'=p_field_id limit 1;
 if v_config is null then raise exception 'Equipment section not found';end if;
 v_rows:=v_sheet->p_field_id->'weapons';
 if jsonb_typeof(v_rows)<>'array' then raise exception 'No weapons saved in this section';end if;
 select w into v_weapon from jsonb_array_elements(v_rows) w
  where w->>'id'=p_weapon_id limit 1;
 if v_weapon is null or jsonb_typeof(v_weapon)<>'object'
 then raise exception 'Weapon not found; save your sheet first';end if;

 v_name:=left(coalesce(nullif(btrim(v_weapon->>'name'),''),'Weapon'),100);
 v_kind:=left(coalesce(nullif(btrim(v_weapon->>'kind'),''),'melee'),24);
 v_type:=left(coalesce(nullif(btrim(v_weapon->>'damageType'),''),''),60);
 v_stat_key:=coalesce(nullif(v_weapon->>'statField',''),nullif(v_config->>'defaultAttackField',''));
 v_stat_mode:=coalesce(nullif(v_weapon->>'statMode',''),nullif(v_config->>'defaultAttackMode',''),'modifier');
 v_base:=public.equipment_numeric(v_config->'scoreBase');
 if v_base=0 and v_config->'scoreBase' is null then v_base:=10;end if;
 v_step:=greatest(1,public.equipment_numeric(v_config->'scoreStep'));
 if v_config->'scoreStep' is null then v_step:=2;end if;
 v_stat:=case when v_stat_key is null then 0 else
  public.equipment_numeric(v_sheet->v_stat_key) end;
 if v_stat_mode='score' and v_stat_key is not null then
  v_stat:=floor((v_stat-v_base)/v_step);
 end if;
 v_prof:=0;
 if coalesce(v_weapon->>'proficient','false')='true'
  and nullif(v_config->>'proficiencyField','') is not null then
  v_prof:=public.equipment_numeric(v_sheet->(v_config->>'proficiencyField'));
 end if;
 v_magic:=public.equipment_numeric(v_weapon->'magic');
 v_hit_bonus:=public.equipment_numeric(v_weapon->'attackBonus');
 v_damage_bonus:=public.equipment_numeric(v_weapon->'damageBonus');
 v_attack_bonus:=trunc(v_stat+v_prof+v_magic+v_hit_bonus)::integer;
 v_damage_mod:=trunc(
  (case when coalesce(v_weapon->>'useStatForDamage','true')='true' then v_stat else 0 end)
  +v_magic+v_damage_bonus)::integer;
 if abs(v_attack_bonus)>10000 or abs(v_damage_mod)>10000
 then raise exception 'Weapon modifiers are out of range';end if;
 v_crit_threshold:=greatest(1,least(20,
  coalesce(nullif(v_weapon->>'critOn','')::integer,20)));
 v_attack_formula:='1d20'||case when v_attack_bonus>=0 then '+' else '' end||v_attack_bonus::text;

 v_damage_formula:=coalesce(nullif(btrim(v_weapon->>'damageDice'),''),'1d8');
 v_damage_formula:=v_damage_formula||
  case when v_damage_mod>=0 then '+' else '' end||v_damage_mod::text;
 v_crit_formula:=coalesce(nullif(btrim(v_weapon->>'critDice'),''),
  nullif(btrim(v_weapon->>'damageDice'),''),'1d8');

 v_attack_a:=public.roll_spell_expression(v_attack_formula,'{}'::jsonb,v_sheet);
 v_attack_b:=public.roll_spell_expression(v_attack_formula,'{}'::jsonb,v_sheet);
 v_nat_a:=(v_attack_a->'rolls'->0->'dice'->>0)::integer;
 v_nat_b:=(v_attack_b->'rolls'->0->'dice'->>0)::integer;
 v_is_crit:=v_nat_a>=v_crit_threshold or v_nat_b>=v_crit_threshold;
 v_damage:=public.roll_spell_expression(v_damage_formula,'{}'::jsonb,v_sheet);

 v_attack_cells:=jsonb_build_array(
  jsonb_build_object('kind','roll','label','Normal','roll',v_attack_a,
   'critical',v_nat_a>=v_crit_threshold),
  jsonb_build_object('kind','roll','label','Adv.','roll',v_attack_b,
   'critical',v_nat_b>=v_crit_threshold),
  jsonb_build_object('kind','text','label','','text','vs AC'));
 v_rows_out:=v_rows_out||jsonb_build_array(jsonb_build_object(
  'id','attack','label','Attack','cells',v_attack_cells));
 v_damage_cells:=jsonb_build_array(
  jsonb_build_object('kind','roll','label','','roll',v_damage));
 if v_type<>'' then
  v_damage_cells:=v_damage_cells||jsonb_build_array(
   jsonb_build_object('kind','text','label','','text',v_type));
 end if;
 v_rows_out:=v_rows_out||jsonb_build_array(jsonb_build_object(
  'id','damage','label','Damage','cells',v_damage_cells));
 if v_is_crit then
  v_crit:=public.roll_spell_expression(v_crit_formula,'{}'::jsonb,v_sheet);
  v_rows_out:=v_rows_out||jsonb_build_array(jsonb_build_object(
   'id','crit','label','Crit','cells',jsonb_build_array(
    jsonb_build_object('kind','text','label','','text','Additional'),
    jsonb_build_object('kind','roll','label','','roll',v_crit),
    jsonb_build_object('kind','text','label','','text','damage'))));
 end if;
 insert into public.chat_messages(campaign_id,user_id,body,kind,result)
 values(p_campaign_id,auth.uid(),v_name,'macro',
  jsonb_build_object('version',1,'type','weapon_attack',
   'title',v_name,'subtitle',left(v_source_name,100)||' · '||
    initcap(v_kind)||' attack','critOn',v_crit_threshold,
   'critical',v_is_crit,'rows',v_rows_out))
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.roll_equipment_weapon(uuid,text,uuid,text,text)
 from public,anon;
grant execute on function public.roll_equipment_weapon(uuid,text,uuid,text,text)
 to authenticated;
