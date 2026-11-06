-- Staged next batch, apply AFTER 20261106190100_dm_ability_modifiers.sql.
-- Adds linked Attack cells; older roll and text cells are unchanged.
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
    if (v_cell-'id'-'kind'-'label'-'formula'-'critOn')<>'{}'::jsonb
       or coalesce(v_cell->>'id','') !~ '^[a-zA-Z0-9_-]{1,50}$'
       or length(btrim(coalesce(v_cell->>'formula','')))<1
       or length(v_cell->>'formula')>120 then return false;end if;
    if v_cell ? 'critOn' and (
       jsonb_typeof(v_cell->'critOn')<>'number'
       or (v_cell->>'critOn') !~ '^([1-9]|1[0-9]|20)$'
    ) then return false;end if;
   elsif v_cell->>'kind'='attack' then
    -- A linked attack is one row/cell, even though it may roll twice to hit.
    v_rolls:=v_rolls+case when v_cell->>'mode'='normal' then 3 else 4 end;
    if jsonb_array_length(v_row->'cells')<>1
       or (v_cell-'id'-'kind'-'label'-'formula'-'mode'-'critOn'-'damage'-'critDamage')<>'{}'::jsonb
       or coalesce(v_cell->>'id','') !~ '^[a-zA-Z0-9_-]{1,50}$'
       or coalesce(v_cell->>'mode','') not in ('normal','advantage','disadvantage')
       or jsonb_typeof(v_cell->'critOn')<>'number'
       or (v_cell->>'critOn') !~ '^([1-9]|1[0-9]|20)$'
       or length(btrim(coalesce(v_cell->>'formula','')))<1
       or length(v_cell->>'formula')>120
       or length(btrim(coalesce(v_cell->>'damage','')))<1
       or length(v_cell->>'damage')>120
       or length(coalesce(v_cell->>'critDamage',''))>120
    then return false;end if;
   elsif v_cell->>'kind'='text' then
    if (v_cell-'id'-'kind'-'label'-'text')<>'{}'::jsonb or
       coalesce(v_cell->>'id','') !~ '^[a-zA-Z0-9_-]{1,50}$'
       or length(coalesce(v_cell->>'text',''))>90 then return false;end if;
   else return false;end if;
  end loop;
 end loop;
 return v_rolls>0 and v_rolls<=18;
end $$;

-- Validate and extract a single positive natural d20 from the server roll.
-- Never infer a natural critical from the final total.
create or replace function public.tabletop_macro_natural_d20(p_roll jsonb)
returns integer language plpgsql immutable set search_path='' as $$
declare v_group jsonb;v_count integer:=0;v_face integer:=null;
begin
 for v_group in select value from jsonb_array_elements(coalesce(p_roll->'rolls','[]'::jsonb)) loop
  if (v_group->>'sides')::integer=20 then
   v_count:=v_count+1;
   if (v_group->>'count')::integer<>1 or (v_group->>'sign')::integer<>1 then
    raise exception 'Linked Attack requires a single positive 1d20 in the to-hit expression';
   end if;
   v_face:=(v_group->'dice'->>0)::integer;
  end if;
 end loop;
 if v_count<>1 or v_face is null then
  raise exception 'Linked Attack requires exactly one natural 1d20';
 end if;
 return v_face;
end $$;
revoke all on function public.tabletop_macro_natural_d20(jsonb) from public,anon,authenticated;


