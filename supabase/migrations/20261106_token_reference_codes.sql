-- STAGED ONLY. Apply before releasing reference-code frontend.
-- DM-defined aliases in campaigns.token_display_config.references, no new tables.

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
  if jsonb_typeof(v_value)='object' then v_value:=v_value->'current';end if;
  if jsonb_typeof(v_value)='number' then return v_value;end if;
  if jsonb_typeof(v_value)='string' and v_value #>> '{}' ~ '^-?[0-9]{1,7}(\.[0-9]{1,3})?$'
  then return to_jsonb((v_value #>> '{}')::numeric);end if;
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

create or replace function public.get_token_monitor_values(p_map uuid)
returns table(token_id uuid,fields jsonb)
language sql stable security definer set search_path='' as $$
with settings as (
 select c.id campaign_id,c.token_display_config cfg,c.sheet_template template,
        public.is_campaign_dm(c.id) dm
 from public.battle_maps m
 join public.campaigns c on c.id=m.campaign_id
 where m.id=p_map
   and (public.is_campaign_dm(c.id)
        or (public.is_campaign_member(c.id) and c.active_map_id=p_map))
), field_keys as (
 select distinct coalesce(w->>'field','') k
 from settings s,lateral jsonb_array_elements(coalesce(s.cfg->'widgets','[]'::jsonb)) w
 union
 select distinct coalesce(w->>'maxField','') k
 from settings s,lateral jsonb_array_elements(coalesce(s.cfg->'widgets','[]'::jsonb)) w
)
select t.id,
 coalesce((
  select jsonb_object_agg(v.key,v.value)
  from (
   select e.key,
          case when jsonb_typeof(e.value)='object' then e.value->'current'
               else e.value end as value
   from jsonb_each(
    case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
         else coalesce(t.npc_values,'{}'::jsonb) end
   ) e
   where e.key in (select k from field_keys)
   union all
   select e.key||'__max' as key,e.value->'max' as value
   from jsonb_each(
    case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
         else coalesce(t.npc_values,'{}'::jsonb) end
   ) e
   where e.key||'__max' in (select k from field_keys)
     and jsonb_typeof(e.value)='object'
   union all
   select r->>'code' as key,
    public.token_reference_value(
     s.cfg,s.template,
     case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
       else coalesce(t.npc_values,'{}'::jsonb) end,
     r->>'code'
    ) as value
   from jsonb_array_elements(
     case when jsonb_typeof(s.cfg->'references')='array'
      then s.cfg->'references' else '[]'::jsonb end) r
   where r->>'code' in (select k from field_keys)
  ) v
  where jsonb_typeof(v.value)='number'
     or (jsonb_typeof(v.value)='string'
         and v.value #>> '{}' ~ '^-?[0-9]{1,7}(\.[0-9]{1,3})?$')
 ),'{}'::jsonb) as fields
from settings s
join public.map_tokens t on t.campaign_id=s.campaign_id and t.map_id=p_map
left join public.characters ch on ch.id=t.character_id and ch.campaign_id=s.campaign_id
where (s.dm or t.visible)
  and (
   s.dm
   or (t.character_id is not null
       and (t.owner_id=auth.uid() or s.cfg->>'playerVisibility'='everyone'))
   or (t.character_id is null
       and (s.cfg->>'npcVisibility'='everyone' or t.npc_bars_public))
  );
$$;

create or replace function public.post_token_reference(p_token uuid,p_code text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
 v_token public.map_tokens%rowtype;
 v_config jsonb;v_sheet jsonb;
 v_template jsonb;v_alias jsonb;v_value jsonb;v_name text;v_msg uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to use token references';end if;
 select * into v_token from public.map_tokens where id=p_token;
 if not found or not public.is_campaign_member(v_token.campaign_id)
 then raise exception 'Token not found';end if;
 if not (public.is_campaign_dm(v_token.campaign_id)
  or (v_token.visible and v_token.owner_id=auth.uid()))
 then raise exception 'Select a token you control';end if;
 select c.token_display_config,c.sheet_template into v_config,v_template
  from public.campaigns c where c.id=v_token.campaign_id;
 select r into v_alias from jsonb_array_elements(
  case when jsonb_typeof(v_config->'references')='array'
   then v_config->'references' else '[]'::jsonb end) r
 where upper(r->>'code')=upper(p_code) limit 1;
 if v_alias is null then raise exception 'Unknown reference code: %',p_code;end if;

 if v_token.character_id is not null then
  select ch.field_values into v_sheet from public.characters ch
   where ch.id=v_token.character_id and ch.campaign_id=v_token.campaign_id;
 else v_sheet:=v_token.npc_values;end if;
 v_value:=public.token_reference_value(v_config,v_template,coalesce(v_sheet,'{}'::jsonb),p_code);
 if v_value is null then raise exception 'Reference has no numeric value';end if;
 v_name:=left(coalesce(nullif(v_alias->>'label',''),p_code),40);
 insert into public.chat_messages(campaign_id,user_id,body,kind)
 values(v_token.campaign_id,auth.uid(),
  left(v_token.name,80)||' · '||v_name||': '||(v_value #>> '{}'),'text')
 returning id into v_msg;
 return v_msg;
end $$;
revoke all on function public.post_token_reference(uuid,text) from public,anon;
grant execute on function public.post_token_reference(uuid,text) to authenticated;
