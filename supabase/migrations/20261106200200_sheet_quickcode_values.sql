-- STAGED ONLY: field-attached quickcodes support safe scalar output and
-- bounded summaries for complex objects. Token bubbles remain numeric-only.
create or replace function public.token_reference_value(
 p_config jsonb,p_template jsonb,p_sheet jsonb,p_code text
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_def jsonb;v_source text;v_field_id text;v_value jsonb;
 v_template_field jsonb;v_equipment jsonb;v_item jsonb;v_cat jsonb;
 v_armor jsonb;v_score numeric;v_attr numeric:=0;v_modifier numeric;
 v_base numeric:=null;v_add numeric:=0;v_max numeric:=0;
 v_mode text;v_bonus text;v_role text;v_step numeric;v_threshold numeric;
 v_base_score numeric;
begin
 if p_code is null or p_code !~ '^=@[A-Za-z][A-Za-z0-9_]{0,31}$'
  or jsonb_typeof(p_config->'references')<>'array' then return null;end if;
 select r into v_def from jsonb_array_elements(p_config->'references') r
  where upper(r->>'code')=upper(p_code) limit 1;
 if v_def is null then return null;end if;
 v_source:=v_def->>'source';
 v_field_id:=v_def->>'fieldId';
 if v_field_id is null or v_field_id !~ '^[a-zA-Z0-9_-]{1,100}$' then return null;end if;
 if v_source='field' then
  v_value:=p_sheet->v_field_id;
  if jsonb_typeof(v_value)='object' and v_value ? 'current' then
   v_value:=v_value->'current';
  end if;
  if jsonb_typeof(v_value)='number' then return v_value;end if;
  if jsonb_typeof(v_value)='string' then
   if (v_value #>> '{}') ~ '^-?[0-9]{1,7}([.][0-9]{1,3})?$' then
    return to_jsonb((v_value #>> '{}')::numeric);
   end if;
   return to_jsonb(left(v_value #>> '{}',160));
  end if;
  if jsonb_typeof(v_value)='boolean' then return v_value;end if;
  if jsonb_typeof(v_value)='array' then
   return to_jsonb(jsonb_array_length(v_value)::text||' entries');
  end if;
  if jsonb_typeof(v_value)='object' then
   return to_jsonb(left(v_value::text,160));
  end if;
  return null;
 elsif v_source<>'equipment_ac' then return null;end if;
 -- Only field types explicitly defined as Equipment by the DM may be resolved.
 select fld into v_template_field from jsonb_array_elements(
   case when jsonb_typeof(p_template->'tabs')='array' then p_template->'tabs'
   else '[]'::jsonb end) tab
  cross join lateral jsonb_array_elements(
   case when jsonb_typeof(tab->'fields')='array' then tab->'fields'
   else '[]'::jsonb end) fld
  where fld->>'type'='equipment' and fld->>'id'=v_field_id
  limit 1;
 if v_template_field is null then return null;end if;
 v_equipment:=p_sheet->v_field_id;
 if jsonb_typeof(v_equipment)<>'object' then v_equipment:='{}'::jsonb;end if;
 v_mode:=coalesce(v_template_field->>'armorModifierMode','modifier');
 if nullif(v_template_field->>'armorModifierField','') is not null then
  v_attr:=public.equipment_numeric(p_sheet->(v_template_field->>'armorModifierField'));
  if v_mode='score' then
   v_step:=public.equipment_numeric(v_template_field->'scoreStep');
   if v_step<1 then v_step:=2;end if;
   v_threshold:=case when v_template_field->'scoreBase' is null then 10
    else public.equipment_numeric(v_template_field->'scoreBase') end;
   v_attr:=floor((v_attr-v_threshold)/v_step);
  end if;
 end if;
 v_armor:=v_equipment->'armor';
 if jsonb_typeof(v_armor)='array' then
  for v_item in select value from jsonb_array_elements(v_armor) limit 100 loop
   if coalesce(v_item->>'worn','true')='false' then continue;end if;
   select c into v_cat from jsonb_array_elements(
    case when jsonb_typeof(v_template_field->'categories')='array'
     then v_template_field->'categories' else '[]'::jsonb end
   ) c where c->>'id'=v_item->>'categoryId' limit 1;
   v_bonus:=coalesce(v_cat->>'bonus','none');
   v_modifier:=case
    when v_bonus='full' then v_attr
    when v_bonus='cap' then least(v_attr,greatest(0,public.equipment_numeric(v_cat->'cap')))
    else 0 end;
   v_score:=public.equipment_numeric(v_item->'base')
    +public.equipment_numeric(v_item->'magic')+v_modifier;
   v_role:=coalesce(v_cat->>'role','add');
   if v_role='base' then
    v_base:=greatest(coalesce(v_base,v_score),v_score);
   else v_add:=v_add+v_score;end if;
  end loop;
 end if;
 if v_base is null then
  v_bonus:=coalesce(v_template_field->>'unarmoredRule','full');
  v_modifier:=case
   when v_bonus='full' then v_attr
   when v_bonus='cap' then least(v_attr,greatest(0,public.equipment_numeric(v_template_field->'unarmoredCap')))
   else 0 end;
  v_base_score:=case when v_template_field->'unarmoredBase' is null then 10
   else public.equipment_numeric(v_template_field->'unarmoredBase') end;
  v_base:=v_base_score+v_modifier;
 end if;
 return to_jsonb(v_base+v_add+public.equipment_numeric(v_equipment->'otherBonus'));
end $$;
-- Internal only. SECURITY DEFINER monitor/chat wrappers invoke it.

revoke all on function public.token_reference_value(jsonb,jsonb,jsonb,text) from public,anon,authenticated;
