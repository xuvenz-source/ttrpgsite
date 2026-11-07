-- Staged: compute DM-configured hidden modifiers in the macro RPC.
-- A preexisting sheet need not be resaved to use @{dexterity_mod}.
create or replace function public.resolve_tabletop_modifier_values(
 p_template jsonb,p_values jsonb
) returns jsonb language plpgsql immutable set search_path='' as $$
declare
 v_out jsonb:=coalesce(p_values,'{}'::jsonb);
 v_rules jsonb:=p_template->'modifierRules';
 v_base numeric:=10;v_step numeric:=2;
 v_tab jsonb;v_field jsonb;v_ref text;v_raw text;v_mod integer;
begin
 if jsonb_typeof(v_out)<>'object' then v_out:='{}'::jsonb;end if;
 if jsonb_typeof(v_rules)='object' then
  if (v_rules->>'base') ~ '^[0-9]{1,3}$' then
   v_base:=least(100,greatest(0,(v_rules->>'base')::numeric));end if;
  if (v_rules->>'step') ~ '^[0-9]{1,2}$' then
   v_step:=least(20,greatest(1,(v_rules->>'step')::numeric));end if;
 end if;
 if jsonb_typeof(p_template->'tabs')<>'array' then return v_out;end if;
 for v_tab in select value from jsonb_array_elements(p_template->'tabs') limit 30 loop
  if jsonb_typeof(v_tab->'fields')='array' then
   for v_field in select value from jsonb_array_elements(v_tab->'fields') limit 150 loop
    if v_field->>'type'='number' and v_field->>'modifierEnabled'='true' then
     v_ref:=lower(regexp_replace(
       coalesce(nullif(v_field->>'modifierCode',''),v_field->>'label',''),
       '[^a-zA-Z0-9_]+','_','g'));
     v_ref:=trim(both '_' from v_ref);
     if v_ref ~ '^[a-z][a-z0-9_]{0,75}$' then
      v_raw:=v_out->>(v_field->>'id');
      if v_raw ~ '^[-]?[0-9]{1,6}([.][0-9]{1,4})?$' then
       v_mod:=floor((v_raw::numeric-v_base)/v_step)::integer;
       v_out:=jsonb_set(v_out,array[v_ref||'_mod'],to_jsonb(v_mod),true);
      end if;
     end if;
    end if;
   end loop;
  end if;
 end loop;
 return v_out;
end $$;
revoke all on function public.resolve_tabletop_modifier_values(jsonb,jsonb) from public,anon;
grant execute on function public.resolve_tabletop_modifier_values(jsonb,jsonb) to authenticated;

create or replace function public.run_tabletop_macro(p_macro_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
 v_macro public.tabletop_macros%rowtype;
 v_template jsonb;
 v_sheet jsonb:='{}'::jsonb;v_rows jsonb:='[]'::jsonb;
 v_row jsonb;v_cell jsonb;v_cells jsonb;v_result jsonb;v_rolls int:=0;
 v_id uuid;
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
   if v_cell->>'kind'='roll' then
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