create or replace function public.run_tabletop_macro(p_macro_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
 v_macro public.tabletop_macros%rowtype;
 v_template jsonb;
 v_sheet jsonb:='{}'::jsonb;v_rows jsonb:='[]'::jsonb;
 v_row jsonb;v_cell jsonb;v_cells jsonb;v_result jsonb;v_rolls int:=0;
 v_id uuid;
 v_hit1 jsonb;v_hit2 jsonb;v_damage jsonb;v_bonus jsonb;
 v_hit_cells jsonb;v_damage_cells jsonb;v_nat1 integer;v_nat2 integer;
 v_mode text;v_choose1 boolean;v_selected integer;v_damage_sum integer;
 v_crit_on integer;v_natural integer;v_d20_count integer;v_d20 jsonb;v_critical boolean;
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
 select c.sheet_template into v_template from public.campaigns c where c.id=v_macro.campaign_id;
 v_sheet:=public.resolve_tabletop_modifier_values(v_template,v_sheet);
 for v_row in select value from jsonb_array_elements(v_macro.rows) loop
  v_cells:='[]'::jsonb;
  for v_cell in select value from jsonb_array_elements(v_row->'cells') loop
   if v_cell->>'kind'='attack' then
    v_mode:=v_cell->>'mode';v_crit_on:=(v_cell->>'critOn')::integer;
    v_rolls:=v_rolls+case when v_mode='normal' then 3 else 4 end;
    if v_rolls>18 then raise exception 'Too many dice rolls in one macro';end if;
    v_hit1:=public.roll_spell_expression(v_cell->>'formula','{}'::jsonb,v_sheet);
    v_nat1:=public.tabletop_macro_natural_d20(v_hit1);
    v_hit2:=null;v_nat2:=null;
    if v_mode<>'normal' then
     v_hit2:=public.roll_spell_expression(v_cell->>'formula','{}'::jsonb,v_sheet);
     v_nat2:=public.tabletop_macro_natural_d20(v_hit2);
    end if;
    -- Advantage/disadvantage choose the natural face, not the modified total.
    v_choose1:=v_mode='normal' or
      (v_mode='advantage' and v_nat1>=v_nat2) or
      (v_mode='disadvantage' and v_nat1<=v_nat2);
    v_selected:=case when v_choose1 then v_nat1 else v_nat2 end;
    v_critical:=v_selected>=v_crit_on;
    v_hit_cells:=jsonb_build_array(jsonb_build_object(
     'kind','roll','label',case when v_hit2 is null then 'To hit' else 'Roll 1' end,
     'roll',v_hit1||jsonb_build_object('natural',v_nat1,'critOn',v_crit_on),
     'selected',v_choose1,'critical',v_critical and v_choose1,'critOn',v_crit_on));
    if v_hit2 is not null then
     v_hit_cells:=v_hit_cells||jsonb_build_array(jsonb_build_object(
      'kind','roll','label','Roll 2',
      'roll',v_hit2||jsonb_build_object('natural',v_nat2,'critOn',v_crit_on),
      'selected',not v_choose1,'critical',v_critical and not v_choose1,
      'critOn',v_crit_on));
    end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
     'label',v_row->>'label','cells',v_hit_cells));
    -- Damage is rolled once, independent of advantage mode.
    v_damage:=public.roll_spell_expression(v_cell->>'damage','{}'::jsonb,v_sheet);
    v_damage_cells:=jsonb_build_array(jsonb_build_object(
     'kind','roll','label','Damage','roll',v_damage));
    if v_critical and length(btrim(coalesce(v_cell->>'critDamage','')))>0 then
     -- Only the chosen critical attack triggers this extra die expression.
     v_bonus:=public.roll_spell_expression(v_cell->>'critDamage','{}'::jsonb,v_sheet);
     v_damage_sum:=(v_damage->>'total')::integer+(v_bonus->>'total')::integer;
     v_damage_cells:=v_damage_cells||jsonb_build_array(jsonb_build_object(
      'kind','roll','label','Crit bonus','roll',v_bonus));
     v_damage_cells:=v_damage_cells||jsonb_build_array(jsonb_build_object(
      'kind','roll','label','Total','roll',jsonb_build_object(
       'expression','Damage including critical bonus',
       'total',v_damage_sum,
       'modifier',(v_damage->>'modifier')::integer+(v_bonus->>'modifier')::integer,
       'rolls',(v_damage->'rolls')||(v_bonus->'rolls'))));
    end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
     'label','Damage','cells',v_damage_cells));
   elsif v_cell->>'kind'='roll' then
    v_rolls:=v_rolls+1;
    if v_rolls>18 then raise exception 'Too many rolls in one macro';end if;
    v_result:=public.roll_spell_expression(v_cell->>'formula','{}'::jsonb,v_sheet);
    if v_cell ? 'critOn' then
     -- Natural crits are the face of one d20, not the modified attack total.
     v_crit_on:=(v_cell->>'critOn')::integer;
     v_d20_count:=0;v_natural:=null;
     for v_d20 in select value from jsonb_array_elements(v_result->'rolls') loop
      if (v_d20->>'sides')::integer=20 then
       v_d20_count:=v_d20_count+1;
       if (v_d20->>'count')::integer<>1 or (v_d20->>'sign')::integer<>1 then
        raise exception 'Critical tracking needs exactly one positive 1d20 (use separate rolls for advantage)';
       end if;
       v_natural:=(v_d20->'dice'->>0)::integer;
      end if;
     end loop;
     if v_d20_count<>1 then
      raise exception 'Critical tracking needs exactly one positive 1d20 (use separate rolls for advantage)';
     end if;
     v_critical:=v_natural>=v_crit_on;
     v_result:=v_result||jsonb_build_object('natural',v_natural,'critOn',v_crit_on);
     v_cells:=v_cells||jsonb_build_array(jsonb_build_object(
      'kind','roll','label',v_cell->>'label','roll',v_result,
      'critical',v_critical,'critOn',v_crit_on));
    else
     v_cells:=v_cells||jsonb_build_array(jsonb_build_object(
      'kind','roll','label',v_cell->>'label','roll',v_result));
    end if;
   else
    v_cells:=v_cells||jsonb_build_array(jsonb_build_object(
      'kind','text','label',v_cell->>'label','text',v_cell->>'text'));
   end if;
  end loop;
  if v_row->'cells'->0->>'kind'<>'attack' then
   v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
     'label',v_row->>'label','cells',v_cells));
  end if;
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
