-- STAGING ONLY. Requires explicit release approval before live Supabase writes.
-- Apply AFTER 20261108033000_player_owned_token_artwork.sql and BEFORE
-- merging PR #42 to main. No client-rolled dice or direct table read added.
-- Retains the existing macro owner/source/campaign checks and dice parser.

-- Private helper. Safe numeric campaign quickcodes from the selected
-- owned character/DM-authorized NPC are resolved before the existing strict
-- roll_spell_expression() parser runs. Never treat quickcode text as raw SQL.
create or replace function public.resolve_tabletop_macro_quickcodes(
 p_expression text,p_source_type text,p_config jsonb,
 p_template jsonb,p_sheet jsonb
) returns text language plpgsql stable security invoker
set search_path='' as $$
declare
 v_expression text:=coalesce(p_expression,'');
 v_match text[];v_code text;v_value jsonb;v_numeric numeric;
 v_count integer:=0;
begin
 if length(v_expression)>120 then raise exception 'Macro formula is too long';end if;
 for v_match in
  select regexp_matches(v_expression,'(=@[a-z][a-z0-9_]{0,31})','gi')
 loop
  v_count:=v_count+1;
  if v_count>16 then raise exception 'Too many quickcodes in one macro formula';end if;
  if coalesce(p_source_type,'none') not in ('character','npc_token','npc_template') then
   raise exception 'Select a character or NPC sheet source to use macro quickcodes';
  end if;
  v_code:=upper(v_match[1]);
  v_value:=public.token_reference_value(p_config,p_template,p_sheet,v_code);
  if v_value is null then
   raise exception 'Unknown or unavailable macro quickcode: %',v_code;
  end if;
  if jsonb_typeof(v_value)<>'number' then
   raise exception 'Macro quickcode % must resolve to a number',v_code;
  end if;
  v_numeric:=(v_value #>> '{}')::numeric;
  if v_numeric<>trunc(v_numeric) or abs(v_numeric)>10000 then
   raise exception 'Macro quickcode % must be a whole number from -10000 to 10000',v_code;
  end if;
  v_expression:=replace(v_expression,v_match[1],(v_numeric::integer)::text);
 end loop;
 return v_expression;
end $$;
revoke all on function public.resolve_tabletop_macro_quickcodes(
 text,text,jsonb,jsonb,jsonb
) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.run_tabletop_macro(p_macro_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_macro public.tabletop_macros%rowtype;
 v_template jsonb;v_config jsonb;
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
 select c.sheet_template,c.token_display_config into v_template,v_config
  from public.campaigns c where c.id=v_macro.campaign_id;
 v_sheet:=public.resolve_tabletop_modifier_values(v_template,v_sheet);
 for v_row in select value from jsonb_array_elements(v_macro.rows) loop
  v_cells:='[]'::jsonb;
  for v_cell in select value from jsonb_array_elements(v_row->'cells') loop
   if v_cell->>'kind'='attack' then
    v_mode:=v_cell->>'mode';v_crit_on:=(v_cell->>'critOn')::integer;
    v_rolls:=v_rolls+case when v_mode='normal' then 3 else 4 end;
    if v_rolls>18 then raise exception 'Too many dice rolls in one macro';end if;
    v_hit1:=public.roll_spell_expression(
     public.resolve_tabletop_macro_quickcodes(v_cell->>'formula',
      v_macro.source_type,v_config,v_template,v_sheet),'{}'::jsonb,v_sheet);
    v_nat1:=public.tabletop_macro_natural_d20(v_hit1);
    v_hit2:=null;v_nat2:=null;
    if v_mode<>'normal' then
     v_hit2:=public.roll_spell_expression(
     public.resolve_tabletop_macro_quickcodes(v_cell->>'formula',
      v_macro.source_type,v_config,v_template,v_sheet),'{}'::jsonb,v_sheet);
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
    v_damage:=public.roll_spell_expression(
     public.resolve_tabletop_macro_quickcodes(v_cell->>'damage',
      v_macro.source_type,v_config,v_template,v_sheet),'{}'::jsonb,v_sheet);
    v_damage_cells:=jsonb_build_array(jsonb_build_object(
     'kind','roll','label','Damage','roll',v_damage));
    if v_critical and length(btrim(coalesce(v_cell->>'critDamage','')))>0 then
     -- Only the chosen critical attack triggers this extra die expression.
     v_bonus:=public.roll_spell_expression(
     public.resolve_tabletop_macro_quickcodes(v_cell->>'critDamage',
      v_macro.source_type,v_config,v_template,v_sheet),'{}'::jsonb,v_sheet);
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
    v_result:=public.roll_spell_expression(
     public.resolve_tabletop_macro_quickcodes(v_cell->>'formula',
      v_macro.source_type,v_config,v_template,v_sheet),'{}'::jsonb,v_sheet);
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
end $function$;
